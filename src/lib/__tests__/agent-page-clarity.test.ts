/**
 * The Agent page reads as one autonomous intake, not a control panel.
 *
 * The user's screenshot (2026-09-02): a "Drop files — auto-classify & run"
 * card with six equal source buttons, a duplicate row of source chips under
 * the URL field, a "Chrome extension (optional) · not required · not
 * installed" card with an "Optional install" button, and — when opened — a
 * see-through six-step developer wizard (unzip, chrome://extensions,
 * developer mode, load unpacked) whose middle band showed the page through
 * it. Above the composer, a five-stage strip carried checkmarks from hours-old
 * tool history while nothing was running.
 *
 * What the page should say instead: drop your tender, the agents take it from
 * there, autopilot is on. Other sources live in one menu; the extension is a
 * menu item that opens an opaque, honest wizard; the stage strip appears only
 * while the agent is actually working.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}
function lacks(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — still has ${what}: ${pattern}`).toBe(false);
}

const TRAY = "src/components/dashboard/mission-attachment-tray.tsx";
const BRIDGE = "src/components/dashboard/mission-extension-bridge.tsx";
const CONSOLE = "src/components/dashboard/platform-agent-console.tsx";
const BAR = "src/components/dashboard/mission-pipeline-bar.tsx";

describe("the intake card", () => {
  test("says what happens, in both languages", () => {
    has(TRAY, "the promise", /Drop your tender here/);
    has(TRAY, "the promise in Arabic", /أسقط مستندات المناقصة هنا/);
    has(TRAY, "what the agents do", /the agents read it/i);
  });

  test("one primary action, the other sources in one menu, no duplicate chip row", () => {
    has(TRAY, "the sources menu", /DropdownMenuTrigger/);
    has(TRAY, "the menu label", /More sources|مصادر أخرى/);
    // Six equal buttons became menu items; the URL row stays.
    const src = read(TRAY);
    const topLevelSourceButtons = (src.match(/<Button[^>]*onClick=\{\(\) => openImportDialog\(/g) ?? []).length;
    expect(topLevelSourceButtons).toBe(0);
    lacks(TRAY, "the connector chip row", /connectors\.map\(\(c\) => \(\s*<Badge/);
  });

  test("autopilot is visible where the documents land", () => {
    has(TRAY, "the autopilot preference", /autopilot/);
    has(TRAY, "the switch", /<Switch/);
  });

  test("the extension is reached from the menu, not from a card on the page", () => {
    has(TRAY, "the wizard opened from the menu", /EXTENSION_WIZARD_OPEN_EVENT/);
    has(CONSOLE, "the bridge kept quiet on the page", /<MissionExtensionBridge[\s\S]{0,120}presentation="quiet"/);
  });
});

describe("the extension wizard", () => {
  test("is opaque and opens on the menu's event", () => {
    has(BRIDGE, "an opaque dialog", /<DialogContent className="[^"]*bg-background/);
    lacks(BRIDGE, "the see-through gradient", /via-teal-500\/\[0\.04\]/);
    has(BRIDGE, "the open event listener", /addEventListener\(EXTENSION_WIZARD_OPEN_EVENT/);
    has(BRIDGE, "the quiet presentation", /presentation === "quiet"/);
  });

  test("tells the truth about why the steps exist", () => {
    // Chrome only installs extensions from outside the Web Store in developer
    // mode; the wizard says so instead of presenting six steps as normal.
    has(BRIDGE, "the Web Store note", /outside the Chrome Web Store|خارج متجر Chrome/);
  });
});

describe("the stage strip", () => {
  test("shows only while the agent is working", () => {
    has(BAR, "render gated on activity", /const shouldRender = performing \|\| activeStep >= 0;/);
  });
});
