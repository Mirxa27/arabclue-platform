import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, withTenant } from "@/lib/api-controller";
import { draftContractWithAi } from "@/lib/ai/contract-drafting-assistant";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import type { ContractTemplateKey } from "@/lib/document-templates/contract-templates";
import type { IngestionEntities, ComplianceMatrixRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestSchema = z.object({
  templateKey: z.enum([
    "it-services-v1",
    "goods-supply-v1",
    "professional-services-v1",
    "nda-v1",
    "subcontract-v1",
    "framework-calloff-v1",
    "saas-data-v1",
  ]),
  projectTitle: z.string().min(1).max(500),
  etimadRef: z.string().nullable().optional(),
  entities: z.record(z.string(), z.unknown()).nullable().optional(),
  complianceRows: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

export async function POST(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const blocked = await checkAiRateLimit({
        route: "ai.contract-draft",
        identifier: workspace.id,
        limit: 10,
        windowMs: 60_000,
      });
      if (blocked) return blocked;

      const data = await parseJsonBody(request, requestSchema);

      const result = await draftContractWithAi({
        templateKey: data.templateKey as ContractTemplateKey,
        projectTitle: data.projectTitle,
        etimadRef: data.etimadRef ?? null,
        entities: (data.entities as unknown as IngestionEntities | null) ?? null,
        complianceRows:
          (data.complianceRows as unknown as ComplianceMatrixRow[]) ?? [],
        locale: data.locale,
        workspaceId: workspace.id,
      });

      return NextResponse.json(result);
    },
    "ai/contract-draft"
  );
}
