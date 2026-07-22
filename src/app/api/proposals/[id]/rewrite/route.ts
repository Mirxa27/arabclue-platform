import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { generateCompletion } from "@/lib/llm";
import { systemDrafting } from "@/lib/agents/prompts";
import type { Locale } from "@/lib/types";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/proposals/[id]/rewrite
 * AI-assisted rewrite of full proposal or a selected markdown fragment.
 * Body: { selection?: string, instruction?: string, locale?: "ar"|"en", apply?: boolean }
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
  const body = await req.json().catch(() => ({}));
  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

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
  const instruction =
    typeof body.instruction === "string" && body.instruction.trim()
      ? body.instruction.trim()
      : locale === "ar"
        ? "حسّن الصياغة الرسمية الحكومية مع الحفاظ على الحقائق والأرقام."
        : "Improve government-formal wording while preserving all facts and figures.";
  const apply = body.apply === true;

  const result = await generateCompletion(
    [
      {
        role: "system",
        content: `${systemDrafting(locale)}

You are now in EDIT mode. Rewrite ONLY the provided markdown fragment or document.
Preserve headings structure when possible. Do not invent past projects, certifications, or financial figures.
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
    rewritten = rewritten.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
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

  let proposalOut = proposal;
  if (apply) {
    const nextVersion = proposal.version + 1;
    const contentMd =
      selection === (proposal.contentMd ?? "")
        ? rewritten
        : (proposal.contentMd ?? "").replace(selection, rewritten);

    proposalOut = await db.$transaction(async (tx) => {
      await tx.proposalVersion.create({
        data: {
          proposalId: id,
          version: nextVersion,
          contentMd,
          changeLog: `AI rewrite: ${instruction.slice(0, 120)}`,
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
          status: "REVIEWED",
        },
      });
    });

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { version: nextVersion, aiRewrite: true, provider: result.provider },
    });
  }

  return NextResponse.json({
    content: rewritten,
    provider: result.provider,
    model: result.model,
    tokensUsed: result.tokensUsed,
    fallback: false,
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
