/**
 * Knowledge corpus eligibility for RAG / proposal agents.
 * Only approved and currently valid knowledge may be used unless explicitly overridden.
 */

import { knowledgeProvenanceSchema } from "./knowledge-approval";

export type KnowledgeEligibility = {
  eligible: boolean;
  reason?: string;
};

export type KnowledgeReviewFields = {
  approved?: boolean | null;
  reviewStatus?: string | null;
  evidenceRef?: string | null;
  evidenceDocumentId?: string | null;
  evidenceVersion?: number | null;
  evidenceChecksum?: string | null;
  provenanceJson?: string | null;
  reviewedById?: string | null;
  approvedAt?: Date | string | null;
  contentHash?: string | null;
  revokedAt?: Date | string | null;
};

export function isKnowledgeReviewApproved(
  item: KnowledgeReviewFields,
  expectedContentHash?: string
): KnowledgeEligibility {
  if (item.approved !== true || item.reviewStatus !== "APPROVED") {
    return { eligible: false, reason: "not_approved" };
  }
  if (item.revokedAt) return { eligible: false, reason: "revoked" };
  if (
    !item.evidenceRef?.trim() ||
    !item.evidenceDocumentId?.trim() ||
    !Number.isSafeInteger(item.evidenceVersion) ||
    (item.evidenceVersion ?? 0) < 1 ||
    !item.evidenceChecksum?.match(/^[a-f0-9]{64}$/i) ||
    !item.provenanceJson?.trim() ||
    !item.reviewedById?.trim() ||
    !item.approvedAt ||
    !item.contentHash?.trim()
  ) {
    return { eligible: false, reason: "incomplete_review" };
  }
  let provenance: unknown;
  try {
    provenance = JSON.parse(item.provenanceJson);
  } catch {
    return { eligible: false, reason: "invalid_provenance" };
  }
  const parsedProvenance = knowledgeProvenanceSchema.safeParse(provenance);
  if (!parsedProvenance.success) {
    return { eligible: false, reason: "invalid_provenance" };
  }
  const checksum = item.evidenceChecksum.toLowerCase();
  const expectedEvidenceRef =
    `uploaded-document:${item.evidenceDocumentId}:v${item.evidenceVersion}` +
    `:sha256:${checksum}`;
  if (
    parsedProvenance.data.sourceId !== item.evidenceDocumentId ||
    parsedProvenance.data.version !== item.evidenceVersion ||
    parsedProvenance.data.checksum.toLowerCase() !== checksum ||
    item.evidenceRef !== expectedEvidenceRef
  ) {
    return { eligible: false, reason: "evidence_mismatch" };
  }
  if (
    expectedContentHash !== undefined &&
    item.contentHash !== expectedContentHash
  ) {
    return { eligible: false, reason: "content_changed" };
  }
  return { eligible: true };
}

export function isCertificateValid(cert: {
  expiresAt: Date | string | null;
  expectedContentHash?: string;
  now?: Date;
} & KnowledgeReviewFields): KnowledgeEligibility {
  const now = cert.now ?? new Date();
  const review = isKnowledgeReviewApproved(cert, cert.expectedContentHash);
  if (!review.eligible) return review;
  if (cert.expiresAt) {
    const exp =
      typeof cert.expiresAt === "string"
        ? new Date(cert.expiresAt)
        : cert.expiresAt;
    if (exp.getTime() <= now.getTime()) {
      return { eligible: false, reason: "expired" };
    }
  }
  return { eligible: true };
}

export function isPastProjectEligible(project: {
  expectedContentHash?: string;
} & KnowledgeReviewFields): KnowledgeEligibility {
  return isKnowledgeReviewApproved(project, project.expectedContentHash);
}

export function isLibraryItemEligible(item: {
  restricted: boolean;
  expectedContentHash?: string;
} & KnowledgeReviewFields): KnowledgeEligibility {
  const review = isKnowledgeReviewApproved(item, item.expectedContentHash);
  if (!review.eligible) return review;
  if (item.restricted) return { eligible: false, reason: "restricted" };
  return { eligible: true };
}

export function isMethodologyEligible(item: {
  expectedContentHash?: string;
} & KnowledgeReviewFields): KnowledgeEligibility {
  return isKnowledgeReviewApproved(item, item.expectedContentHash);
}

export function isStaffEligible(member: {
  active: boolean;
}): KnowledgeEligibility {
  if (!member.active) return { eligible: false, reason: "inactive" };
  return { eligible: true };
}

/**
 * Filter certificates for proposal use — exclude expired/revoked/unapproved.
 */
export function filterValidCertificates<
  T extends {
    expiresAt: Date | string | null;
  } & KnowledgeReviewFields,
>(certs: T[], now = new Date()): T[] {
  return certs.filter((c) => isCertificateValid({ ...c, now }).eligible);
}
