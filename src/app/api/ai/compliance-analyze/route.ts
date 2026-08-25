import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
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
      route: "ai.compliance-analyze",
      identifier: workspace.id,
      limit: 20,
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

    const result = await generateComplianceScorecard({
      documentText: parsed.data.documentText,
      documentType: parsed.data.documentType,
      entities: (parsed.data.entities as unknown as IngestionEntities | null) ?? null,
      tenderCategory: parsed.data.tenderCategory ?? null,
      saudizationTarget: parsed.data.saudizationTarget ?? null,
      localContentTarget: parsed.data.localContentTarget ?? null,
      locale: parsed.data.locale,
      workspaceId: workspace.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ai/compliance-analyze] Error:", error);
    return NextResponse.json(
      { error: "Compliance analysis failed" },
      { status: 500 }
    );
  }
}
