import { MSG, DEFAULT_SETTINGS } from "../shared/messages.js";

const QUEUE_KEY = "arabclue.captureQueue";
const QUEUE_LIMIT = 20;
const QUEUE_MAX_ATTEMPTS = 12;
const RETRY_ALARM = "arabclue-retry-queue";

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn("[arabclue]", err));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "arabclue-send-selection",
    title: "Send selection to ArabClue Voice Agent",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "arabclue-send-page",
    title: "Send page to ArabClue Voice Agent",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "arabclue-open-panel",
    title: "Open ArabClue Voice Agent panel",
    contexts: ["action", "page"],
  });
  void refreshQueueBadge();
});

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function extractPageContext(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selection = window.getSelection()?.toString()?.trim() ?? "";
      const metaDesc =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ?? "";
      const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
        .slice(0, 20)
        .map((el) => el.innerText.trim())
        .filter(Boolean);
      const text = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim();
      return {
        selection,
        title: document.title || "",
        url: location.href,
        metaDescription: metaDesc.slice(0, 500),
        headings,
        text: text.slice(0, 60_000),
        capturedAt: new Date().toISOString(),
      };
    },
  });
  return result;
}

async function captureScreenshot(windowId) {
  return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}

async function notifyDashboards(data) {
  const tabs = await chrome.tabs.query({
    url: ["https://arabclue.com/*", "https://*.arabclue.com/*"],
  });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: MSG.AGENT_EVENT,
        event: "extension-ingest",
        data,
      });
    } catch {
      /* tab may not have bridge yet */
    }
  }
}

/** Raw network uplink — throws on failure without queueing. */
async function postToIngest(payload) {
  const settings = await getSettings();
  const base = (settings.apiBase || DEFAULT_SETTINGS.apiBase).replace(/\/$/, "");

  // Request optional host access when API base is not the production host.
  try {
    const origin = new URL(base).origin + "/*";
    if (!origin.includes("arabclue.com")) {
      const has = await chrome.permissions.contains({ origins: [origin] });
      if (!has) {
        await chrome.permissions.request({ origins: [origin] });
      }
    }
  } catch {
    /* ignore permission prompt failures */
  }

  const res = await fetch(`${base}/api/platform-agent/extension/ingest`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Ingest failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  await notifyDashboards(data);
  return data;
}

// ---------------------------------------------------------------------------
// Offline capture queue — text captures survive network drops / signed-out
// sessions and auto-retry every minute until delivered.
// ---------------------------------------------------------------------------

async function getQueue() {
  const stored = await chrome.storage.local.get({ [QUEUE_KEY]: [] });
  return Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
}

async function setQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
  await refreshQueueBadge(queue.length);
}

async function refreshQueueBadge(count) {
  const n = typeof count === "number" ? count : (await getQueue()).length;
  try {
    await chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#0e7490" });
  } catch {
    /* badge best-effort */
  }
}

async function enqueueCapture(payload, reason) {
  const queue = await getQueue();
  queue.push({
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    reason,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  });
  while (queue.length > QUEUE_LIMIT) queue.shift();
  await setQueue(queue);
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
  return queue.length;
}

async function flushQueue() {
  const queue = await getQueue();
  if (!queue.length) {
    await chrome.alarms.clear(RETRY_ALARM);
    return { ok: true, flushed: 0, remaining: 0 };
  }
  const remaining = [];
  let flushed = 0;
  let lastError = null;
  for (const entry of queue) {
    try {
      await postToIngest(entry.payload);
      flushed++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      entry.attempts = (entry.attempts || 0) + 1;
      if (entry.attempts < QUEUE_MAX_ATTEMPTS) remaining.push(entry);
    }
  }
  await setQueue(remaining);
  if (!remaining.length) await chrome.alarms.clear(RETRY_ALARM);
  return { ok: true, flushed, remaining: remaining.length, lastError };
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void flushQueue();
});

/**
 * Uplink with resilience: screenshots fail fast (too large to queue),
 * text captures fall back to the offline queue.
 */
async function sendToAgent(payload) {
  try {
    return await postToIngest(payload);
  } catch (err) {
    const isScreenshot = Boolean(payload?.screenshotDataUrl);
    // 4xx other than auth/network = caller mistake; don't queue those either.
    const status = err?.status;
    const retryable = status == null || status === 401 || status >= 500;
    if (!isScreenshot && retryable) {
      const queued = await enqueueCapture(
        payload,
        err instanceof Error ? err.message : "network"
      );
      return {
        ok: true,
        queued: true,
        queueLength: queued,
        message:
          status === 401
            ? "Saved offline — sign in at arabclue.com and it will auto-retry."
            : "Saved offline — will auto-retry every minute.",
      };
    }
    throw err;
  }
}

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
        await chrome.storage.sync.set(message.settings || {});
        sendResponse({ ok: true, settings: await getSettings() });
        break;
      }
      case MSG.GET_QUEUE_STATUS: {
        const queue = await getQueue();
        sendResponse({
          ok: true,
          count: queue.length,
          oldest: queue[0]?.queuedAt ?? null,
        });
        break;
      }
      case MSG.FLUSH_QUEUE: {
        sendResponse(await flushQueue());
        break;
      }
      case MSG.GET_PAGE_CONTEXT: {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab");
        const context = await extractPageContext(tab.id);
        sendResponse({
          ok: true,
          context: {
            ...context,
            tabId: tab.id,
            favIconUrl: tab.favIconUrl || null,
          },
        });
        break;
      }
      case MSG.CAPTURE_SCREENSHOT: {
        const win = await chrome.windows.getCurrent();
        const dataUrl = await captureScreenshot(win.id);
        sendResponse({ ok: true, dataUrl });
        break;
      }
      case MSG.SEND_TO_AGENT: {
        const result = await sendToAgent(message.payload);
        sendResponse({ ok: true, result });
        break;
      }
      case MSG.OPEN_MISSION_CONTROL: {
        const settings = await getSettings();
        const base = (settings.apiBase || DEFAULT_SETTINGS.apiBase).replace(
          /\/$/,
          ""
        );
        await chrome.tabs.create({
          url: `${base}/app?view=copilot&extension=1`,
        });
        sendResponse({ ok: true });
        break;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message" });
    }
  })().catch((err) => {
    sendResponse({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      status: err?.status,
    });
  });
  return true;
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.origin || "";
  const allowed = /https:\/\/([a-z0-9-]+\.)?arabclue\.com$/i.test(origin);
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
  sendResponse({ ok: false, error: "Unsupported external message" });
  return false;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "arabclue-open-panel" && tab?.windowId != null) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (!tab?.id) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    /* ignore */
  }
  const context = await extractPageContext(tab.id);
  const mode =
    info.menuItemId === "arabclue-send-selection" && info.selectionText
      ? "selection"
      : "page";
  const text =
    mode === "selection"
      ? info.selectionText || context.selection
      : context.text;
  await sendToAgent({
    mode,
    title: context.title,
    url: context.url,
    text,
    headings: context.headings,
    metaDescription: context.metaDescription,
    source: "chrome-extension",
  });
});

void refreshQueueBadge();
