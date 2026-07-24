/**
 * Public contract-export compatibility surface.
 *
 * The implementation delegates to the structured Phase 2 adapter so existing
 * API routes and ZIP packages use the same safe HTML/PDF renderer.
 */

import {
  buildEnhancedBilingualContractHTML,
  generateEnhancedBilingualContractHTML,
  generateEnhancedBilingualContractPDF,
} from "./contract-export-bilingual";
import {
  letterheadCompanyName,
  type LetterheadBrand,
  type LetterheadCompany,
} from "./letterhead";

export type ContractExportOpts = {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  projectTitle?: string;
  etimadRef?: string | null;
  forPrint?: boolean;
  brand?: LetterheadBrand | null;
  company?: LetterheadCompany | null;
};

export function buildBilingualContractHTML(opts: ContractExportOpts): string {
  return buildEnhancedBilingualContractHTML(opts);
}

export function generateBilingualContractHTML(
  opts: Omit<ContractExportOpts, "forPrint">
): Buffer {
  return generateEnhancedBilingualContractHTML(opts);
}

export async function generateBilingualContractPDF(
  opts: Omit<ContractExportOpts, "forPrint">
): Promise<Buffer> {
  return generateEnhancedBilingualContractPDF(opts);
}

export type ContractObligationSnapshot = {
  id: string;
  text: string;
  source: string;
  status: "open" | "done";
};

/**
 * ZIP package for bilingual contracts: PDF, HTML, markdown, manifest,
 * validation report, and optional obligation register.
 */
export async function generateContractPackageZIP(
  opts: Omit<ContractExportOpts, "forPrint"> & {
    proposalId: string;
    proposalVersion: number;
    proposalStatus: string;
    proposalLocale?: string | null;
    projectId: string;
    projectUpdatedAt?: Date | string | null;
    validation?: import("./validation-gate").ValidationReport;
    obligations?: ContractObligationSnapshot[];
  }
): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const {
    buildExportManifest,
    manifestToJson,
    validationReportToJson,
  } = await import("./export-manifest");
  const { getContractValidationReport } = await import("./contract-review");

  const validation =
    opts.validation ??
    getContractValidationReport({ contentMd: opts.contentMd });

  const htmlBuf = generateBilingualContractHTML(opts);
  zip.file("Draft_Contract_Bilingual.html", htmlBuf);

  const pdfBuf = await generateBilingualContractPDF(opts);
  zip.file("Draft_Contract_Bilingual.pdf", pdfBuf);

  zip.file("Contract_Content.md", opts.contentMd ?? "");

  const obligations = opts.obligations ?? [];
  zip.file(
    "Obligation_Register.json",
    JSON.stringify(
      {
        proposalId: opts.proposalId,
        generatedAt: new Date().toISOString(),
        count: obligations.length,
        done: obligations.filter((o) => o.status === "done").length,
        items: obligations,
      },
      null,
      2
    )
  );

  zip.file("Validation_Report.json", validationReportToJson(validation));

  const companyLabel = letterheadCompanyName("en", opts.brand, opts.company);
  zip.file(
    "Export_Manifest.json",
    manifestToJson(
      buildExportManifest({
        project: {
          id: opts.projectId,
          title: opts.projectTitle ?? opts.title,
          etimadRef: opts.etimadRef ?? null,
          updatedAt: opts.projectUpdatedAt
            ? new Date(opts.projectUpdatedAt)
            : new Date(),
        },
        proposal: {
          id: opts.proposalId,
          version: opts.proposalVersion,
          status: opts.proposalStatus,
          locale: opts.proposalLocale ?? "ar",
          contentMd: opts.contentMd,
          approvedAt: null,
        },
        validation,
        artifacts: [
          {
            name: "Draft_Contract_Bilingual.pdf",
            type: "PDF",
            bytes: pdfBuf,
          },
          {
            name: "Draft_Contract_Bilingual.html",
            type: "HTML",
            bytes: htmlBuf,
          },
        ],
      })
    )
  );

  zip.file(
    "README.txt",
    `${companyLabel} — Bilingual Contract Package
Etimad: ${opts.etimadRef ?? "N/A"}
Generated: ${new Date().toISOString()}
Validation blocking: ${validation.blocking}
Obligations: ${obligations.filter((o) => o.status === "done").length}/${obligations.length} done

Contents:
1. Draft_Contract_Bilingual.pdf
2. Draft_Contract_Bilingual.html
3. Contract_Content.md
4. Obligation_Register.json
5. Validation_Report.json
6. Export_Manifest.json

Authorized legal counsel review required before signature.
ArabClue drafts are assisted — not legal advice. No 100% legal certainty.
`
  );

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return Buffer.from(out);
}
