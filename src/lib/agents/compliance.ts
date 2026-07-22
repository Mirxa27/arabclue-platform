import { COMPLIANCE_FRAMEWORKS } from "../constants";
import {
  PROCUREMENT_LAW,
  PDPL_RULES,
  NORA_PRINCIPLES,
  SLA_PENALTY_RULES,
  NCA_FRAMEWORKS,
  LEGAL_DISCLAIMER,
  extractLocalContentPreference,
  noraPrinciplesFromTender,
  getPolicyById,
  PLATFORM_DATA_POSTURE,
} from "../procurement-rules";
import type { ComplianceMatrixRow, IngestionEntities } from "../types";

function textMentions(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

function controlKeywordHits(
  corpus: string,
  ctrl: { controlId: string; title: string; requirement: string }
): { hitCount: number; keywords: string[] } {
  const keywords = `${ctrl.controlId} ${ctrl.title} ${ctrl.requirement}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .filter(
      (w, i, arr) =>
        arr.indexOf(w) === i &&
        !["with", "from", "that", "this", "shall", "must", "will", "and"].includes(w)
    )
    .slice(0, 10);
  const h = corpus.toLowerCase();
  const hitCount = keywords.filter((k) => h.includes(k)).length;
  return { hitCount, keywords };
}

/**
 * Build compliance matrix from frameworks + tender text/entities.
 * Status is evidence-based — never blanket COMPLIANT without corroborating text.
 * Rows carry sourceCategory and legalReviewStatus so tender facts are never merged
 * with regulatory candidates or internal recommendations.
 */
export function evaluateCompliance(opts: {
  tenderText: string;
  entities: IngestionEntities | null;
  tenderCategory?: string | null;
  saudizationTarget?: number | null;
  localContentTarget?: number | null;
}): { rows: ComplianceMatrixRow[]; findings: string[]; score: number } {
  const corpus = `${opts.tenderText}\n${opts.entities?.scope ?? ""}\n${JSON.stringify(opts.entities ?? {})}`;
  const rows: ComplianceMatrixRow[] = [];
  const findings: string[] = [];
  findings.push(LEGAL_DISCLAIMER);

  const tenderNora = [
    ...(opts.entities?.noraPrinciplesFromTender ?? []),
    ...noraPrinciplesFromTender(opts.tenderText),
  ];
  const localContent =
    opts.entities?.localContentPreferencePercent != null
      ? {
          preferencePercent: opts.entities.localContentPreferencePercent,
          originalWording: opts.entities.localContentOriginalWording ?? null,
          sourceCategory: "EXPLICIT_TENDER" as const,
        }
      : extractLocalContentPreference(opts.tenderText);

  for (const fw of COMPLIANCE_FRAMEWORKS) {
    for (const ctrl of fw.controls) {
      let status: ComplianceMatrixRow["status"] = "PARTIAL";
      let evidence = "";
      let remediation: string | null = null;
      let sourceCategory: ComplianceMatrixRow["sourceCategory"] =
        "INFERRED_APPLICABILITY";
      let legalReviewStatus: ComplianceMatrixRow["legalReviewStatus"] =
        "NOT_LEGAL_ADVICE";
      let policyVersionId: string | null = null;

      if (fw.id === "PDPL" || ctrl.controlId.startsWith("PDPL")) {
        policyVersionId = PDPL_RULES.policyId;
        const hasResidency = textMentions(corpus, [
          "residency",
          "ksa",
          "saudi arabia",
          "إقامة البيانات",
          "المملكة",
          "ndmo",
          "data residency",
          "داخل المملكة",
        ]);
        const hasCrossBorder = textMentions(corpus, [
          "cross-border",
          "transfer",
          "نقل البيانات",
          "خارج المملكة",
        ]);
        const hasBreach = textMentions(corpus, [
          "breach",
          "72",
          "notification",
          "إخطار",
          "اختراق",
        ]);

        if (ctrl.controlId.includes("14") || /residen|إقامة/i.test(ctrl.title)) {
          sourceCategory = hasResidency
            ? "EXPLICIT_TENDER"
            : "REGULATORY_CANDIDATE";
          legalReviewStatus = "REQUIRED";
          if (hasResidency) {
            status = "COMPLIANT";
            evidence = `Tender/solution text references KSA data residency. Platform posture: ${PLATFORM_DATA_POSTURE.defaultHostingRegion}-hosted default. ${PDPL_RULES.residencyEvaluationNote}`;
          } else if (hasCrossBorder) {
            status = "LEGAL_REVIEW_REQUIRED";
            evidence = `Cross-border transfer language present — evaluate against current PDPL transfer regulation and tenant policy. ${PDPL_RULES.residencyEvaluationNote}`;
            remediation =
              "Obtain authorized legal review of transfer mechanism, safeguards, and contractual restrictions.";
          } else {
            status = "CLARIFICATION_REQUIRED";
            evidence = `No explicit residency/transfer clause found. Do not assume a universal 100% residency mandate. ${PDPL_RULES.residencyEvaluationNote}`;
            remediation =
              "Document residency and transfer posture per tender, PDPL, and tenant policy.";
          }
        } else {
          status = hasBreach || hasResidency ? "COMPLIANT" : "PARTIAL";
          sourceCategory = hasBreach || hasResidency
            ? "EXPLICIT_TENDER"
            : "REGULATORY_CANDIDATE";
          evidence = `PDPL control ${ctrl.controlId}: breach-notification candidate window ${PDPL_RULES.breachNotificationHoursCandidate}h (regulatory candidate — confirm applicability). residencyMention=${hasResidency}`;
          if (status === "PARTIAL") {
            remediation = `Document PDPL response for ${ctrl.title}`;
          }
        }
      } else if (fw.id === "LOCAL_CONTENT") {
        policyVersionId = "local-content-mechanisms";
        const hit = textMentions(corpus, [
          "local content",
          "محتوى محلي",
          "sme",
          "سعودة",
          "saudization",
          "nitaqat",
          "منشآت",
        ]);
        const target =
          opts.saudizationTarget ?? opts.localContentTarget ?? null;
        const preference = localContent.preferencePercent;

        if (preference != null) {
          status = "COMPLIANT";
          sourceCategory = "EXPLICIT_TENDER";
          evidence = `Tender-stated preference ${preference}% (${localContent.originalWording ?? "clause present"}). Eligibility must match the tender mechanism and current official rules — not a blanket assumption. Citation: ${PROCUREMENT_LAW.citation}`;
        } else if (hit || target != null) {
          status = "PARTIAL";
          sourceCategory = hit ? "EXPLICIT_TENDER" : "INFERRED_APPLICABILITY";
          evidence =
            target != null
              ? `Local content / saudization target ${target}% present, but no tender-stated preference percentage. Do not assume a blanket preference.`
              : `Local content / SME language present without a stated preference percentage. Mechanism and eligibility require confirmation. Citation: ${PROCUREMENT_LAW.citation}`;
          remediation =
            "Record the specific mechanism and eligibility from the tender and approved official rules.";
        } else {
          status = "NOT_APPLICABLE";
          sourceCategory = "INFERRED_APPLICABILITY";
          evidence =
            "No local-content/SME mechanism identified in tender extract. No blanket preference applied.";
        }
        legalReviewStatus = preference != null ? "REQUIRED" : "NOT_LEGAL_ADVICE";
        findings.push(
          preference != null
            ? `Local content preference ${preference}% from tender (EXPLICIT_TENDER)`
            : "No blanket local-content preference applied"
        );
      } else if (fw.id === "NORA" || fw.id.startsWith("EA_")) {
        // Only use NORA identifiers from tender text or approved registry (currently empty).
        const approved = NORA_PRINCIPLES.find(
          (p) =>
            ctrl.controlId.includes(p.id) ||
            ctrl.title.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])
        );
        const fromTender = tenderNora.find(
          (p) =>
            ctrl.controlId.includes(p.id) ||
            ctrl.title.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])
        );
        const { hitCount } = controlKeywordHits(corpus, ctrl);

        if (fromTender) {
          status = "COMPLIANT";
          sourceCategory = "EXPLICIT_TENDER";
          evidence = `Principle ${fromTender.id} present in tender: "${fromTender.snippet}". Control ${ctrl.controlId} mapped only because the tender names it.`;
        } else if (approved && approved.humanApprovalStatus === "APPROVED") {
          const hit = textMentions(corpus, [
            approved.id.toLowerCase(),
            approved.name.toLowerCase(),
          ]);
          status = hit ? "COMPLIANT" : "PARTIAL";
          sourceCategory = "REGULATORY_CANDIDATE";
          evidence = hit
            ? `Approved NORA registry principle ${approved.id}: ${approved.requirement}`
            : `Approved registry principle ${approved.id} not evidenced in tender — candidate applicability only.`;
          if (!hit) remediation = `Confirm applicability of ${approved.id} with authorized legal/architecture review.`;
        } else {
          status =
            hitCount >= 2 ? "CLARIFICATION_REQUIRED" : "NOT_APPLICABLE";
          sourceCategory = "INFERRED_APPLICABILITY";
          evidence = `No approved official NORA source registered for ${ctrl.controlId}, and tender does not name this identifier. ArabClue does not invent NORA principle IDs.`;
          remediation =
            "Use only identifiers extracted from an approved official NORA source or the tender itself.";
          legalReviewStatus = "REQUIRED";
        }
      } else if (fw.id.startsWith("NCA")) {
        const policy = getPolicyById(
          fw.id.includes("CCC") || ctrl.controlId.startsWith("CCC")
            ? "nca-ccc-baseline"
            : "nca-ecc-baseline"
        );
        policyVersionId = policy?.id ?? null;
        const frameworkLabel =
          fw.id.includes("CCC") || ctrl.controlId.startsWith("CCC")
            ? NCA_FRAMEWORKS.ccc
            : NCA_FRAMEWORKS.ecc;
        const { hitCount, keywords } = controlKeywordHits(corpus, ctrl);
        const frameworkHit = textMentions(corpus, [
          "nca",
          "ecc",
          "ccc",
          "cybersecurity",
          "أمن سيبراني",
          frameworkLabel.toLowerCase(),
        ]);
        sourceCategory = frameworkHit
          ? "EXPLICIT_TENDER"
          : "REGULATORY_CANDIDATE";
        if (hitCount >= 3 && frameworkHit) {
          status = "COMPLIANT";
          evidence = `NCA ${frameworkLabel} control ${ctrl.controlId} evidenced via terms: ${keywords.slice(0, 4).join(", ")}. Requirement: ${ctrl.requirement}. ${NCA_FRAMEWORKS.note}`;
        } else if (hitCount >= 1 || frameworkHit) {
          status = "PARTIAL";
          evidence = `NCA ${frameworkLabel} ${ctrl.controlId} partially evidenced (${hitCount} keyword hits). Requirement: ${ctrl.requirement}. Confirm successor control versions when applicable.`;
          remediation = `Provide explicit control evidence for ${ctrl.controlId} (${ctrl.title})`;
        } else {
          status = "EVIDENCE_MISSING";
          evidence = `No supporting evidence for NCA ${frameworkLabel} ${ctrl.controlId}. Requirement: ${ctrl.requirement}`;
          remediation = `Address ${ctrl.controlId}: ${ctrl.requirement}`;
        }
      } else {
        const { hitCount } = controlKeywordHits(corpus, ctrl);
        status = hitCount >= 2 ? "COMPLIANT" : "PARTIAL";
        sourceCategory = "INFERRED_APPLICABILITY";
        evidence = `${ctrl.requirement} — evaluated against tender extract under ${PROCUREMENT_LAW.nameEn}`;
      }

      rows.push({
        frameworkId: fw.id,
        controlId: ctrl.controlId,
        title: ctrl.title,
        status,
        evidence,
        remediation,
        sourceCategory,
        legalReviewStatus,
        policyVersionId,
      });
    }
  }

  // Tender-stated SLA row (EXPLICIT_TENDER) + separate statutory candidate row
  if (opts.entities?.sla) {
    const tenderSla = opts.entities.sla;
    rows.push({
      frameworkId: "PROCUREMENT_LAW",
      controlId: "SLA-TENDER",
      title: "Delay penalty (tender clause)",
      status: "COMPLIANT",
      sourceCategory: "EXPLICIT_TENDER",
      legalReviewStatus: "NOT_LEGAL_ADVICE",
      policyVersionId: PROCUREMENT_LAW.policyId,
      evidence: `Tender clause: weekly ${tenderSla.perWeek}% / max ${tenderSla.maxPercent}%${tenderSla.originalWording ? ` — "${tenderSla.originalWording}"` : ""}. Clause preserved as-is; not rewritten to statutory defaults.`,
      remediation: null,
    });

    const statutory = SLA_PENALTY_RULES.statutoryCandidate(opts.tenderCategory);
    const exceedsCandidate =
      tenderSla.maxPercent > statutory.maxCandidate ||
      tenderSla.perWeek > statutory.maxCandidate;
    rows.push({
      frameworkId: "PROCUREMENT_LAW",
      controlId: "SLA-STATUTORY-CANDIDATE",
      title: "Delay penalty statutory candidate",
      status: exceedsCandidate ? "LEGAL_REVIEW_REQUIRED" : "PARTIAL",
      sourceCategory: "REGULATORY_CANDIDATE",
      legalReviewStatus: "REQUIRED",
      policyVersionId: PROCUREMENT_LAW.policyId,
      evidence: `Potentially relevant statutory/practice candidate max ${statutory.maxCandidate}% for ${statutory.category} contracts. Source: ${statutory.sourceReference}. This is NOT injected as a tender fact.`,
      remediation: exceedsCandidate
        ? "Authorized legal review: tender penalty exceeds common statutory/practice candidate — confirm enforceability and applicability."
        : "Confirm statutory applicability with authorized legal review; do not treat candidate as tender text.",
    });

    // Backward-compatible SLA-CAP row for existing tests/UI — reflects tender clause status
    rows.push({
      frameworkId: "PROCUREMENT_LAW",
      controlId: "SLA-CAP",
      title: "Delay penalty cap",
      status: "COMPLIANT",
      sourceCategory: "EXPLICIT_TENDER",
      legalReviewStatus: "NOT_LEGAL_ADVICE",
      policyVersionId: PROCUREMENT_LAW.policyId,
      evidence: `Weekly ${tenderSla.perWeek}% / max ${tenderSla.maxPercent}% from tender (EXPLICIT_TENDER). Statutory candidate max ${statutory.maxCandidate}% listed separately. Citation: ${PROCUREMENT_LAW.citation}`,
      remediation: null,
    });

    findings.push(
      `SLA tender clause ${tenderSla.perWeek}%/week, max ${tenderSla.maxPercent}% (${PROCUREMENT_LAW.nameAr}); statutory candidate max ${statutory.maxCandidate}% (legal review)`
    );
  }

  const compliant = rows.filter((r) => r.status === "COMPLIANT").length;
  const score = rows.length ? Math.round((compliant / rows.length) * 100) : 0;
  findings.push(
    `Compliance score ${score}% (${compliant}/${rows.length} COMPLIANT). Law: ${PROCUREMENT_LAW.nameAr}. ${LEGAL_DISCLAIMER}`
  );

  return { rows, findings, score };
}
