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

describe("the shell never clips its own body", () => {
  const SHELL = "src/components/dashboard/mission-control-shell.tsx";
  test("the fixed height applies only to viewports tall enough for it", () => {
    // Production screenshot: with the files panel open, the live-session strip
    // and the transcript were cut to a sliver under it.
    has(SHELL, "a height-gated max height", /lg:\[@media\(min-height:920px\)\]:max-h-\[calc\(100dvh-6\.5rem\)\]/);
    lacks(SHELL, "the unconditional cap", /\slg:max-h-\[calc\(100dvh-6\.5rem\)\]/);
    has(SHELL, "the files panel scrolls inside a cap", /max-h-\[52dvh\] lg:max-h-\[38dvh\] overflow-y-auto/);
  });
  test("the panel subtitle no longer advertises the extension", () => {
    lacks(SHELL, "extension in the subtitle", /upload · extension · live pulse/);
  });
});

describe("the stage strip", () => {
  test("shows only while the agent is working", () => {
    has(BAR, "render gated on activity", /const shouldRender = performing \|\| activeStep >= 0;/);
  });
});

describe("the proposals list after a run", () => {
  const LIST = "src/components/dashboard/proposals-list.tsx";
  test("grows with the page instead of scrolling inside 24rem", () => {
    // Production screenshot: the second proposal cut in half above a screen of
    // empty space.
    lacks(LIST, "the inner scroll cap", /ScrollArea className="max-h-96"/);
  });
  test("explains the draft state instead of repeating the page title", () => {
    lacks(LIST, "the duplicate subtitle", /"Generated proposals"/);
    has(LIST, "why rows are drafts", /stays a draft until you review and approve it/);
    lacks(LIST, "an unexplained badge", /"Not ready"/);
    has(LIST, "the labelled score", /"Compliance"\} \{formatPercent\(p\.complianceScore\)\}%/);
  });
});

describe("the floating launcher", () => {
  test("stays off the Agent page, where the console is the agent", () => {
    // On a phone it sat over the console's voice and style selects.
    const dock = read("src/components/dashboard/assistant-dock.tsx");
    expect(/const onAgentPage = view === "overview";/.test(dock)).toBe(true);
    expect(/\{onAgentPage \? null : \(\s*<Button/.test(dock)).toBe(true);
    expect(/raised=\{!onAgentPage\}/.test(dock)).toBe(true);
  });
});

describe("the proposals list on a phone", () => {
  const LIST = "src/components/dashboard/proposals-list.tsx";
  test("title and badges stack, artifacts go single column", () => {
    has(LIST, "stacked header on small screens", /flex flex-col gap-1\.5 sm:flex-row sm:items-start sm:justify-between/);
    has(LIST, "single-column artifacts on small screens", /grid grid-cols-1 sm:grid-cols-2 gap-1\.5 mt-2/);
  });
});

describe("the documents page tables", () => {
  test("the matrix hides its narrowest columns until the card is wide enough", () => {
    // At 1280 px the two-thirds column clipped the UPDATED header.
    const src = read("src/components/dashboard/document-matrix.tsx");
    expect((src.match(/hidden 2xl:table-cell/g) ?? []).length).toBe(4);
  });
  test("the requirement column gets the width", () => {
    has("src/components/dashboard/requirements-matrix.tsx", "a wide requirement column", /w-\[46%\] min-w-\[16rem\]/);
  });
  test("the version history card does not stretch to the left column's height", () => {
    lacks("src/components/dashboard/version-history.tsx", "the stretched card", /border-border\/60 h-full"/);
  });
});

describe("the ingestion card header in a narrow column", () => {
  test("wraps instead of squeezing the autopilot label into a sliver", () => {
    const src = read("src/components/dashboard/file-ingestion.tsx");
    expect(/flex flex-wrap items-center justify-between gap-x-4 gap-y-2\.5 px-5 py-4/.test(src)).toBe(true);
    expect(/cursor-pointer select-none whitespace-nowrap/.test(src)).toBe(true);
  });
});

describe("the compliance monitor header in a narrow column", () => {
  test("wraps instead of clipping the score and the analyse button", () => {
    has("src/components/dashboard/compliance-monitor.tsx", "a wrapping header", /flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4/);
  });
});
