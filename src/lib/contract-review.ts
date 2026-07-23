import type { ValidationReport } from "./validation-gate";
import { validateContractDraft } from "./agents/law-contract";
import { evaluateExportPolicy } from "./proposal-studio";

type ReviewDecision = "APPROVED" | "REJECTED";

export function getSubmittedForReviewStatus(): "REVIEW" {
  return "REVIEW";
}

export function getReviewDecisionProposalStatus(opts: {
  decision: ReviewDecision;
  pendingReviewsAfterDecision: number;
}): "APPROVED" | "REJECTED" | "REVIEWED" {
  if (opts.decision === "REJECTED") return "REJECTED";
  return opts.pendingReviewsAfterDecision === 0 ? "APPROVED" : "REVIEWED";
}

export function getContractValidationReport(opts: {
  contentMd: string | null | undefined;
  checkedAt?: string;
}): ValidationReport {
  const validation = validateContractDraft(opts.contentMd ?? "");
  return {
    ok: validation.ok,
    blocking: validation.blocking,
    issues: validation.issues,
    checkedAt: opts.checkedAt ?? new Date().toISOString(),
  };
}

export function getContractExportReadiness(opts: {
  contentMd: string | null | undefined;
  proposalStatus: string;
  format: string;
  hasApprovalPolicy: boolean;
  checkedAt?: string;
}): {
  validation: ValidationReport;
  exportReady: boolean;
  exportBlocker: { code: string; error: string } | null;
} {
  const validation = getContractValidationReport({
    contentMd: opts.contentMd,
    checkedAt: opts.checkedAt,
  });
  const policy = evaluateExportPolicy({
    proposalStatus: opts.proposalStatus,
    validation,
    format: opts.format,
    hasApprovalPolicy: opts.hasApprovalPolicy,
  });
  return {
    validation,
    exportReady: policy.allowed,
    exportBlocker: policy.allowed
      ? null
      : { code: policy.code, error: policy.error },
  };
}
