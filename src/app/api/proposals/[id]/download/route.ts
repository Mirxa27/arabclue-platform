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
import {
  evaluateExportPolicy,
  financialForValidationGate,
} from "@/lib/proposal-studio";
import { getContractValidationReport } from "@/lib/contract-review";
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

  const isContract = proposal.type === "CONTRACT";
  if (isContract) {
    // Contracts only support bilingual legal HTML/PDF (and manifest)
    if (!["html", "pdf", "manifest"].includes(format)) {
      format = "pdf";
    }
  }

  // Deterministic validation gate — blocks final export on pricing/placeholder/NORA/etc.
  const restrictions = await db.restriction.findMany({
    where: { workspaceId: workspace.id, active: true },
    select: { text: true },
  });
  const checksForGate = await db.complianceCheck.findMany({
    where: { projectId: proposal.projectId },
  });
  const policy = await db.approvalPolicy.findUnique({
    where: { workspaceId: workspace.id },
    include: { steps: true },
  });
  const hasApprovalPolicy = Boolean(policy && policy.steps.length > 0);

  let formsRaw: {
    boqItems?: {
      item: string;
      unit: string;
      qty: number;
      unitPrice: number | null;
      total: number | null;
    }[];
    source?: string;
  } | null = null;
  if (proposal.financialFormsJson) {
    try {
      formsRaw = JSON.parse(proposal.financialFormsJson);
    } catch {
      formsRaw = null;
    }
  }

  let gateReport;
  if (isContract) {
    gateReport = getContractValidationReport({
      contentMd: proposal.contentMd,
    });
  } else {
    const gateFinancial: FinancialExtract | null =
      financialForValidationGate(formsRaw);
    // Prefer ingestion entities from project documents so NORA gate is tender-aware.
    let entities: import("@/lib/types").IngestionEntities | null = null;
    const docs = await db.uploadedDocument.findMany({
      where: {
        projectId: proposal.projectId,
        extractedEntities: { not: null },
      },
      select: { extractedEntities: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    });
    for (const doc of docs) {
      if (!doc.extractedEntities) continue;
      try {
        const parsed = JSON.parse(doc.extractedEntities) as import("@/lib/types").IngestionEntities;
        if (parsed && (parsed.noraPrinciplesFromTender?.length || parsed.requirements?.length)) {
          entities = parsed;
          break;
        }
        if (!entities) entities = parsed;
      } catch {
        /* ignore bad JSON */
      }
    }
    gateReport = validateProposalOutput({
      contentMd: proposal.contentMd,
      financial: gateFinancial,
      entities,
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
  }

  const policyResult = evaluateExportPolicy({
    proposalStatus: proposal.status,
    validation: gateReport,
    format,
    hasApprovalPolicy,
  });
  if (!policyResult.allowed) {
    if (policyResult.code === "validation_blocked") {
      try {
        assertExportAllowed(gateReport);
      } catch (err) {
        return NextResponse.json(
          {
            error: err instanceof Error ? err.message : "validation_failed",
            code: policyResult.code,
            validation: gateReport,
          },
          { status: 422 }
        );
      }
    }
    return NextResponse.json(
      {
        error: policyResult.error,
        code: policyResult.code,
        validation: gateReport,
        status: proposal.status,
      },
      { status: policyResult.status }
    );
  }

  const brand = proposal.workspace.brandProfiles[0] ?? null;
  const companyLetterhead = {
    name: proposal.workspace.name,
    nameAr: proposal.workspace.nameAr,
    crNumber: proposal.workspace.crNumber,
    vatNumber: proposal.workspace.vatNumber,
  };
  const checks = checksForGate;

  // Prefer human-entered financial forms; fall back to structure-only agent BoQ
  let boqItems:
    | { item: string; unit: string; qty: number; unitPrice: number | null; total: number | null }[]
    | undefined;
  let slidesMetrics: SlidesMetrics | undefined;

  if (formsRaw && Array.isArray(formsRaw.boqItems)) {
    boqItems = formsRaw.boqItems;
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

  try {
    let buffer: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
      case "pdf":
        if (isContract) {
          const { generateBilingualContractPDF } = await import(
            "@/lib/contract-export"
          );
          buffer = await generateBilingualContractPDF({
            title: proposal.title,
            titleAr: proposal.titleAr,
            contentMd: proposal.contentMd ?? "",
            projectTitle: proposal.project.title,
            etimadRef: proposal.project.etimadRef,
            brand,
            company: companyLetterhead,
          });
          contentType = "application/pdf";
          filename = "Draft_Contract_Bilingual.pdf";
        } else {
          buffer = await generateProposalPDF(
            proposal,
            proposal.project,
            brand,
            pdfLocale,
            companyLetterhead
          );
          contentType = "application/pdf";
          filename = "Technical_Proposal.pdf";
        }
        break;
      case "html":
        if (isContract) {
          const { generateBilingualContractHTML } = await import(
            "@/lib/contract-export"
          );
          buffer = generateBilingualContractHTML({
            title: proposal.title,
            titleAr: proposal.titleAr,
            contentMd: proposal.contentMd ?? "",
            projectTitle: proposal.project.title,
            etimadRef: proposal.project.etimadRef,
            brand,
            company: companyLetterhead,
          });
          contentType = "text/html; charset=utf-8";
          filename = "Draft_Contract_Bilingual.html";
        } else {
          buffer = generateProposalHTMLPreview(
            proposal,
            proposal.project,
            brand,
            pdfLocale,
            companyLetterhead
          );
          contentType = "text/html; charset=utf-8";
          filename = "Technical_Proposal.html";
        }
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
      case "manifest": {
        const { buildExportManifest, manifestToJson } = await import(
          "@/lib/export-manifest"
        );
        buffer = manifestToJson(
          buildExportManifest({
            project: {
              id: proposal.project.id,
              title: proposal.project.title,
              etimadRef: proposal.project.etimadRef,
              updatedAt: proposal.project.updatedAt,
            },
            proposal: {
              id: proposal.id,
              version: proposal.version,
              status: proposal.status,
              locale: proposal.locale,
              contentMd: proposal.contentMd,
              approvedAt: proposal.approvedAt,
            },
            validation: gateReport,
            artifacts: [],
          })
        );
        contentType = "application/json; charset=utf-8";
        filename = "Export_Manifest.json";
        break;
      }
      case "zip":
      default:
        buffer = await generateBidPackageZIP(proposal, proposal.project, brand, {
          checks,
          boqItems,
          slidesMetrics,
          validation: gateReport,
          company: companyLetterhead,
        });
        contentType = "application/zip";
        filename = "Arabclue_Bid_Package.zip";
        break;
    }

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "GeneratedProposal",
      resourceId: id,
      details: { format },
    });

    if (policyResult.markExported && proposal.status !== "EXPORTED") {
      await db.generatedProposal.update({
        where: { id },
        data: { status: "EXPORTED" },
      });
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
    const { PdfGenerationError } = await import("@/lib/pdf/html-to-pdf");
    if (err instanceof PdfGenerationError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          hint: "Install Playwright Chromium on the server (bunx playwright install chromium).",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "download failed" },
      { status: 500 }
    );
  }
}
