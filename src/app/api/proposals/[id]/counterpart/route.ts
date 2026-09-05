import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, withTenant } from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { assertWithinQuota, bumpUsage } from "@/lib/quotas";
import { generateCounterpartDraft } from "@/lib/ai/counterpart";
import type { CounterpartDiagnosticsRecord } from "@/lib/counterpart-diagnostics";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { isProposalEditLocked } from "@/lib/proposal-status";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
// Eighteen sections, three at a time, each a bounded translation call: the same
// window the sectioned drafting agent and the rewrite skill already get.
export const maxDuration = 300;

/**
 * POST /api/proposals/[id]/counterpart
 *
 * Generate the complete draft in the proposal's other language for the
 * synchronized bilingual export, persist it on the proposal, and return it with
 * the fidelity findings. No body. Refuses (503 AI_PROVIDER_UNAVAILABLE) rather
 * than fabricating when no model answers; the editor keeps its paste path.
 *
 * Response: `{ counterpartMd, counterpartLocale, counterpartGeneratedAt,
 * diagnostics, sections, tokensUsed, provider, model }`.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant(
    "writer",
    async ({ workspace, userId }) => {
      // Per user, not per workspace: one run is minutes of paid generation and
      // a teammate's regenerate must not lock the whole workspace out.
      const limited = await checkAiRateLimit({
        route: "proposals.counterpart",
        identifier: userId,
        scope: "user",
        limit: 3,
        windowMs: 60_000,
      });
      if (limited) return limited;
      // QuotaExceededError → bilingual 402 via withTenant's mapper.
      await assertWithinQuota(userId, "tokens");

      const { id } = await params;
      const proposal = await db.generatedProposal.findUnique({
        where: { id },
        include: { project: { select: { title: true, titleAr: true } } },
      });
      if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
        return jsonApiFailure("PROPOSAL_NOT_FOUND");
      }
      if (isProposalEditLocked(proposal.status)) {
        return jsonApiFailure("STATUS_LOCKED");
      }
      const contentMd = proposal.contentMd?.trim() ? proposal.contentMd : null;
      if (!contentMd) {
        return jsonApiFailure("EMPTY_PROPOSAL_CONTENT");
      }

      const sourceLocale: Locale = proposal.locale === "en" ? "en" : "ar";
      const targetLocale: Locale = sourceLocale === "en" ? "ar" : "en";
      const projectTitle =
        (targetLocale === "ar" ? proposal.project.titleAr : null) ||
        proposal.project.title;

      // ProviderUnavailableError → 503 AI_PROVIDER_UNAVAILABLE via the mapper.
      const result = await generateCounterpartDraft({
        contentMd,
        sourceLocale,
        targetLocale,
        projectTitle,
      });

      if (result.tokensUsed > 0) {
        await bumpUsage(userId, "tokens", result.tokensUsed).catch((err) =>
          console.warn("[proposals/counterpart] token usage not recorded", err)
        );
      }

      const record: CounterpartDiagnosticsRecord = {
        provider: result.provider,
        model: result.model,
        tokensUsed: result.tokensUsed,
        sections: result.sections,
        diagnostics: result.diagnostics,
      };
      const counterpartGeneratedAt = new Date();
      // Scoped to the workspace and to the draft that was translated: a save or
      // a rewrite that landed during the run changed the source, and a
      // counterpart of the previous text must not be stored against the new one.
      const write = await db.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          version: proposal.version,
          locale: proposal.locale,
        },
        data: {
          counterpartMd: result.contentMd,
          counterpartLocale: targetLocale,
          counterpartGeneratedAt,
          counterpartDiagnosticsJson: JSON.stringify(record),
        },
      });
      if (write.count !== 1) {
        return jsonApiFailure("PROPOSAL_VERSION_CONFLICT");
      }

      await audit({
        userId,
        action: AUDIT_ACTIONS.PROPOSAL_COUNTERPART,
        resource: "GeneratedProposal",
        resourceId: id,
        details: {
          version: proposal.version,
          sourceLocale,
          targetLocale,
          sections: result.sections,
          diagnostics: result.diagnostics.length,
          provider: result.provider,
          model: result.model,
          tokensUsed: result.tokensUsed,
        },
      });

      return NextResponse.json({
        counterpartMd: result.contentMd,
        counterpartLocale: targetLocale,
        counterpartGeneratedAt: counterpartGeneratedAt.toISOString(),
        diagnostics: result.diagnostics,
        sections: result.sections,
        tokensUsed: result.tokensUsed,
        provider: result.provider,
        model: result.model,
      });
    },
    "proposals/counterpart"
  );
}
