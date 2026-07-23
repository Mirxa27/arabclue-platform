/** Bridge: ArabClue web app ↔ extension (content script on arabclue.com). */

const MSG_AGENT_EVENT = "AGENT_EVENT";

function announce(detail) {
  const payload = { source: "arabclue-extension", ...detail };
  window.dispatchEvent(
    new CustomEvent("arabclue-extension-event", { detail: payload })
  );
  window.postMessage(payload, window.location.origin);
}

function pong(res) {
  const detail = res || { ok: false };
  window.dispatchEvent(
    new CustomEvent("arabclue-extension-pong", { detail })
  );
  window.postMessage(
    {
      source: "arabclue-extension",
      type: "extension-pong",
      ...detail,
    },
    window.location.origin
  );
}

function handlePing() {
  try {
    chrome.runtime.sendMessage({ type: "PING" }, (res) => {
      if (chrome.runtime.lastError) {
        pong({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      pong(res || { ok: true });
    });
  } catch (err) {
    pong({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MSG_AGENT_EVENT) return;
  announce({
    type: "extension-event",
    event: message.event,
    data: message.data,
  });
});

// Page → content script ping (custom event + postMessage)
window.addEventListener("arabclue-extension-ping", handlePing);
window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const data = ev.data;
  if (!data || data.source !== "arabclue-page") return;
  if (data.type === "extension-ping") handlePing();
});

function announceReady() {
  const detail = {
    ok: true,
    version: chrome.runtime.getManifest?.()?.version,
  };
  window.dispatchEvent(
    new CustomEvent("arabclue-extension-ready", { detail })
  );
  window.postMessage(
    {
      source: "arabclue-extension",
      type: "extension-ready",
      ...detail,
    },
    window.location.origin
  );
}

announceReady();
// Re-announce in case the SPA mounts after first inject
setTimeout(announceReady, 500);
setTimeout(announceReady, 2000);
