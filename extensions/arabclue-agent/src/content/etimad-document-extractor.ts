/** Extract and classify downloadable documents from Etimad pages */

import type { TenderDocument, TenderDocumentType } from "../types";
import { exposeGlobals } from "./globals";

/** Find all downloadable document URLs on the current page */
export function extractAllDocumentUrls(): TenderDocument[] {
  const docs: TenderDocument[] = [];
  const seen = new Set<string>();
  
  // Strategy 1: Explicit download links
  const downloadLinks = document.querySelectorAll(
    'a[href*="download"], a[href*="Download"], a[download], a[href*="attachment"], a[href*="Attachment"], a[href*="file"], a[href*="File"]'
  );
  
  for (const link of downloadLinks) {
    const doc = extractDocFromLink(link as HTMLAnchorElement);
    if (doc && !seen.has(doc.url)) {
      seen.add(doc.url);
      docs.push(doc);
    }
  }
  
  // Strategy 2: PDF/DOC/XLSX direct links
  const fileLinks = document.querySelectorAll(
    'a[href$=".pdf"], a[href$=".doc"], a[href$=".docx"], a[href$=".xlsx"], a[href$=".xls"], a[href$=".zip"]'
  );
  
  for (const link of fileLinks) {
    const doc = extractDocFromLink(link as HTMLAnchorElement);
    if (doc && !seen.has(doc.url)) {
      seen.add(doc.url);
      docs.push(doc);
    }
  }
  
  // Strategy 3: Buttons with download actions
  const downloadBtns = document.querySelectorAll(
    'button[onclick*="download"], button[data-url], [data-download-url]'
  );
  
  for (const btn of downloadBtns) {
    const url = btn.getAttribute("data-url") || btn.getAttribute("data-download-url") || "";
    if (url && !seen.has(url)) {
      seen.add(url);
      docs.push({
        name: btn.textContent?.trim() || "Document",
        url: resolveDocumentUrl(url),
        type: classifyDocument(btn.textContent || "", url),
      });
    }
  }
  
  // Strategy 4: Table rows with file icons/links
  const fileRows = document.querySelectorAll("tr:has(a[href]), .file-item, .attachment-item");
  for (const row of fileRows) {
    const link = row.querySelector("a[href]") as HTMLAnchorElement | null;
    if (!link) continue;
    const href = link.href;
    if (!href || seen.has(href)) continue;
    if (!/download|attachment|file|\.pdf|\.doc|\.xls|\.zip/i.test(href)) continue;
    
    seen.add(href);
    const sizeEl = row.querySelector(".size, .file-size, td:last-child");
    docs.push({
      name: link.textContent?.trim() || row.querySelector("td")?.textContent?.trim() || "Document",
      url: href,
      type: classifyDocument(link.textContent || "", href),
      size: sizeEl?.textContent?.trim(),
    });
  }
  
  return docs;
}

/** Classify a document by its name and URL */
export function classifyDocument(name: string, url: string): TenderDocumentType {
  const combined = (name + " " + url).toLowerCase();
  
  // RFP / Tender document
  if (/rfp|كراسة|شروط ومواصفات|request for proposal|tender doc|وثيقة المنافسة/i.test(combined)) {
    return "rfp";
  }
  
  // Terms and conditions
  if (/terms|شروط|أحكام|condition|عقد/i.test(combined)) {
    return "terms";
  }
  
  // Technical specifications
  if (/spec|مواصفات|فنية|technical|نطاق العمل|scope/i.test(combined)) {
    return "specs";
  }
  
  // Qualification documents
  if (/qualif|تأهيل|مؤهل|eligib|سجل تجاري|registration/i.test(combined)) {
    return "qualification";
  }
  
  // Financial
  if (/financ|مال|سعر|price|cost|تسعير|جدول كميات|bill of quantities|boq/i.test(combined)) {
    return "financial";
  }
  
  return "other";
}

/** Resolve a potentially relative URL to absolute */
export function resolveDocumentUrl(relative: string): string {
  if (!relative) return "";
  if (relative.startsWith("http://") || relative.startsWith("https://")) return relative;
  try {
    return new URL(relative, window.location.origin).href;
  } catch {
    return relative;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function extractDocFromLink(link: HTMLAnchorElement): TenderDocument | null {
  const url = link.href;
  if (!url || url === "#" || url.startsWith("javascript:")) return null;
  
  const name = link.textContent?.trim() ||
               link.getAttribute("title") ||
               link.getAttribute("download") ||
               url.split("/").pop()?.split("?")[0] || "Document";
  
  const sizeEl = link.closest("tr, .item, .row, li")?.querySelector(".size, .file-size");
  
  return {
    name: name.slice(0, 100),
    url,
    type: classifyDocument(name, url),
    size: sizeEl?.textContent?.trim(),
  };
}

exposeGlobals({
  extractAllDocumentUrls,
  classifyDocument,
  resolveDocumentUrl,
});
