/** Universal page capture helpers — exposed for chrome.scripting.executeScript */

import { LIMITS } from "../constants";
import { exposeGlobals } from "./globals";

export interface CapturedPageContent {
  title: string;
  url: string;
  text: string;
  headings: string[];
  metaDescription: string;
  selection: string;
}

/** Capture readable main content + metadata from the active page */
export function capturePageContent(): CapturedPageContent {
  const title = document.title || "";
  const url = location.href;
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((el) => (el.textContent || "").trim())
    .filter((t) => t.length > 0 && t.length < 300)
    .slice(0, 40);

  const selection = (window.getSelection()?.toString() || "").trim();

  const main =
    document.querySelector("main, article, [role='main'], .content, #content") ||
    document.body;

  const clone = main.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("script, style, noscript, svg, iframe, nav, footer, header")
    .forEach((el) => el.remove());

  let text = (clone.innerText || clone.textContent || "").replace(/\s+\n/g, "\n").trim();
  if (text.length > LIMITS.PAGE_TEXT_MAX) {
    text = text.slice(0, LIMITS.PAGE_TEXT_MAX);
  }

  return { title, url, text, headings, metaDescription, selection };
}

/** Capture only the current text selection */
export function captureSelectionContent(): CapturedPageContent {
  const base = capturePageContent();
  const selection = (window.getSelection()?.toString() || "").trim();
  return {
    ...base,
    text: selection,
    selection,
  };
}

exposeGlobals({
  capturePageContent,
  captureSelectionContent,
});
