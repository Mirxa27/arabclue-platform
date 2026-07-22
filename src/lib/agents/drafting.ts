import { generateCompletion } from "../llm";
import { systemDrafting, draftingUserPrompt } from "./prompts";
import { LEGAL_DISCLAIMER } from "../procurement-rules";
import type { CoveragePlan } from "./coverage";
import type {
  IngestionEntities,
  FinancialExtract,
  TechnicalArchitectOutput,
  ComplianceMatrixRow,
  Locale,
} from "../types";

export async function draftProposal(opts: {
  projectTitle: string;
  etimadRef: string | null;
  tenderTypeName: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  technical: TechnicalArchitectOutput & { ragContext: string };
  financial: FinancialExtract;
  coverage: CoveragePlan;
  brandTagline: string;
  vision2030: string;
  locale?: Locale;
  restrictions?: string;
}): Promise<{
  contentMd: string;
  provider: string;
  model: string;
  tokensUsed: number;
  fallback: boolean;
  locale: Locale;
}> {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const complianceJson = JSON.stringify(
    opts.complianceRows.slice(0, 50).map((r) => ({
      control: r.controlId,
      status: r.status,
      sourceCategory: r.sourceCategory,
      evidence: r.evidence.slice(0, 220),
      remediation: r.remediation,
    })),
    null,
    2
  );

  const coverageJson = JSON.stringify(
    {
      coveragePercent: opts.coverage.coveragePercent,
      coveredCount: opts.coverage.coveredCount,
      gapCount: opts.coverage.gapCount,
      evaluationWeights: opts.coverage.evaluationWeights,
      winStrategyNotes: opts.coverage.winStrategyNotes,
      missingEvidenceTasks: opts.coverage.missingEvidenceTasks.slice(0, 15),
      rows: opts.coverage.rows.slice(0, 40).map((r) => ({
        id: r.requirementId,
        text: r.requirementText.slice(0, 200),
        status: r.status,
        section: r.proposalSection,
        evidence: r.evidenceTitles,
        outline: r.responseOutline,
        sectionRef: r.sectionRef,
        pageRef: r.pageRef,
      })),
    },
    null,
    2
  );

  const user = draftingUserPrompt({
    projectTitle: opts.projectTitle,
    etimadRef: opts.etimadRef,
    tenderType: opts.tenderTypeName,
    ingestionJson: JSON.stringify(opts.entities, null, 2).slice(0, 8000),
    complianceJson,
    technicalJson: JSON.stringify(
      {
        approach: opts.technical.solutionApproach,
        methodology: opts.technical.methodology,
        matchedProjects: opts.technical.matchedProjects,
        deliveryModel: opts.technical.deliveryModel,
        governance: opts.technical.governance,
        qualityPlan: opts.technical.qualityPlan,
        riskPlan: opts.technical.riskPlan,
        securityPrivacy: opts.technical.securityPrivacy,
        serviceManagement: opts.technical.serviceManagement,
        trainingTransition: opts.technical.trainingTransition,
        continuity: opts.technical.continuity,
        evaluationAlignment: opts.technical.evaluationAlignment,
        vision: opts.technical.vision2030Notes,
      },
      null,
      2
    ),
    financialJson: JSON.stringify(opts.financial, null, 2),
    coverageJson,
    ragContext: opts.technical.ragContext,
    restrictions: opts.restrictions,
  });

  const result = await generateCompletion(
    [
      { role: "system", content: systemDrafting(locale) },
      { role: "user", content: user },
    ],
    { maxTokens: 8192, temperature: 0.28, engine: "DRAFTING" }
  );

  let contentMd = result.content?.trim() ?? "";
  if (contentMd.startsWith("```")) {
    contentMd = contentMd
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  const usedFallback = !contentMd || result.fallback;
  if (usedFallback) {
    contentMd = buildDeterministicProposal({ ...opts, locale });
  }

  return {
    contentMd,
    provider: result.provider,
    model: result.model,
    tokensUsed: result.tokensUsed,
    fallback: usedFallback || !result.content,
    locale,
  };
}

function coverageTable(coverage: CoveragePlan, locale: Locale): string {
  const header =
    locale === "ar"
      ? "| المعرف | المتطلب | القسم | الأدلة | الحالة |\n| --- | --- | --- | --- | --- |"
      : "| ID | Requirement | Section | Evidence | Status |\n| --- | --- | --- | --- | --- |";
  const rows = coverage.rows
    .slice(0, 40)
    .map((r) => {
      const ev =
        r.evidenceTitles.length > 0
          ? r.evidenceTitles.slice(0, 2).join("; ")
          : locale === "ar"
            ? "— فجوة —"
            : "— gap —";
      return `| ${r.requirementId} | ${r.requirementText.replace(/\|/g, "/").slice(0, 120)} | ${r.proposalSection} | ${ev.replace(/\|/g, "/")} | ${r.status} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

export function buildDeterministicProposal(opts: {
  projectTitle: string;
  etimadRef: string | null;
  tenderTypeName: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  technical: TechnicalArchitectOutput & { ragContext: string };
  financial: FinancialExtract;
  coverage: CoveragePlan;
  brandTagline: string;
  vision2030: string;
  locale?: Locale;
}): string {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const e = opts.entities;
  const c = opts.coverage;
  const compliant = opts.complianceRows.filter((r) => r.status === "COMPLIANT").length;
  const qlr = opts.financial.quickLiquidityRatio;
  const qlrLabel =
    qlr == null
      ? locale === "ar"
        ? "غير محسوب — يلزم كشف مالي معتمد"
        : "N/A — upload approved financial statements"
      : opts.financial.qlrPasses == null
        ? `${qlr} (${opts.financial.qlrFormula ?? "QLR"}; no tender threshold)`
        : `${qlr} (${opts.financial.qlrPasses ? "PASS" : "FAIL"} vs ${opts.financial.qlrThreshold})`;
  const lcPref = opts.financial.localContentPreferenceApplied;
  const lcLabel =
    lcPref == null
      ? locale === "ar"
        ? "غير مذكور في المناقصة"
        : "Not stated in tender"
      : `${lcPref}% (tender-stated)`;
  const gaps = c.missingEvidenceTasks
    .slice(0, 12)
    .map((t) => `- ${t}`)
    .join("\n");
  const experienceBlock = opts.technical.matchedProjects.length
    ? opts.technical.matchedProjects
        .map(
          (p) =>
            `- **${p.title}** [${p.experienceClass}] — score ${p.score.toFixed(3)}: ${p.why}`
        )
        .join("\n")
    : locale === "ar"
      ? "_لا توجد مشاريع معتمدة مطابقة — يُدرج كفجوة أدلة_"
      : "_No approved matching projects — recorded as evidence gap_";

  const complianceBlock = opts.complianceRows
    .slice(0, 25)
    .map(
      (r) =>
        `| ${r.controlId} | ${r.title} | ${r.status} | ${r.sourceCategory ?? "—"} | ${(r.evidence ?? "").replace(/\|/g, "/").slice(0, 100)} |`
    )
    .join("\n");

  const humanNotice =
    locale === "ar"
      ? "مسودة بانتظار اعتماد بشري مخوّل — المستخدم هو المؤلف النهائي."
      : "Draft pending authorized human approval — user is final author of record.";

  if (locale === "ar") {
    return `# العطاء الفني — ${opts.projectTitle}

**العلامة:** ${opts.brandTagline}  
**مرجع اعتماد:** ${opts.etimadRef ?? "غير متوفر"}  
**نوع المناقصة:** ${opts.tenderTypeName}  
**تغطية المتطلبات:** ${c.coveragePercent}% (${c.coveredCount} مكتمل / ${c.partialCount} جزئي / ${c.gapCount} فجوة)

## 1. الملخص التنفيذي
يقدّم هذا العطاء استجابة منظّمة وفق مصفوفة تغطية المتطلبات، مع أولوية الوزن الفني (${c.evaluationWeights.technical}%). تُستخدم exclusively الأدلة المعتمدة لدى المستأجر ونص المناقصة.
نقاط القوة: ${c.strengths.slice(0, 3).join("؛ ") || "قيد استكمال الأدلة"}
${LEGAL_DISCLAIMER}
${humanNotice}

## 2. فهم المشروع
${e?.scope ?? "نطاق العمل كما ورد في كراسة الشروط المرفوعة."}

| البند | القيمة |
| --- | --- |
| الوزن الفني | ${c.evaluationWeights.technical}% |
| الوزن المالي | ${c.evaluationWeights.financial}% |
| غرامة التأخير (نص المناقصة) | ${e?.sla.perWeek ?? "—"}% / أسبوع (حد ${e?.sla.maxPercent ?? "—"}%) |

## 3. مواءمة معايير التقييم
${opts.technical.evaluationAlignment}

استراتيجية التوثيق (بدون تسعير):
${c.winStrategyNotes.map((n) => `- ${n}`).join("\n")}

## 4. مصفوفة تغطية المتطلبات
${coverageTable(c, "ar")}

### مهام استكمال الأدلة
${gaps || "- لا توجد فجوات مسجّلة في الاستخراج الحالي"}

## 5. منهجية التنفيذ
${opts.technical.methodology.map((m) => `### ${m.id}. ${m.nameAr}\n${m.rationale}`).join("\n\n")}

## 6. المعمارية ونموذج التسليم
${opts.technical.solutionApproach}

**نموذج التسليم:** ${opts.technical.deliveryModel}

## 7. الحوكمة والجودة
**الحوكمة:** ${opts.technical.governance}

**الجودة:** ${opts.technical.qualityPlan}

## 8. إدارة المخاطر
${opts.technical.riskPlan}

## 9. الأمن والخصوصية
${opts.technical.securityPrivacy}

## 10. اتفاقيات مستوى الخدمة وإدارة الخدمة
${opts.technical.serviceManagement}

## 11. الفريق والمؤهلات
تُدرج مؤهلات الفريق فقط من أدلة الكوادر المعتمدة في قاعدة المعرفة. أي نقص يُسجَّل كمهمة استكمال.

## 12. الخبرات ذات الصلة
${experienceBlock}

تصنيف الخبرة: exact = تطابق مباشر من دليل معتمد؛ analogous = خبرة مشابهة؛ proposed = نهج مقترح دون ادّعاء إنجاز سابق.

## 13. الالتزامات التنظيمية
ضوابط COMPLIANT: ${compliant}/${opts.complianceRows.length}

| الضابط | العنوان | الحالة | فئة المصدر | الدليل |
| --- | --- | --- | --- | --- |
${complianceBlock}

${LEGAL_DISCLAIMER}

## 14. التدريب والانتقال والاستمرارية
**التدريب والانتقال:** ${opts.technical.trainingTransition}

**الاستمرارية:** ${opts.technical.continuity}

## 15. هيكل النماذج المالية
- QLR: ${qlrLabel}
- تفضيل المحتوى المحلي: ${lcLabel}
- بنود BoQ (هيكل فقط): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

| البند | الوحدة | الكمية | السعر | الإجمالي |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
  .slice(0, 20)
  .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
  .join("\n")}

## 16. الافتراضات والاستثناءات والتوضيحات
- الأسعار والتعبئة التجارية من مسؤولية الفريق التجاري المعتمد لدى العميل فقط.
- أي متطلب بحالة GAP/NEEDS_USER_INPUT يتطلب دليلاً معتمداً قبل التسليم النهائي.
- المحتوى التنظيمي ليس استشارة قانونية.

## 17. المواءمة مع رؤية 2030
${opts.technical.vision2030Notes}
ملاحظة العلامة: ${opts.vision2030}

## 18. الخاتمة
نؤكد جاهزية المسودة للمراجعة البشرية والاعتماد الداخلي قبل أي تقديم رسمي.
${humanNotice}

---
*أراب كلاو — صياغة مساعدة عالية الدقة · المؤلف النهائي هو المستخدم*
`;
  }

  return `# Technical Proposal — ${opts.projectTitle}

**Brand:** ${opts.brandTagline}  
**Etimad Ref:** ${opts.etimadRef ?? "N/A"}  
**Tender Type:** ${opts.tenderTypeName}  
**Requirement coverage:** ${c.coveragePercent}% (${c.coveredCount} covered / ${c.partialCount} partial / ${c.gapCount} gaps)

## 1. Executive Summary
This package is organized as an evaluator-scorable technical response prioritizing the technical evaluation weight (${c.evaluationWeights.technical}%). All factual claims are limited to tender text and approved tenant evidence.
Strengths: ${c.strengths.slice(0, 3).join("; ") || "Pending additional approved evidence"}
${LEGAL_DISCLAIMER}
${humanNotice}

## 2. Project Understanding
${e?.scope ?? "Scope as defined in the uploaded conditions booklet."}

| Item | Value |
| --- | --- |
| Technical evaluation weight | ${c.evaluationWeights.technical}% |
| Financial evaluation weight | ${c.evaluationWeights.financial}% |
| SLA penalty (tender clause) | ${e?.sla.perWeek ?? "—"}% / week (max ${e?.sla.maxPercent ?? "—"}%) |

## 3. Evaluation Alignment
${opts.technical.evaluationAlignment}

Documentation strategy (no pricing):
${c.winStrategyNotes.map((n) => `- ${n}`).join("\n")}

## 4. Requirement Coverage Matrix
${coverageTable(c, "en")}

### Evidence completion tasks
${gaps || "- No extraction-time gaps recorded"}

## 5. Execution Methodology
${opts.technical.methodology.map((m) => `### ${m.id}. ${m.name} (${m.nameAr})\n${m.rationale}`).join("\n\n")}

## 6. Solution Architecture & Delivery Model
${opts.technical.solutionApproach}

**Delivery model:** ${opts.technical.deliveryModel}

## 7. Governance & Quality
**Governance:** ${opts.technical.governance}

**Quality:** ${opts.technical.qualityPlan}

## 8. Risk Management
${opts.technical.riskPlan}

## 9. Security & Privacy Response
${opts.technical.securityPrivacy}

## 10. SLA & Service Management
${opts.technical.serviceManagement}

## 11. Team & Qualifications
Staff qualifications are drawn only from approved active staff evidence in the tenant knowledge base. Shortfalls are listed as completion tasks.

## 12. Relevant Experience
${experienceBlock}

Experience classes: **exact** = direct approved evidence match; **analogous** = related approved evidence; **proposed** = approach without claiming prior delivery.

## 13. Compliance Commitments
COMPLIANT controls: ${compliant}/${opts.complianceRows.length}

| Control | Title | Status | Source category | Evidence |
| --- | --- | --- | --- | --- |
${complianceBlock}

${LEGAL_DISCLAIMER}

## 14. Training, Transition & Continuity
**Training & transition:** ${opts.technical.trainingTransition}

**Continuity:** ${opts.technical.continuity}

## 15. Financial Forms Structure
- QLR: ${qlrLabel}
- Local content preference: ${lcLabel}
- BoQ lines (structure only): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
  .slice(0, 20)
  .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
  .join("\n")}

## 16. Assumptions, Exclusions & Clarifications
- Commercial prices are entered solely by the client's authorized commercial team.
- Any GAP / NEEDS_USER_INPUT requirement requires approved evidence before final submission.
- Regulatory content is not legal advice.

## 17. Vision 2030 Alignment
${opts.technical.vision2030Notes}
Brand note: ${opts.vision2030}

## 18. Closing
This draft is ready for internal human review and authorization prior to any official submission.
${humanNotice}

---
*ArabClue — precision assisted drafting · user is final author of record*
`;
}
