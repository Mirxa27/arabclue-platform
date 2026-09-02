/**
 * The dock forgot its conversation whenever the agent did its job.
 *
 * Playwright against production, 2026-09-02: ask the dock to "open the
 * Projects screen", the agent calls `navigateToView`, the URL changes — and
 * the in-flight stream reports `net::ERR_ABORTED`; reopen the dock and the
 * starter prompts are back. `AppShell` was rendered by the page entry
 * (`app-route-entry.tsx`), so every route change under `/app` remounted the
 * shell, and with it the dock and its `useChat` instance. A layout survives
 * navigation; a page does not. The shell belongs in the layout.
 *
 * Second finding from the same drive: the UI came up in Arabic for a profile
 * whose language is English, and the agent — which reads the profile —
 * answered in English under an Arabic UI. The only place that reconciled the
 * two was the Settings panel. Three rules now: the profile language is
 * applied once when the shell mounts, the topbar toggle writes the choice
 * back to the profile, and the chat surfaces tell the agent which language
 * is on screen — resolved server-side, never trusted.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRequestLocale } from "../agents/platform/context";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const LAYOUT = "src/app/(app)/app/layout.tsx";
const ENTRY = "src/app/(app)/app/app-route-entry.tsx";
const SHELL = "src/components/dashboard/app-shell.tsx";
const TOPBAR = "src/components/dashboard/topbar.tsx";
const DOCK = "src/components/dashboard/assistant-dock.tsx";
const CONSOLE = "src/components/dashboard/platform-agent-console.tsx";
const CHAT_ROUTE = "src/app/api/platform-agent/chat/route.ts";
const MAIN_AGENT = "src/lib/agents/platform/main-agent.ts";

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}
function lacks(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — still has ${what}: ${pattern}`).toBe(false);
}

describe("the shell lives in the layout, so the dock survives navigation", () => {
  test("the (app)/app layout renders AppShell around its children", () => {
    has(LAYOUT, "the shell", /<AppShell>/);
    has(LAYOUT, "children inside the shell", /<AppShell>\s*\{children\}\s*<\/AppShell>/);
  });

  test("the page entry no longer wraps the views in a second shell", () => {
    lacks(ENTRY, "a page-level shell", /<AppShell/);
    // Anti-vacuous: the entry still renders the views.
    has(ENTRY, "the view map", /<DashboardViews/);
  });
});

describe("resolveRequestLocale", () => {
  test("accepts exactly the two locales", () => {
    expect(resolveRequestLocale("ar", "en")).toBe("ar");
    expect(resolveRequestLocale("en", "ar")).toBe("en");
  });

  test("anything else is the fallback, without throwing", () => {
    for (const junk of ["EN", " ar ", "fr", "", null, undefined, 1, {}, [], true]) {
      expect(resolveRequestLocale(junk, "ar")).toBe("ar");
      expect(resolveRequestLocale(junk, "en")).toBe("en");
    }
  });
});

describe("one language on screen and in the agent's mouth", () => {
  test("the shell applies the profile language when it mounts", () => {
    has(SHELL, "the profile locale read", /session\?\.user\?\.locale|session\.user\.locale/);
    has(SHELL, "the store write", /setLocale\(/);
  });

  test("the topbar toggle writes the choice back to the profile", () => {
    has(TOPBAR, "the profile PATCH", /fetch\("\/api\/auth\/profile",\s*\{[\s\S]*?method:\s*"PATCH"/);
  });

  test("the dock and the console send the on-screen language", () => {
    has(DOCK, "locale in the transport body", /body:\s*\{[^}]*locale/);
    has(CONSOLE, "locale in the transport body", /body:\s*\{[^}]*locale/);
  });

  test("the chat route resolves it and the agent context prefers it", () => {
    has(CHAT_ROUTE, "the resolver", /resolveRequestLocale\(/);
    has(MAIN_AGENT, "the request locale reaching the context", /opts\?\.locale/);
  });
});
