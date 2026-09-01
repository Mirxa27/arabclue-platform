import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, withTenant } from "@/lib/api-controller";
import { matchVendorsWithPrediction } from "@/lib/ai/vendor-matching-engine";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import type { IngestionEntities } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const vendorSchema = z.object({
  vendorId: z.string().min(1).max(200),
  vendorName: z.string().min(1).max(300),
  vendorNameAr: z.string().min(1).max(300),
  workspace: z.object({
    crNumber: z.string().nullable().optional(),
    vatNumber: z.string().nullable().optional(),
  }).optional(),
  certificates: z.array(z.object({
    certType: z.string(),
    expiresAt: z.union([z.string(), z.date()]).nullable().optional(),
    revokedAt: z.union([z.string(), z.date()]).nullable().optional(),
    approved: z.boolean().nullable().optional(),
  })).optional(),
  historicalProposals: z.number().int().min(0).optional(),
  historicalWins: z.number().int().min(0).optional(),
  pastProjectTags: z.array(z.string()).optional(),
});

const requestSchema = z.object({
  tenderRequirements: z.array(z.string()).min(1).max(100),
  entities: z.record(z.string(), z.unknown()).nullable().optional(),
  vendors: z.array(vendorSchema).min(1).max(50),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

export async function POST(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const blocked = await checkAiRateLimit({
        route: "ai.vendor-match",
        identifier: workspace.id,
        limit: 20,
        windowMs: 60_000,
      });
      if (blocked) return blocked;

      const data = await parseJsonBody(request, requestSchema);

      const result = await matchVendorsWithPrediction({
        tenderRequirements: data.tenderRequirements,
        entities: (data.entities as unknown as IngestionEntities | null) ?? null,
        vendors: data.vendors.map((v) => ({
          ...v,
          workspace: v.workspace ?? {},
          certificates: v.certificates ?? [],
          pastProjectTags: v.pastProjectTags ?? [],
        })),
        locale: data.locale,
        workspaceId: workspace.id,
      });

      return NextResponse.json(result);
    },
    "ai/vendor-match"
  );
}
