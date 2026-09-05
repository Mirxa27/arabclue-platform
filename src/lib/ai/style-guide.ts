/**
 * House style for everything the secondary generators write, in either
 * language, and the glossary that keeps their terminology consistent.
 *
 * Every system prompt under `src/lib/ai/*` and `src/lib/agents/*` appends
 * `styleGuideFor(locale)`; prompts that carry a document also append
 * `glossaryBlock(locale, documentText)`, filtered to the terms that document
 * actually uses so the prompt stays bounded. Both are pure text builders with
 * hard size caps, asserted in `__tests__/ai/style-guide.test.ts`, because a
 * prompt that grows with the glossary is a prompt that one day crowds out the
 * tender it was meant to describe.
 *
 * No runtime imports: this module must be safe anywhere a prompt is built.
 */

import type { Locale } from "../types";

// ---------------------------------------------------------------------------
// Style guides
// ---------------------------------------------------------------------------

/** Upper bound on one locale's guide, so prompt budgets can rely on it. */
export const STYLE_GUIDE_MAX_CHARS = 1_800;

/** Upper bound on a glossary block, filtered or not. */
export const GLOSSARY_BLOCK_MAX_CHARS = 2_000;

/**
 * Standards, authorities and platforms that stay in Latin script in Arabic
 * text. Listed once here so both guides name the same set.
 */
export const LATIN_KEPT_NAMES = [
  "NCA",
  "PDPL",
  "NORA",
  "ECC",
  "CCC",
  "DGA",
  "ISO 27001",
  "Etimad",
  "QLR",
  "BoQ",
  "SLA",
  "GTPL",
] as const;

const LATIN_KEPT_LIST = LATIN_KEPT_NAMES.join(", ");

const ARABIC_GUIDE = `STYLE GUIDE — ARABIC (Modern Standard Arabic for Saudi government tenders):
- Register: formal MSA (الفصحى) only. No colloquialisms, no transliterated English where an established Arabic term exists. Use the glossary equivalents and never alternate synonyms for one concept.
- Punctuation: Arabic comma ، semicolon ؛ question mark ؟ — one space after, none before.
- Numbers: Western digits (0-9) for identifiers, amounts, percentages and clause numbers; write percentages as 15%.
- Dates: Gregorian YYYY-MM-DD. Quote a Hijri date only when the source states it, beside its Gregorian equivalent.
- Standards and platforms stay in Latin script, never transliterated or expanded ad hoc: ${LATIN_KEPT_LIST}.
- Orthography: correct Hamza forms (أ/إ/آ/ء/ؤ/ئ), Taa marbuta ة (not ه) and Alef maqsura ى (not ي) where the word requires them; no tatweel; diacritics only to disambiguate.
- Voice: active verbs with a named actor (يلتزم المتعاقد بـ…). Avoid chains of passive verbs and stacked verbal nouns; one idea per sentence.
- Evaluator-scannable: short paragraphs, numbered headings, tables for matrices, requirement IDs and clause numbers verbatim. No superlatives, no marketing claims, no asserted compliance status without evidence.
- Paired English fields (…En): concise professional American English carrying the same facts and figures as the Arabic.`;

const ENGLISH_GUIDE = `STYLE GUIDE — ENGLISH (professional register for Saudi government tenders):
- Concise and evaluator-scannable: short sentences, one idea each; numbered headings, tables for matrices; requirement IDs and clause numbers verbatim.
- No hype: no superlatives, no unsupported claims of leadership, certainty or compliance status. State the evidence or name the gap.
- Spelling: American English throughout (organization, program, license, analyze) — it matches the platform's own interface copy. Never mix conventions.
- Oxford (serial) comma, consistently: "scope, schedule, and acceptance".
- Numbers and dates: Western digits; percentages as 15%; Gregorian dates YYYY-MM-DD.
- Standards and platforms by their established names, never expanded ad hoc or transliterated: ${LATIN_KEPT_LIST}.
- Terminology: use the glossary equivalents consistently — "tender" for the competition itself, "procuring entity", "bill of quantities", "initial guarantee".
- Voice: active voice with a named actor ("the Contractor shall…"); avoid stacked passives and nominalizations.
- Paired Arabic fields (…Ar): Modern Standard Arabic with Arabic punctuation (، ؛ ؟), Western digits, standards kept in Latin script, correct Hamza and Taa marbuta, carrying the same facts and figures as the English.`;

/** One block per locale; each is below `STYLE_GUIDE_MAX_CHARS`. */
export const TENDER_STYLE_GUIDE: Readonly<Record<Locale, string>> = {
  ar: ARABIC_GUIDE,
  en: ENGLISH_GUIDE,
};

/** The guide for the language the caller is writing in. */
export function styleGuideFor(locale: Locale): string {
  return TENDER_STYLE_GUIDE[locale] ?? TENDER_STYLE_GUIDE.en;
}

// ---------------------------------------------------------------------------
// Glossary
// ---------------------------------------------------------------------------

export type GlossaryEntry = Readonly<{
  /** Canonical Arabic term. */
  ar: string;
  /** Canonical English term. */
  en: string;
  /** Established abbreviation, kept in Latin script in both languages. */
  abbr?: string;
  /** Other spellings a tender may use; matching only, never printed. */
  aliases?: readonly string[];
}>;

/**
 * Core Saudi procurement vocabulary, AR ↔ EN. Ordered by how often a tender
 * needs the term, because the unfiltered block truncates at its cap and the
 * common terms are the ones that must survive.
 */
export const TENDER_GLOSSARY: readonly GlossaryEntry[] = [
  {
    ar: "كراسة الشروط والمواصفات",
    en: "tender documents",
    abbr: "RFP",
    aliases: ["كراسة الشروط", "الكراسة", "conditions booklet", "request for proposal"],
  },
  { ar: "المنافسة", en: "tender", aliases: ["المنافسات", "competition"] },
  {
    ar: "الجهة الحكومية / الجهة الطارحة",
    en: "procuring entity",
    aliases: ["الجهة الحكومية", "الجهة الطارحة", "government entity", "contracting authority"],
  },
  { ar: "جدول الكميات", en: "bill of quantities", abbr: "BoQ", aliases: ["جداول الكميات"] },
  {
    ar: "الضمان الابتدائي",
    en: "initial (bid) guarantee",
    aliases: ["الضمان الأولي", "bid bond", "bid guarantee", "initial guarantee"],
  },
  {
    ar: "الضمان النهائي",
    en: "final (performance) guarantee",
    aliases: ["ضمان حسن التنفيذ", "performance bond", "performance guarantee", "final guarantee"],
  },
  { ar: "المحتوى المحلي", en: "local content", aliases: ["محتوى محلي"] },
  { ar: "السعودة / نطاقات", en: "Saudization / Nitaqat", aliases: ["السعودة", "سعودة", "نطاقات", "saudization", "nitaqat"] },
  {
    ar: "غرامة التأخير",
    en: "delay penalty",
    aliases: ["غرامات التأخير", "liquidated damages", "delay penalties", "penalty"],
  },
  { ar: "اتفاقية مستوى الخدمة", en: "service level agreement", abbr: "SLA", aliases: ["مستوى الخدمة"] },
  {
    ar: "نظام المنافسات والمشتريات الحكومية",
    en: "Government Tenders and Procurement Law",
    abbr: "GTPL",
    aliases: ["procurement law"],
  },
  { ar: "اللائحة التنفيذية", en: "Implementing Regulations", aliases: ["implementing regulation"] },
  { ar: "نظام حماية البيانات الشخصية", en: "Personal Data Protection Law", abbr: "PDPL" },
  { ar: "الهيئة الوطنية للأمن السيبراني", en: "National Cybersecurity Authority", abbr: "NCA" },
  { ar: "الضوابط الأساسية للأمن السيبراني", en: "Essential Cybersecurity Controls", abbr: "ECC" },
  { ar: "ضوابط الأمن السيبراني للحوسبة السحابية", en: "Cloud Cybersecurity Controls", abbr: "CCC" },
  { ar: "هيئة الحكومة الرقمية", en: "Digital Government Authority", abbr: "DGA" },
  { ar: "المعمارية المرجعية الوطنية", en: "National Overall Reference Architecture", abbr: "NORA" },
  { ar: "منصة اعتماد", en: "Etimad platform", abbr: "Etimad", aliases: ["اعتماد"] },
  { ar: "الترسية", en: "award", aliases: ["ترسية", "awarded", "award decision"] },
  {
    ar: "طلب الاستفسار / الاستيضاح",
    en: "clarification request",
    aliases: ["الاستفسار", "استفسار", "استيضاح", "clarification"],
  },
  { ar: "المرفقات / الملاحق", en: "annexes", aliases: ["المرفقات", "الملاحق", "المرفق", "الملحق", "annex", "appendix", "appendices"] },
  { ar: "خطاب التغطية", en: "cover letter", aliases: ["خطاب تغطية"] },
  { ar: "المغلف الفني", en: "technical envelope", aliases: ["العرض الفني", "technical proposal", "technical offer"] },
  { ar: "المغلف المالي", en: "financial envelope", aliases: ["العرض المالي", "financial proposal", "financial offer"] },
  { ar: "نسبة السيولة السريعة", en: "quick liquidity ratio", abbr: "QLR" },
  { ar: "التأهيل المسبق", en: "pre-qualification", aliases: ["التأهيل", "prequalification", "qualification"] },
  { ar: "معايير التقييم", en: "evaluation criteria", aliases: ["معايير التقييم", "evaluation criterion"] },
  { ar: "الأوزان النسبية للتقييم", en: "evaluation weights", aliases: ["الوزن الفني", "الوزن المالي", "technical weight", "financial weight"] },
  { ar: "المتطلبات الإلزامية", en: "mandatory requirements", aliases: ["متطلبات إلزامية", "mandatory requirement"] },
  { ar: "نطاق العمل", en: "scope of work", abbr: "SOW", aliases: ["نطاق الأعمال", "scope"] },
  { ar: "المخرجات", en: "deliverables", aliases: ["مخرجات", "deliverable"] },
  { ar: "المعالم / مراحل التسليم", en: "milestones", aliases: ["المعالم", "مراحل التسليم", "milestone"] },
  { ar: "مدة التنفيذ", en: "execution period", aliases: ["مدة العقد", "contract term", "contract duration"] },
  { ar: "الاستلام الابتدائي / النهائي", en: "provisional / final acceptance", aliases: ["الاستلام الابتدائي", "الاستلام النهائي", "acceptance"] },
  { ar: "أمر الشراء", en: "purchase order", aliases: ["أمر التوريد", "purchase orders"] },
  { ar: "المقاول من الباطن", en: "subcontractor", aliases: ["التعاقد من الباطن", "subcontracting", "subcontract"] },
  { ar: "الملكية الفكرية", en: "intellectual property", abbr: "IP", aliases: ["intellectual-property"] },
  { ar: "السرية", en: "confidentiality", aliases: ["سرية", "confidential"] },
  { ar: "إقامة البيانات", en: "data residency", aliases: ["توطين البيانات", "residency"] },
  { ar: "نقل البيانات عبر الحدود", en: "cross-border data transfer", aliases: ["نقل البيانات", "cross-border", "data transfer"] },
  { ar: "القوة القاهرة", en: "force majeure" },
  { ar: "الإنهاء", en: "termination", aliases: ["إنهاء العقد", "terminate"] },
  { ar: "المستشار القانوني المعتمد", en: "authorized legal counsel", aliases: ["مستشار قانوني", "counsel", "legal review", "مراجعة قانونية"] },
  { ar: "السجل التجاري", en: "commercial registration", abbr: "CR", aliases: ["commercial register"] },
  { ar: "ضريبة القيمة المضافة", en: "value added tax", abbr: "VAT", aliases: ["الزكاة والضريبة", "ZATCA"] },
  { ar: "التأمينات الاجتماعية", en: "General Organization for Social Insurance", abbr: "GOSI" },
  { ar: "المنشآت الصغيرة والمتوسطة", en: "small and medium enterprises", abbr: "SMEs", aliases: ["منشآت", "SME"] },
  { ar: "الممثل المفوض", en: "authorized representative", aliases: ["ممثل مفوض", "المفوض بالتوقيع", "authorized signatory"] },
  { ar: "مصفوفة الامتثال", en: "compliance matrix" },
  { ar: "مصفوفة تغطية المتطلبات", en: "requirement coverage matrix", aliases: ["coverage matrix"] },
  { ar: "رؤية 2030", en: "Vision 2030", aliases: ["رؤية المملكة 2030"] },
];

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * Loose Arabic matching: strips diacritics and tatweel, folds the Alef,
 * Taa marbuta and Alef maqsura variants a tender may spell either way.
 */
export function normalizeArabic(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ARABIC_LETTER = /[\u0600-\u06FF]/;

function termAppears(term: string, haystackRaw: string, haystackNorm: string): boolean {
  if (!term) return false;
  if (ARABIC_LETTER.test(term)) {
    return haystackNorm.includes(normalizeArabic(term));
  }
  // Latin terms match on word boundaries so "CR" is not found inside
  // "description" and "IP" not inside "ship".
  return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(term)}(?![A-Za-z0-9])`, "i").test(
    haystackRaw
  );
}

/** True when the entry's Arabic, English, abbreviation or an alias occurs in the text. */
export function glossaryEntryAppearsIn(entry: GlossaryEntry, text: string): boolean {
  const norm = normalizeArabic(text);
  const candidates = [entry.ar, entry.en, entry.abbr ?? "", ...(entry.aliases ?? [])];
  return candidates.some((term) => termAppears(term, text, norm));
}

function asText(terms: string | readonly string[]): string {
  return Array.isArray(terms) ? terms.join("\n") : String(terms);
}

/** Entries whose terminology the given text (or list of strings) uses, in glossary order. */
export function glossaryEntriesFor(terms: string | readonly string[]): GlossaryEntry[] {
  const text = asText(terms);
  return TENDER_GLOSSARY.filter((entry) => glossaryEntryAppearsIn(entry, text));
}

function glossaryLine(entry: GlossaryEntry, locale: Locale): string {
  const en = entry.abbr ? `${entry.en} (${entry.abbr})` : entry.en;
  return locale === "ar" ? `- ${entry.ar} = ${en}` : `- ${en} = ${entry.ar}`;
}

const GLOSSARY_HEADING =
  "GLOSSARY (use these equivalents consistently; abbreviations stay in Latin script):";

/**
 * The glossary as a prompt block. With `terms` (a document, a section, or a
 * list of strings) only the entries that text actually uses are listed, so a
 * prompt about an SLA schedule is not padded with guarantee vocabulary. The
 * block never exceeds `maxChars` (≤ `GLOSSARY_BLOCK_MAX_CHARS`); entries past
 * the cap are dropped from the tail, which is why the glossary is ordered by
 * frequency of need. Empty string when nothing matches.
 */
export function glossaryBlock(
  locale: Locale,
  terms?: string | readonly string[],
  opts?: { maxChars?: number }
): string {
  const maxChars = Math.min(opts?.maxChars ?? GLOSSARY_BLOCK_MAX_CHARS, GLOSSARY_BLOCK_MAX_CHARS);
  const entries = terms === undefined ? TENDER_GLOSSARY : glossaryEntriesFor(terms);
  if (entries.length === 0) return "";

  const lines: string[] = [GLOSSARY_HEADING];
  let size = GLOSSARY_HEADING.length;
  for (const entry of entries) {
    const line = glossaryLine(entry, locale);
    if (size + 1 + line.length > maxChars) break;
    lines.push(line);
    size += 1 + line.length;
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

/** Ceiling for one generator system prompt, guide and glossary included. */
export const SYSTEM_PROMPT_BUDGET_CHARS = 6_000;

/** Below this much room, a glossary would be a heading and one line: skip it. */
const MIN_GLOSSARY_CHARS = 120;

/**
 * `head` (a finished system prompt, guide included) with the glossary for
 * `terms` appended — sized to the room left under the budget, so the whole
 * prompt never exceeds `SYSTEM_PROMPT_BUDGET_CHARS` however the shared rule
 * constants grow upstream. The glossary is what gives way, never the rules.
 */
export function appendGlossaryWithinBudget(
  head: string,
  locale: Locale,
  terms?: string | readonly string[],
  opts?: { maxChars?: number; budget?: number }
): string {
  const budget = opts?.budget ?? SYSTEM_PROMPT_BUDGET_CHARS;
  const remaining = budget - head.length - 1; // the joining newline
  if (remaining < MIN_GLOSSARY_CHARS) return head;
  const block = glossaryBlock(locale, terms, {
    maxChars: Math.min(opts?.maxChars ?? GLOSSARY_BLOCK_MAX_CHARS, remaining),
  });
  return block ? `${head}\n${block}` : head;
}

// ---------------------------------------------------------------------------
// Formatting helpers the deterministic texts share with the guide's rules
// ---------------------------------------------------------------------------

/**
 * "N weeks" with Arabic number agreement: dual for 2, sound plural for 3–10,
 * accusative singular from 11 up. The deterministic milestone lines used one
 * form for every count.
 */
export function formatArabicWeeks(weeks: number): string {
  if (!Number.isFinite(weeks)) return `${weeks} أسبوع`;
  if (!Number.isInteger(weeks)) return `${weeks} أسبوع`;
  if (weeks === 1) return "أسبوع واحد";
  if (weeks === 2) return "أسبوعان";
  if (weeks >= 3 && weeks <= 10) return `${weeks} أسابيع`;
  if (weeks === 0) return "0 أسابيع";
  return `${weeks} أسبوعاً`;
}

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

/**
 * Which language a piece of text is mostly written in, by letter count. Used
 * where a generator receives a document but no locale (the pipeline's
 * enrichment legs) and has to pick the guide that fits what it is polishing.
 * Ties and Latin-only or empty text read as English.
 */
export function detectDominantLocale(text: string): Locale {
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x0600 && code <= 0x06ff) arabic += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin += 1;
  }
  return arabic > latin ? "ar" : "en";
}
