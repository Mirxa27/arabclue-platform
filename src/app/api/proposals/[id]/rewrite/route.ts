import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { generateCompletion } from "@/lib/llm";
import { systemRewrite } from "@/lib/agents/prompts";
import type { Locale } from "@/lib/types";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { parseJsonBody, proposalRewriteSchema } from "@/lib/validation";
import {
  applySectionRewrite,
  skillInstruction,
  unifiedDiff,
} from "@/lib/proposal-studio";
import { validateProposalOutput } from "@/lib/validation-gate";
import { financialForValidationGate } from "@/lib/proposal-studio";
import { isProposalEditLocked } from "@/lib/proposal-status";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/proposals/[id]/rewrite
 * AI skill: rewrite | expand | condense | translate | redesign | section
 * Body: { selection?, instruction?, locale?, apply?, skill? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;
  const parsed = await parseJsonBody(req, proposalRewriteSchema);
  if (!parsed.ok) return parsed.response;

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (isProposalEditLocked(proposal.status)) {
    return NextResponse.json(
      {
        error: "Proposal is locked for editing in current status",
        code: "status_locked",
      },
      { status: 409 }
    );
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
      : proposal.contentMd ?? "";
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
    { maxTokens: 5000, temperature: 0.35, engine: "REWRITE" }
  );

  let rewritten = result.content?.trim() ?? "";
  if (rewritten.startsWith("```")) {
    rewritten = rewritten
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  if (!rewritten || result.fallback) {
    return NextResponse.json(
      {
        error: "AI rewrite unavailable",
        fallback: true,
        provider: result.provider,
        content: selection,
      },
      { status: 503 }
    );
  }

  const contentMd = applySectionRewrite(
    proposal.contentMd ?? "",
    selection,
    rewritten
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
    const blocking = validation.blocking;
    proposalOut = await db.$transaction(async (tx) => {
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
      return tx.generatedProposal.update({
        where: { id },
        data: {
          contentMd,
          version: nextVersion,
          locale,
          status: blocking ? "DRAFT" : "REVIEWED",
        },
      });
    });

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
