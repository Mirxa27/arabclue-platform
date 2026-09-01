import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { jsonApiFailure } from "@/lib/api-controller";
import { apiFailure } from "@/lib/api-failure";
import { generateCompletion } from "@/lib/llm";
import {
  ProviderUnavailableError,
  guardOrThrow,
} from "@/lib/ai/provider-unavailable";
import { systemRewrite } from "@/lib/agents/prompts";
import type { Locale } from "@/lib/types";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  getTenantContext,
  assertWorkspaceMatch,
} from "@/lib/workspace-context";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { parseJsonBody, proposalRewriteSchema } from "@/lib/validation";
import {
  applySectionRewrite,
  skillInstruction,
  unifiedDiff,
} from "@/lib/proposal-studio";
import { validateProposalOutput } from "@/lib/validation-gate";
import { financialForValidationGate } from "@/lib/proposal-studio";
import { isProposalEditLocked } from "@/lib/proposal-status";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "@/lib/proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "@/lib/contract-render-snapshot";

export const dynamic = "force-dynamic";
// Reaches the same reasoning model as /api/platform-agent/chat, so it gets the
// same budget. This route rewrites whole sections, which is strictly more work
// than the co-pilot pass that was already overrunning 60s in production.
export const maxDuration = 300;

/**
 * POST /api/proposals/[id]/rewrite
 * AI skill: rewrite | expand | condense | translate | redesign | section
 * Body: { selection?, instruction?, locale?, apply?, skill? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireWriter();
  if (!session) {
    return jsonApiFailure("FORBIDDEN");
  }
  const { workspace } = await getTenantContext(session.user.id);
  // Lower than the copilot's 30/min next door: that one returns short
  // suggestions, this one asks for up to 5000 output tokens per call.
  const limited = await checkAiRateLimit({
    route: "ai.proposal-rewrite",
    identifier: workspace.id,
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await parseJsonBody(req, proposalRewriteSchema);
  if (!parsed.ok) return parsed.response;

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return jsonApiFailure("PROPOSAL_NOT_FOUND");
  }
  if (isProposalEditLocked(proposal.status)) {
    return jsonApiFailure("STATUS_LOCKED");
  }

  const body = parsed.data;
  const locale: Locale =
    body.locale === "en" || body.locale === "ar"
      ? body.locale
      : proposal.locale === "en"
        ? "en"
        : "ar";
  const selection =
    typeof body.selection === "string" && body.selection.trim()
      ? body.selection.trim()
      : (proposal.contentMd ?? "");
  const skill = body.skill ?? "rewrite";
  const instruction = skillInstruction(skill, locale, body.instruction);
  const apply = body.apply === true;

  const result = await generateCompletion(
    [
      {
        role: "system",
        content: `${systemRewrite(locale)}

Skill: ${skill}
You are in EDIT mode. Rewrite ONLY the provided markdown fragment or document.
Preserve headings structure when possible unless skill is redesign.
Do not invent past projects, certifications, staff, prices, or legal conclusions.
Return Markdown only.`,
      },
      {
        role: "user",
        content: `Instruction: ${instruction}\n\n---\n\n${selection.slice(0, 14000)}`,
      },
    ],
    { maxTokens: 5000, temperature: 0.35, engine: "REWRITE" },
  );

  let rewritten = result.content?.trim() ?? "";
  if (rewritten.startsWith("```")) {
    rewritten = rewritten
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  if (!rewritten || result.fallback) {
    try {
      guardOrThrow(result, "api:proposals-rewrite");
    } catch (err) {
      if (err instanceof ProviderUnavailableError) {
        // `content` is the untouched selection, so the editor can carry on
        // with the text the writer already had rather than losing it.
        return NextResponse.json(
          {
            ...apiFailure("AI_PROVIDER_UNAVAILABLE"),
            fallback: true,
            failureKind: err.failureKind,
            llmFailureKind: err.llmFailureKind ?? null,
            provider: result.provider,
            content: selection,
          },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      throw err;
    }
    return NextResponse.json(
      {
        ...apiFailure("AI_PROVIDER_UNAVAILABLE"),
        fallback: true,
        provider: result.provider,
        content: selection,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentMd = applySectionRewrite(
    proposal.contentMd ?? "",
    selection,
    rewritten,
  );
  const previewDiff = unifiedDiff(selection, rewritten);

  let proposalOut = proposal;
  let validation: ReturnType<typeof validateProposalOutput> | null = null;
  if (apply) {
    const forms = proposal.financialFormsJson
      ? (() => {
          try {
            return JSON.parse(proposal.financialFormsJson);
          } catch {
            return null;
          }
        })()
      : null;
    validation = validateProposalOutput({
      contentMd,
      financial: financialForValidationGate(forms),
      entities: null,
      complianceRows: [],
    });

    const nextVersion = proposal.version + 1;
    const mutation = await db.$transaction(async (tx) => {
      const write = await tx.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          status: proposal.status,
          version: proposal.version,
          updatedAt: proposal.updatedAt,
        },
        data: {
          contentMd,
          version: nextVersion,
          locale,
          status: "DRAFT",
          submittedAt: null,
          approvedAt: null,
          artifactsJson: null,
          ...STRUCTURED_SNAPSHOT_INVALIDATION,
          ...CONTRACT_RENDER_SNAPSHOT_INVALIDATION,
        },
      });
      if (write.count !== 1) return null;
      await tx.proposalReview.deleteMany({ where: { proposalId: id } });
      await tx.proposalVersion.create({
        data: {
          proposalId: id,
          version: nextVersion,
          contentMd,
          changeLog: `AI ${skill}: ${instruction.slice(0, 120)}`,
          locale,
          createdBy: session.user.id,
        },
      });
      return tx.generatedProposal.findUniqueOrThrow({ where: { id } });
    });
    if (!mutation) {
      return jsonApiFailure("PROPOSAL_VERSION_CONFLICT");
    }
    proposalOut = mutation;

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: {
        version: nextVersion,
        aiRewrite: true,
        skill,
        provider: result.provider,
      },
    });
  }

  return NextResponse.json({
    content: rewritten,
    fullContent: contentMd,
    skill,
    instruction,
    previewDiff: previewDiff.slice(0, 400),
    provider: result.provider,
    model: result.model,
    tokensUsed: result.tokensUsed,
    fallback: false,
    validation,
    proposal: apply
      ? {
          ...proposalOut,
          artifacts: proposalOut.artifactsJson
            ? JSON.parse(proposalOut.artifactsJson)
            : [],
        }
      : undefined,
  });
}
