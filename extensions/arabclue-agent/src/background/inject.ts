/** Helpers to inject IIFE content scripts and invoke exposed globals */

import type { EtimadTender, TenderDocument, UserMatchCriteria } from "../types";
import { ARABCLUE_NS } from "../content/globals";

const NS = ARABCLUE_NS;

async function injectFiles(tabId: number, files: string[]): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });
}

function callGlobal<T>(name: string, ...args: unknown[]): T | null {
  const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[NS];
  const fn = root?.[name];
  if (typeof fn !== "function") return null;
  return (fn as (...a: unknown[]) => T)(...args);
}

/** Inject listing parser and return tenders */
export async function runListingParser(tabId: number): Promise<EtimadTender[]> {
  await injectFiles(tabId, ["content/etimad-parser.js"]);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (ns: string) => {
      const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[ns];
      const fn = root?.parseTenderListingPage;
      if (typeof fn !== "function") return [];
      return (fn as () => unknown)();
    },
    args: [NS],
  });
  return (result as EtimadTender[]) || [];
}

/** Inject navigator and click next page */
export async function runClickNextPage(tabId: number): Promise<boolean> {
  await injectFiles(tabId, ["content/etimad-navigator.js"]);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (ns: string) => {
      const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[ns];
      const fn = root?.clickNextPage;
      if (typeof fn !== "function") return false;
      return Boolean((fn as () => boolean)());
    },
    args: [NS],
  });
  return Boolean(result);
}

/** Inject navigator and apply match filters when criteria exist */
export async function runApplyFilters(tabId: number, criteria: UserMatchCriteria): Promise<void> {
  const hasCriteria =
    criteria.categories.length > 0 ||
    criteria.keywords.length > 0 ||
    criteria.keywordsAr.length > 0;
  if (!hasCriteria) return;

  await injectFiles(tabId, ["content/etimad-navigator.js"]);
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (ns: string, crit: UserMatchCriteria) => {
      const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[ns];
      const fn = root?.applyFilters;
      if (typeof fn === "function") (fn as (c: UserMatchCriteria) => void)(crit);
    },
    args: [NS, criteria],
  });
}

/** Inject detail parser and return tender */
export async function runDetailParser(tabId: number): Promise<EtimadTender | null> {
  await injectFiles(tabId, [
    "content/etimad-parser.js",
    "content/etimad-detail-parser.js",
    "content/etimad-document-extractor.js",
  ]);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (ns: string) => {
      const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[ns];
      const parseDetail = root?.parseTenderDetailPage;
      const extractDocs = root?.extractAllDocumentUrls;
      let tender = typeof parseDetail === "function" ? (parseDetail as () => unknown)() : null;
      if (tender && typeof extractDocs === "function") {
        const docs = (extractDocs as () => TenderDocument[])() || [];
        const existing = (tender as EtimadTender).documents || [];
        const seen = new Set(existing.map((d) => d.url));
        const merged = [...existing];
        for (const d of docs) {
          if (d?.url && !seen.has(d.url)) {
            seen.add(d.url);
            merged.push(d);
          }
        }
        tender = { ...(tender as EtimadTender), documents: merged };
      }
      return tender;
    },
    args: [NS],
  });
  return (result as EtimadTender | null) || null;
}

/** Inject page capture and return content */
export async function runPageCapture(
  tabId: number,
  mode: "page" | "selection"
): Promise<{
  title: string;
  url: string;
  text: string;
  headings: string[];
  metaDescription: string;
  selection: string;
} | null> {
  await injectFiles(tabId, ["content/page-capture.js"]);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (ns: string, captureMode: "page" | "selection") => {
      const root = (globalThis as unknown as Record<string, Record<string, unknown>>)[ns];
      const fn =
        captureMode === "selection" ? root?.captureSelectionContent : root?.capturePageContent;
      if (typeof fn !== "function") return null;
      return (fn as () => unknown)();
    },
    args: [NS, mode],
  });
  return result as {
    title: string;
    url: string;
    text: string;
    headings: string[];
    metaDescription: string;
    selection: string;
  } | null;
}

export { callGlobal, injectFiles };
