/** ArabClue Etimad Agent — Service Worker (message router, alarms, context menus) */

import type { ExtensionSettings, UserMatchCriteria } from "../types";
import { MSG, DEFAULT_SETTINGS, STORAGE, ALARMS } from "../constants";
import { normalizeApiBase } from "../utils";
import { startScan, stopScan, getScanState, getMatchedTenders, clearTenders, scheduleAutoScan } from "./scanner";
import { downloadTenderDocuments, getDownloadStatus } from "./downloader";
import { ingestTender, startProposalPipeline } from "./ingest";
import { notifyNewMatches, notifyClosingSoon } from "./notifications";
import { getQueue, flushQueue, refreshQueueBadge } from "./queue";
import { daysUntil } from "../utils";

// ─── Side Panel Behavior ─────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// ─── Install / Startup ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  void refreshQueueBadge();
  void initAutoScan();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshQueueBadge();
  void initAutoScan();
});

// ─── Context Menus ───────────────────────────────────────────────────

function setupContextMenus(): void {
  chrome.contextMenus.create({
    id: "arabclue-scan-etimad",
    title: "Scan Etimad for tenders",
    contexts: ["action", "page"],
  });
  chrome.contextMenus.create({
    id: "arabclue-extract-tender",
    title: "Extract tender from this page",
    contexts: ["page"],
    documentUrlPatterns: ["https://tenders.etimad.sa/*", "https://*.etimad.sa/*"],
  });
  chrome.contextMenus.create({
    id: "arabclue-prepare-proposal",
    title: "Prepare proposal for this tender",
    contexts: ["page"],
    documentUrlPatterns: ["https://tenders.etimad.sa/*", "https://*.etimad.sa/*"],
  });
  chrome.contextMenus.create({
    id: "arabclue-open-panel",
    title: "Open ArabClue Etimad Agent",
    contexts: ["action", "page"],
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "arabclue-open-panel" && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId === "arabclue-scan-etimad") {
    const criteria = await getMatchCriteria();
    void startScan(criteria).then(result => {
      if (result.newSinceLastScan.length > 0) {
        notifyNewMatches(result.newSinceLastScan);
      }
    });
    return;
  }
  if (info.menuItemId === "arabclue-extract-tender" && tab?.id) {
    // Extract will be handled by the side panel sending EXTRACT_CURRENT_PAGE
    if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId === "arabclue-prepare-proposal" && tab?.id) {
    if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
});

// ─── Alarms ──────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARMS.RETRY_QUEUE) {
    void flushQueue();
    return;
  }
  if (alarm.name === ALARMS.AUTO_SCAN) {
    const settings = await getSettings();
    if (settings.autoScanInterval <= 0) return;
    const criteria = await getMatchCriteria();
    try {
      const result = await startScan(criteria);
      if (result.newSinceLastScan.length > 0 && settings.notifyOnMatch) {
        notifyNewMatches(result.newSinceLastScan);
      }
      // Auto-download if enabled
      if (settings.autoDownload) {
        for (const tender of result.newSinceLastScan) {
          if (tender.documents.length > 0) {
            void downloadTenderDocuments(tender);
          }
        }
      }
      // Auto-proposal if enabled
      if (settings.autoProposal) {
        for (const tender of result.newSinceLastScan.slice(0, 3)) {
          void startProposalPipeline(tender, tender.documents);
        }
      }
    } catch {
      /* auto-scan failures are silent */
    }
    return;
  }
  if (alarm.name === ALARMS.DEADLINE_CHECK) {
    const matched = await getMatchedTenders();
    const closingSoon = matched.filter(t => {
      const days = daysUntil(t.closingDate);
      return days >= 0 && days <= 2;
    });
    if (closingSoon.length > 0) notifyClosingSoon(closingSoon);
  }
});

// ─── Message Router ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case MSG.PING:
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
        break;

      case MSG.GET_SETTINGS:
        sendResponse({ ok: true, settings: await getSettings() });
        break;

      case MSG.SET_SETTINGS: {
        const next = { ...(message.settings || {}) };
        if (next.apiBase != null) next.apiBase = normalizeApiBase(next.apiBase);
        await chrome.storage.sync.set(next);
        const updated = await getSettings();
        scheduleAutoScan(updated.autoScanInterval);
        sendResponse({ ok: true, settings: updated });
        break;
      }

      case MSG.SCAN_ETIMAD: {
        const criteria = await getMatchCriteria();
        const result = await startScan(criteria);
        if (result.newSinceLastScan.length > 0) {
          const settings = await getSettings();
          if (settings.notifyOnMatch) notifyNewMatches(result.newSinceLastScan);
        }
        sendResponse({ ok: true, result });
        break;
      }

      case MSG.STOP_SCAN:
        stopScan();
        sendResponse({ ok: true });
        break;

      case MSG.GET_SCAN_STATE:
        sendResponse({ ok: true, state: await getScanState() });
        break;

      case MSG.GET_MATCHED_TENDERS:
        sendResponse({ ok: true, tenders: await getMatchedTenders() });
        break;

      case MSG.DOWNLOAD_DOCUMENTS: {
        const tasks = await downloadTenderDocuments(message.tender);
        sendResponse({ ok: true, tasks });
        break;
      }

      case MSG.PREPARE_PROPOSAL: {
        const result = await startProposalPipeline(message.tender, message.tender.documents || []);
        sendResponse({ ok: true, result });
        break;
      }

      case MSG.INGEST_TENDER: {
        const result = await ingestTender(message.tender, message.tender.documents || []);
        sendResponse({ ok: true, result });
        break;
      }

      case MSG.GET_MATCH_CRITERIA:
        sendResponse({ ok: true, criteria: await getMatchCriteria() });
        break;

      case MSG.SET_MATCH_CRITERIA:
        await chrome.storage.sync.set({ [STORAGE.CRITERIA]: message.criteria });
        sendResponse({ ok: true });
        break;

      case MSG.GET_DOWNLOAD_STATUS:
        sendResponse({ ok: true, tasks: await getDownloadStatus() });
        break;

      case MSG.CLEAR_TENDERS:
        await clearTenders();
        sendResponse({ ok: true });
        break;

      case MSG.GET_QUEUE_STATUS: {
        const queue = await getQueue();
        sendResponse({ ok: true, count: queue.length });
        break;
      }

      case MSG.FLUSH_QUEUE: {
        const result = await flushQueue();
        sendResponse({ ok: true, ...result });
        break;
      }

      case MSG.OPEN_MISSION_CONTROL: {
        const settings = await getSettings();
        const base = normalizeApiBase(settings.apiBase);
        await chrome.tabs.create({ url: `${base}/app?view=copilot&extension=1` });
        sendResponse({ ok: true });
        break;
      }

      case MSG.EXTRACT_CURRENT_PAGE: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content/etimad-detail-parser.js"],
        });
        sendResponse({ ok: true, tender: result });
        break;
      }

      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })().catch((err) => {
    sendResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  return true; // Keep message channel open for async
});

// ─── External Messages (from arabclue.com) ───────────────────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.origin || "";
  if (!/https:\/\/([a-z0-9-]+\.)?arabclue\.com$/i.test(origin)) {
    sendResponse({ ok: false, error: "Origin not allowed" });
    return false;
  }
  if (message?.type === MSG.PING) {
    sendResponse({
      ok: true,
      extensionId: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
    });
    return false;
  }
  sendResponse({ ok: false, error: "Unsupported" });
  return false;
});

// ─── Keyboard Shortcuts ──────────────────────────────────────────────

chrome.commands?.onCommand?.addListener(async (command) => {
  if (command === "scan-etimad") {
    const criteria = await getMatchCriteria();
    void startScan(criteria);
  }
  if (command === "prepare-proposal") {
    // Open side panel for action
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored, apiBase: normalizeApiBase(stored.apiBase) };
}

async function getMatchCriteria(): Promise<UserMatchCriteria> {
  const stored = await chrome.storage.sync.get({ [STORAGE.CRITERIA]: null });
  return stored[STORAGE.CRITERIA] || {
    categories: [],
    keywords: [],
    keywordsAr: [],
    autoDownloadDocuments: false,
    autoStartProposal: false,
  };
}

async function initAutoScan(): Promise<void> {
  const settings = await getSettings();
  scheduleAutoScan(settings.autoScanInterval);
  // Also set up deadline check every 6 hours
  chrome.alarms.create(ALARMS.DEADLINE_CHECK, { periodInMinutes: 360 });
}

void refreshQueueBadge();
