/** Parse Etimad tender listing pages into structured EtimadTender[] */

import type { EtimadTender, TenderCategory, TenderStatus, TenderDocument } from "../types";
import { CATEGORY_KEYWORDS } from "../constants";
import { parseArabicDate, parseSARValue } from "../utils";

/** Extract all tenders from the current Etimad listing page */
export function parseTenderListingPage(): EtimadTender[] {
  const tenders: EtimadTender[] = [];
  
  // Etimad uses table rows or card-based layouts for tender listings
  const rows = document.querySelectorAll(
    "table tbody tr, .tender-item, .tender-card, [data-tender-id], .card-body"
  );
  
  for (const row of rows) {
    const tender = extractTenderRow(row);
    if (tender?.referenceNumber) {
      tenders.push(tender as EtimadTender);
    }
  }
  
  // Fallback: try grid/list view
  if (!tenders.length) {
    const items = document.querySelectorAll(".list-group-item, .tender-row, .result-item");
    for (const item of items) {
      const tender = extractTenderRow(item);
      if (tender?.referenceNumber) {
        tenders.push(tender as EtimadTender);
      }
    }
  }
  
  return tenders;
}

/** Parse a single tender row/card element */
export function extractTenderRow(row: Element): Partial<EtimadTender> | null {
  const text = row.textContent || "";
  if (!text.trim()) return null;
  
  // Extract reference number (pattern: numeric sequences like 260012345)
  const refMatch = text.match(/(\d{9,12})/);
  const referenceNumber = refMatch?.[1] || row.getAttribute("data-tender-id") || "";
  if (!referenceNumber) return null;
  
  // Extract title — look for heading elements or strong/bold text
  const titleEl = row.querySelector("h3, h4, h5, .tender-title, .title, a[href*='Tender']");
  const titleAr = titleEl?.textContent?.trim() || extractFirstMeaningfulText(row);
  const title = titleAr; // Will be same since Etimad is Arabic-primary
  
  // Extract entity name
  const entityEl = row.querySelector(".entity, .agency, .organization, [data-entity]");
  const entityAr = entityEl?.textContent?.trim() || extractEntityFromRow(row);
  
  // Extract value
  const valueText = extractValueText(row);
  const value = parseSARValue(valueText);
  
  // Extract dates
  const dates = extractDatesFromRow(row);
  
  // Extract status
  const status = detectTenderStatus(row);
  
  // Extract link
  const linkEl = row.querySelector("a[href*='Tender'], a[href*='tender'], a[href*='Details']");
  const url = linkEl ? resolveUrl(linkEl.getAttribute("href") || "") : "";
  
  return {
    referenceNumber,
    title,
    titleAr,
    entity: entityAr,
    entityAr,
    category: inferCategory(titleAr + " " + text),
    value,
    currency: "SAR",
    publishDate: dates.publish,
    closingDate: dates.close,
    status,
    url,
    documents: [],
    qualifications: [],
    extractedAt: new Date().toISOString(),
  };
}

/** Infer tender category from text using keyword matching */
export function inferCategory(text: string): TenderCategory {
  const lower = text.toLowerCase();
  let bestCategory: TenderCategory = "other";
  let bestScore = 0;
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase()) || text.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as TenderCategory;
    }
  }
  
  return bestCategory;
}

/** Detect tender status from DOM element */
export function detectTenderStatus(el: Element): TenderStatus {
  const text = (el.textContent || "").toLowerCase();
  const badges = el.querySelectorAll(".badge, .status, .label, .tag, [class*='status']");
  
  for (const badge of badges) {
    const badgeText = (badge.textContent || "").trim();
    if (/open|مفتوح|فعال|active/i.test(badgeText)) return "open";
    if (/clos|مغلق|منتهي|ended/i.test(badgeText)) return "closed";
    if (/award|ترسية|فائز/i.test(badgeText)) return "awarded";
    if (/cancel|ملغ/i.test(badgeText)) return "cancelled";
  }
  
  if (/مفتوح|open|active|فعال/.test(text)) return "open";
  if (/مغلق|closed|ended|منتهي/.test(text)) return "closed";
  if (/ترسية|awarded/.test(text)) return "awarded";
  if (/ملغ|cancel/.test(text)) return "cancelled";
  
  return "open";
}

/** Get pagination next page URL */
export function getNextPageUrl(): string | null {
  const nextBtn = document.querySelector(
    "a.next, .pagination .next a, [aria-label='Next'], a[rel='next'], .page-item:last-child a"
  );
  if (!nextBtn) return null;
  const href = nextBtn.getAttribute("href");
  if (!href || href === "#") return null;
  return resolveUrl(href);
}

/** Get total pages from pagination */
export function getTotalPages(): number {
  const pagination = document.querySelector(".pagination, [role='navigation']");
  if (!pagination) return 1;
  
  const items = pagination.querySelectorAll("a, .page-link, .page-item");
  let max = 1;
  for (const item of items) {
    const num = parseInt(item.textContent?.trim() || "0", 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return max;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractFirstMeaningfulText(el: Element): string {
  const candidates = el.querySelectorAll("td, span, div, p");
  for (const c of candidates) {
    const t = c.textContent?.trim() || "";
    if (t.length > 10 && t.length < 200 && !/^\d+$/.test(t)) return t;
  }
  return "";
}

function extractEntityFromRow(row: Element): string {
  const cells = row.querySelectorAll("td, .col, span");
  for (const cell of cells) {
    const text = cell.textContent?.trim() || "";
    // Entities typically contain "وزارة" or "هيئة" or "أمانة" or "جامعة"
    if (/وزارة|هيئة|أمانة|جامعة|مؤسسة|شركة|إمارة/i.test(text) && text.length < 100) {
      return text;
    }
  }
  return "";
}

function extractValueText(row: Element): string {
  const text = row.textContent || "";
  // Look for SAR values
  const sarMatch = text.match(/(?:SAR|ر\.س|ريال)\s*[\d,٠-٩,.]+/i) ||
                   text.match(/[\d,٠-٩,.]+\s*(?:SAR|ر\.س|ريال)/i);
  return sarMatch?.[0] || "";
}

function extractDatesFromRow(row: Element): { publish: string; close: string } {
  const text = row.textContent || "";
  const dates = text.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
  
  return {
    publish: dates[0] ? parseArabicDate(dates[0]) : "",
    close: dates[1] ? parseArabicDate(dates[1]) : dates[0] ? parseArabicDate(dates[0]) : "",
  };
}

function resolveUrl(href: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  try {
    return new URL(href, window.location.origin).href;
  } catch {
    return "";
  }
}
