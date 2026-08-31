import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { parseJsonBody, copilotSuggestSchema } from "@/lib/validation";
import { jsonApiFailure } from "@/lib/api-controller";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { generateCopilotSuggestions } from "@/lib/ai/copilot-suggestions";
import type { Locale } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/proposals/[id]/copilot
 *
 * One co-pilot review pass over the editor buffer. Returns anchored edit
 * proposals only — nothing is written to the proposal here. The client
 * previews each one and applies it locally; saving stays on the existing
 * PATCH path, so the co-pilot can never mutate a document on its own.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireWriter();
  if (!session) return jsonApiFailure("WORKSPACE_ROLE_FORBIDDEN");
  const { workspace } = await getTenantContext(session.user.id);

  // Every pass is a model call, so the limit is per workspace and tighter than
  // a human could trigger by hand — the rail also fires on idle.
  const limited = await checkAiRateLimit({
    route: "ai.proposal-copilot",
    identifier: workspace.id,
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const { id } = await params;
  const parsed = await parseJsonBody(req, copilotSuggestSchema);
  if (!parsed.ok) return parsed.response;

  const proposal = await db.generatedProposal.findUnique({
    where: { id },
    select: { workspaceId: true, locale: true },
  });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return jsonApiFailure("RESOURCE_NOT_FOUND");
  }

  const locale: Locale =
    parsed.data.locale ?? (proposal.locale === "en" ? "en" : "ar");

  try {
    const result = await generateCopilotSuggestions({
      contentMd: parsed.data.contentMd,
      selection: parsed.data.selection,
      locale,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[proposals/copilot] Error:", error);
    // No deterministic fallback by design: a fabricated edit pointing at real
    // text in a real bid is worse than an empty rail.
    return jsonApiFailure("AI_PROVIDER_UNAVAILABLE");
  }
}
