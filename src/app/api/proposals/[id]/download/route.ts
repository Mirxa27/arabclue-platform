import { redactSensitiveText } from "@/lib/api-failure";
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
  resolveLocale,
  type SlidesMetrics,
} from "@/lib/generators";
import { canWriteRole, requireSession } from "@/lib/auth";
import { resolveEmailVerifiedClaim } from "@/lib/email-verification-policy";
import {
  rateLimitAsync,
  describeRateLimitDenial,
} from "@/lib/rate-limit";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import {
  assertExportAllowed,
  validateProposalOutput,
} from "@/lib/validation-gate";
import {
  evaluateExportPolicy,
  financialForValidationGate,
  loadProjectIngestionEntities,
} from "@/lib/proposal-studio";
import { getContractValidationReport } from "@/lib/contract-review";
import {
  isQualityMilestoneName,
  sanitizeMilestonesForBoq,
} from "@/lib/text-quality";
import type { FinancialExtract } from "@/lib/types";
import { letterheadCompanyName } from "@/lib/letterhead";
import { sanitizeFilename } from "@/lib/storage";
import {
  documentExportGate,
  type DocumentExportPermit,
} from "@/lib/document-export-guard";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
} from "@/lib/analytics-collector";
import {
  ProposalLayoutExportError,
  exportProposalLayout,
} from "@/lib/proposal-layout-export";
import {
  selectProposalDownloadEngine,
  claimedStructuredKnowledgeIds,
  requiresStructuredSnapshotForAuthoritativeExport,
  validateStructuredProposalOutput,
  validateStructuredSnapshotEvidence,
  validatePersistedProposalSnapshot,
  type CanonicalProposalSnapshot,
} from "@/lib/proposal-snapshot-persistence";
import { loadApprovedStructuredEvidenceBindings } from "@/lib/proposal-snapshot-evidence";
import {
  proposalSnapshotServerIdentityFromRecords,
  validateProposalSnapshotServerIdentity,
} from "@/lib/proposal-snapshot-identity";
import { hasCompleteBoundProposalApproval } from "@/lib/proposal-final-export";
import {
  contractExportOptionsFromSnapshot,
  validatePersistedContractRenderSnapshot,
  type CanonicalContractRenderSnapshot,
} from "@/lib/contract-render-snapshot";
import type { ContractObligationSnapshot } from "@/lib/contract-export";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export type ProposalDownloadFormat =
  | "zip"
  | "pdf"
  | "html"
  | "xlsx"
  | "xlsx-matrix"
  | "xlsx-boq"
  | "slides"
  | "pptx"
  | "manifest";

export function resolveProposalDownloadFormat(
  value: string | null
): ProposalDownloadFormat | null {
  const candidate =
    value === null
      ? "zip"
      : value === "ea-matrix"
        ? "xlsx-matrix"
        : value === "boq"
          ? "xlsx-boq"
          : value;
  switch (candidate) {
    case "zip":
    case "pdf":
    case "html":
    case "xlsx":
    case "xlsx-matrix":
    case "xlsx-boq":
    case "slides":
    case "pptx":
    case "manifest":
      return candidate;
    default:
      return null;
  }
}

export function resolveProposalExportLifecycle(input: {
  readonly proposalStatus: string;
  readonly finalArtifactRequested: boolean;
  readonly hasValidatedRenderSnapshot: boolean;
}): {
  readonly authoritative: boolean;
  readonly lifecycle:
    | "APPROVED"
    | "EXPORTED"
    | "NON_AUTHORITATIVE_PREVIEW";
} {
  const finalStatus =
    input.proposalStatus === "APPROVED" ||
    input.proposalStatus === "EXPORTED";
  if (
    finalStatus &&
    input.finalArtifactRequested &&
    input.hasValidatedRenderSnapshot
  ) {
    return {
      authoritative: true,
      lifecycle:
        input.proposalStatus === "EXPORTED"
          ? "EXPORTED"
          : "APPROVED",
    };
  }
  return {
    authoritative: false,
    lifecycle: "NON_AUTHORITATIVE_PREVIEW",
  };
}

export function shouldMarkProposalExported(input: {
  readonly policyRequestedTransition: boolean;
  /**
   * Whether this request is allowed to mutate proposal lifecycle state.
   *
   * The download surface is a GET because links, iframes and in-app previews
   * depend on it, so it is reachable by prefetch, by a cross-origin
   * `<img>`/`<iframe>`, and by a read-only REVIEWER. Producing the artifact is
   * harmless in all of those cases; advancing APPROVED to EXPORTED is not.
   */
  readonly mutationAllowed: boolean;
  readonly currentStatus: string;
  readonly authoritative: boolean;
  readonly completeBoundReviewChain: boolean;
}): boolean {
  return (
    input.mutationAllowed &&
    input.policyRequestedTransition &&
    input.currentStatus === "APPROVED" &&
    input.authoritative &&
    input.completeBoundReviewChain
  );
}

/**
 * True when a download request may advance proposal lifecycle state.
 *
 * Requires all three:
 * - a role that can write (a REVIEWER may download but must not export),
 * - a same-origin request (blocks a cross-origin tag triggering the transition),
 * - not a prefetch (blocks a browser or crawler exporting on hover).
 *
 * `Sec-Fetch-*` are forbidden headers, so a page cannot forge them; absent
 * values are treated as same-origin to stay compatible with non-browser
 * clients that legitimately drive exports.
 */
function exportMutationAllowed(
  req: NextRequest,
  role: Parameters<typeof canWriteRole>[0]
): boolean {
  if (!canWriteRole(role)) return false;

  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const purpose =
    req.headers.get("sec-purpose") ??
    req.headers.get("purpose") ??
    req.headers.get("x-purpose") ??
    "";
  if (purpose.toLowerCase().includes("prefetch")) return false;

  return true;
}

// GET /api/proposals/[id]/download?format=zip|pdf|html|xlsx|xlsx-matrix|ea-matrix|xlsx-boq|boq|slides|pptx
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!resolveEmailVerifiedClaim(session.user.emailVerified)) {
    return NextResponse.json(
      { error: "EMAIL_VERIFICATION_REQUIRED" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }
  const { id } = await params;
  const rl = await rateLimitAsync({
    key: `proposal-download:${session.user.id}`,
    limit: 10,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) {
    const denial = describeRateLimitDenial(rl);
    return NextResponse.json(
      { error: denial.error },
      {
        status: denial.status,
        headers: {
          "Retry-After": String(denial.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      }
    );
  }
  const { workspace } = await getTenantContext(session.user.id);
  let format = resolveProposalDownloadFormat(
    req.nextUrl.searchParams.get("format")
  );
  if (format === null) {
    return NextResponse.json(
      {
        error:
          "Unsupported format. Expected zip, pdf, html, xlsx, xlsx-matrix, xlsx-boq, slides, pptx, or manifest.",
        code: "UNSUPPORTED_EXPORT_FORMAT",
      },
      { status: 400 }
    );
  }
  const localeParam = req.nextUrl.searchParams.get("locale");
  const pdfLocale =
    localeParam === "ar" || localeParam === "en"
      ? localeParam
      : undefined;

  const proposal = await db.generatedProposal.findUnique({
    where: { id },
    include: {
      project: true,
      workspace: {
        include: {
          brandProfiles: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (
    proposal.structuredSnapshot === null &&
    requiresStructuredSnapshotForAuthoritativeExport({
      proposalType: proposal.type,
      proposalStatus: proposal.status,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "Approved and exported proposals require an immutable validated structured snapshot. Legacy mutable generators are preview-only.",
        code: "STRUCTURED_SNAPSHOT_REQUIRED",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  const exportEngine = selectProposalDownloadEngine(
    proposal.structuredSnapshot !== null,
    format
  );
  if (exportEngine.kind === "STRUCTURED_FORMAT_UNSUPPORTED") {
    return NextResponse.json(
      {
        error:
          "This proposal has an authoritative structured snapshot. Use html, pdf, or pptx; legacy-only formats are disabled to prevent stale output.",
        code: "STRUCTURED_EXPORT_FORMAT_UNSUPPORTED",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  let structuredSnapshot: CanonicalProposalSnapshot | null = null;
  let structuredApprovedEvidenceIds: readonly string[] = [];
  if (
    exportEngine.kind === "STRUCTURED" ||
    exportEngine.kind === "STRUCTURED_SUPPLEMENTAL"
  ) {
    const validation = validatePersistedProposalSnapshot(
      proposal.structuredSnapshot,
      {
        proposalId: proposal.id,
        hash: proposal.structuredSnapshotHash,
        revision: proposal.structuredSnapshotRevision,
        presetKey: proposal.structuredSnapshotPreset,
      }
    );
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Persisted structured proposal snapshot is invalid.",
          code: validation.code,
          diagnostics: validation.diagnostics,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    structuredSnapshot = validation.value;
    const serverIdentity = proposalSnapshotServerIdentityFromRecords({
      project: proposal.project,
      workspace: proposal.workspace,
      brand: proposal.workspace.brandProfiles[0] ?? null,
    });
    const identityDiagnostics = validateProposalSnapshotServerIdentity(
      structuredSnapshot.snapshot,
      serverIdentity
    );
    if (identityDiagnostics.length > 0) {
      return NextResponse.json(
        {
          error:
            "Persisted structured proposal identity no longer matches tenant records.",
          code: "STRUCTURED_IDENTITY_MISMATCH",
          diagnostics: identityDiagnostics,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    const structuredApprovedEvidence =
      await loadApprovedStructuredEvidenceBindings(
        workspace.id,
        claimedStructuredKnowledgeIds(structuredSnapshot.snapshot)
      );
    const evidenceDiagnostics = validateStructuredSnapshotEvidence(
      structuredSnapshot.snapshot,
      structuredApprovedEvidence
    );
    if (evidenceDiagnostics.length > 0) {
      return NextResponse.json(
        {
          error:
            "Persisted structured proposal evidence is no longer approved.",
          code: "STRUCTURED_EVIDENCE_NOT_APPROVED",
          diagnostics: evidenceDiagnostics,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    structuredApprovedEvidenceIds = structuredApprovedEvidence.map(
      (binding) => binding.id
    );
  }

  const isContract = proposal.type === "CONTRACT";
  if (isContract && structuredSnapshot !== null) {
    return NextResponse.json(
      {
        error:
          "A contract record cannot be exported through the Phase 4 proposal snapshot engine.",
        code: "STRUCTURED_SNAPSHOT_TYPE_MISMATCH",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  if (isContract) {
    // Contracts support bilingual legal HTML/PDF, ZIP package, and manifest
    if (!["html", "pdf", "manifest", "zip"].includes(format)) {
      format = "pdf";
    }
  }
  const policy = await db.approvalPolicy.findUnique({
    where: { workspaceId: workspace.id },
    include: { steps: { orderBy: { stepIndex: "asc" } } },
  });
  const finalArtifactRequested = isContract
    ? ["html", "pdf", "manifest", "zip"].includes(format)
    : format === "html" || format === "pdf" || format === "pptx";
  const finalStatus =
    proposal.status === "APPROVED" || proposal.status === "EXPORTED";
  let contractRenderSnapshot: CanonicalContractRenderSnapshot | null =
    null;
  let finalReviewChainValidated = false;
  if (isContract && finalStatus && finalArtifactRequested) {
    const validation = validatePersistedContractRenderSnapshot(
      proposal.contractRenderSnapshot,
      {
        proposalId: proposal.id,
        hash: proposal.contractRenderSnapshotHash,
        revision: proposal.contractRenderSnapshotRevision,
      }
    );
    if (!validation.ok) {
      return NextResponse.json(
        {
          error:
            "Final contract export requires the immutable render snapshot captured at review submission.",
          code: validation.code,
          diagnostics: validation.diagnostics,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    contractRenderSnapshot = validation.value;
  }
  if (
    finalStatus && finalArtifactRequested
  ) {
    const reviews = await db.proposalReview.findMany({
      where: { proposalId: proposal.id },
      orderBy: { stepIndex: "asc" },
    });
    if (
      !hasCompleteBoundProposalApproval(
        proposal,
        reviews,
        policy?.steps ?? []
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Final export requires the exact current approval-policy chain, with every assigned step approved and bound to the current document state.",
          code: "FINAL_REVIEW_BINDING_INVALID",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    finalReviewChainValidated = true;
  }
  let exportLifecycle = resolveProposalExportLifecycle({
    proposalStatus: proposal.status,
    finalArtifactRequested,
    hasValidatedRenderSnapshot:
      structuredSnapshot !== null ||
      contractRenderSnapshot !== null,
  });

  // Deterministic validation gate — blocks final export on pricing/placeholder/NORA/etc.
  const restrictions = await db.restriction.findMany({
    where: { workspaceId: workspace.id, active: true },
    select: { text: true },
  });
  const checksForGate = await db.complianceCheck.findMany({
    where: { projectId: proposal.projectId },
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
  if (structuredSnapshot !== null) {
    const entities = await loadProjectIngestionEntities(proposal.projectId);
    gateReport = validateStructuredProposalOutput(
      structuredSnapshot.snapshot,
      {
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
        restrictions: restrictions.map((restriction) => restriction.text),
        approvedEvidenceIds: structuredApprovedEvidenceIds,
      }
    );
  } else if (isContract) {
    gateReport = getContractValidationReport({
      contentMd:
        contractRenderSnapshot?.snapshot.proposal.contentMd ??
        proposal.contentMd,
      checkedAt:
        contractRenderSnapshot?.snapshot.capturedAt,
    });
  } else {
    const gateFinancial: FinancialExtract | null =
      financialForValidationGate(formsRaw);
    const entities = await loadProjectIngestionEntities(proposal.projectId);
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
            error: redactSensitiveText(err instanceof Error ? err.message : "validation_failed"),
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
  const contractOptions =
    contractRenderSnapshot === null
      ? {
          title: proposal.title,
          titleAr: proposal.titleAr,
          contentMd: proposal.contentMd ?? "",
          projectTitle: proposal.project.title,
          etimadRef: proposal.project.etimadRef,
          brand,
          company: companyLetterhead,
        }
      : contractExportOptionsFromSnapshot(
          contractRenderSnapshot.snapshot
        );
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

  const exportLocale =
    contractRenderSnapshot?.snapshot.proposal.locale ??
    resolveLocale(proposal, pdfLocale);

  // Drop Q&A scraps previously stored as BoQ lines; fall back to standard phases.
  if (boqItems?.length) {
    const hadJunk = boqItems.some((b) => !isQualityMilestoneName(b.item));
    if (hadJunk) {
      const cleaned = sanitizeMilestonesForBoq(
        boqItems.map((b) => ({ name: b.item, weeks: 4 })),
        exportLocale === "ar" ? "ar" : "en"
      );
      boqItems = cleaned.map((m) => ({
        item: m.name,
        unit: "LS",
        qty: 1,
        unitPrice: null,
        total: null,
      }));
    }
  }

  let exportPermit: DocumentExportPermit | null = null;
  if (format === "pdf" || format === "zip" || format === "pptx") {
    const sourceCharacters =
      contractRenderSnapshot !== null
        ? JSON.stringify(contractRenderSnapshot.snapshot).length
        : structuredSnapshot === null
        ? JSON.stringify({
            contentMd: proposal.contentMd,
            artifactsJson: proposal.artifactsJson,
            financialFormsJson: proposal.financialFormsJson,
            checks: checksForGate,
            boqItems,
          }).length
        : structuredSnapshot.canonicalJson.length;
    const admission = await documentExportGate.acquire({
      userId: session.user.id,
      workspaceId: workspace.id,
      sourceCharacters,
      kind:
        structuredSnapshot === null
          ? format === "zip"
            ? "proposal-package"
            : `proposal-${format}`
          : `structured-proposal-${format}`,
    });
    if (!admission.ok) {
      return NextResponse.json(
        { error: admission.message, code: admission.code },
        {
          status: admission.status,
          headers:
            admission.retryAfterSeconds === null
              ? undefined
              : { "Retry-After": String(admission.retryAfterSeconds) },
        }
      );
    }
    exportPermit = admission.permit;
  }

  try {
    let buffer: Buffer;
    let contentType: string;
    let filename: string;
    let layoutPlanHash: string | null = null;

    switch (format) {
      case "pdf":
        if (structuredSnapshot !== null) {
          const artifact = await exportProposalLayout(
            structuredSnapshot.snapshot,
            {
              channel: "PDF",
              presetKey: structuredSnapshot.presetKey,
            }
          );
          buffer = artifact.buffer;
          contentType = artifact.mediaType;
          filename = "Structured_Proposal_Bilingual.pdf";
        } else if (isContract) {
          const { generateBilingualContractPDF } = await import(
            "@/lib/contract-export"
          );
          buffer = await generateBilingualContractPDF(
            contractOptions
          );
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
        if (structuredSnapshot !== null) {
          const artifact = await exportProposalLayout(
            structuredSnapshot.snapshot,
            {
              channel: "HTML",
              presetKey: structuredSnapshot.presetKey,
              render: {
                target: "screen",
                includeDocumentShell: true,
              },
            }
          );
          buffer = artifact.buffer;
          contentType = artifact.mediaType;
          filename = "Structured_Proposal_Bilingual.html";
        } else if (isContract) {
          const { generateBilingualContractHTML } = await import(
            "@/lib/contract-export"
          );
          buffer = generateBilingualContractHTML(contractOptions);
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
      case "xlsx":
        if (structuredSnapshot === null) {
          return NextResponse.json(
            {
              error:
                "Structured XLSX export requires an immutable structured snapshot. Use xlsx-matrix or xlsx-boq for legacy proposals.",
              code: "STRUCTURED_SNAPSHOT_REQUIRED_FOR_XLSX",
            },
            { status: 409, headers: { "Cache-Control": "no-store" } }
          );
        }
        {
          const xlsxLocale = exportLocale === "ar" ? "ar" : "en";
          const artifact = await exportProposalLayout(
            structuredSnapshot.snapshot,
            {
              channel: "XLSX",
              presetKey: structuredSnapshot.presetKey,
              locale: xlsxLocale,
            }
          );
          buffer = artifact.buffer;
          contentType = artifact.mediaType;
          filename = "Structured_Proposal_Data.xlsx";
          layoutPlanHash = artifact.metadata.planHash;
        }
        break;
      case "xlsx-matrix":
        buffer = await generateComplianceMatrixXLSX(
          proposal.project,
          brand,
          checks,
          companyLetterhead,
          exportLocale
        );
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = "Compliance_Matrix.xlsx";
        break;
      case "xlsx-boq":
        buffer = await generateBoQXLSX(
          proposal.project,
          brand,
          boqItems,
          companyLetterhead,
          exportLocale
        );
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        filename = "Financial_BoQ.xlsx";
        break;
      case "slides":
        buffer = Buffer.from(
          generateSlidesHTML(
            proposal,
            proposal.project,
            brand,
            slidesMetrics,
            companyLetterhead,
            exportLocale
          ),
          "utf8"
        );
        contentType = "text/html; charset=utf-8";
        filename = "Technical_Proposal_Slides.html";
        break;
      case "pptx":
        if (structuredSnapshot !== null) {
          const artifact = await exportProposalLayout(
            structuredSnapshot.snapshot,
            {
              channel: "PPTX",
              presetKey: structuredSnapshot.presetKey,
            }
          );
          buffer = artifact.buffer;
          contentType = artifact.mediaType;
          filename = "Structured_Proposal_Bilingual.pptx";
        } else {
          buffer = await generateProposalPPTX(
            proposal,
            proposal.project,
            brand,
            slidesMetrics,
            companyLetterhead,
            exportLocale
          );
          contentType =
            "application/vnd.openxmlformats-officedocument.presentationml.presentation";
          filename = "Technical_Proposal_Slides.pptx";
        }
        break;
      case "manifest": {
        const {
          buildExportManifest,
          CONTRACT_EXPORT_SAFETY,
          manifestToJson,
        } = await import("@/lib/export-manifest");
        buffer = manifestToJson(
          buildExportManifest({
            project:
              contractRenderSnapshot === null
                ? {
                    id: proposal.project.id,
                    title: proposal.project.title,
                    etimadRef: proposal.project.etimadRef,
                    updatedAt: proposal.project.updatedAt,
                  }
                : {
                    id: contractRenderSnapshot.snapshot.project.id,
                    title:
                      contractRenderSnapshot.snapshot.project.title,
                    etimadRef:
                      contractRenderSnapshot.snapshot.project.etimadRef,
                    updatedAt: new Date(
                      contractRenderSnapshot.snapshot.project.updatedAt
                    ),
                  },
            proposal:
              contractRenderSnapshot === null
                ? {
                    id: proposal.id,
                    version: proposal.version,
                    status: proposal.status,
                    locale: proposal.locale,
                    contentMd: proposal.contentMd,
                    approvedAt: proposal.approvedAt,
                  }
                : {
                    id: contractRenderSnapshot.snapshot.proposal.id,
                    version:
                      contractRenderSnapshot.snapshot.proposal.version,
                    status: "APPROVED",
                    locale:
                      contractRenderSnapshot.snapshot.proposal.locale,
                    contentMd:
                      contractRenderSnapshot.snapshot.proposal.contentMd,
                    approvedAt: null,
                  },
            validation: gateReport,
            ...(isContract
              ? { contractSafety: CONTRACT_EXPORT_SAFETY }
              : {}),
            artifacts: [],
            generatedAt:
              contractRenderSnapshot?.snapshot.capturedAt,
          })
        );
        contentType = "application/json; charset=utf-8";
        filename = "Export_Manifest.json";
        break;
      }
      case "zip":
        if (isContract) {
          const { generateContractPackageZIP } = await import(
            "@/lib/contract-export"
          );
          let obligations: ContractObligationSnapshot[];
          if (contractRenderSnapshot !== null) {
            obligations = [
              ...contractRenderSnapshot.snapshot.obligations,
            ];
          } else {
            const { extractObligations } = await import(
              "@/lib/contract-obligations"
            );
            const { parseContractArticles } = await import(
              "@/lib/contract-format"
            );
            const { parseContractArtifacts } = await import(
              "@/lib/contract-artifacts"
            );
            const artifacts = parseContractArtifacts(
              proposal.artifactsJson
            );
            const articles =
              artifacts.articles?.length
                ? artifacts.articles
                : parseContractArticles(proposal.contentMd ?? "");
            const derived = extractObligations(
              articles,
              artifacts.milestones
            );
            const states =
              await db.contractObligationState.findMany({
                where: { proposalId: proposal.id },
              });
            const statusById = new Map(
              states.map((state) => [
                state.obligationId,
                state.status as "open" | "done",
              ])
            );
            obligations = derived.map((row) => ({
              ...row,
              status: statusById.get(row.id) ?? row.status,
            }));
          }
          const frozenContract =
            contractRenderSnapshot?.snapshot ?? null;
          buffer = await generateContractPackageZIP({
            ...contractOptions,
            proposalId:
              frozenContract?.proposal.id ?? proposal.id,
            proposalVersion:
              frozenContract?.proposal.version ?? proposal.version,
            proposalStatus:
              frozenContract === null
                ? proposal.status
                : "APPROVED",
            proposalLocale:
              frozenContract?.proposal.locale ?? proposal.locale,
            projectId:
              frozenContract?.project.id ?? proposal.project.id,
            projectUpdatedAt:
              frozenContract?.project.updatedAt ??
              proposal.project.updatedAt,
            generatedAt: frozenContract?.capturedAt,
            validation: gateReport,
            obligations,
          });
          contentType = "application/zip";
          {
            const companyName = letterheadCompanyName(
              exportLocale,
              contractOptions.brand,
              contractOptions.company
            );
            const companySlug =
              sanitizeFilename(companyName)
                .replace(/\s+/g, "_")
                .replace(/_+/g, "_") || "Contract_Package";
            filename = `${companySlug}_Contract_Package.zip`;
          }
        } else if (structuredSnapshot !== null) {
          const { generateStructuredBidPackageZIP } = await import(
            "@/lib/structured-bid-package"
          );
          buffer = await generateStructuredBidPackageZIP({
            snapshot: structuredSnapshot.snapshot,
            presetKey: structuredSnapshot.presetKey,
            proposalId: proposal.id,
            proposalVersion: proposal.version,
            proposalStatus: proposal.status,
            proposalContentMd: proposal.contentMd,
            proposalApprovedAt: proposal.approvedAt,
            project: proposal.project,
            brand,
            checks,
            boqItems: boqItems ?? [],
            validation: gateReport,
            company: companyLetterhead,
            locale: exportLocale,
          });
          contentType = "application/zip";
          {
            const companyName = letterheadCompanyName(
              exportLocale,
              brand,
              companyLetterhead
            );
            const companySlug =
              sanitizeFilename(companyName)
                .replace(/\s+/g, "_")
                .replace(/_+/g, "_") || "Bid_Package";
            filename = `${companySlug}_Structured_Bid_Package.zip`;
          }
        } else {
          buffer = await generateBidPackageZIP(
            proposal,
            proposal.project,
            brand,
            {
              checks,
              boqItems,
              slidesMetrics,
              validation: gateReport,
              company: companyLetterhead,
              locale: exportLocale,
            }
          );
          contentType = "application/zip";
          {
            const companyName = letterheadCompanyName(
              exportLocale,
              brand,
              companyLetterhead
            );
            const companySlug =
              sanitizeFilename(companyName)
                .replace(/\s+/g, "_")
                .replace(/_+/g, "_") || "Bid_Package";
            filename = `${companySlug}_Bid_Package.zip`;
          }
        }
        break;
      default:
        throw new Error(`Unsupported normalized export format: ${format}`);
    }

    if (
      shouldMarkProposalExported({
        mutationAllowed: exportMutationAllowed(req, session.user.role),
        policyRequestedTransition: policyResult.markExported,
        currentStatus: proposal.status,
        authoritative: exportLifecycle.authoritative,
        completeBoundReviewChain: finalReviewChainValidated,
      })
    ) {
      const transition = await db.generatedProposal.updateMany({
        where: {
          id,
          workspaceId: workspace.id,
          status: "APPROVED",
          updatedAt: proposal.updatedAt,
          ...(isContract
            ? {
                contractRenderSnapshotHash:
                  contractRenderSnapshot?.hash ?? null,
                contractRenderSnapshotRevision:
                  contractRenderSnapshot?.revision ?? -1,
              }
            : {
                structuredSnapshotHash:
                  structuredSnapshot?.hash ?? null,
                structuredSnapshotRevision:
                  structuredSnapshot?.revision ?? -1,
              }),
        },
        data: { status: "EXPORTED" },
      });
      if (transition.count !== 1) {
        return NextResponse.json(
          {
            error:
              "Proposal changed while the authoritative artifact was being prepared. Retry from the latest state.",
            code: "EXPORT_STATE_CHANGED",
          },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      exportLifecycle = {
        authoritative: true,
        lifecycle: "EXPORTED",
      };
    }

    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "GeneratedProposal",
      resourceId: id,
      details: {
        format,
        exportEngine:
          structuredSnapshot !== null
            ? "structured-v1"
            : contractRenderSnapshot !== null
              ? "contract-render-v1"
              : "legacy-markdown",
        ...(structuredSnapshot === null
          ? contractRenderSnapshot === null
            ? {}
            : {
                contractRenderSnapshotHash:
                  contractRenderSnapshot.hash,
                contractRenderSnapshotRevision:
                  contractRenderSnapshot.revision,
              }
          : {
              snapshotHash: structuredSnapshot.hash,
              snapshotRevision: structuredSnapshot.revision,
              presetKey: structuredSnapshot.presetKey,
            }),
      },
    });

    // The artifact has been produced and any authoritative lifecycle transition
    // has committed. The mutation reference is the exported artifact identity —
    // the channel plus the persisted snapshot hash, or the persisted proposal
    // revision when no snapshot exists — so re-downloading the same artifact
    // appends no second row while a new revision or channel does. A failure never
    // changes this response (requirements 4.1, 4.4, 4.5, 4.6).
    await recordProposalAnalyticsEvent({
      eventType: "proposal_exported",
      proposalId: id,
      mutationRef: `${format}:${
        structuredSnapshot?.hash ??
        contractRenderSnapshot?.hash ??
        String(proposal.version)
      }`,
      origin: analyticsRequestOrigin({
        tenantWorkspaceId: workspace.id,
        actorUserId: session.user.id,
      }),
      metadata: {
        exportFormat: format,
        locale: exportLocale,
        revision:
          structuredSnapshot?.revision ??
          contractRenderSnapshot?.revision ??
          proposal.version,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
        "X-Arabclue-Proposal-Engine":
          structuredSnapshot !== null
            ? "structured-v1"
            : contractRenderSnapshot !== null
              ? "contract-render-v1"
              : "legacy-markdown",
        "X-Proposal-Structured":
          structuredSnapshot === null ? "false" : "true",
        "X-Proposal-Authoritative":
          exportLifecycle.authoritative
            ? "true"
            : "false",
        ...(isContract
          ? {
              "X-Contract-Legal-Review-Status": "UNREVIEWED",
              "X-Contract-Counsel-Review-Required": "true",
              "X-Contract-Executable": "false",
            }
          : {}),
        ...(structuredSnapshot === null
          ? contractRenderSnapshot === null
            ? {
                "X-Proposal-Lifecycle":
                  "NON_AUTHORITATIVE_PREVIEW",
              }
            : {
                "X-Contract-Render-Snapshot-Hash":
                  contractRenderSnapshot.hash,
                "X-Contract-Render-Snapshot-Revision": String(
                  contractRenderSnapshot.revision
                ),
                "X-Proposal-Lifecycle":
                  exportLifecycle.lifecycle,
              }
          : {
              "X-Proposal-Snapshot-Hash": structuredSnapshot.hash,
              "X-Proposal-Snapshot-Revision": String(
                structuredSnapshot.revision
              ),
              "X-Proposal-Layout-Preset": structuredSnapshot.presetKey,
              "X-Proposal-Lifecycle": exportLifecycle.lifecycle,
              ...(layoutPlanHash
                ? { "X-Proposal-Plan-Hash": layoutPlanHash }
                : {}),
            }),
      },
    });
  } catch (err) {
    console.error("[download]", err);
    if (err instanceof ProposalLayoutExportError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "STRUCTURED_EXPORT_BLOCKED",
          channel: err.channel,
          diagnostics: err.diagnostics,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }
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
      { error: redactSensitiveText(err instanceof Error ? err.message : "download failed") },
      { status: 500 }
    );
  } finally {
    await exportPermit?.release();
  }
}
