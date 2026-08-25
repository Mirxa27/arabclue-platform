import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
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
      route: "ai.contract-draft",
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

    const result = await draftContractWithAi({
      templateKey: parsed.data.templateKey as ContractTemplateKey,
      projectTitle: parsed.data.projectTitle,
      etimadRef: parsed.data.etimadRef ?? null,
      entities: (parsed.data.entities as unknown as IngestionEntities | null) ?? null,
      complianceRows:
        (parsed.data.complianceRows as unknown as ComplianceMatrixRow[]) ?? [],
      locale: parsed.data.locale,
      workspaceId: workspace.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ai/contract-draft] Error:", error);
    return NextResponse.json(
      { error: "Contract drafting failed" },
      { status: 500 }
    );
  }
}
