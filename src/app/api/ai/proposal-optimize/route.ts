import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, withTenant } from "@/lib/api-controller";
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
  return withTenant(
    "session",
    async ({ workspace }) => {
      const blocked = await checkAiRateLimit({
        route: "ai.proposal-optimize",
        identifier: workspace.id,
        limit: 10,
        windowMs: 60_000,
      });
      if (blocked) return blocked;

      const data = await parseJsonBody(request, requestSchema);

      const result = await optimizeProposal({
        contentMd: data.contentMd,
        entities: (data.entities as unknown as IngestionEntities | null) ?? null,
        complianceRows:
          (data.complianceRows as unknown as ComplianceMatrixRow[]) ?? [],
        coverage: null,
        locale: data.locale,
        workspaceId: workspace.id,
        historicalWinRate: data.historicalWinRate ?? null,
      });

      return NextResponse.json(result);
    },
    "ai/proposal-optimize"
  );
}
