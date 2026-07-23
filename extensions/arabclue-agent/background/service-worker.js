import { MSG, DEFAULT_SETTINGS } from "../shared/messages.js";

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

async function sendToAgent(payload) {
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
  return data;
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
