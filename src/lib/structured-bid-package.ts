/**
 * Build an authoritative bid ZIP from structured Phase 4 export channels
 * plus live compliance / BoQ sheets (not mutable Markdown).
 */
import JSZip from "jszip";
import { exportProposalLayout } from "@/lib/proposal-layout-export";
import type { ProposalSnapshot } from "@/lib/proposal-layouts";
import { generateComplianceMatrixXLSX, generateBoQXLSX, type PdfLocale } from "@/lib/generators";
import type { BrandProfile, TenderProject } from "@prisma/client";
import type { ValidationReport } from "@/lib/validation-gate";
import {
  renderCoverLetterheadHtml,
  renderSubmissionLetterHtml,
} from "@/lib/branded-front-matter";

export const BRANDED_FRONT_MATTER_ZIP_FILES = [
  "Cover_Letterhead.html",
  "Submission_Letter.html",
] as const;

type BoqRow = {
  item: string;
  unit: string;
  qty: number;
  unitPrice: number | null;
  total: number | null;
};

export async function generateStructuredBidPackageZIP(opts: {
  snapshot: ProposalSnapshot;
  presetKey: string | null | undefined;
  proposalId: string;
  proposalVersion: number;
  /**
   * Real lifecycle state of the proposal.
   *
   * The manifest previously hardcoded `"APPROVED"` — three lines above
   * `approvedAt: null` — so every package shipped an integrity artifact
   * attesting an approval that had not been checked.
   */
  proposalStatus: string;
  /**
   * Proposal body used to derive the manifest content hash. Previously passed
   * as `""`, which made the published hash a constant SHA-256 of the empty
   * string for every export.
   */
  proposalContentMd: string | null;
  proposalApprovedAt?: Date | null;
  project: TenderProject;
  brand: BrandProfile | null;
  checks: Parameters<typeof generateComplianceMatrixXLSX>[2];
  boqItems: BoqRow[];
  validation: ValidationReport;
  locale?: PdfLocale;
  company?: Parameters<typeof generateComplianceMatrixXLSX>[3];
}): Promise<Buffer> {
  const zip = new JSZip();
  const locale: "ar" | "en" = opts.locale === "ar" ? "ar" : "en";
  const presetKey = opts.presetKey as
    | import("@/lib/proposal-layouts").ProposalLayoutKey
    | undefined;
  // A ZIP built from an approved proposal carries authoritative chrome;
  // drafts keep the honest draft marking on every artifact inside.
  const chromeLifecycle: "DRAFT" | "FINAL" =
    opts.proposalStatus === "APPROVED" || opts.proposalStatus === "EXPORTED"
      ? "FINAL"
      : "DRAFT";

  const pdf = await exportProposalLayout(opts.snapshot, {
    channel: "PDF",
    presetKey,
    lifecycle: chromeLifecycle,
  });
  zip.file("Structured_Proposal_Bilingual.pdf", pdf.buffer);

  const pptx = await exportProposalLayout(opts.snapshot, {
    channel: "PPTX",
    presetKey,
    lifecycle: chromeLifecycle,
  });
  zip.file("Structured_Proposal_Bilingual.pptx", pptx.buffer);

  const xlsx = await exportProposalLayout(opts.snapshot, {
    channel: "XLSX",
    presetKey,
    lifecycle: chromeLifecycle,
    locale,
  });
  zip.file("Structured_Proposal_Data.xlsx", xlsx.buffer);

  const html = await exportProposalLayout(opts.snapshot, {
    channel: "HTML",
    presetKey,
    lifecycle: chromeLifecycle,
    render: { target: "screen", includeDocumentShell: true },
  });
  zip.file("Structured_Proposal_Bilingual.html", html.buffer);

  const frontMatter = {
    locale,
    brand: opts.brand,
    company: opts.company ?? null,
    projectTitle: opts.project.title,
    projectTitleAr: opts.project.titleAr,
    etimadRef: opts.project.etimadRef,
  };
  const coverHtml = renderCoverLetterheadHtml(frontMatter);
  const letterHtml = renderSubmissionLetterHtml(frontMatter);
  zip.file("Cover_Letterhead.html", coverHtml);
  zip.file("Submission_Letter.html", letterHtml);

  const matrix = await generateComplianceMatrixXLSX(
    opts.project,
    opts.brand,
    opts.checks,
    opts.company,
    opts.locale
  );
  zip.file("Compliance_Matrix.xlsx", matrix);

  const boq = await generateBoQXLSX(
    opts.project,
    opts.brand,
    opts.boqItems,
    opts.company,
    opts.locale
  );
  zip.file("Financial_BoQ.xlsx", boq);

  const { validationReportToJson, buildExportManifest, manifestToJson } =
    await import("@/lib/export-manifest");
  zip.file(
    "Validation_Report.json",
    validationReportToJson(opts.validation)
  );
  zip.file(
    "Export_Manifest.json",
    manifestToJson(
      buildExportManifest({
        project: {
          id: opts.project.id,
          title: opts.project.title,
          etimadRef: opts.project.etimadRef,
          updatedAt: opts.project.updatedAt,
        },
        proposal: {
          id: opts.proposalId,
          version: opts.proposalVersion,
          status: opts.proposalStatus,
          locale,
          contentMd: opts.proposalContentMd,
          approvedAt: opts.proposalApprovedAt ?? null,
        },
        validation: opts.validation,
        artifacts: [
          { name: "Structured_Proposal_Bilingual.pdf", type: "PDF", bytes: pdf.buffer },
          { name: "Structured_Proposal_Bilingual.pptx", type: "PPTX", bytes: pptx.buffer },
          { name: "Structured_Proposal_Data.xlsx", type: "XLSX", bytes: xlsx.buffer },
          { name: "Cover_Letterhead.html", type: "HTML", bytes: Buffer.from(coverHtml) },
          { name: "Submission_Letter.html", type: "HTML", bytes: Buffer.from(letterHtml) },
          { name: "Compliance_Matrix.xlsx", type: "XLSX", bytes: matrix },
          { name: "Financial_BoQ.xlsx", type: "XLSX", bytes: boq },
        ],
      })
    )
  );

  return zip.generateAsync({ type: "nodebuffer" });
}
