/**
 * Law Contract agent — researches Saudi frameworks then drafts a bilingual
 * EN|AR front-to-front contract. Never claims 100% legal certainty.
 */

import { generateCompletion } from "../llm";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "../ai/provider-unavailable";
import {
  appendGlossaryWithinBudget,
  formatArabicWeeks,
  styleGuideFor,
} from "../ai/style-guide";
import { LEGAL_DISCLAIMER } from "../procurement-rules";
import {
  researchSaudiLawForContract,
  type SaudiLawResearchBrief,
} from "../saudi-law-research";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
  Locale,
} from "../types";
import {
  NO_PRICING_RULE,
  REGULATORY_PRECISION_RULE,
} from "./prompts";
import {
  articleBlock,
  parseContractArticles,
  type ContractArticle,
} from "../contract-format";
import { detectPricingRequest, detectPricingSuggestion } from "../guardrails";

export type { ContractArticle };
export { parseContractArticles };

export type BilingualContractDraft = {
  contentMd: string;
  articles: ContractArticle[];
  research: SaudiLawResearchBrief;
  provider: string;
  model: string;
  tokensUsed: number;
  fallback: boolean;
  locale: "bilingual";
};

type ContractValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

const ARTICLE_HEADER_RE = /^###\s*Article\s+(\d+)[^\n]*$/gim;
const BILINGUAL_ARTICLE_HEADER_RE =
  /^###\s*Article\s+\d+\s*—\s*[^|\n]+\|\s*المادة\s+\d+\s*—\s*[^\n]+$/i;

/** Glossary budget inside the system prompt; the hard rules and the format come first. */
const PROMPT_GLOSSARY_CHARS = 1_200;

/**
 * The system turn. Exported so its size cap can be asserted: the glossary is
 * filtered to the terms the draft under refinement actually uses and capped,
 * so the prompt stays under 6,000 characters for any draft.
 */
export function lawContractSystemPrompt(locale: Locale = "ar", draftText = ""): string {
  const head = `You are ArabClue Agent — Principal Saudi Contract Counsel Drafter (assistant only).
You draft bilingual EN/AR service / supply contracts for Saudi tender engagements.

HARD RULES:
- ${LEGAL_DISCLAIMER}
- ${REGULATORY_PRECISION_RULE}
- ${NO_PRICING_RULE}
- NEVER claim 100% legal certainty, "guaranteed enforceability", or that counsel review is optional.
- Research FIRST using only the provided research brief and tender anchors. Do not invent statutes, article numbers, or gazette updates.
- Every operative clause must be grounded in: (a) tender-explicit facts, (b) registry-backed findings marked REGISTRY_BACKED or TENDER_EXPLICIT, or (c) clearly labeled REQUIRES_COUNSEL recommendations.
- Where the brief and the tender give no value for a term (a party name, a date, a cap, a forum), keep the draft's placeholder or write "[TO BE COMPLETED BY COUNSEL]" / "[يُستكمل بواسطة المستشار القانوني]" — never an invented value.
- The English and Arabic bodies of an article carry the same parties, obligations, periods, percentages, exceptions and remedies; neither adds a term the other lacks.
- Output MUST be bilingual front-to-front using exactly this article format (repeat for each article):

### Article N — English Title | المادة N — العنوان العربي
:::en
English clause body. Formal legal English. No pricing.
:::
:::ar
نص البند بالعربية الفصحى. صياغة قانونية رسمية. بلا تسعير.
:::

- Start with a preamble block:

# DRAFT CONTRACT | مسودة عقد
> NOT LEGAL ADVICE | ليست استشارة قانونية
> Authorized human legal review required before signature.
> يلزم مراجعة قانونية بشرية معتمدة قبل التوقيع.

Then:
# RESEARCH SUMMARY | موجز البحث
(short bullets from the research brief only)

Then:
# OPERATIVE ARTICLES | البنود النافذة
(articles)

End with signature blocks EN/AR and the disclaimer verbatim: "${LEGAL_DISCLAIMER}"
Output Markdown only — no outer code fences.

${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, draftText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

/**
 * What a model does to the article format when it is nearly right: wraps the
 * whole draft in a code fence, puts a hyphen or en dash where the em dash
 * goes in an article header, leaves a trailing space after `:::en`. Each of
 * those made `parseContractArticles` see nothing and the run fall back to the
 * deterministic draft. Normalizing them is safe — none changes a clause — and
 * everything downstream (validation, export) reads the normalized text.
 */
export function normalizeContractMarkdown(md: string): string {
  let text = md.trim();
  const fenced = text.match(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/);
  if (fenced) text = fenced[1].trim();
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/^[ \t]*(:::(?:en|ar)?)[ \t]*$/gim, (_, marker: string) => marker.toLowerCase())
    .replace(
      /^(###\s*Article\s+\d+)\s*[-–—]+\s*([^|\n]+?)\s*\|\s*(المادة\s+\d+)\s*[-–—]+\s*/gim,
      (_, article: string, titleEn: string, madda: string) =>
        `${article} — ${titleEn} | ${madda} — `
    );
}

export function buildDeterministicContract(opts: {
  projectTitle: string;
  etimadRef: string | null;
  parties: { clientEn: string; clientAr: string; vendorEn: string; vendorAr: string };
  entities: IngestionEntities | null;
  research: SaudiLawResearchBrief;
}): { contentMd: string; articles: ContractArticle[] } {
  const scopeEn =
    opts.entities?.scope?.slice(0, 1200) ||
    `Performance of works/services described in tender documents for «${opts.projectTitle}».`;
  const scopeAr =
    opts.entities?.scope?.slice(0, 1200) ||
    `تنفيذ الأعمال/الخدمات الواردة في مستندات المنافسة الخاصة بـ «${opts.projectTitle}».`;

  const slaEn = opts.entities?.sla
    ? `Delay liquidated damages follow the tender clause: ${opts.entities.sla.perWeek}% per week` +
      (opts.entities.sla.maxPercent != null
        ? `, capped at ${opts.entities.sla.maxPercent}%`
        : "") +
      `. Statutory candidates are excluded from this operative clause and reserved for counsel schedules.`
    : `Delay remedies, if any, shall follow the tender documents and applicable mandatory rules after counsel review. No statutory cap is inserted as a tender fact.`;

  const slaAr = opts.entities?.sla
    ? `تُطبَّق غرامات التأخير وفق بند الكراسة: ${opts.entities.sla.perWeek}% أسبوعياً` +
      (opts.entities.sla.maxPercent != null
        ? ` وبحد أقصى ${opts.entities.sla.maxPercent}%`
        : "") +
      `. تُستبعد المرشحات النظامية من هذا البند النافذ وتُحفظ لجداول المراجعة القانونية.`
    : `تُحدَّد جزاءات التأخير — إن وُجدت — وفق مستندات المنافسة والقواعد الآمرة بعد المراجعة القانونية. لا يُدرج أي حد نظامي كأنه نص كراسة.`;

  const articles: ContractArticle[] = [
    {
      number: 1,
      titleEn: "Parties",
      titleAr: "الأطراف",
      bodyEn: `This Draft Service Agreement is prepared between ${opts.parties.clientEn} (“Client”) and ${opts.parties.vendorEn} (“Contractor”) in connection with project «${opts.projectTitle}»${opts.etimadRef ? ` (reference ${opts.etimadRef})` : ""}. Party particulars must be completed from CR/VAT records by authorized signatories.`,
      bodyAr: `تُعد مسودة اتفاقية الخدمات هذه بين ${opts.parties.clientAr} («العميل») و${opts.parties.vendorAr} («المتعاقد») بشأن مشروع «${opts.projectTitle}»${opts.etimadRef ? ` (المرجع ${opts.etimadRef})` : ""}. تُستكمل بيانات الأطراف من السجلات الرسمية (السجل التجاري/الضريبي) بواسطة المفوَّضين بالتوقيع.`,
      sourceIds: ["governing-law"],
    },
    {
      number: 2,
      titleEn: "Definitions",
      titleAr: "التعاريف",
      bodyEn: `“Tender Documents” means the RFP, specifications, addenda, and annexes forming the competition package. “Deliverables” means outputs expressly required by the Tender Documents. “Personal Data” has the meaning under the Saudi Personal Data Protection Law (PDPL) as applicable.`,
      bodyAr: `«مستندات المنافسة» تعني كراسة الشروط والمواصفات والملاحق والمرفقات. «المخرجات» تعني ما تنص عليه مستندات المنافسة صراحة. «البيانات الشخصية» لها المعنى الوارد في نظام حماية البيانات الشخصية بحسب انطباقه.`,
      sourceIds: ["pdpl"],
    },
    {
      number: 3,
      titleEn: "Scope of work",
      titleAr: "نطاق العمل",
      bodyEn: scopeEn,
      bodyAr: scopeAr,
      sourceIds: ["procurement-context"],
    },
    {
      number: 4,
      titleEn: "Term",
      titleAr: "المدة",
      bodyEn: opts.entities?.milestones?.length
        ? `The term follows milestone schedule: ${opts.entities.milestones.map((m) => `${m.name} (${m.weeks} weeks)`).join("; ")}. Exact start/end dates require human completion.`
        : `The term shall follow the Tender Documents. Start and end dates require human completion before signature.`,
      bodyAr: opts.entities?.milestones?.length
        ? `تتبع المدة جدول المعالم: ${opts.entities.milestones.map((m) => `${m.name} (${formatArabicWeeks(m.weeks)})`).join("؛ ")}. تواريخ البدء والانتهاء تتطلب استكمالاً بشرياً.`
        : `تتبع المدة مستندات المنافسة. تواريخ البدء والانتهاء تتطلب استكمالاً بشرياً قبل التوقيع.`,
      sourceIds: ["procurement-context"],
    },
    {
      number: 5,
      titleEn: "Contractor obligations",
      titleAr: "التزامات المتعاقد",
      bodyEn: `The Contractor shall perform the Scope with due professional care, maintain required licenses and qualifications evidenced in the account knowledge base, and comply with applicable KSA laws and Tender Documents. No obligation invents certifications or staff not evidenced.`,
      bodyAr: `يلتزم المتعاقد بتنفيذ النطاق بعناية مهنية معتادة، والمحافظة على التراخيص والمؤهلات المثبتة في قاعدة معرفة الحساب، والامتثال للأنظمة السعودية واجبة التطبيق ومستندات المنافسة. لا يُختلق أي التزام بشهادات أو طاقم غير مثبت.`,
      sourceIds: ["procurement-context"],
    },
    {
      number: 6,
      titleEn: "Client obligations",
      titleAr: "التزامات العميل",
      bodyEn: `The Client shall provide timely access, decisions, and materials reasonably required for performance, and designate an authorized representative.`,
      bodyAr: `يلتزم العميل بتوفير الوصول والقرارات والمواد اللازمة للتنفيذ في وقت معقول، وتعيين ممثل مفوَّض.`,
      sourceIds: ["procurement-context"],
    },
    {
      number: 7,
      titleEn: "Confidentiality",
      titleAr: "السرية",
      bodyEn: `Each party shall protect the other party’s non-public information obtained in connection with this engagement and use it solely for performance, except where disclosure is required by law or competent authority.`,
      bodyAr: `يلتزم كل طرف بحماية معلومات الطرف الآخر غير العامة التي يطّلع عليها بمناسبة هذا التعاقد واستخدامها لأغراض التنفيذ فقط، إلا إذا اقتضى النظام أو جهة مختصة الإفصاح.`,
      sourceIds: ["pdpl"],
    },
    {
      number: 8,
      titleEn: "Personal data protection",
      titleAr: "حماية البيانات الشخصية",
      bodyEn: `Where Personal Data is processed, the parties shall implement PDPL-aligned roles, lawful bases, security measures, and transfer assessments. Default platform hosting posture is KSA where configured; cross-border transfers require explicit evaluation and counsel review.`,
      bodyAr: `عند معالجة بيانات شخصية، يطبّق الطرفان أدواراً وأساساً نظامياً وتدابير أمن وتقييمات نقل متوافقة مع نظام حماية البيانات الشخصية. الوضع التشغيلي الافتراضي للاستضافة هو المملكة حيثما تم التكوين؛ ويتطلب النقل عبر الحدود تقييماً صريحاً ومراجعة قانونية.`,
      sourceIds: ["pdpl"],
    },
    {
      number: 9,
      titleEn: "Delay remedies",
      titleAr: "جزاءات التأخير",
      bodyEn: slaEn,
      bodyAr: slaAr,
      sourceIds: ["sla-tender", "procurement-context"],
    },
    {
      number: 10,
      titleEn: "Liability",
      titleAr: "المسؤولية",
      bodyEn: `Liability allocation, caps, and exclusions shall be completed by authorized counsel. This draft does not invent unlimited liability or statutory caps not present in the Tender Documents.`,
      bodyAr: `توزيع المسؤولية والحدود والاستثناءات تُستكمل بواسطة مستشار قانوني معتمد. لا تختلق هذه المسودة مسؤولية غير محدودة أو حدوداً نظامية غير واردة في مستندات المنافسة.`,
      sourceIds: ["update-verification"],
    },
    {
      number: 11,
      titleEn: "Termination",
      titleAr: "الإنهاء",
      bodyEn: `Either party may terminate for material breach uncured within a reasonable cure period stated in the Tender Documents, or as mandatory law requires. Exit assistance obligations should be scheduled by counsel.`,
      bodyAr: `يجوز لأي طرف الإنهاء عند إخلال جوهري لم يُعالَج خلال مهلة علاج معقولة واردة في مستندات المنافسة، أو حسب ما يقتضيه النظام الآمر. تُجدول التزامات المساعدة عند الخروج بواسطة المستشار.`,
      sourceIds: ["procurement-context"],
    },
    {
      number: 12,
      titleEn: "Governing law and disputes",
      titleAr: "القانون الحاكم والنزاعات",
      bodyEn: `This Agreement is governed by the laws of the Kingdom of Saudi Arabia. Courts of competent jurisdiction in the Kingdom shall have venue, unless the parties validly agree an alternative forum permitted by law.`,
      bodyAr: `تخضع هذه الاتفاقية لأنظمة المملكة العربية السعودية. وتكون محاكم المملكة ذات الاختصاص المكاني، ما لم يتفق الطرفان على محفل بديل يجيزه النظام.`,
      sourceIds: ["governing-law"],
    },
    {
      number: 13,
      titleEn: "General",
      titleAr: "أحكام عامة",
      bodyEn: `This draft, together with the Tender Documents, forms the intended contractual framework. Amendments must be in writing. If any provision is invalid, the remainder continues in effect to the extent permitted.`,
      bodyAr: `تشكّل هذه المسودة مع مستندات المنافسة الإطار التعاقدي المقصود. التعديلات كتابةً. إذا بطل أي بند يستمر الباقي نافذاً بالقدر الذي يسمح به النظام.`,
      sourceIds: ["governing-law"],
    },
    {
      number: 14,
      titleEn: "Human legal review gate",
      titleAr: "بوابة المراجعة القانونية البشرية",
      bodyEn: `${LEGAL_DISCLAIMER} The Law Contract agent performed registry-and-tender research only; official updates after registry review dates must be verified by counsel. No clause is warranted as 100% certain.`,
      bodyAr: `مسودات العقود والتعليقات التنظيمية أدوات صياغة مساعدة، وليست استشارة قانونية. يلزم مراجعة واعتماد قانوني بشري معتمد قبل التوقيع. أجرى وكيل العقود بحثاً من السجل والكراسة فقط؛ ويجب التحقق من التحديثات الرسمية بعد تواريخ مراجعة السجل. لا يُضمن أي بند بيقين 100%.`,
      sourceIds: ["update-verification"],
    },
  ];

  const researchBullets = opts.research.findings
    .map(
      (f) =>
        `- **${f.topicEn} / ${f.topicAr}** [${f.certainty}]: ${f.statementEn}`
    )
    .join("\n");

  const sourcesBlock = opts.research.sources
    .map(
      (s) =>
        `- ${s.instrumentEn} / ${s.instrumentAr} (${s.version}, review ${s.reviewDate}) — ${s.sourceReference}`
    )
    .join("\n");

  const contentMd = `# DRAFT CONTRACT | مسودة عقد
> NOT LEGAL ADVICE | ليست استشارة قانونية
> Authorized human legal review required before signature.
> يلزم مراجعة قانونية بشرية معتمدة قبل التوقيع.

**Project / المشروع:** ${opts.projectTitle}
**Reference / المرجع:** ${opts.etimadRef || "—"}
**Researched at / تاريخ البحث:** ${opts.research.researchedAt}

# RESEARCH SUMMARY | موجز البحث

${opts.research.updatePostureEn}

${opts.research.updatePostureAr}

## Findings | النتائج
${researchBullets}

## Sources (registry) | المصادر (السجل)
${sourcesBlock}

# OPERATIVE ARTICLES | البنود النافذة

${articles.map(articleBlock).join("\n")}

# SIGNATURES | التوقيعات

| Client / العميل | Contractor / المتعاقد |
| --- | --- |
| Name: ________ | Name: ________ |
| Title: ________ | Title: ________ |
| Date: ________ | Date: ________ |

---
${LEGAL_DISCLAIMER}
`;

  return { contentMd, articles };
}

export async function draftLawContract(opts: {
  projectTitle: string;
  etimadRef: string | null;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  brandName?: string | null;
  brandNameAr?: string | null;
  clientName?: string | null;
  clientNameAr?: string | null;
  restrictions?: string[];
  locale?: Locale;
  /** Receives the refined contract as the model writes it; the result is unchanged. */
  onDelta?: (text: string) => void;
  /**
   * Dated, source-linked web passages ([Sn] … URL). Draft-grade context for
   * recitals and REQUIRES_COUNSEL notes, never a substitute for the registry
   * or for counsel; absent when no search key is configured.
   */
  liveResearch?: string;
}): Promise<BilingualContractDraft> {
  const research = researchSaudiLawForContract({
    entities: opts.entities,
    complianceRows: opts.complianceRows,
    projectTitle: opts.projectTitle,
    restrictions: opts.restrictions,
  });

  const parties = {
    clientEn: opts.clientName || "Client (to be completed)",
    clientAr: opts.clientNameAr || "العميل (يُستكمل)",
    vendorEn: opts.brandName || "Contractor (to be completed)",
    vendorAr: opts.brandNameAr || "المتعاقد (يُستكمل)",
  };

  const deterministic = buildDeterministicContract({
    projectTitle: opts.projectTitle,
    etimadRef: opts.etimadRef,
    parties,
    entities: opts.entities,
    research,
  });

  try {
    const completion = await generateCompletion(
      [
        {
          role: "system",
          content: lawContractSystemPrompt(opts.locale ?? "ar", deterministic.contentMd),
        },
        {
          role: "user",
          content: `Research brief JSON:\n${JSON.stringify(research).slice(0, 14000)}\n\n${
            opts.liveResearch
              ? `Live web research (dated, source-linked; cite as [Sn] with the URL inside a REQUIRES_COUNSEL note only; never as a statute text or certainty):\n<document>\n${opts.liveResearch.slice(0, 5000)}\n</document>\n\n`
              : ""
          }Deterministic draft to refine (preserve article markers :::en :::ar):\n${deterministic.contentMd.slice(0, 12000)}\n\nRefine operative language for formality. Do not add pricing. Do not claim 100% certainty. Keep bilingual article format exactly.`,
        },
      ],
      {
        engine: "LAW",
        temperature: 0.15,
        maxTokens: 8192,
        // Same reasoning as the proposal draft: one long attempt.
        timeoutMs: 270_000,
        maxAttempts: 1,
        promptOrigin: "system",
        onDelta: opts.onDelta,
      }
    );

    if (completion.fallback) {
      guardOrThrow(completion, "law-contract:draftContract");
    }

    const md = completion.content?.trim()
      ? normalizeContractMarkdown(completion.content)
      : deterministic.contentMd;
    const articles = parseContractArticles(md);
    const useMd =
      articles.length >= 8 ? md : deterministic.contentMd;
    const useArticles =
      articles.length >= 8 ? articles : deterministic.articles;

    // Force disclaimer presence
    const withDisclaimer = /not legal advice|ليست استشارة قانونية/i.test(useMd)
      ? useMd
      : `${useMd}\n\n---\n${LEGAL_DISCLAIMER}\n`;

    return {
      contentMd: withDisclaimer,
      articles: useArticles,
      research,
      provider: completion.provider,
      model: completion.model,
      tokensUsed: completion.tokensUsed ?? 0,
      fallback: Boolean(completion.fallback) || articles.length < 8,
      locale: "bilingual",
    };
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[law-contract] LLM draft failed, using deterministic", err);
    guardCaughtOrThrow(err, "law-contract:draftContract");
    return {
      contentMd: deterministic.contentMd,
      articles: deterministic.articles,
      research,
      provider: "deterministic",
      model: "saudi-law-registry",
      tokensUsed: 0,
      fallback: true,
      locale: "bilingual",
    };
  }
}

export function validateContractDraft(contentMd: string): {
  ok: boolean;
  blocking: boolean;
  issues: ContractValidationIssue[];
} {
  const issues: ContractValidationIssue[] = [];
  if (!contentMd.trim()) {
    issues.push({
      code: "empty_contract",
      severity: "error",
      message: "Contract content is empty",
    });
  }
  if (!/not legal advice|ليست استشارة قانونية/i.test(contentMd)) {
    issues.push({
      code: "missing_legal_disclaimer",
      severity: "error",
      message: "Contract missing mandatory legal-advice disclaimer",
    });
  }
  if (/100%\s*(certain|certainty|sure|guaranteed)|يقين\s*100|مضمون\s*100/i.test(contentMd)) {
    issues.push({
      code: "false_certainty",
      severity: "error",
      message: "Contract must not claim 100% legal certainty",
    });
  }
  if (detectPricingSuggestion(contentMd) || detectPricingRequest(contentMd)) {
    issues.push({
      code: "pricing_language",
      severity: "error",
      message: "Contract contains pricing recommendation language",
    });
  }
  if (
    !/#\s*RESEARCH SUMMARY\s*\|\s*موجز البحث/i.test(contentMd) ||
    !/##\s*Sources\b[^|\n]*(?:\|\s*المصادر|\n)|##\s*المصادر/i.test(contentMd)
  ) {
    issues.push({
      code: "missing_research_sources",
      severity: "error",
      message: "Contract missing mandatory research summary and source section markers",
    });
  }
  const articles = parseContractArticles(contentMd);
  issues.push(...validateBilingualArticleStructure(contentMd));
  const asymmetric = articles.some((a) => {
    const hasEnglish = a.bodyEn.trim().length > 0;
    const hasArabic = a.bodyAr.trim().length > 0;
    return hasEnglish !== hasArabic;
  });
  if (asymmetric) {
    issues.push({
      code: "bilingual_asymmetry",
      severity: "error",
      message: "Contract article has content in only one language body",
    });
  }
  if (articles.length < 5) {
    issues.push({
      code: "insufficient_articles",
      severity: "warning",
      message: "Fewer than 5 bilingual articles parsed",
    });
  }
  const blocking = issues.some((i) => i.severity === "error");
  return { ok: !blocking, blocking, issues };
}

function validateBilingualArticleStructure(contentMd: string): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  const headers = collectArticleHeaders(contentMd);
  const claimsBilingualArticles =
    /#\s*DRAFT CONTRACT\s*\|\s*مسودة عقد/i.test(contentMd) ||
    /#\s*OPERATIVE ARTICLES\s*\|\s*البنود النافذة/i.test(contentMd) ||
    headers.length > 0;

  if (!claimsBilingualArticles) {
    return issues;
  }

  if (headers.length === 0) {
    issues.push({
      code: "bilingual_structure",
      severity: "error",
      message: "Contract claims bilingual operative articles but no Article EN/AR blocks were found",
    });
    return issues;
  }

  headers.forEach((header, index) => {
    const nextHeader = headers[index + 1];
    const section = contentMd.slice(header.end, nextHeader?.start ?? contentMd.length);
    const articleLabel = Number.isFinite(header.number)
      ? `Article ${header.number}`
      : "Contract article";

    if (!BILINGUAL_ARTICLE_HEADER_RE.test(header.text.trim())) {
      issues.push({
        code: "bilingual_structure",
        severity: "error",
        message: `${articleLabel} header must include paired English and Arabic titles`,
      });
      return;
    }

    const enMarkers = section.match(/^:::en\s*$/gim) ?? [];
    const arMarkers = section.match(/^:::ar\s*$/gim) ?? [];
    if (enMarkers.length !== 1 || arMarkers.length !== 1) {
      issues.push({
        code: "bilingual_structure",
        severity: "error",
        message: `${articleLabel} must include exactly one :::en block and one :::ar block`,
      });
      return;
    }

    const parsed = parseContractArticles(`${header.text}${section}`);
    if (parsed.length !== 1 || parsed[0]?.number !== header.number) {
      issues.push({
        code: "bilingual_structure",
        severity: "error",
        message: `${articleLabel} has malformed bilingual article markup`,
      });
    }
  });

  return issues;
}

function collectArticleHeaders(md: string): Array<{
  number: number;
  text: string;
  start: number;
  end: number;
}> {
  const headers: Array<{
    number: number;
    text: string;
    start: number;
    end: number;
  }> = [];
  let match: RegExpExecArray | null;
  ARTICLE_HEADER_RE.lastIndex = 0;
  while ((match = ARTICLE_HEADER_RE.exec(md)) !== null) {
    headers.push({
      number: Number(match[1]),
      text: match[0],
      start: match.index,
      end: ARTICLE_HEADER_RE.lastIndex,
    });
  }
  return headers;
}
