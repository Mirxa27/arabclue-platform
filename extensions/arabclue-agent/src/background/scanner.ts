/** Etimad background scanning orchestrator */

import type { EtimadTender, ScanState, ScanResult, UserMatchCriteria } from "../types";
import { ETIMAD, STORAGE, LIMITS, ALARMS } from "../constants";
import { filterMatches, deduplicateTenders } from "./matcher";

let scanning = false;
let abortScan = false;

/** Get current scan state from storage */
export async function getScanState(): Promise<ScanState> {
  const stored = await chrome.storage.local.get({ [STORAGE.SCAN_STATE]: null });
  return stored[STORAGE.SCAN_STATE] || {
    lastScanAt: null,
    tendersFound: 0,
    tendersMatched: 0,
    isScanning: false,
    currentPage: 0,
    totalPages: 0,
  };
}

/** Update scan state in storage */
async function setScanState(state: Partial<ScanState>): Promise<void> {
  const current = await getScanState();
  await chrome.storage.local.set({ [STORAGE.SCAN_STATE]: { ...current, ...state } });
}

/** Start a full Etimad scan */
export async function startScan(criteria: UserMatchCriteria): Promise<ScanResult> {
  if (scanning) throw new Error("Scan already in progress");
  scanning = true;
  abortScan = false;

  const startTime = Date.now();
  const allTenders: EtimadTender[] = [];

  try {
    await setScanState({ isScanning: true, currentPage: 0, error: undefined });

    // Open or reuse Etimad tab
    const tabId = await openEtimadTab();

    // Navigate to tenders list
    await chrome.tabs.update(tabId, { url: ETIMAD.TENDERS_LIST });
    await waitForTabLoad(tabId);
    await delay(2000); // Let SPA render

    // Scan pages
    let page = 1;
    while (page <= LIMITS.MAX_SCAN_PAGES && !abortScan) {
      await setScanState({ currentPage: page });

      const tenders = await scanPage(tabId);
      allTenders.push(...tenders);

      // Try next page
      const hasNext = await navigateNextPage(tabId);
      if (!hasNext) break;
      
      page++;
      await delay(LIMITS.SCAN_PAGE_DELAY_MS);
    }

    // Deduplicate
    const unique = deduplicateTenders(allTenders);

    // Match against criteria
    const matched = filterMatches(unique, criteria);

    // Find new tenders since last scan
    const stored = await getStoredTenders();
    const storedRefs = new Set(stored.map(t => t.referenceNumber));
    const newSinceLastScan = matched.filter(t => !storedRefs.has(t.referenceNumber));

    // Persist results
    await storeTenders(unique);
    await storeMatched(matched);

    const result: ScanResult = {
      tenders: unique,
      matched,
      newSinceLastScan,
      scanDuration: Date.now() - startTime,
      pagesScanned: page,
    };

    await setScanState({
      isScanning: false,
      lastScanAt: new Date().toISOString(),
      tendersFound: unique.length,
      tendersMatched: matched.length,
      totalPages: page,
    });

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Scan failed";
    await setScanState({ isScanning: false, error });
    throw err;
  } finally {
    scanning = false;
  }
}

/** Stop the current scan */
export function stopScan(): void {
  abortScan = true;
}

/** Scan a single page via content script injection */
async function scanPage(tabId: number): Promise<EtimadTender[]> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // This runs in the page context — the bundled content script exposes parseTenderListingPage
        const rows = document.querySelectorAll("table tbody tr, .tender-item, .tender-card, [data-tender-id], .card-body");
        const tenders: any[] = [];
        for (const row of rows) {
          const text = row.textContent || "";
          const refMatch = text.match(/(\d{9,12})/);
          if (!refMatch) continue;
          
          const titleEl = row.querySelector("h3, h4, h5, .tender-title, .title, a[href*='Tender']");
          const linkEl = row.querySelector("a[href*='Tender'], a[href*='Details']") as HTMLAnchorElement | null;
          
          tenders.push({
            referenceNumber: refMatch[1],
            titleAr: titleEl?.textContent?.trim() || "",
            title: titleEl?.textContent?.trim() || "",
            url: linkEl?.href || "",
            extractedAt: new Date().toISOString(),
            entity: "",
            entityAr: "",
            category: "other",
            currency: "SAR",
            publishDate: "",
            closingDate: "",
            status: "open",
            documents: [],
            qualifications: [],
          });
        }
        return tenders;
      },
    });
    return (result as EtimadTender[]) || [];
  } catch {
    return [];
  }
}

/** Navigate to next page in the listing */
async function navigateNextPage(tabId: number): Promise<boolean> {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const nextBtn = document.querySelector(
          "a.next, .pagination .next a, [aria-label='Next'], a[rel='next'], .page-item:not(.disabled):last-child a"
        ) as HTMLAnchorElement | null;
        if (!nextBtn) return false;
        const parent = nextBtn.closest(".page-item, li");
        if (parent?.classList.contains("disabled")) return false;
        nextBtn.click();
        return true;
      },
    });
    if (result) await delay(LIMITS.SCAN_PAGE_DELAY_MS);
    return !!result;
  } catch {
    return false;
  }
}

/** Open or reuse an Etimad tab */
async function openEtimadTab(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: ["https://tenders.etimad.sa/*", "https://*.etimad.sa/*"] });
  if (tabs.length > 0 && tabs[0].id) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: ETIMAD.TENDERS_LIST, active: false });
  return tab.id!;
}

/** Schedule auto-scan alarm */
export function scheduleAutoScan(intervalMinutes: number): void {
  if (intervalMinutes <= 0) {
    chrome.alarms.clear(ALARMS.AUTO_SCAN);
    return;
  }
  chrome.alarms.create(ALARMS.AUTO_SCAN, { periodInMinutes: intervalMinutes });
}

// ─── Storage Helpers ─────────────────────────────────────────────────

async function getStoredTenders(): Promise<EtimadTender[]> {
  const stored = await chrome.storage.local.get({ [STORAGE.TENDERS]: [] });
  return stored[STORAGE.TENDERS] || [];
}

async function storeTenders(tenders: EtimadTender[]): Promise<void> {
  const limited = tenders.slice(0, LIMITS.MAX_TENDERS_STORED);
  await chrome.storage.local.set({ [STORAGE.TENDERS]: limited });
}

async function storeMatched(tenders: EtimadTender[]): Promise<void> {
  const limited = tenders.slice(0, LIMITS.MAX_MATCHED_STORED);
  await chrome.storage.local.set({ [STORAGE.MATCHED]: limited });
}

export async function getMatchedTenders(): Promise<EtimadTender[]> {
  const stored = await chrome.storage.local.get({ [STORAGE.MATCHED]: [] });
  return stored[STORAGE.MATCHED] || [];
}

export async function clearTenders(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE.TENDERS]: [],
    [STORAGE.MATCHED]: [],
  });
}

// ─── Utilities ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise(resolve => {
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}
