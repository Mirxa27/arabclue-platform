/**
 * The agent page as a control room: a proposal being generated should look
 * like something premium is happening, and every number on screen must be
 * one the run actually produced.
 *
 * The panel used to be a scrolling text box with a word count. Now it is a
 * section rail (eighteen steps, read off the `## N.` headings the drafting
 * stage writes), a document on a dark stage, a metrics strip, and — once the
 * run is over — a drawer of the live research sources from the final
 * artifact. The six agents are a connected timeline; the completion banner is
 * a mission report.
 *
 * What this file pins:
 *   - the rail derives from the text, not from time (`sectionProgressFromDraft`);
 *   - no percentage is shown where the total is unknown, and the live draft
 *     never shows one at all — the stream reports no total and no tokens;
 *   - no favicon service is called for a source (a third-party request per
 *     source is a tracking beacon on a compliance product): the host is text;
 *   - the ambient layers stop under `prefers-reduced-motion`;
 *   - the presentation copy of the eighteen-section outline matches the one
 *     the drafting stage writes from.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROPOSAL_SECTIONS } from "../agents/drafting";
import { resolveTranslation } from "../i18n";
import {
  DRAFT_SECTION_COUNT,
  DRAFT_SECTION_OUTLINE,
  agentDurationLabel,
  draftCompletionLabel,
  draftSectionTitle,
  durationBetween,
  extractSearchSources,
  formatElapsed,
  hostnameOf,
  liveDraftOutcomeFor,
  missionReportFromArtifact,
  relativeTime,
  runStartedAt,
  sectionFallbackNote,
  sectionProgressFromDraft,
  uncoveredRequirementsNote,
} from "../agents/run-presentation";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}
function lacks(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — still has ${what}: ${pattern}`).toBe(false);
}

const PANEL = "src/components/dashboard/live-draft-panel.tsx";
const WORKFLOW = "src/components/dashboard/agent-workflow.tsx";
const REPORT = "src/components/dashboard/mission-report.tsx";
const DETAIL = "src/components/dashboard/agent-timeline-detail.tsx";
const HISTORY = "src/components/dashboard/agent-run-history.tsx";
const THEATER = "src/components/dashboard/mission-tool-theater.tsx";
const BAR = "src/components/dashboard/mission-pipeline-bar.tsx";
const GAUGE = "src/components/dashboard/radial-gauge.tsx";
const PREVIEW = "src/components/dashboard/document-preview-frame.tsx";
const CSS = "src/app/globals.css";

const DRAFT = [
  "# Proposal",
  "",
  "## 1. Executive Summary / الملخص التنفيذي",
  "Outcomes.",
  "### 1.1 Not a section",
  "## Unnumbered heading",
  "## 2. Project Understanding / فهم المشروع",
  "Scope.",
].join("\n");

describe("the section rail derives from the `## N.` headings", () => {
  test("nothing streamed, nothing on the rail", () => {
    const p = sectionProgressFromDraft("");
    expect(p.seen).toEqual([]);
    expect(p.current).toBeNull();
    expect(p.doneCount).toBe(0);
    expect(p.total).toBe(DRAFT_SECTION_COUNT);
  });

  test("the last heading seen is being written; the ones before it are done", () => {
    const p = sectionProgressFromDraft(DRAFT);
    expect(p.seen).toEqual([1, 2]);
    expect(p.done).toEqual([1]);
    expect(p.current).toBe(2);
    expect(p.doneCount).toBe(1);
  });

  test("a finished stream closes the section being written", () => {
    const p = sectionProgressFromDraft(DRAFT, { finished: true });
    expect(p.done).toEqual([1, 2]);
    expect(p.current).toBeNull();
    expect(p.doneCount).toBe(2);
  });

  test("sub-headings and unnumbered headings are not sections", () => {
    expect(sectionProgressFromDraft("### 1.1 Detail\n## Title\n#### 4. Deep").seen).toEqual([]);
  });

  test("Arabic-Indic digits count", () => {
    const p = sectionProgressFromDraft("## ٣. مواءمة معايير التقييم\nنص");
    expect(p.current).toBe(3);
  });

  test("a heading is a section only with the dot and a space after the number", () => {
    expect(sectionProgressFromDraft("## 12 Team").seen).toEqual([]);
    expect(sectionProgressFromDraft("## 12.Team").seen).toEqual([]);
    expect(sectionProgressFromDraft("##12. Team").seen).toEqual([12]);
    expect(sectionProgressFromDraft("  ## 12. Team").seen).toEqual([12]);
  });

  test("numbers outside the outline and repeats are ignored, not shown as extra steps", () => {
    const p = sectionProgressFromDraft("## 19. Extra\n## 0. Zero\n## 5. Five\n## 5. Five again");
    expect(p.seen).toEqual([5]);
  });

  test("a heading in the middle of a line is prose, not a section", () => {
    expect(sectionProgressFromDraft("see ## 3. below").seen).toEqual([]);
  });
});

describe("the presentation outline is the drafting stage's outline", () => {
  test("eighteen sections, same numbers, same titles in both languages", () => {
    expect(DRAFT_SECTION_OUTLINE).toHaveLength(18);
    expect(DRAFT_SECTION_COUNT).toBe(PROPOSAL_SECTIONS.length);
    expect(DRAFT_SECTION_OUTLINE.map((s) => [s.number, s.titleEn, s.titleAr])).toEqual(
      PROPOSAL_SECTIONS.map((s) => [s.number, s.titleEn, s.titleAr]),
    );
  });

  test("titles resolve by number in either language; an unknown number shows itself", () => {
    expect(draftSectionTitle(1, "en")).toBe("Executive Summary");
    expect(draftSectionTitle(18, "ar")).toBe("الخاتمة");
    expect(draftSectionTitle(42, "en")).toBe("42");
  });

  test("the panel renders the rail from the shared outline and the shared parser", () => {
    has(PANEL, "the outline", /DRAFT_SECTION_OUTLINE\.map\(/);
    has(PANEL, "the parser", /sectionProgressFromDraft\(text/);
    // Click scrolls the preview to the heading: the h2 is found by number,
    // digit script notwithstanding, and scrolled inside the container only.
    has(PANEL, "jump to a section", /jumpToSection\(section\.number\)/);
    has(PANEL, "heading lookup", /querySelectorAll<HTMLElement>\("h2"\)/);
    has(PANEL, "the current step marked for assistive tech", /aria-current=\{isCurrent \? "step" : undefined\}/);
  });
});

describe("no percentage without a known total", () => {
  test("the completion label is a fraction with a total and a count without one", () => {
    expect(draftCompletionLabel(7, 18, "en")).toBe("7 / 18 sections");
    expect(draftCompletionLabel(7, null, "en")).toBe("7 sections done");
    expect(draftCompletionLabel(7, 0, "en")).toBe("7 sections done");
    expect(draftCompletionLabel(7, null, "en")).not.toContain("%");
    expect(draftCompletionLabel(7, 18, "en")).not.toContain("%");
    expect(draftCompletionLabel(7, 18, "ar")).toContain("أقسام");
  });

  test("the live draft panel prints no percent at all", () => {
    // The stream carries characters and section headings; it carries no
    // total and no token count. `${x}%` anywhere here would be invented.
    lacks(PANEL, "an interpolated percent", /\}%/);
    lacks(PANEL, "a computed ratio", /\*\s*100/);
    has(PANEL, "the fraction label", /draftCompletionLabel\(progress\.doneCount, progress\.total, locale\)/);
    has(PANEL, "elapsed from the first words", /formatElapsed\(elapsedMs\)/);
  });

  test("the pipeline bar shows a fraction only with telemetry", () => {
    has(BAR, "the telemetry gate", /hasTelemetry/);
    has(BAR, "no fraction announced without telemetry", /aria-valuenow=\{hasTelemetry \? progressPct : undefined\}/);
    lacks(BAR, "a timer", /setInterval/);
  });

  test("the gauge orbits instead of showing 0% for a running step with no measurement", () => {
    has(GAUGE, "the indeterminate prop", /indeterminate\?: boolean/);
    has(GAUGE, "no percent in the label when indeterminate", /indeterminate \? undefined : `\$\{Math\.round\(clamped\)\}%`/);
    has(WORKFLOW, "indeterminate while running with no milestone", /indeterminate=\{isRunning && measured <= 0\}/);
  });

  test("the mission report says not measured rather than a number", () => {
    has(REPORT, "the not-measured label", /mission_report_not_measured/);
    has(REPORT, "coverage only when the engine reported it", /coveragePercent != null \? `\$\{coveragePercent\.toLocaleString\(numberLocale\)\}%` : notMeasured/);
  });
});

describe("no favicon service", () => {
  test("no component fetches a favicon for a source", () => {
    // The word may appear in a comment explaining why not; a URL may not.
    for (const path of [PANEL, THEATER, REPORT, WORKFLOW, HISTORY]) {
      lacks(path, "the Google favicon endpoint", /s2\/favicons/);
      lacks(path, "a favicon url", /favicons?\.(ico|png|svg)|favicons?\?domain|duckduckgo\.com\/ip3|icon\.horse|faviconkit|favicon\.im/i);
      lacks(path, "an <img> per source", /<img\b/);
    }
  });

  test("the host is rendered as text, and the link opens safely", () => {
    for (const path of [PANEL, THEATER]) {
      has(path, "the hostname chip", /\{s\.hostname\}/);
      has(path, "an external link", /target="_blank"/);
      has(path, "no opener, no referrer", /rel="noreferrer noopener"/);
      has(path, "the retrieval date", /formatRetrievedDate\(s\.retrievedAt, locale\)/);
    }
  });

  test("hostnames drop www and survive an unparseable url", () => {
    expect(hostnameOf("https://www.nca.gov.sa/en/pages/ecc")).toBe("nca.gov.sa");
    expect(hostnameOf("HTTPS://SDAIA.GOV.SA/x")).toBe("sdaia.gov.sa");
    expect(hostnameOf("not a url")).toBe("not a url");
  });
});

describe("search results become source cards", () => {
  const searchWebOutput = {
    ok: true,
    query: "NCA ECC current version",
    retrievedAt: "2026-09-01T10:00:00.000Z",
    answer: "ECC-2:2024 is current.",
    results: [
      { ref: "S1", title: "Essential Cybersecurity Controls", url: "https://www.nca.gov.sa/ecc", snippet: "ECC-2:2024…" },
      { ref: "S2", title: "Bad", url: "ftp://nope", snippet: "" },
    ],
    note: "Dated web passages, not verified statute text; cite the URL and the retrieval date.",
  };

  test("searchWeb output: results with the tool's retrieval date, non-http urls dropped", () => {
    const view = extractSearchSources(searchWebOutput);
    expect(view).not.toBeNull();
    expect(view!.query).toBe("NCA ECC current version");
    expect(view!.answer).toBe("ECC-2:2024 is current.");
    expect(view!.sources).toHaveLength(1);
    expect(view!.sources[0]).toEqual({
      ref: "S1",
      title: "Essential Cybersecurity Controls",
      url: "https://www.nca.gov.sa/ecc",
      hostname: "nca.gov.sa",
      snippet: "ECC-2:2024…",
      retrievedAt: "2026-09-01T10:00:00.000Z",
    });
    expect(view!.note).toContain("Dated web passages");
  });

  test("researchSaudiLaw output: liveSources with their own dates and the status", () => {
    const view = extractSearchSources({
      liveSources: [{ n: 2, title: "PDPL", url: "https://sdaia.gov.sa/pdpl", snippet: "Article 1", query: "q", retrievedAt: "2026-08-30T00:00:00.000Z" }],
      liveResearchStatus: "live",
    });
    expect(view!.sources[0].ref).toBe("S2");
    expect(view!.sources[0].retrievedAt).toBe("2026-08-30T00:00:00.000Z");
    expect(view!.status).toBe("live");
  });

  test("a failed search and an unrelated payload are not source lists", () => {
    expect(extractSearchSources({ ok: false, error: "not configured" })).toBeNull();
    expect(extractSearchSources({ proposal: { id: "x" } })).toBeNull();
    expect(extractSearchSources("text")).toBeNull();
  });

  test("the theater shows them for searchWeb and researchSaudiLaw", () => {
    has(THEATER, "the source tools", /SEARCH_SOURCE_TOOLS = new Set\(\["searchWeb", "researchSaudiLaw"\]\)/);
    has(THEATER, "the panel mounted", /<SearchSourcesPanel locale=\{locale\} tools=\{tools\} \/>/);
    has(THEATER, "the parser", /extractSearchSources\(latest\.output\)/);
  });
});

describe("the mission report reads the artifact defensively", () => {
  test("a full artifact", () => {
    const r = missionReportFromArtifact({
      proposalId: "p1",
      contractId: "c1",
      provider: "openai",
      fallback: false,
      truncated: true,
      coverage: { coveragePercent: 83 },
      exportReady: false,
      aiReview: {
        overall: 71,
        coverage: 80,
        compliance: 65,
        clarity: 70,
        competitiveness: 60,
        suggestions: [{ sectionId: "9", requirementId: "R-4", suggestionEn: "Cite ECC-1.8", suggestionAr: "استشهد", priority: "HIGH" }],
        provider: "openai",
        fallback: false,
        at: "2026-09-01T00:00:00.000Z",
      },
      liveResearch: {
        sources: [{ n: 1, title: "ECC", url: "https://nca.gov.sa", snippet: "", query: "q", retrievedAt: "2026-09-01T00:00:00.000Z" }],
        queries: ["q"],
        unavailableReason: null,
      },
      sectionFallbacks: [12, 7, 7],
      uncoveredRequirementIds: ["R-9", "", "R-12"],
    });
    expect(r.coveragePercent).toBe(83);
    expect(r.exportReady).toBe(false);
    expect(r.truncated).toBe(true);
    expect(r.aiReview?.overall).toBe(71);
    expect(r.aiReview?.suggestions[0].priority).toBe("HIGH");
    expect(r.liveResearch?.sources).toHaveLength(1);
    expect(r.liveResearch?.sources[0].hostname).toBe("nca.gov.sa");
    expect(r.sectionFallbacks).toEqual([7, 12]);
    expect(r.uncoveredRequirementIds).toEqual(["R-9", "R-12"]);
  });

  test("an old artifact with none of the new fields", () => {
    const r = missionReportFromArtifact({ proposalId: "p1" });
    expect(r.coveragePercent).toBeNull();
    expect(r.exportReady).toBeNull();
    expect(r.aiReview).toBeNull();
    expect(r.liveResearch).toBeNull();
    expect(r.sectionFallbacks).toEqual([]);
    expect(r.uncoveredRequirementIds).toEqual([]);
    expect(missionReportFromArtifact(null).proposalId).toBeNull();
  });

  test("the honest notes, in both languages, and null when there is nothing to confess", () => {
    expect(sectionFallbackNote([7, 12], "en")).toBe("Sections 7, 12 used the deterministic template");
    expect(sectionFallbackNote([7], "en")).toBe("Section 7 used the deterministic template");
    expect(sectionFallbackNote([7, 12], "ar")).toContain("القالب الحتمي");
    expect(sectionFallbackNote([], "en")).toBeNull();
    expect(uncoveredRequirementsNote(["R-4", "R-9", "R-12"], "en")).toBe("3 requirements not covered: R-4, R-9, R-12");
    expect(uncoveredRequirementsNote(Array.from({ length: 10 }, (_, i) => `R-${i}`), "en")).toContain("+2");
    expect(uncoveredRequirementsNote([], "ar")).toBeNull();
  });

  test("the workflow renders one report block with the payoff actions inside it", () => {
    const src = read(WORKFLOW);
    expect(src.split('runStatus === "COMPLETED"').length - 1).toBe(1);
    has(WORKFLOW, "the report", /<MissionReportCard/);
    has(WORKFLOW, "the artifact normalised", /setReport\(missionReportFromArtifact\(fa\)\)/);
    has(WORKFLOW, "the sources handed to the panel", /sources=\{report\?\.liveResearch \? report\.liveResearch\.sources : undefined\}/);
    has(REPORT, "the template-filled sections", /sectionFallbackNote\(/);
    has(REPORT, "the uncovered requirement ids", /uncoveredRequirementsNote\(/);
    has(REPORT, "the AI review kept", /aiReview\.suggestions\.slice\(0, 3\)/);
  });
});

describe("time is read off the run's own stamps", () => {
  test("elapsed formats as m:ss and h:mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("0:00");
    expect(formatElapsed(Number.NaN)).toBe("0:00");
  });

  test("a duration needs both ends, in order", () => {
    expect(durationBetween("2026-09-01T00:00:00Z", "2026-09-01T00:01:30Z")).toBe(90_000);
    expect(durationBetween(undefined, "2026-09-01T00:01:30Z")).toBeNull();
    expect(durationBetween("2026-09-01T00:01:30Z", "2026-09-01T00:00:00Z")).toBeNull();
    expect(durationBetween("garbage", "2026-09-01T00:00:00Z")).toBeNull();
  });

  test("only a finished agent with both stamps gets a duration", () => {
    expect(agentDurationLabel({ status: "completed", startedAt: "2026-09-01T00:00:00Z", completedAt: "2026-09-01T00:00:42Z" })).toBe("0:42");
    expect(agentDurationLabel({ status: "running", startedAt: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(agentDurationLabel({ status: "completed", startedAt: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(agentDurationLabel({ status: "pending" })).toBeNull();
  });

  test("the run started when its first agent did", () => {
    expect(runStartedAt([{ startedAt: "2026-09-01T00:00:05Z" }, { startedAt: "2026-09-01T00:00:01Z" }, {}])).toBe("2026-09-01T00:00:01Z");
    expect(runStartedAt([{}, { startedAt: "nope" }])).toBeNull();
  });

  test("relative times in both languages", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    expect(relativeTime("2026-09-05T11:57:00Z", "en", now)).toBe("3 minutes ago");
    expect(relativeTime("2026-09-05T11:59:50Z", "en", now)).toBe("now");
    expect(relativeTime("2026-09-04T12:00:00Z", "en", now)).toBe("yesterday");
    expect(relativeTime("2026-09-05T11:57:00Z", "ar", now)).toContain("دقائق");
    expect(relativeTime("garbage", "en", now)).toBe("");
  });

  test("the timeline and the history read durations, not timers", () => {
    has(DETAIL, "the agent's own stamps", /agentDurationLabel\(agent\)/);
    has(WORKFLOW, "run time from the earliest agent", /runStartedAt\(agentStates\)/);
    lacks(WORKFLOW, "a timer in the page", /setInterval/);
    lacks(WORKFLOW, "randomness", /Math\.random/);
    has(HISTORY, "relative times", /relativeTime\(run\.createdAt, locale, now\)/);
    has(HISTORY, "the absolute time kept in the tooltip", /title=\{formatRunDate\(run\.createdAt, locale\)\}/);
    has(HISTORY, "duration from the run's stamps", /durationBetween\(run\.createdAt, run\.completedAt\)/);
  });
});

describe("the live panel treats an ended run as a recording", () => {
  test("outcomes", () => {
    expect(liveDraftOutcomeFor("RUNNING", true)).toBe("live");
    expect(liveDraftOutcomeFor("CANCELLED", false)).toBe("cancelled");
    expect(liveDraftOutcomeFor("FAILED", false)).toBe("failed");
    expect(liveDraftOutcomeFor("COMPLETED", false)).toBe("completed");
    expect(liveDraftOutcomeFor(null, false)).toBe("completed");
  });

  test("the panel stays mounted after the run and says what the stream is", () => {
    has(WORKFLOW, "the outcome passed", /runOutcome=\{draftOutcome\}/);
    // Mounted on the drafting agent having started — not on the run being live.
    has(WORKFLOW, "mount independent of running", /const showLiveDraft =\s*!!runId && draftingState != null/);
    has(PANEL, "a 404 stream named", /source\.readyState === EventSource\.CLOSED\) setStreamUnavailable\(true\)/);
    has(PANEL, "an ended run does not hold the connection", /IDLE_CLOSE_AFTER_RUN_ENDED_MS/);
    has(PANEL, "the recorded-draft copy", /live_draft_recorded/);
    has(PANEL, "the run-ended copy", /live_draft_run_ended/);
  });
});

describe("reduced motion is honoured", () => {
  test("the ambient layers carry a motion variant and the CSS has the media query", () => {
    has(PANEL, "the aurora gated", /ops-aurora motion-reduce:hidden/);
    has(PANEL, "the scan line gated twice", /live && !reduceMotion \? <div aria-hidden className="ops-scanline motion-reduce:hidden"/);
    has(PANEL, "the framer caret gated", /animate=\{reduceMotion \? undefined/);
    const css = read(CSS);
    const guard = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const cls of [".ops-aurora", ".ops-shimmer", ".ops-pulse", ".ops-spin", ".ops-scanline"]) {
      expect(guard.includes(cls), `globals.css — reduced-motion guard misses ${cls}`).toBe(true);
    }
  });

  test("no continuous framer loop runs without checking the preference", () => {
    for (const path of [WORKFLOW, BAR, PANEL]) {
      const src = read(path);
      for (const m of src.matchAll(/repeat: Infinity/g)) {
        const before = src.slice(Math.max(0, m.index - 400), m.index);
        expect(/reduceMotion/.test(before), `${path} — a repeat: Infinity not gated on reduceMotion near offset ${m.index}`).toBe(true);
      }
    }
    has(BAR, "the preference read", /useReducedMotion\(\)/);
    lacks(BAR, "the ungated indeterminate sweep", /animate=\{\{ x: \["-100%", "300%"\] \}\}/);
    lacks(THEATER, "an ungated pulse", /[" ]animate-pulse/);
    has(GAUGE, "the orbiting arc gated", /ops-spin motion-reduce:animate-none/);
  });
});

describe("the document stage", () => {
  test("paper on a theme-aware reading surface, the same controls, no invented page count", () => {
    has(PREVIEW, "the stage", /relative overflow-auto bg-muted\/40/);
    has(PREVIEW, "the paper", /bg-white shadow-sm/);
    has(PREVIEW, "accessible expanded reading", /<Dialog open=\{expanded\}/);
    has(PREVIEW, "layout mode", /setMode\("html"\)/);
    has(PREVIEW, "pdf mode", /setMode\("pdf"\)/);
    has(PREVIEW, "the zoom group labelled", /aria-label=\{tr\("preview_zoom_label", locale\)\}/);
    lacks(PREVIEW, "a page counter", /page \d+ of|of \d+ pages|صفحة \d+ من|pageCount|totalPages/i);
  });
});

describe("the copy exists in both languages", () => {
  test("every new key resolves without falling back", () => {
    const keys = [
      "live_draft_sections",
      "live_draft_sections_unknown_total",
      "live_draft_section_rail",
      "live_draft_section_done",
      "live_draft_section_current",
      "live_draft_section_pending",
      "live_draft_jump_to",
      "live_draft_elapsed",
      "live_draft_characters",
      "live_draft_sections_label",
      "live_draft_follow",
      "live_draft_recorded",
      "live_draft_run_ended",
      "live_draft_stream_unavailable",
      "live_draft_sources",
      "live_draft_sources_count",
      "live_draft_sources_none",
      "live_draft_sources_unavailable",
      "live_draft_sources_note",
      "live_draft_retrieved",
      "live_draft_open_source",
      "agent_state_pending",
      "agent_state_running",
      "agent_state_completed",
      "agent_state_failed",
      "agent_timeline_label",
      "agent_timeline_findings",
      "agent_timeline_no_findings",
      "agent_timeline_run_elapsed",
      "agent_timeline_step",
      "agent_timeline_show_details",
      "mission_report_title",
      "mission_report_coverage",
      "mission_report_compliance",
      "mission_report_export",
      "mission_report_export_ready",
      "mission_report_export_review",
      "mission_report_sources",
      "mission_report_engine",
      "mission_report_not_measured",
      "mission_report_ai_review",
      "mission_report_fallback_section",
      "mission_report_fallback_sections",
      "mission_report_uncovered",
      "run_history_duration",
      "run_history_current",
      "run_history_restore",
      "search_sources_title",
      "search_sources_query",
      "search_sources_empty",
      "search_sources_failed",
      "preview_stage_paper",
      "preview_zoom_label",
    ];
    for (const key of keys) {
      for (const locale of ["ar", "en"] as const) {
        const r = resolveTranslation(key, locale);
        expect(r.missing, `${key} ${locale}`).toBe(false);
        expect(r.resolvedLocale).toBe(locale);
      }
    }
  });
});

describe("mobile and RTL", () => {
  test("the rails scroll sideways on a phone and use logical properties", () => {
    has(WORKFLOW, "the timeline scrolls on a phone", /overflow-x-auto[^"]*lg:grid lg:grid-cols-6/);
    has(WORKFLOW, "connector on the inline-start side", /-start-2 top-\[34px\]/);
    has(PANEL, "the section rail scrolls on a phone, stacks on desktop", /overflow-x-auto[^"]*md:flex-col/);
    has(PANEL, "the follow button on the inline-end side", /bottom-3 end-3/);
    for (const path of [PANEL, WORKFLOW, REPORT, DETAIL, HISTORY]) {
      lacks(path, "a physical left/right margin or padding", /\b(ml|mr|pl|pr)-\d/);
      lacks(path, "a physical left/right inset", /\b(left|right)-\d/);
    }
  });
});
