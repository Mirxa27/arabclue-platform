import { readStoredFile, fileExists } from "../storage";
import {
  SLA_PENALTY_RULES,
  extractLocalContentPreference,
  noraPrinciplesFromTender,
} from "../procurement-rules";
import type { IngestionEntities } from "../types";
import { getTenderType } from "../constants";

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
