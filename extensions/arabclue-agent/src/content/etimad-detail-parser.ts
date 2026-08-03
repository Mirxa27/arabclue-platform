/** Parse individual Etimad tender detail pages */

import type { EtimadTender, TenderDocument, TenderDocumentType } from "../types";
import { parseArabicDate, parseSARValue } from "../utils";
import { inferCategory, detectTenderStatus } from "./etimad-parser";
import { exposeGlobals } from "./globals";

/** Extract full tender data from a detail page */
export function parseTenderDetailPage(): EtimadTender | null {
  const body = document.body;
  if (!body.textContent?.trim()) return null;

  const referenceNumber = extractReferenceNumber();
  if (!referenceNumber) return null;

  const titleAr = extractTitle();
  const entity = extractEntityInfo();
  const timeline = extractTimeline();
  const documents = extractDocumentLinks();
  const qualifications = extractQualifications();
  const localContent = extractLocalContentRequirements();
  const value = extractTenderValue();
  const specs = extractSpecifications();

  return {
    referenceNumber,
    title: titleAr,
    titleAr,
    entity: entity.nameAr,
    entityAr: entity.nameAr,
    category: inferCategory(titleAr + " " + specs),
    value,
    currency: "SAR",
    publishDate: timeline.publish,
    closingDate: timeline.close,
    status: detectTenderStatus(body),
    location: extractLocation(),
    url: window.location.href,
    documents,
    qualifications,
    localContentRequired: localContent.required,
    localContentMinimum: localContent.minimum,
    extractedAt: new Date().toISOString(),
  };
}

/** Extract tender reference number from detail page */
function extractReferenceNumber(): string {
  // Look for reference in page title, headings, or labeled fields
  const selectors = [
    "[data-tender-ref]",
    ".tender-reference",
    ".reference-number",
    "h1, h2, h3",
  ];
  
  for (const selector of selectors) {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      const match = el.textContent?.match(/(\d{9,12})/);
      if (match) return match[1];
    }
  }
  
  // Try URL parameter
  const urlMatch = window.location.href.match(/[?&](?:id|tender|ref)=(\d+)/i);
  if (urlMatch) return urlMatch[1];
  
  // Try page text
  const pageMatch = document.body.textContent?.match(/(?:رقم المنافسة|Reference|Tender No)[:\s]*(\d{9,12})/i);
  return pageMatch?.[1] || "";
}

/** Extract tender title */
function extractTitle(): string {
  const titleEl = document.querySelector(
    "h1, .tender-title, .page-title, [data-field='title']"
  );
  if (titleEl?.textContent?.trim()) return titleEl.textContent.trim();
  
  // Look for labeled field
  const labels = document.querySelectorAll("label, th, dt, .field-label");
  for (const label of labels) {
    if (/اسم المنافسة|عنوان|Tender Name|Title/i.test(label.textContent || "")) {
      const value = label.nextElementSibling?.textContent?.trim() ||
                    label.parentElement?.querySelector("td, dd, .field-value")?.textContent?.trim();
      if (value) return value;
    }
  }
  
  return document.title.replace(/\s*[-|].*$/, "").trim();
}

/** Extract issuing entity */
function extractEntityInfo(): { name: string; nameAr: string } {
  const labels = document.querySelectorAll("label, th, dt, .field-label");
  for (const label of labels) {
    if (/الجهة|Entity|Agency|Organization|جهة حكومية/i.test(label.textContent || "")) {
      const value = label.nextElementSibling?.textContent?.trim() ||
                    label.parentElement?.querySelector("td, dd, .field-value")?.textContent?.trim();
      if (value) return { name: value, nameAr: value };
    }
  }
  
  // Try meta or structured data
  const entityEl = document.querySelector("[data-entity], .entity-name, .agency-name");
  const name = entityEl?.textContent?.trim() || "";
  return { name, nameAr: name };
}

/** Extract publish and close dates */
export function extractTimeline(): { publish: string; close: string } {
  let publish = "";
  let close = "";
  
  const labels = document.querySelectorAll("label, th, dt, .field-label, span");
  for (const label of labels) {
    const text = label.textContent || "";
    const valueEl = label.nextElementSibling || label.parentElement?.querySelector("td, dd, .field-value");
    const value = valueEl?.textContent?.trim() || "";
    
    if (/تاريخ الطرح|Publish|نشر|Start Date/i.test(text)) {
      publish = parseArabicDate(value);
    }
    if (/آخر موعد|Closing|إغلاق|End Date|الموعد النهائي|Last Date/i.test(text)) {
      close = parseArabicDate(value);
    }
  }
  
  return { publish, close };
}

/** Extract all downloadable document links */
export function extractDocumentLinks(): TenderDocument[] {
  const docs: TenderDocument[] = [];
  const seen = new Set<string>();
  
  // Find download links/buttons
  const links = document.querySelectorAll(
    "a[href*='download'], a[href*='Download'], a[href*='.pdf'], a[href*='.doc'], a[href*='attachment'], a[href*='Attachment'], .download-link, [data-download]"
  );
  
  for (const link of links) {
    const href = (link as HTMLAnchorElement).href || link.getAttribute("data-url") || "";
    if (!href || seen.has(href)) continue;
    seen.add(href);
    
    const name = link.textContent?.trim() || href.split("/").pop() || "document";
    const sizeEl = link.closest("tr, .item, .row")?.querySelector(".size, .file-size");
    
    docs.push({
      name,
      url: href,
      type: classifyDocumentType(name, href),
      size: sizeEl?.textContent?.trim(),
    });
  }
  
  return docs;
}

/** Extract qualification requirements */
export function extractQualifications(): string[] {
  const qualifications: string[] = [];
  
  // Look for qualification section
  const sections = document.querySelectorAll("section, .panel, .card, details, [id*='qual'], [id*='require']");
  for (const section of sections) {
    const heading = section.querySelector("h2, h3, h4, summary, .panel-title");
    if (!heading) continue;
    if (!/شروط|مؤهل|متطلبات|Qualification|Requirement|Eligibility/i.test(heading.textContent || "")) continue;
    
    const items = section.querySelectorAll("li, p, td");
    for (const item of items) {
      const text = item.textContent?.trim();
      if (text && text.length > 5 && text.length < 300) {
        qualifications.push(text);
      }
    }
  }
  
  return qualifications.slice(0, 20);
}

/** Extract local content requirements */
export function extractLocalContentRequirements(): { required: boolean; minimum?: number } {
  const text = document.body.textContent || "";
  const hasLC = /محتوى محلي|local content|LCGPA/i.test(text);
  
  if (!hasLC) return { required: false };
  
  const percentMatch = text.match(/(?:محتوى محلي|local content)[^.]*?(\d{1,3})\s*%/i);
  const minimum = percentMatch ? parseInt(percentMatch[1], 10) : undefined;
  
  return { required: true, minimum };
}

/** Extract tender value */
function extractTenderValue(): number | undefined {
  const labels = document.querySelectorAll("label, th, dt, .field-label");
  for (const label of labels) {
    if (/القيمة|Value|Budget|المبلغ|التكلفة/i.test(label.textContent || "")) {
      const valueEl = label.nextElementSibling || label.parentElement?.querySelector("td, dd, .field-value");
      const text = valueEl?.textContent || "";
      const parsed = parseSARValue(text);
      if (parsed) return parsed;
    }
  }
  return undefined;
}

/** Extract technical specifications text */
export function extractSpecifications(): string {
  const sections = document.querySelectorAll("section, .panel, .card, details");
  for (const section of sections) {
    const heading = section.querySelector("h2, h3, h4, summary");
    if (/مواصفات|نطاق|Scope|Specifications|Technical/i.test(heading?.textContent || "")) {
      return (section.textContent || "").slice(0, 2000).trim();
    }
  }
  return "";
}

/** Extract location/region */
function extractLocation(): string {
  const labels = document.querySelectorAll("label, th, dt, .field-label");
  for (const label of labels) {
    if (/المنطقة|الموقع|Location|Region|City/i.test(label.textContent || "")) {
      const valueEl = label.nextElementSibling || label.parentElement?.querySelector("td, dd, .field-value");
      return valueEl?.textContent?.trim() || "";
    }
  }
  return "";
}

/** Classify document type by name and URL */
function classifyDocumentType(name: string, url: string): TenderDocumentType {
  const combined = (name + " " + url).toLowerCase();
  if (/rfp|طلب عرض|كراسة|request for proposal/i.test(combined)) return "rfp";
  if (/terms|شروط|أحكام|condition/i.test(combined)) return "terms";
  if (/spec|مواصفات|فنية|technical/i.test(combined)) return "specs";
  if (/qualif|تأهيل|مؤهل|eligib/i.test(combined)) return "qualification";
  if (/financ|مال|سعر|price|cost/i.test(combined)) return "financial";
  return "other";
}

exposeGlobals({
  parseTenderDetailPage,
  extractTimeline,
  extractDocumentLinks,
  extractQualifications,
  extractLocalContentRequirements,
  extractSpecifications,
});
