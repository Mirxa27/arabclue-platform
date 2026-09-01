import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, withTenant } from "@/lib/api-controller";
import { generateComplianceScorecard } from "@/lib/ai/compliance-analyzer";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import type { IngestionEntities } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  documentText: z.string().min(1).max(100_000),
  documentType: z.enum(["PROPOSAL", "CONTRACT", "TENDER"]),
  entities: z.record(z.string(), z.unknown()).nullable().optional(),
  tenderCategory: z.string().nullable().optional(),
  saudizationTarget: z.number().nullable().optional(),
  localContentTarget: z.number().nullable().optional(),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

export async function POST(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const blocked = await checkAiRateLimit({
        route: "ai.compliance-analyze",
        identifier: workspace.id,
        limit: 20,
        windowMs: 60_000,
      });
      if (blocked) return blocked;

      const data = await parseJsonBody(request, requestSchema);

      const result = await generateComplianceScorecard({
        documentText: data.documentText,
        documentType: data.documentType,
        entities: (data.entities as unknown as IngestionEntities | null) ?? null,
        tenderCategory: data.tenderCategory ?? null,
        saudizationTarget: data.saudizationTarget ?? null,
        localContentTarget: data.localContentTarget ?? null,
        locale: data.locale,
        workspaceId: workspace.id,
      });

      return NextResponse.json(result);
    },
    "ai/compliance-analyze"
  );
}
