/**
 * Deterministic tender interrogation — the rules that need no model.
 *
 * Each detector reads the tender passages and returns findings whose quotes
 * are verbatim runs of the source text, with the document, page and heading
 * they came from. They run on every interrogation, with or without an AI
 * provider, so the clarification view is never empty for want of a key, and
 * what they find is labelled `DETERMINISTIC` — it is not passed off as a
 * model's judgement.
 *
 * Every rule is a pure function of the passages. Thresholds and vocabulary
 * live at the top of the file so a reviewer can audit or tune them without
 * reading the control flow.
 */

import { fingerprintFinding } from "./fingerprint";
import { asciiDigits, clipQuote, hasArabic, normalizeForMatch, splitSentences } from "./text";
import type {
  ClarificationKind,
  ClarificationQuote,
  ClarificationSeverity,
  Finding,
  SourcePassage,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

const DEADLINE_LABEL =
  /(submission deadline|deadline for (?:bid|proposal|offer|tender)s? submission|closing date|last (?:date|day) (?:for|of) (?:bid |proposal |offer )?submission|(?:bids?|proposals?|offers?|tenders?) (?:must|shall|should) be submitted (?:by|no later than|before|on or before)|\bdeadline\b|آخر موعد|اخر موعد|الموعد النهائي|تاريخ (?:الإغلاق|الاغلاق|إغلاق|اغلاق|الإقفال|الاقفال)|آخر يوم|اخر يوم|موعد (?:إقفال|اقفال|إغلاق|اغلاق))/i;

/** Dates that are legitimately different from the submission deadline. */
const DEADLINE_EXCLUDE =
  /(question|clarif|inquir|enquir|site visit|pre-?bid|opening|validity|bond|guarantee|award|start|commence|استفسار|زيارة|فتح المظاريف|فتح العروض|الأسئلة|الاسئلة|سريان|الضمان|الترسية|بدء|البدء)/i;

const EVALUATION_VOCAB =
  /(weight|weigh|score|scoring|evaluation|evaluat|criteria|marks|points|الوزن|التقييم|تقييم|معايير|درج|النقاط|النسبة)/i;
/** Percentages in these sentences are not evaluation weights. */
const WEIGHT_EXCLUDE = /(complian|availability|uptime|saudi|local content|المحتوى المحلي|سعودة|نطاقات|توطين)/i;
const TECHNICAL_KEY = /\btechnical\b|الفني|فني/i;
const FINANCIAL_KEY = /\bfinancial\b|\bcommercial\b|المالي|مالي|التجاري/i;

const PENALTY_VOCAB = /(penalt|liquidated damages|delay damages|deduction|غرام|الخصم|جزاء|جزائي)/i;
const CAP_VOCAB =
  /(maximum|\bmax\b|\bcap\b|capped|ceiling|not exceed|shall not exceed|may not exceed|up to|الحد الأقصى|الحد الاقصى|بحد أقصى|بحد اقصى|لا تتجاوز|لا يتجاوز|لا تزيد|لا يزيد|سقف)/i;
const PENALTY_RATE = /%|per (?:day|week|month)|يوم|أسبوع|اسبوع|شهر/i;

const ANNEX_REF_EN = /\b(Annex|Appendix|Schedule|Attachment|Exhibit)\s+(?:No\.?\s*)?([A-Z]|\d{1,2}|[IVX]{1,4})\b/g;
const ANNEX_REF_AR = /(الملحق|المرفق)\s*(?:رقم\s*)?\(?\s*(\d{1,2}|[أ-ي])\s*\)?/g;

const PLACEHOLDER =
  /\bTB[DCA]\b|\bto be (?:determined|confirmed|advised|announced)\b|\[\s*\]|\[\s*(?:insert|to be|enter|specify|xx)[^\]]{0,60}\]|_{4,}|\bX{2,}\b|×{2,}|(?:يحدد|تحدد|يُحدد|تُحدد|سيحدد|ستحدد|سيتم تحديد\S*|يتم تحديد\S*)\s+(?:\S+\s+){0,3}?(?:لاحقاً|لاحقا|لاحقًا|فيما بعد)/i;
const FORM_FIELD = /(signat|توقيع|stamp|الختم|ختم|\bname\b|الاسم|\bdate\b|التاريخ|seal|\bmr\.?\b|السيد)/i;
const PLACEHOLDER_MAJOR_CONTEXT =
  /(deadline|penalt|budget|value|amount|warrant|duration|period|term\b|موعد|غرام|ميزانية|قيمة|مبلغ|ضمان|مدة|فترة)/i;

const CURRENCY_AMOUNT =
  /(SAR|\bSR\b|ر\.س\.?|ريالاً|ريالا|ريال(?: سعودي)?|USD|US\$|\$|EUR|€|GBP|£|AED|درهم)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(SAR|\bSR\b|ر\.س\.?|ريالاً|ريالا|ريال(?: سعودي)?|USD|US\$|EUR|€|GBP|£|AED|درهم|\$)/gi;

const DAY_COUNT =
  /\b(?:within|in|no later than)\s+(\d{1,3})\s+(?:\(\d+\)\s*)?days?\b|\b(\d{1,3})\s+days?\s+(?:from|of|after|following|prior|before)\b|خلال\s*\(?(\d{1,3})\)?\s*(?:يوم|أيام|ايام|يوماً|يوما)/i;
const DAY_QUALIFIER = /(working|business|calendar|عمل|تقويم|ميلادي|هجري)/i;

const RISK_RULES: readonly {
  key: string;
  re: RegExp;
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  questionEn: string;
  questionAr: string;
}[] = [
  {
    key: "liability-unlimited",
    re: /unlimited liability|liability (?:is|shall be|will be) unlimited|without (?:any )?(?:limit|limitation|cap)[^.]{0,40}liab|liab[^.]{0,40}without (?:any )?(?:limit|limitation|cap)|مسؤولية غير محدودة|غير محدودة المسؤولية|مسؤولية كاملة وغير محدودة/i,
    titleEn: "Unlimited contractor liability",
    titleAr: "مسؤولية غير محدودة على المتعاقد",
    rationaleEn:
      "An uncapped liability exposure cannot be insured or priced by the authorized commercial team and may be unacceptable to the bidder's board.",
    rationaleAr:
      "لا يمكن التأمين على مسؤولية غير محدودة ولا تقديرها من الفريق التجاري المخوّل، وقد لا تقبلها إدارة المنشأة.",
    questionEn:
      "We kindly request the Entity to confirm whether the contractor's aggregate liability under the contract is capped, and if so at what amount or percentage of the contract value.",
    questionAr:
      "نرجو من الجهة الحكومية التكرم بتوضيح ما إذا كانت المسؤولية الإجمالية للمتعاقد بموجب العقد محددة بحد أقصى، ومقدار هذا الحد أو نسبته من قيمة العقد إن وُجد.",
  },
  {
    key: "termination-no-notice",
    re: /terminat\w*[^.]{0,60}(?:at any time|without (?:prior |any )?notice|for convenience|at its sole discretion)|إنهاء العقد[^.]{0,40}(?:في أي وقت|في اي وقت|دون إشعار|دون اشعار|دون إنذار|بدون إشعار|بدون اشعار|بدون إنذار)|(?:دون|بدون) (?:إشعار|اشعار|إنذار)[^.]{0,30}(?:إنهاء|انهاء)/i,
    titleEn: "Termination without notice or at the Entity's discretion",
    titleAr: "إنهاء العقد دون إشعار أو وفق تقدير الجهة",
    rationaleEn:
      "Termination without a notice period or a cure right leaves committed staff, subcontracts and procurement costs unrecoverable.",
    rationaleAr:
      "الإنهاء دون فترة إشعار أو فرصة للمعالجة يجعل تكاليف الكادر والتعاقدات الفرعية والمشتريات الملتزم بها غير قابلة للاسترداد.",
    questionEn:
      "We kindly request the Entity to confirm the notice period and cure period that apply before termination, and the compensation due for work performed and commitments made up to the termination date.",
    questionAr:
      "نرجو من الجهة الحكومية التكرم بتوضيح فترة الإشعار وفترة المعالجة المطبقتين قبل إنهاء العقد، والمستحقات المترتبة عن الأعمال المنفذة والالتزامات القائمة حتى تاريخ الإنهاء.",
  },
  {
    key: "ip-transfer",
    re: /(?:all|any)\s+(?:pre-?existing\s+)?intellectual property[^.]{0,80}(?:vest|belong|transfer|assign|become the property)|pre-?existing (?:ip|intellectual property)[^.]{0,60}(?:transfer|assign|vest)|(?:تنتقل|تؤول|تنقل)\s+(?:جميع\s+|كافة\s+)?حقوق الملكية الفكرية|جميع حقوق الملكية الفكرية[^.]{0,60}(?:للجهة|ملكاً|ملكا)/i,
    titleEn: "Transfer of all intellectual property, including pre-existing IP",
    titleAr: "انتقال جميع حقوق الملكية الفكرية بما فيها القائمة مسبقاً",
    rationaleEn:
      "A blanket IP assignment would transfer the bidder's pre-existing platforms, tools and know-how, not only the deliverables created for this contract.",
    rationaleAr:
      "التنازل الشامل عن الملكية الفكرية ينقل منصات المتعاقد وأدواته ومعارفه القائمة مسبقاً، وليس فقط المخرجات المنشأة لهذا العقد.",
    questionEn:
      "We kindly request the Entity to confirm that the intellectual property assignment is limited to deliverables created specifically under this contract, and that pre-existing and third-party components remain licensed rather than assigned.",
    questionAr:
      "نرجو من الجهة الحكومية التكرم بتأكيد أن انتقال الملكية الفكرية يقتصر على المخرجات المنشأة خصيصاً بموجب هذا العقد، وأن المكونات القائمة مسبقاً ومكونات الأطراف الثالثة تبقى مرخّصة لا منقولة الملكية.",
  },
];

/** Corpus-level presence checks: what a complete tender must state somewhere. */
const MANDATORY: readonly {
  key: string;
  re: RegExp;
  severity: ClarificationSeverity;
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  questionEn: string;
  questionAr: string;
}[] = [
  {
    key: "deadline",
    re: DEADLINE_LABEL,
    severity: "CRITICAL",
    titleEn: "No submission deadline stated",
    titleAr: "لم يُذكر آخر موعد لتقديم العروض",
    rationaleEn: "Without a stated deadline the bid schedule, bond validity and staffing plan cannot be fixed.",
    rationaleAr: "دون موعد نهائي معلن لا يمكن ضبط جدول إعداد العرض ومدة سريان الضمان وخطة الكادر.",
    questionEn: "We kindly request the Entity to confirm the exact date and time (Riyadh time) by which bids must be submitted.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتحديد التاريخ والوقت النهائيين (بتوقيت الرياض) لتقديم العروض.",
  },
  {
    key: "evaluation",
    re: /(evaluation criteria|evaluation|criteria|weight|scoring|التقييم|معايير|الوزن|درجات التقييم)/i,
    severity: "MAJOR",
    titleEn: "No evaluation criteria or weights stated",
    titleAr: "لم تُذكر معايير التقييم أو أوزانها",
    rationaleEn: "The proposal cannot be organized around the evaluators' scoring without the criteria and their weights.",
    rationaleAr: "لا يمكن بناء العرض حول تقييم اللجنة دون معرفة المعايير وأوزانها.",
    questionEn: "We kindly request the Entity to publish the evaluation criteria and the technical and financial weights that will be applied.",
    questionAr: "نرجو من الجهة الحكومية التكرم بنشر معايير التقييم والأوزان الفنية والمالية التي ستُطبق.",
  },
  {
    key: "sla",
    re: /(penalt|liquidated damages|service level|\bSLA\b|غرام|مستوى الخدمة|اتفاقية مستوى)/i,
    severity: "MAJOR",
    titleEn: "No service levels or penalty regime stated",
    titleAr: "لم تُذكر مستويات الخدمة أو نظام الغرامات",
    rationaleEn: "Service levels and penalties define the operational commitments the delivery model must be sized for.",
    rationaleAr: "تحدد مستويات الخدمة والغرامات الالتزامات التشغيلية التي يجب أن يُبنى عليها نموذج التنفيذ.",
    questionEn: "We kindly request the Entity to confirm the service levels, the delay penalty rate and its maximum cap that will govern the contract.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتوضيح مستويات الخدمة ونسبة غرامة التأخير وحدها الأقصى التي ستحكم العقد.",
  },
  {
    key: "scope",
    re: /(scope of work|scope of services|scope of supply|\bSOW\b|\bscope\b|نطاق العمل|نطاق الأعمال|نطاق الاعمال|نطاق الخدمات|نطاق التوريد)/i,
    severity: "MAJOR",
    titleEn: "No scope of work section found",
    titleAr: "لم يُعثر على قسم نطاق العمل",
    rationaleEn: "Every requirement, deliverable and assumption in the proposal traces back to the scope statement.",
    rationaleAr: "يُبنى كل متطلب ومخرج وافتراض في العرض على بيان نطاق العمل.",
    questionEn: "We kindly request the Entity to provide or confirm the scope of work and the list of deliverables for this tender.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتوفير نطاق العمل وقائمة المخرجات لهذه المنافسة أو تأكيدهما.",
  },
  {
    key: "submission",
    re: /(etimad|\bsubmit|submission|اعتماد|تقديم العروض|تقديم العرض|منصة)/i,
    severity: "MINOR",
    titleEn: "No submission channel stated",
    titleAr: "لم تُذكر قناة تقديم العروض",
    rationaleEn: "The submission channel decides the file formats, signatures and portal steps the bid must satisfy.",
    rationaleAr: "تحدد قناة التقديم صيغ الملفات والتوقيعات وخطوات المنصة التي يجب أن يستوفيها العرض.",
    questionEn: "We kindly request the Entity to confirm that bids are submitted exclusively through the Etimad portal and whether any hard-copy or physical documents are also required.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد أن تقديم العروض يكون حصراً عبر منصة اعتماد، وما إذا كانت هناك مستندات ورقية مطلوبة إضافةً إلى ذلك.",
  },
];

/* -------------------------------------------------------------------------- */
/* Extraction helpers (exported for tests)                                     */
/* -------------------------------------------------------------------------- */

const EN_MONTHS: Readonly<Record<string, number>> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const AR_G_MONTHS: Readonly<Record<string, number>> = {
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, إبريل: 4, مايو: 5, يونيو: 6, يوليو: 7,
  أغسطس: 8, اغسطس: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};
const AR_H_MONTHS: Readonly<Record<string, number>> = {
  محرم: 1, صفر: 2, "ربيع الأول": 3, "ربيع الاول": 3, "ربيع الآخر": 4, "ربيع الثاني": 4,
  "جمادى الأولى": 5, "جمادى الاولى": 5, "جمادى الآخرة": 6, "جمادى الثانية": 6, رجب: 7,
  شعبان: 8, رمضان: 9, شوال: 10, "ذو القعدة": 11, "ذي القعدة": 11, "ذو الحجة": 12, "ذي الحجة": 12,
};

export type DateMention = Readonly<{ raw: string; key: string; index: number }>;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(calendar: "g" | "h", y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${calendar}:${y}-${pad(m)}-${pad(d)}`;
}

/** Every date in the text, ASCII-digit normalized, in order of appearance, without overlaps. */
export function extractDateMentions(text: string): DateMention[] {
  const t = asciiDigits(text);
  const out: Array<DateMention & { end: number }> = [];
  const push = (m: RegExpExecArray, key: string | null) => {
    if (!key) return;
    const start = m.index;
    const end = start + m[0].length;
    if (out.some((o) => start < o.end && end > o.index)) return;
    out.push({ raw: m[0], key, index: start, end });
  };
  const patterns: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => dateKey(Number(m[1]) >= 1600 ? "g" : "h", Number(m[1]), Number(m[2]), Number(m[3]))],
    [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*(?:هـ|ه\b)?/g, (m) => dateKey(Number(m[3]) >= 1600 ? "g" : "h", Number(m[3]), Number(m[2]), Number(m[1]))],
    [/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?,?\s+(\d{4})\b/gi,
      (m) => dateKey("g", Number(m[3]), EN_MONTHS[m[2].toLowerCase()], Number(m[1]))],
    [/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/gi,
      (m) => dateKey("g", Number(m[3]), EN_MONTHS[m[1].toLowerCase()], Number(m[2]))],
    [/(\d{1,2})\s+(يناير|فبراير|مارس|أبريل|ابريل|إبريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s+(\d{4})/g,
      (m) => dateKey("g", Number(m[3]), AR_G_MONTHS[m[2]], Number(m[1]))],
    [/(\d{1,2})\s+(محرم|صفر|ربيع الأول|ربيع الاول|ربيع الآخر|ربيع الثاني|جمادى الأولى|جمادى الاولى|جمادى الآخرة|جمادى الثانية|رجب|شعبان|رمضان|شوال|ذو القعدة|ذي القعدة|ذو الحجة|ذي الحجة)\s+(\d{4})/g,
      (m) => dateKey("h", Number(m[3]), AR_H_MONTHS[m[2]], Number(m[1]))],
  ];
  for (const [re, toKey] of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) push(m, toKey(m));
  }
  return out.sort((a, b) => a.index - b.index).map(({ raw, key, index }) => ({ raw, key, index }));
}

export type PercentMention = Readonly<{ value: number; index: number; raw: string }>;

/** Percentages (ASCII or Arabic digits, either percent sign), in order. */
export function extractPercentMentions(text: string): PercentMention[] {
  const t = asciiDigits(text);
  const out: PercentMention[] = [];
  const re = /(\d{1,3}(?:[.,]\d+)?)\s?%/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const value = Number(m[1].replace(",", "."));
    if (Number.isFinite(value) && value <= 100) out.push({ value, index: m.index, raw: m[0] });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

type Sentence = Readonly<{ text: string; ascii: string; passage: SourcePassage }>;

function sentencesOf(passages: readonly SourcePassage[]): Sentence[] {
  const out: Sentence[] = [];
  for (const passage of passages) {
    for (const text of splitSentences(passage.text)) {
      out.push({ text, ascii: asciiDigits(text), passage });
    }
  }
  return out;
}

function quoteOf(s: Sentence, matchIndex: number): ClarificationQuote {
  return {
    text: clipQuote(s.text, matchIndex),
    documentId: s.passage.documentId,
    documentName: s.passage.documentName,
    pageRef: s.passage.pageRef,
    sectionHeading: s.passage.sectionHeading,
  };
}

function finding(
  kind: ClarificationKind,
  severity: ClarificationSeverity,
  detectorId: string,
  key: string,
  text: Pick<Finding, "titleEn" | "titleAr" | "rationaleEn" | "rationaleAr" | "questionEn" | "questionAr">,
  quotes: readonly ClarificationQuote[]
): Finding {
  return {
    kind,
    severity,
    ...text,
    quotes,
    provenance: "DETERMINISTIC",
    fingerprint: fingerprintFinding(kind, { detectorId, key }),
    provenanceDetail: { detectorId, key },
  };
}

function where(q: ClarificationQuote): string {
  const parts = [q.documentName, q.pageRef ? `p. ${q.pageRef}` : null].filter(Boolean);
  return parts.join(", ");
}
function whereAr(q: ClarificationQuote): string {
  const parts = [q.documentName, q.pageRef ? `ص ${q.pageRef}` : null].filter(Boolean);
  return parts.join("، ");
}

/** Nearest keyword before the percent sign, within a window, or null. */
function nearestKeyBefore(ascii: string, index: number, re: RegExp, window = 70): boolean {
  const from = Math.max(0, index - window);
  return re.test(ascii.slice(from, index));
}

/* -------------------------------------------------------------------------- */
/* Detectors                                                                   */
/* -------------------------------------------------------------------------- */

function detectDeadlineConflict(sentences: readonly Sentence[]): Finding[] {
  const byCalendar = new Map<string, Map<string, { s: Sentence; index: number; raw: string }>>();
  for (const s of sentences) {
    const label = DEADLINE_LABEL.exec(s.ascii);
    if (!label || DEADLINE_EXCLUDE.test(s.ascii)) continue;
    const dates = extractDateMentions(s.text);
    if (dates.length === 0) continue;
    const chosen = dates.find((d) => d.index > label.index) ?? dates[0];
    const calendar = chosen.key.slice(0, 1);
    const map = byCalendar.get(calendar) ?? new Map();
    if (!map.has(chosen.key)) map.set(chosen.key, { s, index: chosen.index, raw: chosen.raw });
    byCalendar.set(calendar, map);
  }
  const out: Finding[] = [];
  for (const [calendar, map] of byCalendar) {
    if (map.size < 2) continue;
    const entries = [...map.values()];
    const quotes = entries.map((e) => quoteOf(e.s, e.index));
    const list = entries.map((e) => e.raw.trim());
    const listEn = entries.map((e, i) => `"${e.raw.trim()}" (${where(quotes[i])})`).join(" and ");
    const listAr = entries.map((e, i) => `"${e.raw.trim()}" (${whereAr(quotes[i])})`).join(" و");
    out.push(
      finding("CONTRADICTION", "CRITICAL", "deadline-conflict", `${calendar}:${[...map.keys()].sort().join("|")}`, {
        titleEn: "Submission deadline stated differently",
        titleAr: "تعارض في آخر موعد لتقديم العروض",
        rationaleEn: `The tender documents state ${map.size} different submission deadlines: ${list.join(", ")}. A bid prepared for the later date would be rejected if the earlier one governs.`,
        rationaleAr: `تذكر مستندات المنافسة ${map.size} مواعيد نهائية مختلفة لتقديم العروض: ${list.join("، ")}. العرض المُعَدّ للتاريخ اللاحق سيُرفض إذا كان التاريخ الأسبق هو النافذ.`,
        questionEn: `The documents state the submission deadline as ${listEn}. We kindly request the Entity to confirm which date and time govern, and to publish a corrigendum if needed.`,
        questionAr: `تذكر المستندات آخر موعد لتقديم العروض على أنه ${listAr}. نرجو من الجهة الحكومية التكرم بتأكيد التاريخ والوقت النافذين، وإصدار ملحق تعديلي عند الحاجة.`,
      }, quotes)
    );
  }
  return out;
}

function detectEvaluationWeights(sentences: readonly Sentence[]): Finding[] {
  const technical = new Map<number, { s: Sentence; index: number }>();
  const financial = new Map<number, { s: Sentence; index: number }>();
  for (const s of sentences) {
    if (WEIGHT_EXCLUDE.test(s.ascii)) continue;
    const mentionsAxis = TECHNICAL_KEY.test(s.ascii) || FINANCIAL_KEY.test(s.ascii);
    if (!mentionsAxis) continue;
    for (const p of extractPercentMentions(s.text)) {
      const tech = nearestKeyBefore(s.ascii, p.index, TECHNICAL_KEY);
      const fin = nearestKeyBefore(s.ascii, p.index, FINANCIAL_KEY);
      // The Arabic sentence "الوزن الفني 70% والوزن المالي 30%" has both keys
      // before the second percentage; the closer one wins.
      const pick = (re: RegExp) => {
        const slice = s.ascii.slice(Math.max(0, p.index - 70), p.index);
        let last = -1;
        const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
        let m: RegExpExecArray | null;
        while ((m = g.exec(slice)) !== null) last = m.index;
        return last;
      };
      if (tech && fin) {
        if (pick(TECHNICAL_KEY) > pick(FINANCIAL_KEY)) {
          if (!technical.has(p.value)) technical.set(p.value, { s, index: p.index });
        } else if (!financial.has(p.value)) financial.set(p.value, { s, index: p.index });
      } else if (tech) {
        if (!technical.has(p.value)) technical.set(p.value, { s, index: p.index });
      } else if (fin) {
        if (!financial.has(p.value)) financial.set(p.value, { s, index: p.index });
      } else if (EVALUATION_VOCAB.test(s.ascii) && TECHNICAL_KEY.test(s.ascii) && !technical.has(p.value)) {
        technical.set(p.value, { s, index: p.index });
      }
    }
  }
  const out: Finding[] = [];
  const conflict = (axis: "technical" | "financial", map: Map<number, { s: Sentence; index: number }>) => {
    if (map.size < 2) return;
    const entries = [...map.entries()];
    const quotes = entries.map(([, e]) => quoteOf(e.s, e.index));
    const values = entries.map(([v]) => `${v}%`);
    const axisAr = axis === "technical" ? "الفني" : "المالي";
    out.push(
      finding("CONTRADICTION", "MAJOR", "evaluation-weight-conflict", `${axis}:${values.join("|")}`, {
        titleEn: `${axis === "technical" ? "Technical" : "Financial"} evaluation weight stated with different values`,
        titleAr: `تعارض في نسبة الوزن ${axisAr} للتقييم`,
        rationaleEn: `The ${axis} weight appears as ${values.join(" and ")}. The proposal's density and the evaluation-alignment section depend on which value applies.`,
        rationaleAr: `يظهر الوزن ${axisAr} بقيم مختلفة: ${values.join(" و")}. تعتمد كثافة العرض وقسم مواءمة التقييم على القيمة النافذة.`,
        questionEn: `The ${axis} evaluation weight is stated as ${values.join(" and ")} in different places (${quotes.map(where).join("; ")}). We kindly request the Entity to confirm the applicable weight.`,
        questionAr: `وردت نسبة الوزن ${axisAr} للتقييم بقيم مختلفة (${values.join(" و")}) في مواضع متعددة (${quotes.map(whereAr).join("؛ ")}). نرجو من الجهة الحكومية التكرم بتأكيد النسبة المطبقة.`,
      }, quotes)
    );
  };
  conflict("technical", technical);
  conflict("financial", financial);
  if (technical.size === 1 && financial.size === 1) {
    const [t] = [...technical.keys()];
    const [f] = [...financial.keys()];
    const sum = Math.round((t + f) * 100) / 100;
    if (sum !== 100) {
      const te = technical.get(t)!;
      const fe = financial.get(f)!;
      const quotes = te.s === fe.s ? [quoteOf(te.s, te.index)] : [quoteOf(te.s, te.index), quoteOf(fe.s, fe.index)];
      out.push(
        finding("CONTRADICTION", "MAJOR", "evaluation-weight-sum", `${t}+${f}`, {
          titleEn: "Technical and financial weights do not total 100%",
          titleAr: "مجموع الوزنين الفني والمالي لا يساوي 100%",
          rationaleEn: `Technical ${t}% plus financial ${f}% totals ${sum}%. Either a weight is misstated or a third criterion is unpublished.`,
          rationaleAr: `الوزن الفني ${t}% مع الوزن المالي ${f}% يساوي ${sum}%. إما أن إحدى النسب مذكورة خطأً أو أن معياراً ثالثاً لم يُنشر.`,
          questionEn: `The technical weight (${t}%) and the financial weight (${f}%) total ${sum}%. We kindly request the Entity to confirm the correct weights and whether any additional criterion applies.`,
          questionAr: `مجموع الوزن الفني (${t}%) والوزن المالي (${f}%) يساوي ${sum}%. نرجو من الجهة الحكومية التكرم بتأكيد النسب الصحيحة وما إذا كان هناك معيار إضافي.`,
        }, quotes)
      );
    }
  }
  return out;
}

function detectPenaltyCaps(sentences: readonly Sentence[]): Finding[] {
  const caps = new Map<number, { s: Sentence; index: number }>();
  const uncapped: Array<{ s: Sentence; index: number }> = [];
  let capAnywhere = false;
  for (const s of sentences) {
    if (!PENALTY_VOCAB.test(s.ascii)) continue;
    const capMatch = CAP_VOCAB.exec(s.ascii);
    const percents = extractPercentMentions(s.text);
    if (capMatch) {
      capAnywhere = true;
      const after = percents.find((p) => p.index > capMatch.index) ?? percents[percents.length - 1];
      if (after && !caps.has(after.value)) caps.set(after.value, { s, index: after.index });
    } else if (percents.length > 0 || PENALTY_RATE.test(s.ascii)) {
      uncapped.push({ s, index: percents[0]?.index ?? 0 });
    }
  }
  const out: Finding[] = [];
  if (caps.size >= 2) {
    const entries = [...caps.entries()];
    const quotes = entries.map(([, e]) => quoteOf(e.s, e.index));
    const values = entries.map(([v]) => `${v}%`);
    out.push(
      finding("CONTRADICTION", "MAJOR", "penalty-cap-conflict", values.join("|"), {
        titleEn: "Maximum penalty stated with different values",
        titleAr: "تعارض في الحد الأقصى للغرامات",
        rationaleEn: `The penalty cap appears as ${values.join(" and ")}. The service-management response and the risk register must quote one ceiling, exactly as written.`,
        rationaleAr: `يظهر الحد الأقصى للغرامات بقيم مختلفة: ${values.join(" و")}. يجب أن يستند قسم إدارة الخدمة وسجل المخاطر إلى سقف واحد كما ورد نصاً.`,
        questionEn: `The maximum penalty is stated as ${values.join(" and ")} (${quotes.map(where).join("; ")}). We kindly request the Entity to confirm the governing cap.`,
        questionAr: `ورد الحد الأقصى للغرامات بقيم مختلفة (${values.join(" و")}) في (${quotes.map(whereAr).join("؛ ")}). نرجو من الجهة الحكومية التكرم بتأكيد السقف النافذ.`,
      }, quotes)
    );
  }
  if (!capAnywhere && uncapped.length > 0) {
    const quotes = uncapped.slice(0, 3).map((e) => quoteOf(e.s, e.index));
    out.push(
      finding("RISK_CLAUSE", "MAJOR", "risk-clause", "penalty-uncapped", {
        titleEn: "Delay penalty without a stated maximum",
        titleAr: "غرامة تأخير دون حد أقصى معلن",
        rationaleEn: "A penalty rate with no ceiling is an open-ended exposure the risk register cannot bound.",
        rationaleAr: "نسبة غرامة دون سقف تمثل تعرضاً غير محدود لا يمكن لسجل المخاطر حصره.",
        questionEn: "The tender states a delay penalty rate but no maximum. We kindly request the Entity to confirm the cap on total penalties as a percentage of the contract value.",
        questionAr: "تذكر المنافسة نسبة غرامة تأخير دون حد أقصى. نرجو من الجهة الحكومية التكرم بتأكيد سقف مجموع الغرامات كنسبة من قيمة العقد.",
      }, quotes)
    );
  }
  return out;
}

function annexKey(kind: string, id: string): string {
  const norm = /^[IVX]+$/i.test(id) ? id.toLowerCase() : id.toLowerCase();
  void kind;
  return `annex-${norm}`;
}

function detectDanglingReferences(passages: readonly SourcePassage[], sentences: readonly Sentence[]): Finding[] {
  // Definitions: a heading recorded by the chunker, or a line that starts with
  // the reference, or the reference followed by a title separator.
  const defined = new Set<string>();
  const defRe = /^\s*(?:Annex|Appendix|Schedule|Attachment|Exhibit|الملحق|المرفق)\s*(?:No\.?\s*|رقم\s*)?\(?\s*([A-Za-z]|\d{1,2}|[IVXivx]{1,4}|[أ-ي])\s*\)?(?=\s*[:—–\-|.]|\s*$|\s+[A-Z؀-ۿ])/gim;
  const collect = (text: string) => {
    defRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = defRe.exec(text)) !== null) defined.add(annexKey("", m[1]));
  };
  for (const p of passages) {
    if (p.sectionHeading) collect(p.sectionHeading);
    collect(asciiDigits(p.text));
    // A reference followed by a title separator defines it.
    const titled = /(?:Annex|Appendix|Schedule|Attachment|Exhibit|الملحق|المرفق)\s*(?:No\.?\s*|رقم\s*)?\(?\s*([A-Za-z]|\d{1,2}|[IVXivx]{1,4}|[أ-ي])\s*\)?\s*[:—–]/gi;
    let m: RegExpExecArray | null;
    const t = asciiDigits(p.text);
    while ((m = titled.exec(t)) !== null) defined.add(annexKey("", m[1]));
  }
  const referenced = new Map<string, Array<{ s: Sentence; index: number; label: string }>>();
  for (const s of sentences) {
    for (const re of [ANNEX_REF_EN, ANNEX_REF_AR]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s.ascii)) !== null) {
        const key = annexKey(m[1], m[2]);
        if (defined.has(key)) continue;
        const list = referenced.get(key) ?? [];
        list.push({ s, index: m.index, label: `${m[1]} ${m[2]}` });
        referenced.set(key, list);
      }
    }
  }
  const out: Finding[] = [];
  for (const [key, refs] of [...referenced.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const quotes = refs.slice(0, 3).map((r) => quoteOf(r.s, r.index));
    const label = refs[0].label;
    out.push(
      finding("MISSING_INFO", "MAJOR", "dangling-reference", key, {
        titleEn: `${label} is referenced but not provided`,
        titleAr: `الإشارة إلى "${label}" دون توفيره`,
        rationaleEn: `The documents refer to ${label} ${refs.length} time${refs.length === 1 ? "" : "s"} but no such annex is defined in the uploaded files. Its forms or specifications may be mandatory.`,
        rationaleAr: `تشير المستندات إلى "${label}" ${refs.length} مرة دون أن يُعرَّف هذا الملحق في الملفات المرفوعة، وقد تكون نماذجه أو مواصفاته إلزامية.`,
        questionEn: `The documents refer to ${label} (${quotes.map(where).join("; ")}) but it is not included. We kindly request the Entity to provide it or confirm that it does not apply.`,
        questionAr: `تشير المستندات إلى "${label}" (${quotes.map(whereAr).join("؛ ")}) دون أن يكون مرفقاً. نرجو من الجهة الحكومية التكرم بتوفيره أو تأكيد عدم انطباقه.`,
      }, quotes)
    );
  }
  return out;
}

function detectMissingMandatory(passages: readonly SourcePassage[]): Finding[] {
  const corpus = asciiDigits(passages.map((p) => `${p.sectionHeading ?? ""}\n${p.text}`).join("\n"));
  const out: Finding[] = [];
  for (const rule of MANDATORY) {
    if (rule.re.test(corpus)) continue;
    out.push(
      finding("MISSING_INFO", rule.severity, "missing-mandatory", rule.key, {
        titleEn: rule.titleEn,
        titleAr: rule.titleAr,
        rationaleEn: rule.rationaleEn,
        rationaleAr: rule.rationaleAr,
        questionEn: rule.questionEn,
        questionAr: rule.questionAr,
      }, [])
    );
  }
  return out;
}

function detectPlaceholders(sentences: readonly Sentence[]): Finding[] {
  const byDoc = new Map<string, Array<{ s: Sentence; index: number }>>();
  for (const s of sentences) {
    if (FORM_FIELD.test(s.ascii)) continue;
    const m = PLACEHOLDER.exec(s.ascii);
    if (!m) continue;
    const list = byDoc.get(s.passage.documentId) ?? [];
    list.push({ s, index: m.index });
    byDoc.set(s.passage.documentId, list);
  }
  const out: Finding[] = [];
  for (const [documentId, hits] of byDoc) {
    const quotes = hits.slice(0, 5).map((h) => quoteOf(h.s, h.index));
    const major = hits.some((h) => PLACEHOLDER_MAJOR_CONTEXT.test(h.s.ascii));
    out.push(
      finding("PLACEHOLDER", major ? "MAJOR" : "MINOR", "placeholder", documentId, {
        titleEn: `Unfilled placeholders in ${quotes[0].documentName ?? "the document"}`,
        titleAr: `حقول غير مكتملة في ${quotes[0].documentName ?? "المستند"}`,
        rationaleEn: `${hits.length} passage${hits.length === 1 ? "" : "s"} still carry "to be determined" text or blank fields. A bid cannot commit to a value the tender leaves open.`,
        rationaleAr: `${hits.length} ${hits.length === 1 ? "موضع لا يزال يحمل" : "مواضع لا تزال تحمل"} نصاً بصيغة "يُحدد لاحقاً" أو حقولاً فارغة، ولا يمكن للعرض الالتزام بقيمة تركتها المنافسة مفتوحة.`,
        questionEn: `The following passages are left to be determined (${quotes.map(where).join("; ")}). We kindly request the Entity to publish the final values or confirm how bidders should treat them.`,
        questionAr: `تُركت المواضع التالية دون تحديد (${quotes.map(whereAr).join("؛ ")}). نرجو من الجهة الحكومية التكرم بنشر القيم النهائية أو توضيح كيفية تعامل المتنافسين معها.`,
      }, quotes)
    );
  }
  return out;
}

function currencyFamily(token: string): string {
  const t = token.toUpperCase();
  if (/^(SAR|SR)$/.test(t) || /ريال|ر\.س/.test(token)) return "SAR";
  if (/^(USD|US\$|\$)$/.test(t)) return "USD";
  if (/^(EUR|€)$/.test(t)) return "EUR";
  if (/^(GBP|£)$/.test(t)) return "GBP";
  if (/^AED$/.test(t) || /درهم/.test(token)) return "AED";
  return t;
}

function detectCurrencyAmbiguity(sentences: readonly Sentence[]): Finding[] {
  const families = new Map<string, { s: Sentence; index: number }>();
  for (const s of sentences) {
    CURRENCY_AMOUNT.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CURRENCY_AMOUNT.exec(s.ascii)) !== null) {
      const fam = currencyFamily(m[1] ?? m[4] ?? "");
      if (!families.has(fam)) families.set(fam, { s, index: m.index });
    }
  }
  if (families.size < 2) return [];
  const entries = [...families.entries()];
  const quotes = entries.map(([, e]) => quoteOf(e.s, e.index));
  const names = entries.map(([f]) => f);
  return [
    finding("AMBIGUITY", "MINOR", "currency-ambiguity", names.sort().join("|"), {
      titleEn: "Amounts stated in more than one currency",
      titleAr: "مبالغ مذكورة بأكثر من عملة",
      rationaleEn: `Amounts appear in ${names.join(" and ")}. Bonds and financial forms must be denominated consistently.`,
      rationaleAr: `تظهر المبالغ بعملات ${names.join(" و")}. يجب أن تكون الضمانات والنماذج المالية بعملة واحدة متسقة.`,
      questionEn: `Amounts are stated in ${names.join(" and ")} (${quotes.map(where).join("; ")}). We kindly request the Entity to confirm the currency of the bid, the bonds and the financial forms.`,
      questionAr: `وردت المبالغ بعملات مختلفة (${names.join(" و")}) في (${quotes.map(whereAr).join("؛ ")}). نرجو من الجهة الحكومية التكرم بتأكيد عملة العرض والضمانات والنماذج المالية.`,
    }, quotes),
  ];
}

function detectDayCountAmbiguity(sentences: readonly Sentence[]): Finding[] {
  const hits: Array<{ s: Sentence; index: number }> = [];
  for (const s of sentences) {
    const m = DAY_COUNT.exec(s.ascii);
    if (!m || DAY_QUALIFIER.test(s.ascii)) continue;
    hits.push({ s, index: m.index });
  }
  if (hits.length === 0) return [];
  const quotes = hits.slice(0, 4).map((h) => quoteOf(h.s, h.index));
  return [
    finding("AMBIGUITY", "MINOR", "day-count-ambiguity", "unqualified-days", {
      titleEn: "Day counts without working/calendar qualifier",
      titleAr: "مدد بالأيام دون تحديد أيام عمل أو تقويمية",
      rationaleEn: `${hits.length} period${hits.length === 1 ? "" : "s"} are expressed in days without stating whether they are working or calendar days; the difference changes every response and penalty computation.`,
      rationaleAr: `${hits.length} ${hits.length === 1 ? "مدة معبَّر عنها" : "مدد معبَّر عنها"} بالأيام دون تحديد ما إذا كانت أيام عمل أو أياماً تقويمية، والفارق يغيّر كل احتساب للاستجابة والغرامات.`,
      questionEn: `Several periods are stated in days without a qualifier (${quotes.map(where).join("; ")}). We kindly request the Entity to confirm whether these are working days or calendar days.`,
      questionAr: `وردت عدة مدد بالأيام دون تحديد نوعها (${quotes.map(whereAr).join("؛ ")}). نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت أيام عمل أو أياماً تقويمية.`,
    }, quotes),
  ];
}

function detectRiskClauses(sentences: readonly Sentence[]): Finding[] {
  const out: Finding[] = [];
  for (const rule of RISK_RULES) {
    const hits: Array<{ s: Sentence; index: number }> = [];
    for (const s of sentences) {
      const m = rule.re.exec(s.ascii);
      if (m) hits.push({ s, index: m.index });
    }
    if (hits.length === 0) continue;
    const quotes = hits.slice(0, 3).map((h) => quoteOf(h.s, h.index));
    out.push(
      finding("RISK_CLAUSE", "MAJOR", "risk-clause", rule.key, {
        titleEn: rule.titleEn,
        titleAr: rule.titleAr,
        rationaleEn: rule.rationaleEn,
        rationaleAr: rule.rationaleAr,
        questionEn: `${rule.questionEn} (${quotes.map(where).join("; ")})`,
        questionAr: `${rule.questionAr} (${quotes.map(whereAr).join("؛ ")})`,
      }, quotes)
    );
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const SEVERITY_ORDER: Readonly<Record<ClarificationSeverity, number>> = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };

/**
 * Every deterministic finding for the passages, CRITICAL first, then in
 * detector order. Empty when the passages are empty.
 */
export function detectDeterministicFindings(passages: readonly SourcePassage[]): Finding[] {
  if (passages.length === 0) return [];
  const sentences = sentencesOf(passages);
  const findings = [
    ...detectDeadlineConflict(sentences),
    ...detectEvaluationWeights(sentences),
    ...detectPenaltyCaps(sentences),
    ...detectDanglingReferences(passages, sentences),
    ...detectMissingMandatory(passages),
    ...detectPlaceholders(sentences),
    ...detectCurrencyAmbiguity(sentences),
    ...detectDayCountAmbiguity(sentences),
    ...detectRiskClauses(sentences),
  ];
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);
}

/** Exposed for the prompt builder: the vocabulary that marks a passage as worth a model's read. */
export const INTERROGATION_VOCAB: readonly RegExp[] = [
  DEADLINE_LABEL,
  EVALUATION_VOCAB,
  PENALTY_VOCAB,
  CAP_VOCAB,
  /scope|نطاق|deliverable|مخرج|milestone|مرحل/i,
  /liab|مسؤول|terminat|إنهاء|انهاء|indemn|تعويض|warrant|ضمان|intellectual|ملكية/i,
  /annex|appendix|schedule|ملحق|مرفق/i,
  /payment|invoice|دفع|فاتورة|مستخلص|retention|محتجز/i,
  /shall|must|يجب|يلتزم|إلزام|mandatory|إلزامي/i,
];

export { hasArabic, normalizeForMatch };
