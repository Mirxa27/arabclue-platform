import { COMPLIANCE_FRAMEWORKS } from "../constants";
import {
  PROCUREMENT_LAW,
  PDPL_RULES,
  LOCAL_CONTENT_PRICE_PREFERENCE,
  NORA_PRINCIPLES,
  SLA_PENALTY_RULES,
  NCA_FRAMEWORKS,
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

  for (const fw of COMPLIANCE_FRAMEWORKS) {
    for (const ctrl of fw.controls) {
      let status: ComplianceMatrixRow["status"] = "PARTIAL";
      let evidence = "";
      let remediation: string | null = null;

      if (fw.id === "PDPL" || ctrl.controlId.startsWith("PDPL")) {
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
        const hasBreach = textMentions(corpus, [
          "breach",
          "72",
          "notification",
          "إخطار",
          "اختراق",
        ]);
        if (ctrl.controlId.includes("14") || /residen|إقامة/i.test(ctrl.title)) {
          status = hasResidency ? "COMPLIANT" : "NON_COMPLIANT";
          evidence = hasResidency
            ? `PDPL residency commitment grounded in tender/solution text. Rule: ${PDPL_RULES.residencyStatement}`
            : `No explicit KSA data residency statement found. Required: ${PDPL_RULES.residencyStatement}`;
          if (status === "NON_COMPLIANT") {
            remediation =
              "Add explicit 100% KSA data residency and NDMO transfer controls to the proposal.";
          }
        } else {
          status = hasBreach || hasResidency ? "COMPLIANT" : "PARTIAL";
          evidence = `PDPL control ${ctrl.controlId}: breach notification window ${PDPL_RULES.breachNotificationHours}h; residency=${hasResidency}`;
          if (status === "PARTIAL") {
            remediation = `Document PDPL response for ${ctrl.title}`;
          }
        }
      } else if (fw.id === "LOCAL_CONTENT") {
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
        status = hit || target != null ? "COMPLIANT" : "PARTIAL";
        evidence = hit
          ? `${PROCUREMENT_LAW.smePreferenceNote}. Applied preference: ${(LOCAL_CONTENT_PRICE_PREFERENCE * 100).toFixed(0)}%. Citation: ${PROCUREMENT_LAW.citation}`
          : target != null
            ? `Local content / saudization target ${target}% extracted from qualification docs. Preference ${(LOCAL_CONTENT_PRICE_PREFERENCE * 100).toFixed(0)}% applies. Citation: ${PROCUREMENT_LAW.citation}`
            : `Local content preference ${(LOCAL_CONTENT_PRICE_PREFERENCE * 100).toFixed(0)}% required — tender text does not explicitly reference local content/SME commitments. Citation: ${PROCUREMENT_LAW.citation}`;
        if (status === "PARTIAL") {
          remediation =
            "Add explicit Local Content / SME preference commitments to the proposal.";
        }
        findings.push(
          status === "COMPLIANT"
            ? `Local content ${(LOCAL_CONTENT_PRICE_PREFERENCE * 100).toFixed(0)}% preference evidenced`
            : "Local content preference not evidenced in tender extract — marked PARTIAL"
        );
      } else if (fw.id === "NORA" || fw.id.startsWith("EA_")) {
        const principle = NORA_PRINCIPLES.find(
          (p) =>
            ctrl.controlId.includes(p.id) ||
            ctrl.title.toLowerCase().includes(p.name.toLowerCase().split(" ")[0])
        );
        const needles = principle
          ? [
              principle.id.toLowerCase(),
              principle.name.toLowerCase(),
              ...principle.requirement
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 4)
                .slice(0, 4),
            ]
          : ["cloud", "zero trust", "encryption", "سحابة", "ثقة"];
        const { hitCount } = controlKeywordHits(corpus, ctrl);
        const hit = textMentions(corpus, needles) || hitCount >= 2;
        status = hit ? "COMPLIANT" : "PARTIAL";
        evidence = hit
          ? `Mapped to NORA/EA control ${ctrl.controlId} (${principle?.id ?? "EA"}): ${ctrl.requirement}`
          : `Control ${ctrl.controlId} requires explicit proposal commitment: ${ctrl.requirement}`;
        if (!hit) remediation = `Strengthen proposal language for ${ctrl.title}`;
      } else if (fw.id.startsWith("NCA")) {
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
        // Require control-specific keyword hits — never blanket COMPLIANT on "cybersecurity" alone
        if (hitCount >= 3 && frameworkHit) {
          status = "COMPLIANT";
          evidence = `NCA ${frameworkLabel} control ${ctrl.controlId} evidenced via terms: ${keywords.slice(0, 4).join(", ")}. Requirement: ${ctrl.requirement}`;
        } else if (hitCount >= 1 || frameworkHit) {
          status = "PARTIAL";
          evidence = `NCA ${frameworkLabel} ${ctrl.controlId} partially evidenced (${hitCount} keyword hits). Requirement: ${ctrl.requirement}`;
          remediation = `Provide explicit control evidence for ${ctrl.controlId} (${ctrl.title})`;
        } else {
          status = "NON_COMPLIANT";
          evidence = `No supporting evidence for NCA ${frameworkLabel} ${ctrl.controlId}. Requirement: ${ctrl.requirement}`;
          remediation = `Address ${ctrl.controlId}: ${ctrl.requirement}`;
        }
      } else {
        const { hitCount } = controlKeywordHits(corpus, ctrl);
        status = hitCount >= 2 ? "COMPLIANT" : "PARTIAL";
        evidence = `${ctrl.requirement} — evaluated against tender extract under ${PROCUREMENT_LAW.nameEn}`;
      }

      rows.push({
        frameworkId: fw.id,
        controlId: ctrl.controlId,
        title: ctrl.title,
        status,
        evidence,
        remediation,
      });
    }
  }

  // SLA enforcement row from procurement rules (always present when entities available)
  if (opts.entities?.sla) {
    const enforced = SLA_PENALTY_RULES.enforceCap(
      opts.entities.sla.perWeek,
      opts.tenderCategory
    );
    const withinCap = opts.entities.sla.maxPercent <= enforced.max;
    rows.push({
      frameworkId: "PROCUREMENT_LAW",
      controlId: "SLA-CAP",
      title: "Delay penalty cap",
      status: withinCap ? "COMPLIANT" : "NON_COMPLIANT",
      evidence: `Weekly ${enforced.weekly}% / max ${enforced.max}% under ${PROCUREMENT_LAW.citation}. Extracted max=${opts.entities.sla.maxPercent}%${enforced.capped ? " (weekly capped)" : ""}`,
      remediation: withinCap
        ? null
        : `Cap SLA penalties at ${enforced.max}% for this tender category`,
    });
    findings.push(
      `SLA enforced at ${enforced.weekly}%/week, max ${enforced.max}% (${PROCUREMENT_LAW.nameAr})`
    );
  }

  const compliant = rows.filter((r) => r.status === "COMPLIANT").length;
  const score = rows.length ? Math.round((compliant / rows.length) * 100) : 0;
  findings.push(
    `Compliance score ${score}% (${compliant}/${rows.length} COMPLIANT). Law: ${PROCUREMENT_LAW.nameAr}`
  );

  return { rows, findings, score };
}
