/** Etimad background scanning orchestrator — uses real IIFE content parsers */

import type { EtimadTender, ScanState, ScanResult, UserMatchCriteria } from "../types";
import { ETIMAD, STORAGE, LIMITS, ALARMS } from "../constants";
import { filterMatches, deduplicateTenders } from "./matcher";
import { getEtimadListUrl } from "../config/remote";
import { runApplyFilters, runClickNextPage, runListingParser } from "./inject";

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

    const listUrl = await getEtimadListUrl();
    const tabId = await openEtimadTab(listUrl);

    await chrome.tabs.update(tabId, { url: listUrl });
    await waitForTabLoad(tabId);
    await delay(2000);

    await runApplyFilters(tabId, criteria);
    await delay(1500);

    let page = 1;
    while (page <= LIMITS.MAX_SCAN_PAGES && !abortScan) {
      await setScanState({ currentPage: page });

      const tenders = await runListingParser(tabId);
      allTenders.push(...tenders);

      const hasNext = await runClickNextPage(tabId);
      if (!hasNext) break;

      page++;
      await delay(LIMITS.SCAN_PAGE_DELAY_MS);
      await waitForTabLoad(tabId);
    }

    const unique = deduplicateTenders(allTenders);
    const matched = filterMatches(unique, criteria);

    const stored = await getStoredTenders();
    const storedRefs = new Set(stored.map((t) => t.referenceNumber));
    const newSinceLastScan = matched.filter((t) => !storedRefs.has(t.referenceNumber));

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

/** Open or reuse an Etimad tab */
async function openEtimadTab(listUrl: string): Promise<number> {
  const tabs = await chrome.tabs.query({
    url: ["https://tenders.etimad.sa/*", "https://*.etimad.sa/*"],
  });
  if (tabs.length > 0 && tabs[0].id) return tabs[0].id;
  const tab = await chrome.tabs.create({ url: listUrl || ETIMAD.TENDERS_LIST, active: false });
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

export async function upsertMatchedTender(tender: EtimadTender): Promise<void> {
  const matched = await getMatchedTenders();
  const idx = matched.findIndex((t) => t.referenceNumber === tender.referenceNumber);
  if (idx >= 0) matched[idx] = { ...matched[idx], ...tender };
  else matched.unshift(tender);
  await storeMatched(matched);
}

// ─── Utilities ───────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
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
    }, 15_000);
  });
}

export { waitForTabLoad, delay };
