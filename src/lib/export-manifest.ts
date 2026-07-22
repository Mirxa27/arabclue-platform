/**
 * Export manifest — content hashes, versions, approval/validation status.
 */

import { createHash } from "crypto";
import type { ValidationReport } from "./validation-gate";

export type ManifestArtifact = {
  name: string;
  type: string;
  contentHash: string;
  sizeBytes: number;
};

export type ExportManifest = {
  manifestVersion: "1.0";
  generatorVersion: string;
  generatedAt: string;
  tender: {
    projectId: string;
    title: string;
    etimadRef: string | null;
    tenderVersionHint: string | null;
  };
  proposal: {
    id: string;
    version: number;
    status: string;
    locale: string;
    approvalStatus: string;
    contentHash: string;
  };
  validation: {
    status: "PASS" | "FAIL" | "WARN";
    blocking: boolean;
    issueCodes: string[];
    checkedAt: string;
  };
  artifacts: ManifestArtifact[];
  humanAuthorityNotice: string;
};

export const GENERATOR_VERSION = "arabclue-export-1.0.0";

export function sha256Hex(bytes: Buffer | string): string {
  return createHash("sha256")
    .update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes)
    .digest("hex");
}

export function buildExportManifest(opts: {
  project: {
    id: string;
    title: string;
    etimadRef: string | null;
    updatedAt?: Date | null;
  };
  proposal: {
    id: string;
    version: number;
    status: string;
    locale: string;
    contentMd: string | null;
    approvedAt?: Date | null;
  };
  validation: ValidationReport;
  artifacts: { name: string; type: string; bytes: Buffer }[];
}): ExportManifest {
  const issueCodes = opts.validation.issues.map((i) => i.code);
  const hasWarn = opts.validation.issues.some((i) => i.severity === "warning");
  const validationStatus: ExportManifest["validation"]["status"] =
    opts.validation.blocking ? "FAIL" : hasWarn ? "WARN" : "PASS";

  return {
    manifestVersion: "1.0",
    generatorVersion: GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    tender: {
      projectId: opts.project.id,
      title: opts.project.title,
      etimadRef: opts.project.etimadRef,
      tenderVersionHint: opts.project.updatedAt
        ? opts.project.updatedAt.toISOString()
        : null,
    },
    proposal: {
      id: opts.proposal.id,
      version: opts.proposal.version,
      status: opts.proposal.status,
      locale: opts.proposal.locale,
      approvalStatus: opts.proposal.approvedAt
        ? "APPROVED"
        : opts.proposal.status === "APPROVED"
          ? "APPROVED"
          : opts.proposal.status,
      contentHash: sha256Hex(opts.proposal.contentMd ?? ""),
    },
    validation: {
      status: validationStatus,
      blocking: opts.validation.blocking,
      issueCodes,
      checkedAt: opts.validation.checkedAt,
    },
    artifacts: opts.artifacts.map((a) => ({
      name: a.name,
      type: a.type,
      contentHash: sha256Hex(a.bytes),
      sizeBytes: a.bytes.length,
    })),
    humanAuthorityNotice:
      "ArabClue is an assisted drafting platform. The user remains the final author of record. Generated content requires explicit human approval before submission.",
  };
}

export function manifestToJson(manifest: ExportManifest): Buffer {
  return Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
}

export function validationReportToJson(report: ValidationReport): Buffer {
  return Buffer.from(JSON.stringify(report, null, 2), "utf8");
}
