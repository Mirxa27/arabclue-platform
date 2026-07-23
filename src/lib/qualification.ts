/**
 * Saudi bidder qualification dossier helpers.
 * Advisory checklist for CR / ZATCA VAT / GOSI / NCA / LCGPA — not hard blockers.
 */

export const CERTIFICATE_TYPES = [
  "CR",
  "ZATCA_VAT",
  "GOSI",
  "NCA",
  "LCGPA",
  "ISO",
  "LICENSE",
  "ZAKAT",
  "VAT", // legacy alias for ZATCA_VAT
  "OTHER",
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export type QualificationDocKey =
  | "cr"
  | "zatca_vat"
  | "gosi"
  | "nca"
  | "lcgpa"
  | "iso";

export type QualificationDocDef = {
  key: QualificationDocKey;
  labelEn: string;
  labelAr: string;
  requiredForStrongBid: boolean;
  certTypes?: CertificateType[];
  workspaceFields?: Array<"crNumber" | "vatNumber">;
};

export const QUALIFICATION_DOSSIER: QualificationDocDef[] = [
  {
    key: "cr",
    labelEn: "Commercial Registration (CR)",
    labelAr: "السجل التجاري",
    requiredForStrongBid: true,
    certTypes: ["CR"],
    workspaceFields: ["crNumber"],
  },
  {
    key: "zatca_vat",
    labelEn: "ZATCA VAT registration",
    labelAr: "تسجيل ضريبة القيمة المضافة (زاتكا)",
    requiredForStrongBid: true,
    certTypes: ["ZATCA_VAT", "VAT"],
    workspaceFields: ["vatNumber"],
  },
  {
    key: "gosi",
    labelEn: "GOSI / social insurance certificate",
    labelAr: "شهادة التأمينات الاجتماعية (GOSI)",
    requiredForStrongBid: true,
    certTypes: ["GOSI"],
  },
  {
    key: "nca",
    labelEn: "NCA cybersecurity attestation / evidence",
    labelAr: "إثبات/شهادة الأمن السيبراني (NCA)",
    requiredForStrongBid: false,
    certTypes: ["NCA"],
  },
  {
    key: "lcgpa",
    labelEn: "LCGPA local content certificate",
    labelAr: "شهادة المحتوى المحلي (LCGPA)",
    requiredForStrongBid: false,
    certTypes: ["LCGPA"],
  },
  {
    key: "iso",
    labelEn: "ISO / quality certification (if tender-stated)",
    labelAr: "شهادة آيزو / جودة (إن اشترطت المناقصة)",
    requiredForStrongBid: false,
    certTypes: ["ISO"],
  },
];

export type QualificationCertInput = {
  certType: string;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  approved?: boolean | null;
};

export type QualificationWorkspaceInput = {
  crNumber?: string | null;
  vatNumber?: string | null;
};

export type QualificationGap = {
  key: QualificationDocKey;
  labelEn: string;
  labelAr: string;
  reason: "missing" | "expired" | "revoked" | "unapproved";
  requiredForStrongBid: boolean;
};

function isExpired(expiresAt?: Date | string | null, now = new Date()): boolean {
  if (!expiresAt) return false;
  const d = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < now.getTime();
}

function certMatches(
  cert: QualificationCertInput,
  types: CertificateType[] | undefined
): boolean {
  if (!types?.length) return false;
  const t = (cert.certType || "").toUpperCase();
  return types.some((x) => x.toUpperCase() === t);
}

/**
 * Returns advisory gaps for the Saudi qualification dossier.
 * Does not invent tender-specific mandatory percentages.
 */
export function assessQualificationDossier(opts: {
  workspace: QualificationWorkspaceInput;
  certificates: QualificationCertInput[];
  now?: Date;
}): {
  gaps: QualificationGap[];
  strongBidReady: boolean;
  presentKeys: QualificationDocKey[];
} {
  const now = opts.now ?? new Date();
  const gaps: QualificationGap[] = [];
  const presentKeys: QualificationDocKey[] = [];

  for (const doc of QUALIFICATION_DOSSIER) {
    const fieldHit = (doc.workspaceFields ?? []).some((f) => {
      const v = opts.workspace[f];
      return typeof v === "string" && v.trim().length > 0;
    });
    const matching = opts.certificates.filter((c) =>
      certMatches(c, doc.certTypes)
    );

    if (fieldHit || matching.length > 0) {
      presentKeys.push(doc.key);
    }

    if (!fieldHit && matching.length === 0) {
      gaps.push({
        key: doc.key,
        labelEn: doc.labelEn,
        labelAr: doc.labelAr,
        reason: "missing",
        requiredForStrongBid: doc.requiredForStrongBid,
      });
      continue;
    }

    // If only certs (no workspace field), check validity of best match
    if (!fieldHit && matching.length > 0) {
      const usable = matching.find(
        (c) =>
          c.approved !== false &&
          !c.revokedAt &&
          !isExpired(c.expiresAt, now)
      );
      if (!usable) {
        const revoked = matching.some((c) => c.revokedAt);
        const expired = matching.some((c) => isExpired(c.expiresAt, now));
        const unapproved = matching.every((c) => c.approved === false);
        gaps.push({
          key: doc.key,
          labelEn: doc.labelEn,
          labelAr: doc.labelAr,
          reason: revoked
            ? "revoked"
            : expired
              ? "expired"
              : unapproved
                ? "unapproved"
                : "missing",
          requiredForStrongBid: doc.requiredForStrongBid,
        });
        // still counted present above; remove from present if invalid-only
        const idx = presentKeys.lastIndexOf(doc.key);
        if (idx >= 0) presentKeys.splice(idx, 1);
      }
    }
  }

  const strongBidReady = !gaps.some((g) => g.requiredForStrongBid);
  return { gaps, strongBidReady, presentKeys };
}
