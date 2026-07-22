/**
 * Knowledge corpus eligibility for RAG / proposal agents.
 * Only approved and currently valid knowledge may be used unless explicitly overridden.
 */

export type KnowledgeEligibility = {
  eligible: boolean;
  reason?: string;
};

export function isCertificateValid(cert: {
  expiresAt: Date | string | null;
  revokedAt?: Date | string | null;
  approved?: boolean | null;
  now?: Date;
}): KnowledgeEligibility {
  const now = cert.now ?? new Date();
  if (cert.approved === false) {
    return { eligible: false, reason: "not_approved" };
  }
  if (cert.revokedAt) {
    return { eligible: false, reason: "revoked" };
  }
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
  approved?: boolean | null;
  revokedAt?: Date | string | null;
}): KnowledgeEligibility {
  if (project.revokedAt) return { eligible: false, reason: "revoked" };
  // Default approved when field absent (legacy rows)
  if (project.approved === false) {
    return { eligible: false, reason: "not_approved" };
  }
  return { eligible: true };
}

export function isLibraryItemEligible(item: {
  approved: boolean;
  restricted: boolean;
}): KnowledgeEligibility {
  if (!item.approved) return { eligible: false, reason: "not_approved" };
  if (item.restricted) return { eligible: false, reason: "restricted" };
  return { eligible: true };
}

export function isMethodologyEligible(item: {
  approved: boolean;
}): KnowledgeEligibility {
  if (!item.approved) return { eligible: false, reason: "not_approved" };
  return { eligible: true };
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
    revokedAt?: Date | string | null;
    approved?: boolean | null;
  },
>(certs: T[], now = new Date()): T[] {
  return certs.filter((c) => isCertificateValid({ ...c, now }).eligible);
}
