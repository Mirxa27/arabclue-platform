/** ArabClue Agent — Service Worker (message router, alarms, context menus) */

import type { ExtensionSettings, UserMatchCriteria, EtimadTender } from "../types";
import { MSG, DEFAULT_SETTINGS, STORAGE, ALARMS } from "../constants";
import { normalizeApiBase } from "../utils";
import {
  startScan,
  stopScan,
  getScanState,
  getMatchedTenders,
  clearTenders,
  scheduleAutoScan,
  upsertMatchedTender,
  waitForTabLoad,
  delay,
} from "./scanner";
import { downloadTenderDocuments, getDownloadStatus } from "./downloader";
import { ingestTender, startProposalPipeline, sendCopilotChat } from "./ingest";
import { notifyNewMatches, notifyClosingSoon } from "./notifications";
import { getQueue, flushQueue, refreshQueueBadge } from "./queue";
import { daysUntil } from "../utils";
import { loadRemoteConfig, probeAuthStatus } from "../config/remote";
import { runDetailParser } from "./inject";
import {
  captureAndIngestPage,
  captureAndIngestSelection,
  captureAndIngestScreenshot,
  requestHostPermissionForUrl,
} from "./capture";

// ─── Side Panel Behavior ─────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

// ─── Install / Startup ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  void refreshQueueBadge();
  void initAutoScan();
  void loadRemoteConfig(true).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  void refreshQueueBadge();
  void initAutoScan();
  void loadRemoteConfig(false).catch(() => {});
});

// ─── Context Menus ───────────────────────────────────────────────────

function setupContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
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
      id: "arabclue-capture-page",
      title: "Capture page to ArabClue",
      contexts: ["page", "action"],
    });
    chrome.contextMenus.create({
      id: "arabclue-capture-selection",
      title: "Capture selection to ArabClue",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: "arabclue-open-panel",
      title: "Open ArabClue Agent",
      contexts: ["action", "page"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "arabclue-open-panel" && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId === "arabclue-scan-etimad") {
    const criteria = await getMatchCriteria();
    void startScan(criteria).then((result) => {
      if (result.newSinceLastScan.length > 0) {
        notifyNewMatches(result.newSinceLastScan);
      }
    });
    return;
  }
  if (info.menuItemId === "arabclue-extract-tender" && tab?.id) {
    const tender = await extractCurrentPageTender(tab.id);
    if (tender) {
      await upsertMatchedTender(tender);
      await ingestTender(tender, tender.documents || []);
    }
    if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId === "arabclue-prepare-proposal" && tab?.id) {
    const tender = await extractCurrentPageTender(tab.id);
    if (tender) {
      await upsertMatchedTender(tender);
      await startProposalPipeline(tender, tender.documents || []);
    }
    if (tab.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId === "arabclue-capture-page") {
    void captureAndIngestPage();
    return;
  }
  if (info.menuItemId === "arabclue-capture-selection") {
    void captureAndIngestSelection();
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
    const flags = await getFeatureFlags();
    if (!flags.autoScan) return;
    const criteria = await getMatchCriteria();
    try {
      const result = await startScan(criteria);
      if (result.newSinceLastScan.length > 0 && settings.notifyOnMatch) {
        notifyNewMatches(result.newSinceLastScan);
      }
      const autoDownload =
        settings.autoDownload || Boolean(criteria.autoDownloadDocuments);
      const autoProposal =
        settings.autoProposal || Boolean(criteria.autoStartProposal);
      if (autoDownload && flags.documentUpload) {
        for (const tender of result.newSinceLastScan) {
          if ((tender.documents || []).length > 0) {
            void downloadTenderDocuments(tender);
          }
        }
      }
      if (autoProposal && flags.autopilot) {
        for (const tender of result.newSinceLastScan.slice(0, 3)) {
          void startProposalPipeline(tender, tender.documents || []);
        }
      }
    } catch {
      /* auto-scan failures are silent */
    }
    return;
  }
  if (alarm.name === ALARMS.DEADLINE_CHECK) {
    const matched = await getMatchedTenders();
    const closingSoon = matched.filter((t) => {
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

      case MSG.GET_TENDER_DETAILS: {
        const tender = await getTenderDetails(message.tender as EtimadTender | undefined, message.url as string | undefined);
        sendResponse({ ok: true, tender });
        break;
      }

      case MSG.DOWNLOAD_DOCUMENTS: {
        if (!message.tender) throw new Error("tender required");
        const tasks = await downloadTenderDocuments(message.tender);
        sendResponse({ ok: true, tasks });
        break;
      }

      case MSG.PREPARE_PROPOSAL: {
        if (!message.tender) throw new Error("tender required");
        const docs = Array.isArray(message.tender.documents)
          ? message.tender.documents
          : [];
        const result = await startProposalPipeline(message.tender, docs);
        sendResponse({ ok: true, result });
        break;
      }

      case MSG.INGEST_TENDER: {
        if (!message.tender) throw new Error("tender required");
        const docs = Array.isArray(message.tender.documents)
          ? message.tender.documents
          : [];
        const result = await ingestTender(message.tender, docs);
        sendResponse({ ok: true, result });
        break;
      }

      case MSG.GET_MATCH_CRITERIA:
        sendResponse({ ok: true, criteria: await getMatchCriteria() });
        break;

      case MSG.SET_MATCH_CRITERIA: {
        const next = message.criteria as UserMatchCriteria;
        await chrome.storage.sync.set({ [STORAGE.CRITERIA]: next });
        // Keep settings flags in sync with criteria checkboxes
        await chrome.storage.sync.set({
          autoDownload: Boolean(next?.autoDownloadDocuments),
          autoProposal: Boolean(next?.autoStartProposal),
        });
        sendResponse({ ok: true });
        break;
      }

      case MSG.GET_DOWNLOAD_STATUS:
        sendResponse({ ok: true, tasks: await getDownloadStatus() });
        break;

      case MSG.CLEAR_TENDERS:
        await clearTenders();
        sendResponse({ ok: true });
        break;

      case MSG.GET_QUEUE_STATUS: {
        const queue = await getQueue();
        sendResponse({
          ok: true,
          count: queue.length,
          pending: queue.length,
          items: queue.map((e) =>
            e.kind === "capture"
              ? {
                  id: e.id,
                  kind: "capture",
                  referenceNumber: `${e.capture.mode}:${e.capture.url}`,
                  reason: e.reason,
                  attempts: e.attempts,
                }
              : {
                  id: e.id,
                  kind: "tender",
                  referenceNumber: e.tender.referenceNumber,
                  reason: e.reason,
                  attempts: e.attempts,
                }
          ),
        });
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
        const missionStored = await chrome.storage.local.get({ [STORAGE.LAST_MISSION]: null });
        const missionId = missionStored[STORAGE.LAST_MISSION];
        const url = missionId
          ? `${base}/app?view=copilot&extension=1&mission=${encodeURIComponent(missionId)}`
          : `${base}/app?view=copilot&extension=1`;
        await chrome.tabs.create({ url });
        sendResponse({ ok: true });
        break;
      }

      case MSG.EXTRACT_CURRENT_PAGE: {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error("No active tab");
        const tender = await extractCurrentPageTender(tab.id);
        if (!tender) throw new Error("Could not parse Etimad page");
        await upsertMatchedTender(tender);
        sendResponse({ ok: true, tender });
        break;
      }

      case MSG.CAPTURE_PAGE: {
        const flags = await getFeatureFlags();
        if (!flags.universalCapture) throw new Error("Universal capture disabled");
        const result = await captureAndIngestPage();
        sendResponse({ ok: result.ok, result, error: result.error });
        break;
      }

      case MSG.CAPTURE_SELECTION: {
        const flags = await getFeatureFlags();
        if (!flags.universalCapture) throw new Error("Universal capture disabled");
        const result = await captureAndIngestSelection();
        sendResponse({ ok: result.ok, result, error: result.error });
        break;
      }

      case MSG.CAPTURE_SCREENSHOT: {
        const flags = await getFeatureFlags();
        if (!flags.universalCapture) throw new Error("Universal capture disabled");
        const result = await captureAndIngestScreenshot();
        sendResponse({ ok: result.ok, result, error: result.error });
        break;
      }

      case MSG.INGEST_CAPTURE: {
        const flags = await getFeatureFlags();
        if (!flags.universalCapture) throw new Error("Universal capture disabled");
        if (!message.payload) throw new Error("payload required");
        const { ingestCapture } = await import("./ingest");
        const result = await ingestCapture(message.payload);
        sendResponse({ ok: result.ok, result, error: result.error });
        break;
      }

      case MSG.COPILOT_CHAT: {
        const flags = await getFeatureFlags();
        if (!flags.copilot) throw new Error("Copilot disabled");
        const result = await sendCopilotChat(String(message.text || ""), message.missionId);
        sendResponse({ ...result });
        break;
      }

      case MSG.GET_AUTH_STATUS: {
        const settings = await getSettings();
        const status = await probeAuthStatus(settings);
        sendResponse({ ok: true, ...status });
        break;
      }

      case MSG.SYNC_REMOTE_CONFIG: {
        const config = await loadRemoteConfig(Boolean(message.force));
        sendResponse({ ok: true, config });
        break;
      }

      case MSG.REQUEST_HOST_PERMISSION: {
        const url = String(message.url || "");
        if (!url) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) throw new Error("No active tab URL");
          sendResponse(await requestHostPermissionForUrl(tab.url));
        } else {
          sendResponse(await requestHostPermissionForUrl(url));
        }
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
  return true;
});

// ─── External Messages (from arabclue.com / localhost) ───────────────

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.origin || "";
  const allowed =
    /https:\/\/([a-z0-9-]+\.)?arabclue\.com$/i.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):3000$/i.test(origin);
  if (!allowed) {
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
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const tender = await extractCurrentPageTender(tab.id);
      if (tender) {
        await upsertMatchedTender(tender);
        await startProposalPipeline(tender, tender.documents || []);
      }
    }
    if (tab?.windowId) await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// ─── Tender detail helpers ───────────────────────────────────────────

async function extractCurrentPageTender(tabId: number): Promise<EtimadTender | null> {
  return runDetailParser(tabId);
}

async function getTenderDetails(
  partial?: EtimadTender,
  url?: string
): Promise<EtimadTender | null> {
  const targetUrl = url || partial?.url;
  if (!targetUrl) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    return extractCurrentPageTender(tab.id);
  }

  let tabId: number | undefined;
  const existing = await chrome.tabs.query({ url: ["https://tenders.etimad.sa/*", "https://*.etimad.sa/*"] });
  if (existing[0]?.id) {
    tabId = existing[0].id;
    await chrome.tabs.update(tabId, { url: targetUrl });
  } else {
    const tab = await chrome.tabs.create({ url: targetUrl, active: false });
    tabId = tab.id;
  }
  if (!tabId) return null;

  await waitForTabLoad(tabId);
  await delay(2000);
  const tender = await runDetailParser(tabId);
  if (!tender) return partial || null;

  const merged: EtimadTender = {
    ...(partial || ({} as EtimadTender)),
    ...tender,
    documents: mergeDocuments(partial?.documents || [], tender.documents || []),
    qualifications: tender.qualifications?.length
      ? tender.qualifications
      : partial?.qualifications || [],
  };
  await upsertMatchedTender(merged);
  return merged;
}

function mergeDocuments(
  a: EtimadTender["documents"],
  b: EtimadTender["documents"]
): EtimadTender["documents"] {
  const seen = new Set<string>();
  const out: EtimadTender["documents"] = [];
  for (const d of [...a, ...b]) {
    if (!d?.url || seen.has(d.url)) continue;
    seen.add(d.url);
    out.push(d);
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    apiBase: normalizeApiBase(stored.apiBase as string),
  };
}

async function getMatchCriteria(): Promise<UserMatchCriteria> {
  const stored = await chrome.storage.sync.get({ [STORAGE.CRITERIA]: null });
  const remote = await loadRemoteConfig().catch(() => null);
  const defaults = remote?.matchCriteriaDefaults || {};
  return (
    stored[STORAGE.CRITERIA] || {
      categories: defaults.categories || [],
      keywords: defaults.keywords || [],
      keywordsAr: defaults.keywordsAr || [],
      autoDownloadDocuments: defaults.autoDownloadDocuments ?? false,
      autoStartProposal: defaults.autoStartProposal ?? false,
      minValue: defaults.minValue,
      maxValue: defaults.maxValue,
      maxDaysUntilClose: defaults.maxDaysUntilClose,
    }
  );
}

async function getFeatureFlags(): Promise<{
  universalCapture: boolean;
  copilot: boolean;
  autoScan: boolean;
  documentUpload: boolean;
  autopilot: boolean;
}> {
  const remote = await loadRemoteConfig().catch(() => null);
  const flags = remote?.featureFlags;
  return {
    universalCapture: flags?.universalCapture !== false,
    copilot: flags?.copilot !== false,
    autoScan: flags?.autoScan !== false,
    documentUpload: flags?.documentUpload !== false,
    autopilot: flags?.autopilot !== false,
  };
}

async function initAutoScan(): Promise<void> {
  const settings = await getSettings();
  scheduleAutoScan(settings.autoScanInterval);
  chrome.alarms.create(ALARMS.DEADLINE_CHECK, { periodInMinutes: 360 });
}

void refreshQueueBadge();
