import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { matchVendorsWithPrediction } from "@/lib/ai/vendor-matching-engine";
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
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { workspace } = await getTenantContext(session.user.id);

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await matchVendorsWithPrediction({
      tenderRequirements: parsed.data.tenderRequirements,
      entities: (parsed.data.entities as unknown as IngestionEntities | null) ?? null,
      vendors: parsed.data.vendors.map((v) => ({
        ...v,
        workspace: v.workspace ?? {},
        certificates: v.certificates ?? [],
        pastProjectTags: v.pastProjectTags ?? [],
      })),
      locale: parsed.data.locale,
      workspaceId: workspace.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ai/vendor-match] Error:", error);
    return NextResponse.json(
      { error: "Vendor matching failed" },
      { status: 500 }
    );
  }
}
