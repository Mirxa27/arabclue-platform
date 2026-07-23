import { readStoredFile, fileExists } from "../storage";
import {
  SLA_PENALTY_RULES,
  extractLocalContentPreference,
  noraPrinciplesFromTender,
} from "../procurement-rules";
import type { IngestionEntities } from "../types";
import { getTenderType, TENDER_TYPES } from "../constants";

/** Strip C0 control chars that break JSON round-trips in some clients */
export function sanitizeText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

export async function extractTextFromBuffer(
  bytes: Buffer,
  mimeType: string,
  originalName: string
): Promise<string> {
  const lower = originalName.toLowerCase();
  const isText =
    mimeType.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json") ||
    mimeType === "application/json";

  if (isText) {
    return sanitizeText(bytes.toString("utf8"));
  }

  // Image OCR (camera / screenshots / scanned notes)
  const { isImageMime, extractTextFromImage } = await import("./ocr-image");
  if (isImageMime(mimeType, originalName)) {
    try {
      return await extractTextFromImage(bytes, mimeType, originalName);
    } catch (err) {
      console.warn("[ingestion] image OCR failed", err);
      return "";
    }
  }

  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    try {
      const mod = await import("pdf-parse");
      const PDFParse = (
        mod as unknown as {
          PDFParse: new (opts: { data: Uint8Array }) => {
            getText: () => Promise<{ text: string }>;
            destroy: () => Promise<void>;
          };
        }
      ).PDFParse;
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      try {
        const result = await parser.getText();
        return sanitizeText(result.text || "");
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (err) {
      console.warn("[ingestion] pdf-parse failed", err);
      return "";
    }
  }

  if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: bytes });
      return sanitizeText(result.value || "");
    } catch (err) {
      console.warn("[ingestion] mammoth failed", err);
      return "";
    }
  }

  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel")
  ) {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      // exceljs typings expect Node Buffer; runtime accepts Uint8Array/Buffer
      await wb.xlsx.load(bytes as never);
      const parts: string[] = [];
      wb.eachSheet((sheet) => {
        parts.push(`Sheet: ${sheet.name}`);
        sheet.eachRow((row) => {
          const vals = (row.values as unknown[])
            .slice(1)
            .map((v) => (v == null ? "" : String(v)))
            .filter(Boolean);
          if (vals.length) parts.push(vals.join(" | "));
        });
      });
      return sanitizeText(parts.join("\n"));
    } catch (err) {
      console.warn("[ingestion] exceljs parse failed", err);
      return "";
    }
  }

  // Safe ZIP package extraction (ZIP-slip and bomb resistant)
  if (
    lower.endsWith(".zip") ||
    mimeType.includes("zip") ||
    (bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04)
  ) {
    try {
      const { extractSafeZip } = await import("../safe-zip");
      const { entries, skipped } = await extractSafeZip(bytes);
      const parts: string[] = [];
      if (skipped.some((s) => s.reason === "zip_slip")) {
        parts.push("[zip] blocked path-traversal entries");
      }
      for (const entry of entries) {
        const inner = await extractTextFromBuffer(
          entry.bytes,
          "application/octet-stream",
          entry.name
        );
        if (inner.trim()) {
          parts.push(`--- ${entry.name} ---\n${inner}`);
        }
      }
      return sanitizeText(parts.join("\n\n"));
    } catch (err) {
      console.warn("[ingestion] safe zip extract failed", err);
      return "";
    }
  }

  return "";
}

export async function extractTextFromStorage(
  storagePath: string,
  mimeType: string,
  originalName: string
): Promise<string> {
  if (!(await fileExists(storagePath))) return "";
  const bytes = await readStoredFile(storagePath);
  return extractTextFromBuffer(bytes, mimeType, originalName);
}

function parsePercent(text: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

function firstLabeledValue(text: string, labelPatterns: string[]): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    for (const label of labelPatterns) {
      const match = line.match(
        new RegExp(`^(?:${label})\\s*[:：\\-–]\\s*(.{2,240})$`, "i")
      );
      if (match?.[1]) return match[1].trim();
    }
  }

  return null;
}

function cleanFieldValue(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/\s+/g, " ").trim().replace(/[.;،]+$/, "");
  return clean.length >= 2 ? clean.slice(0, 500) : null;
}

function parseTenderTitle(text: string): string | null {
  return cleanFieldValue(
    firstLabeledValue(text, [
      "tender\\s*(?:name|title)",
      "project\\s*(?:name|title)",
      "competition\\s*(?:name|title)",
      "rfp\\s*(?:name|title)",
      "اسم\\s*(?:المنافسة|المشروع|العطاء)",
      "عنوان\\s*(?:المنافسة|المشروع|العطاء)",
    ])
  );
}

function parseEtimadRef(text: string): string | null {
  const labeled = firstLabeledValue(text, [
    "etimad\\s*(?:ref(?:erence)?|no\\.?|number)?",
    "tender\\s*(?:ref(?:erence)?|no\\.?|number)",
    "competition\\s*(?:ref(?:erence)?|no\\.?|number)",
    "رقم\\s*(?:المنافسة|المشروع|العطاء|المرجع)",
    "مرجع\\s*اعتماد",
  ]);
  const source =
    labeled ||
    text.match(
      /(?:etimad|اعتماد)[^\n\r]{0,40}?([A-Z0-9][A-Z0-9/_\-]{2,40})/i
    )?.[1] ||
    null;
  const ref = source?.match(/[A-Z0-9][A-Z0-9/_\-]{2,40}/i)?.[0] ?? null;
  return ref ? ref.toUpperCase() : null;
}

function inferTenderCategory(text: string, tenderCategory?: string | null): string | null {
  const explicit = firstLabeledValue(text, [
    "category",
    "tender\\s*category",
    "sector",
    "نوع\\s*(?:المنافسة|المشروع|العطاء)",
    "فئة\\s*(?:المنافسة|المشروع|العطاء)",
    "القطاع",
  ]);
  if (explicit && /\bIT\b/i.test(explicit)) return "IT";
  const blob = `${explicit ?? ""}\n${text}`.toLowerCase();
  const categoryHits: Array<[string, string[]]> = [
    ["CONSTRUCTION", ["construction", "infrastructure", "إنشاء", "البنية التحتية"]],
    ["CONSULTING", ["consulting", "advisory", "استشار", "دراسات"]],
    ["OPERATIONS", ["operations", "facility management", "تشغيل", "إدارة مرافق"]],
    ["MEDICAL", ["medical", "healthcare", "health", "صحي", "طبي"]],
    ["GENERAL", ["supplies", "general services", "توريدات", "خدمات عامة"]],
    ["IT", ["digital", "cloud", "software", "cybersecurity", "تقنية", "رقمي", "سحابي"]],
  ];

  for (const [id, needles] of categoryHits) {
    if (needles.some((needle) => blob.includes(needle))) return id;
  }

  const supplied = tenderCategory?.trim().toUpperCase();
  return TENDER_TYPES.some((t) => t.id === supplied) ? supplied! : null;
}

function parseTenderBudget(text: string): { amount: number | null; currency: string | null } {
  const budgetLine = firstLabeledValue(text, [
    "estimated\\s*(?:budget|value)",
    "tender\\s*(?:budget|value)",
    "contract\\s*value",
    "budget",
    "قيمة\\s*(?:المنافسة|العقد|المشروع|العطاء)",
    "الميزانية\\s*(?:التقديرية)?",
  ]);
  const source = budgetLine
    ? `budget ${budgetLine}`
    : text.match(
        /(?:estimated\s*)?(?:budget|value|contract\s*value|tender\s*value|قيمة\s*(?:المنافسة|العقد|المشروع|العطاء)|الميزانية)[^\n\r]{0,120}/i
      )?.[0] ?? "";
  const amountMatch = source.match(/(\d[\d,]*(?:\.\d+)?)\s*(million|m|مليون)?/i);
  if (!amountMatch?.[1]) return { amount: null, currency: null };

  const base = Number(amountMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(base) || base < 0) return { amount: null, currency: null };
  const multiplier = amountMatch[2] ? 1_000_000 : 1;
  const currency = /usd|دولار/i.test(source)
    ? "USD"
    : /eur|euro|يورو/i.test(source)
      ? "EUR"
      : "SAR";

  return { amount: base * multiplier, currency };
}

function normalizeDeadlineDate(value: string): string | null {
  const iso = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d)).toISOString();
    }
  }

  const dmy = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return new Date(Date.UTC(y, m - 1, d)).toISOString();
    }
  }

  return null;
}

function parseSubmissionDeadline(text: string): string | null {
  const labeled = firstLabeledValue(text, [
    "submission\\s*deadline",
    "deadline",
    "closing\\s*date",
    "bid\\s*closing",
    "آخر\\s*موعد\\s*(?:للتقديم|لتقديم\\s*العروض)",
    "موعد\\s*(?:التقديم|تسليم\\s*العروض)",
    "تاريخ\\s*(?:الإغلاق|الاغلاق|تسليم\\s*العروض)",
  ]);
  const source =
    labeled ||
    text.match(
      /(?:submission\s*deadline|deadline|closing\s*date|bid\s*closing|آخر\s*موعد|تاريخ\s*(?:الإغلاق|الاغلاق))[^\n\r]{0,120}/i
    )?.[0] ||
    "";
  return normalizeDeadlineDate(source);
}

function parseSaudizationTarget(text: string): number | null {
  return parsePercent(text, [
    /(?:saudization|nitaqat)[^%\d]{0,40}(\d{1,3}(?:\.\d+)?)\s*%/i,
    /(?:سعودة|نطاقات)[^%\d]{0,40}(\d{1,3}(?:\.\d+)?)\s*%/,
  ]);
}

function extractMilestones(text: string): { name: string; weeks: number }[] {
  const milestones: { name: string; weeks: number }[] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:milestone|مرحلة|phase)\s*[:\-–]?\s*([^\n,|;]{2,80}?)[^\d\n]{0,40}?(\d+)\s*(?:week|weeks|أسبوع|أسابيع|wk)/gi,
    /([A-Za-z\u0600-\u06FF][^\n,|;]{2,60}?)\s*[:\-–]\s*(\d+)\s*(?:week|weeks|أسبوع|أسابيع|wk)/gi,
    /(\d+)\s*(?:week|weeks|أسبوع|أسابيع)\s*[:\-–]?\s*([A-Za-z\u0600-\u06FF][^\n,|;]{2,60})/gi,
  ];

  for (const re of patterns) {
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(text)) !== null && milestones.length < 10) {
      let name: string;
      let weeks: number;
      if (/^\d+$/.test(mm[1])) {
        weeks = parseInt(mm[1], 10);
        name = mm[2].trim();
      } else {
        name = mm[1].trim();
        weeks = parseInt(mm[2], 10);
      }
      name = name.replace(/^[\d.\-\s]+/, "").trim();
      if (!name || Number.isNaN(weeks) || weeks <= 0 || weeks > 260) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      milestones.push({ name, weeks });
    }
  }

  return milestones;
}

/** Deterministic extraction from tender document text */
export function parseTenderText(
  text: string,
  tenderCategory?: string | null
): IngestionEntities {
  const tenderType = getTenderType(tenderCategory);
  const evidence: string[] = [];
  const clean = sanitizeText(text);
  const title = parseTenderTitle(clean);
  const etimadRef = parseEtimadRef(clean);
  const category = inferTenderCategory(clean, tenderCategory);
  const budget = parseTenderBudget(clean);
  const submissionDeadline = parseSubmissionDeadline(clean);
  const saudizationTarget = parseSaudizationTarget(clean);

  const techEval =
    parsePercent(clean, [
      /technical[^%\d]{0,40}(\d{1,3})\s*%/i,
      /فني[^%\d]{0,20}(\d{1,3})\s*%/,
      /evaluation[^%\d]{0,40}technical[^%\d]{0,20}(\d{1,3})\s*%/i,
    ]) ?? tenderType.evaluationSplit.technical;

  const finEval =
    parsePercent(clean, [
      /financial[^%\d]{0,40}(\d{1,3})\s*%/i,
      /مالي[^%\d]{0,20}(\d{1,3})\s*%/,
    ]) ?? tenderType.evaluationSplit.financial;

  if (techEval !== tenderType.evaluationSplit.technical) {
    evidence.push(`Evaluation technical weight detected: ${techEval}%`);
  }
  if (finEval !== tenderType.evaluationSplit.financial) {
    evidence.push(`Evaluation financial weight detected: ${finEval}%`);
  }

  const weeklyRaw =
    parsePercent(clean, [
      /(\d+(?:\.\d+)?)\s*%\s*(?:per\s*week|\/\s*week|أسبوعي)/i,
      /penalty[^%\d]{0,40}(\d+(?:\.\d+)?)\s*%/i,
      /غرامة[^%\d]{0,30}(\d+(?:\.\d+)?)\s*%/,
    ]) ?? tenderType.slaPerWeek;

  const maxRaw =
    parsePercent(clean, [
      /max(?:imum)?[^%\d]{0,30}(\d+(?:\.\d+)?)\s*%/i,
      /سقف[^%\d]{0,20}(\d+(?:\.\d+)?)\s*%/,
      /لا\s*تتجاوز[^%\d]{0,20}(\d+(?:\.\d+)?)\s*%/,
    ]) ?? tenderType.slaMaxPenalty;

  // Preserve tender-stated penalty values exactly — do not rewrite to statutory defaults.
  const statutory = SLA_PENALTY_RULES.statutoryCandidate(tenderCategory);
  const originalWording =
    clean.match(
      /(?:delay\s*penalty|penalty|غرامة)[^\n]{0,120}/i
    )?.[0]?.slice(0, 200) ?? null;
  evidence.push(
    `Tender SLA (EXPLICIT_TENDER): ${weeklyRaw}%/week, max ${maxRaw}%${originalWording ? ` — "${originalWording}"` : ""}`
  );
  if (maxRaw > statutory.maxCandidate || weeklyRaw > statutory.maxCandidate) {
    evidence.push(
      `Statutory candidate max ${statutory.maxCandidate}% (${statutory.category}) listed separately for legal review — tender clause not rewritten. Source: ${statutory.sourceReference}`
    );
  }

  const localContent = extractLocalContentPreference(clean);
  if (localContent.preferencePercent != null) {
    evidence.push(
      `Local-content preference ${localContent.preferencePercent}% extracted from tender (EXPLICIT_TENDER)`
    );
  }

  const noraFromTender = noraPrinciplesFromTender(clean);
  if (noraFromTender.length) {
    evidence.push(
      `NORA/EA principle identifiers found in tender: ${noraFromTender.map((p) => p.id).join(", ")}`
    );
  }

  let scope = "";
  const scopeMatch = clean.match(
    /(?:scope\s*of\s*work|نطاق\s*العمل|SOW)[:\s\-–]*([\s\S]{40,600})/i
  );
  if (scopeMatch?.[1]) {
    scope = scopeMatch[1].split(/\n{2,}/)[0].trim().slice(0, 800);
    evidence.push("Scope of Work section located in source document");
  } else {
    const cleaned = clean.replace(/\s+/g, " ").trim();
    scope = cleaned.slice(0, 500) || `Scope derived for ${tenderType.name} tender`;
  }

  let milestones = extractMilestones(clean);
  if (milestones.length === 0) {
    milestones = [
      { name: "Mobilization", weeks: 2 },
      { name: "Discovery", weeks: 4 },
      { name: "Design", weeks: 6 },
      { name: "Build", weeks: 16 },
      { name: "UAT & Go-Live", weeks: 4 },
    ];
    evidence.push("Milestones not explicitly found — applied standard delivery phasing");
  } else {
    evidence.push(`Extracted ${milestones.length} milestone(s) from document`);
  }

  return {
    scope,
    project: {
      title,
      titleAr: title && /[\u0600-\u06FF]/.test(title) ? title : null,
      etimadRef,
      category,
      budget: budget.amount,
      currency: budget.currency,
      submissionDeadline,
      saudizationTarget,
      localContentTarget: localContent.preferencePercent,
    },
    evaluation: {
      technical: Math.min(100, Math.max(0, techEval)),
      financial: Math.min(100, Math.max(0, finEval)),
    },
    sla: {
      perWeek: weeklyRaw,
      maxPercent: maxRaw,
      capped: false,
      originalWording,
      statutoryCandidateMaxPercent: statutory.maxCandidate,
      statutoryCandidateSource: statutory.sourceReference,
    },
    milestones,
    evidence,
    rawTextExcerpt: clean.slice(0, 2000),
    localContentPreferencePercent: localContent.preferencePercent,
    localContentOriginalWording: localContent.originalWording,
    noraPrinciplesFromTender: noraFromTender.map((p) => ({
      id: p.id,
      name: p.name,
      snippet: p.snippet,
    })),
  };
}

export function buildIngestionSummary(entities: IngestionEntities, docNames: string[]): string {
  return `Parsed ${docNames.length} document(s): ${docNames.join(", ")}. SOW: ${entities.scope.slice(0, 160)}… Evaluation ${entities.evaluation.technical}/${entities.evaluation.financial}. SLA ${entities.sla.perWeek}%/wk max ${entities.sla.maxPercent}%. Milestones: ${entities.milestones.length}.`;
}
