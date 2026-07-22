import { generateCompletion } from "../llm";
import { systemDrafting, draftingUserPrompt } from "./prompts";
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
    opts.complianceRows.slice(0, 40).map((r) => ({
      control: r.controlId,
      status: r.status,
      evidence: r.evidence.slice(0, 200),
    })),
    null,
    2
  );

  const user = draftingUserPrompt({
    projectTitle: opts.projectTitle,
    etimadRef: opts.etimadRef,
    tenderType: opts.tenderTypeName,
    ingestionJson: JSON.stringify(opts.entities, null, 2),
    complianceJson,
    technicalJson: JSON.stringify(
      {
        approach: opts.technical.solutionApproach,
        methodology: opts.technical.methodology,
        matchedProjects: opts.technical.matchedProjects,
        vision: opts.technical.vision2030Notes,
      },
      null,
      2
    ),
    financialJson: JSON.stringify(opts.financial, null, 2),
    ragContext: opts.technical.ragContext,
    restrictions: opts.restrictions,
  });

  const result = await generateCompletion(
    [
      { role: "system", content: systemDrafting(locale) },
      { role: "user", content: user },
    ],
    { maxTokens: 6000, temperature: 0.35, engine: "DRAFTING" }
  );

  let contentMd = result.content?.trim() ?? "";
  // Strip accidental wrapping fences
  if (contentMd.startsWith("```")) {
    contentMd = contentMd.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
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

export function buildDeterministicProposal(opts: {
  projectTitle: string;
  etimadRef: string | null;
  tenderTypeName: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  technical: TechnicalArchitectOutput & { ragContext: string };
  financial: FinancialExtract;
  brandTagline: string;
  vision2030: string;
  locale?: Locale;
}): string {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const e = opts.entities;
  const compliant = opts.complianceRows.filter((r) => r.status === "COMPLIANT").length;
  const qlr = opts.financial.quickLiquidityRatio;
  const qlrLabel =
    qlr == null
      ? locale === "ar"
        ? "غير محسوب"
        : "N/A"
      : `${qlr} (${opts.financial.qlrPasses ? "PASS" : "FAIL"})`;

  if (locale === "ar") {
    return `# العطاء الفني والمالي — ${opts.projectTitle}

**العلامة:** ${opts.brandTagline}  
**مرجع اعتماد:** ${opts.etimadRef ?? "غير متوفر"}  
**نوع المناقصة:** ${opts.tenderTypeName}

## 1. الملخص التنفيذي (Executive Summary)
يقدّم هذا العطاء استجابة متكاملة لمناقصة اعتماد بما يتوافق مع نظام المنافسات والمشتريات الحكومية، وضوابط الهيئة الوطنية للأمن السيبراني (ECC-1:2018 / CCC-1:2020)، ونظام حماية البيانات الشخصية (PDPL) بإقامة البيانات في المملكة، ومبادئ NORA (TP1/SP1/SP2)، مع تطبيق تفضيل المحتوى المحلي الإلزامي بنسبة 10%.

## 2. فهم المشروع (Project Understanding)
${e?.scope ?? "نطاق العمل كما ورد في كراسة الشروط والمواصفات المرفوعة."}

| البند | القيمة |
| --- | --- |
| التقييم الفني | ${e?.evaluation.technical ?? 70}% |
| التقييم المالي | ${e?.evaluation.financial ?? 30}% |
| غرامة التأخير | ${e?.sla.perWeek ?? 2}% أسبوعياً (حد أقصى ${e?.sla.maxPercent ?? 20}%) |

## 3. منهجية التنفيذ (Execution Methodology)
${opts.technical.methodology
  .map((m) => `### ${m.id}. ${m.nameAr} (${m.name})\n${m.rationale}`)
  .join("\n\n")}

## 4. نهج الحل (Solution Approach)
${opts.technical.solutionApproach}

## 5. الخبرات ذات الصلة (Relevant Experience)
${
  opts.technical.matchedProjects
    .map((p) => `- **${p.title}** — درجة ${p.score.toFixed(3)}: ${p.why}`)
    .join("\n") || "_لا توجد مشاريع سابقة مطابقة بدرجة كافية_"
}

## 6. الالتزامات التنظيمية (Compliance)
تم تقييم ${compliant}/${opts.complianceRows.length} ضابطاً بحالة COMPLIANT في مصفوفة الامتثال المُنشأة.

## 7. هيكل النماذج المالية (Financial Forms Structure)
- نسبة السيولة السريعة (QLR): ${qlrLabel}
- تفضيل المحتوى المحلي (قاعدة تقييم تنظيمية فقط): ${(opts.financial.localContentPreferenceApplied * 100).toFixed(0)}%
- بنود جدول الكميات (هيكل فقط — الأسعار يُدخلها العميل): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

### ملخص جدول الكميات (أسعار فارغة — يُدخلها فريق العميل)
| البند | الوحدة | الكمية | السعر | الإجمالي |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
  .slice(0, 12)
  .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
  .join("\n")}

## 8. المواءمة مع رؤية 2030
${opts.technical.vision2030Notes}
ملاحظة العلامة التجارية: ${opts.vision2030}

## 9. الخاتمة
نؤكد التزامنا الكامل بمتطلبات اعتماد والمعايير السعودية، وجاهزيتنا للتنفيذ وفق الجدول الزمني المتفق عليه.

---
*أُنشئ بواسطة أراب كلاو · متوافق مع PDPL · إقامة البيانات في المملكة*
`;
  }

  return `# Technical & Financial Proposal — ${opts.projectTitle}

**Brand:** ${opts.brandTagline}  
**Etimad Ref:** ${opts.etimadRef ?? "N/A"}  
**Tender Type:** ${opts.tenderTypeName}

## 1. Executive Summary (الملخص التنفيذي)
This proposal responds to the Etimad tender with full alignment to the Government Tenders and Procurement Law (نظام المنافسات والمشتريات الحكومية), NCA ECC-1:2018 / CCC-1:2020, PDPL KSA residency, NORA TP1/SP1/SP2, and the mandatory 10% Local Content preference.

## 2. Project Understanding (فهم المشروع)
${e?.scope ?? "Scope as defined in the uploaded conditions booklet."}

| Item | Value |
| --- | --- |
| Technical evaluation | ${e?.evaluation.technical ?? 70}% |
| Financial evaluation | ${e?.evaluation.financial ?? 30}% |
| SLA penalty | ${e?.sla.perWeek ?? 2}% / week (max ${e?.sla.maxPercent ?? 20}%) |

## 3. Execution Methodology (منهجية التنفيذ)
${opts.technical.methodology
  .map((m) => `### ${m.id}. ${m.name} (${m.nameAr})\n${m.rationale}`)
  .join("\n\n")}

## 4. Solution Approach (نهج الحل)
${opts.technical.solutionApproach}

## 5. Relevant Experience (الخبرات ذات الصلة)
${
  opts.technical.matchedProjects
    .map((p) => `- **${p.title}** — score ${p.score.toFixed(3)}: ${p.why}`)
    .join("\n") || "_No ranked past projects_"
}

## 6. Compliance Commitments (الالتزامات التنظيمية)
${compliant}/${opts.complianceRows.length} controls assessed COMPLIANT in the generated matrix.

## 7. Financial Forms Structure (هيكل النماذج المالية)
- Quick Liquidity Ratio: ${qlrLabel}
- Local content preference (regulatory evaluation fact only): ${(opts.financial.localContentPreferenceApplied * 100).toFixed(0)}%
- BoQ lines (structure only — client enters prices): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

### BoQ Summary (blank amounts — client-entered)
| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
  .slice(0, 12)
  .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
  .join("\n")}

## 8. Vision 2030 Alignment (المواءمة مع رؤية 2030)
${opts.technical.vision2030Notes}
Brand note: ${opts.vision2030}

## 9. Closing (الخاتمة)
We confirm full readiness to deliver in accordance with Etimad requirements and the agreed schedule.

---
*Generated by Arabclue · PDPL Compliant · KSA Data Residency*
`;
}
