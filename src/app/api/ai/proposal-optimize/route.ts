import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { optimizeProposal } from "@/lib/ai/proposal-optimizer";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import type { IngestionEntities, ComplianceMatrixRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  contentMd: z.string().min(1).max(100_000),
  entities: z.record(z.string(), z.unknown()).nullable().optional(),
  complianceRows: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
  historicalWinRate: z.number().min(0).max(100).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { workspace } = await getTenantContext(session.user.id);

    const blocked = await checkAiRateLimit({
      route: "ai.proposal-optimize",
      identifier: workspace.id,
      limit: 10,
      windowMs: 60_000,
    });
    if (blocked) return blocked;

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await optimizeProposal({
      contentMd: parsed.data.contentMd,
      entities: (parsed.data.entities as unknown as IngestionEntities | null) ?? null,
      complianceRows:
        (parsed.data.complianceRows as unknown as ComplianceMatrixRow[]) ?? [],
      coverage: null,
      locale: parsed.data.locale,
      workspaceId: workspace.id,
      historicalWinRate: parsed.data.historicalWinRate ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ai/proposal-optimize] Error:", error);
    return NextResponse.json(
      { error: "Proposal optimization failed" },
      { status: 500 }
    );
  }
}
