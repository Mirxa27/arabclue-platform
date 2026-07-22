import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  generateProposalPDF,
  generateProposalHTMLPreview,
  generateComplianceMatrixXLSX,
  generateBoQXLSX,
  generateSlidesHTML,
  generateProposalPPTX,
  generateBidPackageZIP,
  type SlidesMetrics,
} from "@/lib/generators";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import {
  assertExportAllowed,
  validateProposalOutput,
} from "@/lib/validation-gate";
import type { FinancialExtract } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/proposals/[id]/download?format=zip|pdf|html|xlsx-matrix|ea-matrix|xlsx-boq|boq|slides|pptx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;
  let format = req.nextUrl.searchParams.get("format") ?? "zip";
  // Aliases from artifact JSON
  if (format === "ea-matrix") format = "xlsx-matrix";
  if (format === "boq") format = "xlsx-boq";
  const localeParam = req.nextUrl.searchParams.get("locale");
  const pdfLocale =
    localeParam === "ar" || localeParam === "en"
      ? localeParam
      : undefined;

  const proposal = await db.generatedProposal.findUnique({
    where: { id },
    include: { project: true, workspace: { include: { brandProfiles: true } } },
  });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Deterministic validation gate — blocks final export on pricing/placeholder/NORA/etc.
  const restrictions = await db.restriction.findMany({
    where: { workspaceId: workspace.id, active: true },
    select: { text: true },
  });
  const checksForGate = await db.complianceCheck.findMany({
    where: { projectId: proposal.projectId },
  });
  const gateFinancial: FinancialExtract | null = proposal.financialFormsJson
    ? (() => {
        try {
          const forms = JSON.parse(proposal.financialFormsJson);
          return {
            cashEquivalents: null,
            accountsReceivable: null,
            currentLiabilities: null,
            quickLiquidityRatio: null,
            qlrPasses: null,
            qlrThreshold: null,
            qlrFormula: null,
            saudizationPercent: null,
            boqItems: Array.isArray(forms.boqItems) ? forms.boqItems : [],
            localContentPreferenceApplied: null,
            notes: [],
          };
        } catch {
          return null;
        }
      })()
    : null;
  const gateReport = validateProposalOutput({
    contentMd: proposal.contentMd,
    financial: gateFinancial,
    entities: null,
    complianceRows: checksForGate.map((c) => ({
      frameworkId: c.framework,
      controlId: c.controlId,
      title: c.title,
      status: (c.status === "GAP" ? "PARTIAL" : c.status) as
        | "COMPLIANT"
        | "PARTIAL"
        | "NON_COMPLIANT"
        | "PENDING",
      evidence: c.evidence ?? "",
      remediation: c.remediation,
    })),
    restrictions: restrictions.map((r) => r.text),
  });
  if (gateReport.blocking && format !== "html") {
    try {
      assertExportAllowed(gateReport);
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "validation_failed",
          validation: gateReport,
        },
        { status: 422 }
      );
    }
  }

  const brand = proposal.workspace.brandProfiles[0] ?? null;
  const checks = checksForGate;

  // Prefer human-entered financial forms; fall back to structure-only agent BoQ
  let boqItems:
    | { item: string; unit: string; qty: number; unitPrice: number | null; total: number | null }[]
    | undefined;
  let slidesMetrics: SlidesMetrics | undefined;

  if (proposal.financialFormsJson) {
    try {
      const forms = JSON.parse(proposal.financialFormsJson);
      if (Array.isArray(forms.boqItems)) boqItems = forms.boqItems;
    } catch {
      /* ignore */
    }
  }

  const run = await db.agentRun.findFirst({
    where: { projectId: proposal.projectId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
  });
  if (run?.finalArtifact) {
    try {
      const fa = JSON.parse(run.finalArtifact);
      if (!boqItems) boqItems = fa.boqItems;
      slidesMetrics = fa.slidesMetrics ?? {
        quickLiquidityRatio: fa.financial?.quickLiquidityRatio,
        qlrPasses: fa.financial?.qlrPasses,
        saudizationPercent: fa.financial?.saudizationPercent,
        saudizationTarget: proposal.project.saudizationTarget,
        complianceScore: fa.complianceScore ?? proposal.complianceScore,
      };
    } catch {
      /* ignore */
    }
  }
  if (!slidesMetrics) {
    slidesMetrics = {
      complianceScore: proposal.complianceScore,
      saudizationTarget: proposal.project.saudizationTarget,
    };
  }

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
    resource: "GeneratedProposal",
    resourceId: id,
    details: { format },
  });

  try {
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
      case "pdf":
        buffer = await generateProposalPDF(proposal, proposal.project, brand, pdfLocale);
        contentType = "application/pdf";
        filename = "Technical_Proposal.pdf";
        break;
      case "html":
        buffer = generateProposalHTMLPreview(proposal, proposal.project, brand, pdfLocale);
        contentType = "text/html; charset=utf-8";
        filename = "Technical_Proposal.html";
        break;
      case "xlsx-matrix":
        buffer = await generateComplianceMatrixXLSX(proposal.project, brand, checks);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = "Compliance_Matrix.xlsx";
        break;
      case "xlsx-boq":
        buffer = await generateBoQXLSX(proposal.project, brand, boqItems);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = "Financial_BoQ.xlsx";
        break;
      case "slides":
        buffer = Buffer.from(
          generateSlidesHTML(proposal, proposal.project, brand, slidesMetrics),
          "utf8"
        );
        contentType = "text/html; charset=utf-8";
        filename = "Technical_Proposal_Slides.html";
        break;
      case "pptx":
        buffer = await generateProposalPPTX(
          proposal,
          proposal.project,
          brand,
          slidesMetrics
        );
        contentType =
          "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        filename = "Technical_Proposal_Slides.pptx";
        break;
      case "zip":
      default:
        buffer = await generateBidPackageZIP(proposal, proposal.project, brand, {
          checks,
          boqItems,
          slidesMetrics,
        });
        contentType = "application/zip";
        filename = "Arabclue_Bid_Package.zip";
        break;
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[download]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "download failed" },
      { status: 500 }
    );
  }
}
