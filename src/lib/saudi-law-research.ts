/**
 * Saudi-law research brief for the Law Contract agent.
 *
 * Built only from the platform regulatory registry, tender extracts, and
 * compliance rows. Does NOT claim live gazette certainty — counsel must verify
 * the latest official publications before signing.
 */

import {
  LEGAL_DISCLAIMER,
  REGULATORY_POLICY_REGISTRY,
  PROCUREMENT_LAW,
  PDPL_RULES,
  PLATFORM_DATA_POSTURE,
  type LegalReviewStatus,
} from "./procurement-rules";
import type { ComplianceMatrixRow, IngestionEntities } from "./types";

export type LawSourceCitation = {
  id: string;
  instrumentEn: string;
  instrumentAr: string;
  authority: string;
  version: string;
  effectiveDate: string;
  reviewDate: string;
  sourceReference: string;
  applicability: string;
  approvalStatus: string;
  notes: string;
};

export type LawResearchFinding = {
  id: string;
  topicEn: string;
  topicAr: string;
  statementEn: string;
  statementAr: string;
  sourceIds: string[];
  /** Draft-grade only — never presented as 100% legal certainty */
  certainty: "REGISTRY_BACKED" | "TENDER_EXPLICIT" | "REQUIRES_COUNSEL";
  legalReviewStatus: LegalReviewStatus;
};

export type SaudiLawResearchBrief = {
  researchedAt: string;
  jurisdiction: "SA";
  disclaimerEn: string;
  disclaimerAr: string;
  updatePostureEn: string;
  updatePostureAr: string;
  sources: LawSourceCitation[];
  findings: LawResearchFinding[];
  tenderAnchors: string[];
  complianceHighlights: Array<{
    controlId: string;
    status: string;
    legalReviewStatus?: string;
  }>;
};

function registrySources(): LawSourceCitation[] {
  return REGULATORY_POLICY_REGISTRY.filter((p) => !p.superseded).map((p) => ({
    id: p.id,
    instrumentEn: p.instrumentName,
    instrumentAr: p.instrumentNameAr ?? p.instrumentName,
    authority: p.authority,
    version: p.version,
    effectiveDate: p.effectiveDate,
    reviewDate: p.reviewDate,
    sourceReference: p.sourceReference,
    applicability: p.applicabilityCriteria,
    approvalStatus: p.humanApprovalStatus,
    notes: p.notes,
  }));
}

/**
 * Research applicable Saudi frameworks before drafting a contract.
 * Certainty is always draft-grade; authorized legal review is mandatory.
 */
export function researchSaudiLawForContract(opts: {
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  projectTitle: string;
  restrictions?: string[];
}): SaudiLawResearchBrief {
  const sources = registrySources();
  const sourceIds = sources.map((s) => s.id);
  const findings: LawResearchFinding[] = [];

  findings.push({
    id: "governing-law",
    topicEn: "Governing law & venue",
    topicAr: "القانون الحاكم والاختصاص",
    statementEn:
      "Draft contracts for KSA-performance engagements should designate the laws of the Kingdom of Saudi Arabia and competent KSA courts or agreed dispute forums, subject to mandatory rules and the parties’ written agreement.",
    statementAr:
      "مسودات العقود للالتزامات المنفَّذة في المملكة ينبغي أن تنص على أنظمة المملكة العربية السعودية ومحاكمها المختصة أو محافل التسوية المتفق عليها، مع مراعاة القواعد الآمرة واتفاق الأطراف المكتوب.",
    sourceIds: sourceIds.filter((id) => id.includes("gtpl") || id.includes("civil")),
    certainty: "REGISTRY_BACKED",
    legalReviewStatus: "REQUIRED",
  });

  findings.push({
    id: "procurement-context",
    topicEn: "Government procurement context",
    topicAr: "سياق المنافسات الحكومية",
    statementEn: `${PROCUREMENT_LAW.nameEn} / ${PROCUREMENT_LAW.nameAr} applies when the engagement is under GTPL. Tender-stated SLA penalties and caps control; statutory candidates are listed only for counsel review and must not overwrite tender text.`,
    statementAr: `ينطبق ${PROCUREMENT_LAW.nameAr} عند خضوع التعاقد لنظام المنافسات. عقوبات ومستويات SLA المنصوص عليها في كراسة الشروط هي الحاكمة؛ والمرشحون النظاميون للمراجعة القانونية فقط ولا يستبدلون نص الكراسة.`,
    sourceIds: ["gtpl-ksa-baseline"],
    certainty: opts.entities?.sla ? "TENDER_EXPLICIT" : "REGISTRY_BACKED",
    legalReviewStatus: "REQUIRED",
  });

  findings.push({
    id: "pdpl",
    topicEn: "Personal data protection",
    topicAr: "حماية البيانات الشخصية",
    statementEn: `${PDPL_RULES.residencyEvaluationNote} Platform posture: ${PLATFORM_DATA_POSTURE.note}`,
    statementAr:
      "يجب تقييم معالجة البيانات الشخصية وفق نظام حماية البيانات الشخصية واللوائح ذات الصلة، بما في ذلك النقل عبر الحدود وتصنيف البيانات وسياسة العميل — دون فرض إقامة بيانات مطلقة بنسبة 100% كاستنتاج عام.",
    sourceIds: ["pdpl-ksa-baseline"],
    certainty: "REGISTRY_BACKED",
    legalReviewStatus: "REQUIRED",
  });

  if (opts.entities?.sla) {
    findings.push({
      id: "sla-tender",
      topicEn: "Delay penalties (tender clause)",
      topicAr: "غرامات التأخير (بند الكراسة)",
      statementEn: `Tender extract states delay penalty ${opts.entities.sla.perWeek}% per week` +
        (opts.entities.sla.maxPercent != null
          ? `, max ${opts.entities.sla.maxPercent}%`
          : "") +
        ". Contract draft must mirror tender wording; statutory candidates are counsel-only.",
      statementAr: `مستخرج الكراسة يذكر غرامة تأخير ${opts.entities.sla.perWeek}% أسبوعياً` +
        (opts.entities.sla.maxPercent != null
          ? ` بحد أقصى ${opts.entities.sla.maxPercent}%`
          : "") +
        ". يجب أن تعكس مسودة العقد صياغة الكراسة؛ والمرشحون النظاميون للمراجعة القانونية فقط.",
      sourceIds: ["gtpl-ksa-baseline"],
      certainty: "TENDER_EXPLICIT",
      legalReviewStatus: "REQUIRED",
    });
  }

  const openCompliance = opts.complianceRows.filter(
    (r) =>
      r.status === "NON_COMPLIANT" ||
      r.status === "PARTIAL" ||
      r.legalReviewStatus === "REQUIRED"
  );
  if (openCompliance.length) {
    findings.push({
      id: "compliance-open-items",
      topicEn: "Open compliance items requiring counsel",
      topicAr: "بنود امتثال مفتوحة تتطلب مراجعة قانونية",
      statementEn: `Compliance matrix flags ${openCompliance.length} item(s) needing attention before signature. Contract schedules should reference remediation obligations without inventing legal conclusions.`,
      statementAr: `تُظهر مصفوفة الامتثال ${openCompliance.length} بنداً يحتاج معالجة قبل التوقيع. يجب أن تشير جداول العقد إلى التزامات المعالجة دون اختراع استنتاجات قانونية.`,
      sourceIds,
      certainty: "REQUIRES_COUNSEL",
      legalReviewStatus: "REQUIRED",
    });
  }

  findings.push({
    id: "update-verification",
    topicEn: "Official update verification",
    topicAr: "التحقق من التحديثات الرسمية",
    statementEn:
      "Platform registry entries carry review dates. Official Umm Al-Qura / competent authority publications may amend instruments after the registry review date. Authorized counsel must verify the current text before execution. The agent never asserts 100% legal certainty.",
    statementAr:
      "تحمل إدخالات سجل المنصة تواريخ مراجعة. قد تعدّل منشورات أم القرى / الجهة المختصة النصوص بعد تاريخ مراجعة السجل. يجب على المستشار القانوني المعتمد التحقق من النص الساري قبل التوقيع. لا يدّعي الوكيل يقيناً قانونياً بنسبة 100%.",
    sourceIds,
    certainty: "REQUIRES_COUNSEL",
    legalReviewStatus: "REQUIRED",
  });

  const tenderAnchors: string[] = [];
  if (opts.entities?.scope) tenderAnchors.push(`Scope: ${opts.entities.scope.slice(0, 400)}`);
  if (opts.entities?.milestones?.length) {
    tenderAnchors.push(
      `Milestones: ${opts.entities.milestones.map((m) => m.name).filter(Boolean).join("; ").slice(0, 400)}`
    );
  }
  for (const r of (opts.restrictions ?? []).slice(0, 8)) {
    tenderAnchors.push(`Restriction: ${r}`);
  }

  return {
    researchedAt: new Date().toISOString(),
    jurisdiction: "SA",
    disclaimerEn: LEGAL_DISCLAIMER,
    disclaimerAr:
      "مسودات العقود والتعليقات التنظيمية أدوات صياغة مساعدة، وليست استشارة قانونية. يلزم مراجعة واعتماد قانوني بشري معتمد قبل التوقيع أو التقديم.",
    updatePostureEn:
      "Research uses the ArabClue regulatory registry and tender extracts only. Counsel must confirm the latest official Saudi instruments before reliance.",
    updatePostureAr:
      "يعتمد البحث على سجل أراب كلاو التنظيمي ومستخرجات الكراسة فقط. يجب على المستشار تأكيد أحدث النصوص الرسمية السعودية قبل الاعتماد.",
    sources,
    findings,
    tenderAnchors,
    complianceHighlights: opts.complianceRows.slice(0, 40).map((r) => ({
      controlId: r.controlId,
      status: r.status,
      legalReviewStatus: r.legalReviewStatus,
    })),
  };
}
