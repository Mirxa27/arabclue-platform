/** Bridge: ArabClue web app ↔ extension (content script on arabclue.com only). */

const MSG_AGENT_EVENT = "AGENT_EVENT";

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== MSG_AGENT_EVENT) return;
  window.dispatchEvent(
    new CustomEvent("arabclue-extension-event", {
      detail: message,
    })
  );
  window.postMessage(
    {
      source: "arabclue-extension",
      type: "extension-event",
      event: message.event,
      data: message.data,
    },
    window.location.origin
  );
});

// Allow the web app to ping for extension presence via DOM custom event
window.addEventListener("arabclue-extension-ping", () => {
  chrome.runtime.sendMessage({ type: "PING" }, (res) => {
    window.dispatchEvent(
      new CustomEvent("arabclue-extension-pong", {
        detail: res || { ok: false },
      })
    );
  });
});

window.dispatchEvent(
  new CustomEvent("arabclue-extension-ready", {
    detail: { ok: true },
  })
);
