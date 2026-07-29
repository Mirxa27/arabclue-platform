/** Universal capture orchestration (page / selection / screenshot) */

import type { PageCapturePayload, ProposalPrepResult } from "../types";
import { ingestCapture } from "./ingest";
import { runPageCapture } from "./inject";

async function ensureHostPermission(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin + "/*";
    const have = await chrome.permissions.contains({ origins: [origin] });
    if (have) return true;
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function requestHostPermissionForUrl(url: string): Promise<{ ok: boolean; granted: boolean }> {
  const granted = await ensureHostPermission(url);
  return { ok: true, granted };
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No active tab");
  return tab;
}

export async function captureAndIngestPage(): Promise<ProposalPrepResult> {
  const tab = await activeTab();
  if (!(await ensureHostPermission(tab.url!))) {
    return { ok: false, error: "Host permission denied", message: "Grant host permission to capture" };
  }
  const content = await runPageCapture(tab.id!, "page");
  if (!content?.text) {
    return { ok: false, error: "Empty page", message: "Could not extract page text" };
  }
  const payload: PageCapturePayload = {
    mode: "page",
    title: content.title,
    url: content.url,
    text: content.text,
    headings: content.headings,
    metaDescription: content.metaDescription,
    source: "chrome-extension",
  };
  return ingestCapture(payload);
}

export async function captureAndIngestSelection(): Promise<ProposalPrepResult> {
  const tab = await activeTab();
  if (!(await ensureHostPermission(tab.url!))) {
    return { ok: false, error: "Host permission denied", message: "Grant host permission to capture" };
  }
  const content = await runPageCapture(tab.id!, "selection");
  if (!content?.text) {
    return { ok: false, error: "Empty selection", message: "Select text on the page first" };
  }
  const payload: PageCapturePayload = {
    mode: "selection",
    title: content.title,
    url: content.url,
    text: content.text,
    headings: content.headings,
    metaDescription: content.metaDescription,
    source: "chrome-extension",
  };
  return ingestCapture(payload);
}

export async function captureAndIngestScreenshot(): Promise<ProposalPrepResult> {
  const tab = await activeTab();
  if (!(await ensureHostPermission(tab.url!))) {
    return { ok: false, error: "Host permission denied", message: "Grant host permission to capture" };
  }

  let content = await runPageCapture(tab.id!, "page").catch(() => null);
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

  const payload: PageCapturePayload = {
    mode: "screenshot",
    title: content?.title || tab.title || "Screenshot",
    url: content?.url || tab.url || "",
    text: content?.text?.slice(0, 4000) || "",
    headings: content?.headings || [],
    metaDescription: content?.metaDescription,
    screenshotDataUrl: dataUrl,
    source: "chrome-extension",
  };
  return ingestCapture(payload);
}
