/**
 * Sectioned drafting, the run.
 *
 * `draftProposal` keeps its interface but now makes eighteen bounded calls
 * three at a time, streams them in order, continues a truncated section once,
 * lets a later section fall back to its deterministic slice, treats a first
 * degraded call as the whole-document decision the single call made, stops
 * starting sections past the deadline, and fills requirement IDs the draft
 * never mentioned with one more call. Driven here through an injected
 * completion function and, for the deterministic path, the real
 * `generateCompletion` under `ARABCLUE_LLM_DETERMINISTIC=1`. No provider is
 * ever contacted.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COVERAGE_FILL_MAX_TOKENS,
  PROPOSAL_SECTIONS,
  SECTION_CONCURRENCY,
  SECTION_CONTINUATION_MAX_TOKENS,
  SECTION_TIMEOUT_MS,
  buildDeterministicProposal,
  draftProposal,
  draftProposalSectioned,
  sectionHeading,
} from "../agents/drafting";
import { systemDraftingSection, HUMAN_APPROVAL_NOTICE } from "../agents/prompts";
import { LEGAL_DISCLAIMER } from "../procurement-rules";
import { ProviderUnavailableError } from "../ai/provider-unavailable";
import type { LLMMessage, LLMResult, generateCompletion } from "../llm";
import { ROWS, sampleOptions, withEnv } from "./support/drafting-fixture";

/* -------------------------------------------------------------------------- */
/* A scripted provider                                                        */
/* -------------------------------------------------------------------------- */

type CompletionOpts = NonNullable<Parameters<typeof generateCompletion>[1]>;
type Call = { messages: LLMMessage[]; opts: CompletionOpts };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function sectionOf(messages: LLMMessage[]): number {
  const m = (messages[1]?.content ?? "").match(/^Your section: ## (\d+)\./m);
  if (!m) throw new Error("not a section prompt");
  return Number(m[1]);
}
const isContinuation = (messages: LLMMessage[]) => messages.length === 4;
const isFill = (messages: LLMMessage[]) =>
  messages.length === 2 && /never mentions the requirement IDs/.test(messages[1]?.content ?? "");

function live(content: string, extra: Partial<LLMResult> = {}): LLMResult {
  return {
    content,
    provider: "openai",
    model: "gpt-test",
    tokensUsed: 10,
    confidence: 0.9,
    fallback: false,
    failureKind: "none",
    ...extra,
  };
}
function down(failureKind: LLMResult["failureKind"] = "network"): LLMResult {
  return { content: "", provider: "openai", model: "gpt-test", tokensUsed: 0, confidence: 0, fallback: true, failureKind };
}
function sectionText(n: number, body?: string): string {
  return `${sectionHeading(PROPOSAL_SECTIONS[n - 1], "en")}\n${body ?? `Body of section ${n}.`}`;
}
const MATRIX_WITH_EVERY_ID = [
  "| Req ID | requirement | response summary | evidence | status |",
  "| --- | --- | --- | --- | --- |",
  ...ROWS.map((r) => `| ${r.requirementId} | ${r.requirementText} | Answered. | Approved Evidence One | ${r.status} |`),
].join("\n");

function scriptedProvider(script: {
  section?: (n: number, call: Call) => LLMResult;
  continuation?: (n: number, call: Call) => LLMResult;
  fill?: (call: Call) => LLMResult;
  /** Per-section latency, so completion order can differ from section order. */
  delayMs?: (n: number) => number;
  /** False for a transport that delivers the whole answer at once (the SDK paths). */
  streams?: boolean;
}) {
  const calls: Call[] = [];
  const complete: typeof generateCompletion = async (messages, opts) => {
    const call = { messages, opts: opts ?? {} };
    calls.push(call);
    if (isFill(messages)) return script.fill?.(call) ?? down("invalid_response");
    const n = sectionOf(messages);
    const result = isContinuation(messages)
      ? (script.continuation?.(n, call) ?? down("invalid_response"))
      : (script.section?.(n, call) ?? live(sectionText(n)));
    const delay = script.delayMs?.(n) ?? 0;
    // A live answer streams in two halves around the latency, like a transport would.
    if (script.streams !== false && !result.fallback && result.content && opts?.onDelta) {
      const half = Math.ceil(result.content.length / 2);
      opts.onDelta(result.content.slice(0, half));
      await sleep(delay);
      opts.onDelta(result.content.slice(half));
    } else {
      await sleep(delay);
    }
    return result;
  };
  return { complete, calls };
}

const sectionCalls = (calls: Call[]) => calls.filter((c) => !isFill(c.messages) && !isContinuation(c.messages));
const headingIndexes = (md: string) => PROPOSAL_SECTIONS.map((s) => md.indexOf(`## ${s.number}. `));
const ascending = (xs: number[]) => xs.every((x, i) => x >= 0 && (i === 0 || x > xs[i - 1]));

/* -------------------------------------------------------------------------- */

describe("a live sectioned draft", () => {
  test("eighteen calls with the registry's budgets, assembled in order and streamed in order", async () => {
    const { complete, calls } = scriptedProvider({
      section: (n) => live(sectionText(n, n === 4 ? MATRIX_WITH_EVERY_ID : undefined)),
      // Completion order differs from section order: 3, 6, 9 … finish first.
      delayMs: (n) => (n % 3) * 4,
    });
    const deltas: string[] = [];

    const result = await draftProposalSectioned(
      { ...sampleOptions(), onDelta: (t) => deltas.push(t) },
      { complete }
    );

    expect(result.sections).toBe(18);
    expect(result.fallback).toBe(false);
    expect(result.failureKind).toBeNull();
    expect(result.truncated).toBe(false);
    expect(result.sectionFallbacks).toEqual([]);
    expect(result.uncoveredRequirementIds).toEqual([]);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-test");
    expect(result.tokensUsed).toBe(18 * 10);
    expect(result.locale).toBe("en");
    // No requirement went missing, so no fill call.
    expect(calls.filter((c) => isFill(c.messages))).toHaveLength(0);
    expect(sectionCalls(calls)).toHaveLength(18);

    expect(ascending(headingIndexes(result.contentMd))).toBe(true);
    // The stream is the sections in order, blank-line separated; the document
    // is that plus the lines the template demands verbatim.
    const streamed = deltas.join("");
    expect(ascending(headingIndexes(streamed))).toBe(true);
    expect(result.contentMd.startsWith(streamed)).toBe(true);
    expect(result.contentMd).toContain(LEGAL_DISCLAIMER);
    expect(result.contentMd).toContain(HUMAN_APPROVAL_NOTICE);

    for (const call of sectionCalls(calls)) {
      const spec = PROPOSAL_SECTIONS[sectionOf(call.messages) - 1];
      expect(call.messages[0].content).toBe(systemDraftingSection("en"));
      expect(call.opts.maxTokens).toBe(spec.maxTokens);
      expect(call.opts.engine).toBe("DRAFTING");
      expect(call.opts.promptOrigin).toBe("system");
      expect(call.opts.temperature).toBe(0.28);
      expect(call.opts.maxAttempts).toBe(2);
      expect(call.opts.timeoutMs).toBeGreaterThan(0);
      expect(call.opts.timeoutMs).toBeLessThanOrEqual(SECTION_TIMEOUT_MS);
    }
    const financial = sectionCalls(calls).find((c) => sectionOf(c.messages) === 15)!;
    expect(financial.messages[1].content).not.toContain("RAG-CORPUS-MARKER");
    expect(SECTION_CONCURRENCY).toBe(3);
  });

  test("a transport that never streams still yields a complete live draft, in order", async () => {
    const { complete } = scriptedProvider({
      section: (n) => (n === 8 ? down("server_error") : live(sectionText(n, n === 4 ? MATRIX_WITH_EVERY_ID : undefined))),
      delayMs: (n) => (n % 3) * 4,
      streams: false,
    });
    const deltas: string[] = [];

    const result = await withEnv({ AUTONOMY_REAL_AI_ONLY: "0" }, () =>
      draftProposalSectioned(
        { ...sampleOptions(), onDelta: (t) => deltas.push(t) },
        { complete }
      )
    );

    const streamed = deltas.join("");
    expect(ascending(headingIndexes(streamed))).toBe(true);
    expect(streamed).toContain("RISK-MARKER");
    expect(result.contentMd.startsWith(streamed)).toBe(true);
  });

  test("a section cut off at its cap is continued once, scoped to the section, with 800 tokens", async () => {
    const { complete, calls } = scriptedProvider({
      section: (n) =>
        n === 5
          ? live(sectionText(5, "Phases: discovery, build and the acceptance ph"), { truncated: true })
          : live(sectionText(n, n === 4 ? MATRIX_WITH_EVERY_ID : undefined)),
      // A token-cap cut lands mid-word; the model resumes the word.
      continuation: () => live("ase with exit criteria."),
    });

    const result = await draftProposalSectioned(sampleOptions(), { complete });

    const continuations = calls.filter((c) => isContinuation(c.messages));
    expect(continuations).toHaveLength(1);
    expect(sectionOf(continuations[0].messages)).toBe(5);
    expect(continuations[0].opts.maxTokens).toBe(SECTION_CONTINUATION_MAX_TOKENS);
    expect(SECTION_CONTINUATION_MAX_TOKENS).toBe(800);
    expect(continuations[0].messages[2]).toEqual({
      role: "assistant",
      content: sectionText(5, "Phases: discovery, build and the acceptance ph"),
    });
    expect(continuations[0].messages[3].content).toMatch(/finish this section only/);
    expect(result.contentMd).toContain("Phases: discovery, build and the acceptance phase with exit criteria.");
    expect(result.truncated).toBe(false);
    expect(result.tokensUsed).toBe(18 * 10 + 10);
  });

  test("still truncated after its continuation, the section marks the draft truncated", async () => {
    const cutOff = scriptedProvider({
      section: (n) => live(sectionText(n), { truncated: n === 12 }),
      continuation: () => live(" more.", { truncated: true }),
    });
    expect((await draftProposalSectioned(sampleOptions(), { complete: cutOff.complete })).truncated).toBe(true);

    const noHelp = scriptedProvider({
      section: (n) => live(sectionText(n), { truncated: n === 12 }),
      continuation: () => down("timeout"),
    });
    const result = await draftProposalSectioned(sampleOptions(), { complete: noHelp.complete });
    expect(result.truncated).toBe(true);
    expect(result.contentMd).toContain("Body of section 12.");
  });

  test("a section that degrades after the first live one takes its deterministic slice", async () => {
    const { complete } = scriptedProvider({
      section: (n) => (n === 8 ? down("server_error") : live(sectionText(n, n === 4 ? MATRIX_WITH_EVERY_ID : undefined))),
    });
    const deltas: string[] = [];

    const result = await withEnv({ AUTONOMY_REAL_AI_ONLY: "0" }, () =>
      draftProposalSectioned(
        { ...sampleOptions(), onDelta: (t) => deltas.push(t) },
        { complete }
      )
    );

    expect(result.fallback).toBe(true);
    expect(result.sectionFallbacks).toEqual([8]);
    expect(result.failureKind).toBe("server_error");
    // The template's risk section under the heading the live sections use.
    expect(result.contentMd).toContain("## 8. Risk Management / إدارة المخاطر\nRISK-MARKER");
    expect(result.contentMd).not.toContain("Body of section 8.");
    expect(ascending(headingIndexes(result.contentMd))).toBe(true);
    // The slice is streamed too, in its place.
    expect(deltas.join("")).toContain("RISK-MARKER");
  });

  test("strict mode refuses a later failed section without streaming a template", async () => {
    const { complete } = scriptedProvider({
      section: (number) => number === 8 ? down("server_error") : live(sectionText(number)),
    });
    const deltas: string[] = [];
    await expect(withEnv({ AUTONOMY_REAL_AI_ONLY: "1" }, () =>
      draftProposalSectioned(
        { ...sampleOptions(), onDelta: (text) => deltas.push(text) },
        { complete },
      )
    )).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(deltas.join("")).not.toContain("RISK-MARKER");
  });

  test("strict mode refuses a deadline after live sections instead of filling with templates", async () => {
    let clock = 0;
    const { complete } = scriptedProvider({
      section: (number) => {
        clock += 500;
        return live(sectionText(number));
      },
    });
    await expect(withEnv({ AUTONOMY_REAL_AI_ONLY: "1" }, () =>
      draftProposalSectioned(
        { ...sampleOptions(), deadlineMs: 1_200 },
        { complete, now: () => clock },
      )
    )).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  test("the first call to settle degrading is the whole-document decision", async () => {
    const script = () =>
      scriptedProvider({
        section: (n) => (n === 1 ? down("network") : live(sectionText(n))),
        delayMs: (n) => (n === 1 ? 0 : 8),
      });

    const permissive = script();
    const result = await withEnv({ AUTONOMY_REAL_AI_ONLY: "0" }, () =>
      draftProposalSectioned(sampleOptions(), { complete: permissive.complete })
    );
    expect(result.fallback).toBe(true);
    expect(result.failureKind).toBe("network");
    expect(result.contentMd).toBe(buildDeterministicProposal({ ...sampleOptions(), locale: "en" }));
    expect(result.sectionFallbacks).toHaveLength(18);
    expect(result.provider).toBe("openai");
    // Nothing beyond the first wave was started.
    expect(sectionCalls(permissive.calls).length).toBeLessThanOrEqual(SECTION_CONCURRENCY);

    const strict = script();
    await expect(
      withEnv({ AUTONOMY_REAL_AI_ONLY: "1" }, () =>
        draftProposalSectioned(sampleOptions(), { complete: strict.complete })
      )
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  test("an empty first answer the transport did not flag is still a degraded draft", async () => {
    const script = () =>
      scriptedProvider({
        section: (n) => (n === 1 ? live("") : live(sectionText(n))),
        delayMs: (n) => (n === 1 ? 0 : 8),
      });
    await expect(
      withEnv({ AUTONOMY_REAL_AI_ONLY: "1" }, () =>
        draftProposalSectioned(sampleOptions(), { complete: script().complete })
      )
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    const result = await withEnv({ AUTONOMY_REAL_AI_ONLY: "0" }, () =>
      draftProposalSectioned(sampleOptions(), { complete: script().complete })
    );
    expect(result.fallback).toBe(true);
    expect(result.failureKind).toBe("invalid_response");
  });

  test("past the deadline the remaining sections take their slices and the fill is skipped", async () => {
    let clock = 0;
    const { complete, calls } = scriptedProvider({
      section: (n) => {
        clock += 500;
        return live(sectionText(n));
      },
    });

    const result = await withEnv({ AUTONOMY_REAL_AI_ONLY: "0" }, () =>
      draftProposalSectioned(
        { ...sampleOptions(), deadlineMs: 1_200 },
        { complete, now: () => clock }
      )
    );

    // The first wave of three started inside the deadline; everything after it did not.
    expect(sectionCalls(calls).map((c) => sectionOf(c.messages))).toEqual([1, 2, 3]);
    expect(result.sectionFallbacks).toEqual(Array.from({ length: 15 }, (_, i) => i + 4));
    expect(result.fallback).toBe(true);
    expect(result.failureKind).toBe("timeout");
    expect(result.provider).toBe("openai");
    expect(calls.filter((c) => isFill(c.messages))).toHaveLength(0);
    expect(result.contentMd).toContain("Body of section 1.");
    expect(result.contentMd).toContain("## 4. Requirement Coverage Matrix / مصفوفة تغطية المتطلبات\n| ID | Requirement |");
  });

  test("requirement IDs the draft never mentions get one 1 200-token fill under section 4", async () => {
    const { complete, calls } = scriptedProvider({
      // Only REQ-001 appears anywhere in the eighteen sections.
      section: (n) => live(sectionText(n, n === 4 ? "| REQ-001 | Requirement REQ-001 text | Answered. | Approved Evidence One | COVERED |" : undefined)),
      fill: (call) => {
        const ids = [...call.messages[1].content.matchAll(/"id": "(REQ-\d+)"/g)].map((m) => m[1]);
        return live(
          [...ids.map((id) => `| ${id} | Requirement ${id} text | Filled. | — gap — | GAP |`), "", ...ids.map((id) => `${id} — filled response.`)].join("\n")
        );
      },
    });

    const result = await draftProposalSectioned(sampleOptions(), { complete });

    const fills = calls.filter((c) => isFill(c.messages));
    expect(fills).toHaveLength(1);
    expect(fills[0].opts.maxTokens).toBe(COVERAGE_FILL_MAX_TOKENS);
    expect(COVERAGE_FILL_MAX_TOKENS).toBe(1_200);
    expect(fills[0].opts.maxAttempts).toBe(1);
    expect(fills[0].messages[0].content).toBe(systemDraftingSection("en"));
    expect(fills[0].messages[1].content).toContain('"id": "REQ-002"');
    expect(fills[0].messages[1].content).not.toContain('"id": "REQ-001"');
    expect(result.uncoveredRequirementIds).toEqual([]);
    const md = result.contentMd;
    const filled = md.indexOf("REQ-012 — filled response.");
    expect(filled).toBeGreaterThan(md.indexOf("## 4. "));
    expect(filled).toBeLessThan(md.indexOf("## 5. "));
    expect(result.tokensUsed).toBe(18 * 10 + 10);
  });

  test("when the fill degrades, the missing IDs are still reported", async () => {
    const { complete } = scriptedProvider({
      section: (n) => live(sectionText(n, n === 4 ? "| REQ-001 | … |" : undefined)),
      fill: () => down("timeout"),
    });

    const result = await draftProposalSectioned(sampleOptions(), { complete });

    expect(result.uncoveredRequirementIds).toEqual(ROWS.slice(1).map((r) => r.requirementId));
    expect(result.fallback).toBe(false);
  });

  test("a pricing refusal is a failed draft, not a section", async () => {
    const { complete } = scriptedProvider({
      section: (n) => (n === 2 ? live("refused", { failureKind: "pricing_refusal" }) : live(sectionText(n))),
    });
    await expect(draftProposalSectioned(sampleOptions(), { complete })).rejects.toThrow(/pricing guard/);
  });
});

describe("draftProposal without a provider", () => {
  test("deterministic mode, permissive: the whole template, flagged as fallback", async () => {
    const opts = sampleOptions();
    const result = await withEnv(
      { ARABCLUE_LLM_DETERMINISTIC: "1", AUTONOMY_REAL_AI_ONLY: "0", ARABCLUE_DRAFTING_SINGLE_SHOT: undefined },
      () => draftProposal(opts)
    );
    expect(result.fallback).toBe(true);
    expect(result.failureKind).toBe("deterministic_mode");
    expect(result.contentMd).toBe(buildDeterministicProposal({ ...opts, locale: "en" }));
    expect(result.sections).toBe(18);
    expect(result.sectionFallbacks).toHaveLength(18);
    expect(result.provider).toBe("none");
    expect(result.truncated).toBe(false);
    expect(result.uncoveredRequirementIds).toEqual([]);
  });

  test("deterministic mode, strict: refuses instead of fabricating", async () => {
    await expect(
      withEnv({ ARABCLUE_LLM_DETERMINISTIC: "1", AUTONOMY_REAL_AI_ONLY: "1", ARABCLUE_DRAFTING_SINGLE_SHOT: undefined }, () =>
        draftProposal(sampleOptions())
      )
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  test("the kill switch runs the single-shot path and reports one section", async () => {
    const opts = sampleOptions({ locale: "ar" });
    const result = await withEnv(
      { ARABCLUE_LLM_DETERMINISTIC: "1", AUTONOMY_REAL_AI_ONLY: "0", ARABCLUE_DRAFTING_SINGLE_SHOT: "1" },
      () => draftProposal(opts)
    );
    expect(result.sections).toBe(1);
    expect(result.sectionFallbacks).toEqual([]);
    expect(result.fallback).toBe(true);
    expect(result.failureKind).toBe("deterministic_mode");
    expect(result.locale).toBe("ar");
    expect(result.contentMd).toBe(buildDeterministicProposal({ ...opts, locale: "ar" }));
  });
});

describe("the wiring", () => {
  const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
  const src = readFileSync(join(REPO_ROOT, "src/lib/agents/drafting.ts"), "utf8");

  test("the sectioned path streams only through the flusher", () => {
    const start = src.indexOf("export async function draftProposalSectioned(");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("\nexport ", start + 1));
    const onDeltas = body.match(/onDelta:[^\n]*/g) ?? [];
    // The section call and its continuation stream; the fill does not.
    expect(onDeltas).toHaveLength(2);
    for (const line of onDeltas) {
      expect(line).toMatch(/onDelta:\s*\(text\)\s*=>\s*flusher\.push\(spec\.number,\s*text\)/);
    }
    // The caller's sink is handed to the flusher once and never called directly.
    expect(body.match(/opts\.onDelta/g)).toHaveLength(1);
    expect(body).toMatch(/new OrderedFlusher\(\s*PROPOSAL_SECTIONS\.map\(\(s\) => s\.number\),\s*opts\.onDelta\s*\)/);
  });

  test("the entry point dispatches on the kill switch and keeps the single-shot code", () => {
    expect(src).toMatch(/process\.env\.ARABCLUE_DRAFTING_SINGLE_SHOT === "1"/);
    expect(src).toMatch(/export async function draftProposalSingleShot\(/);
    expect(src).toMatch(/Array\.from\(\{ length: SECTION_CONCURRENCY \}/);
    expect(src).toMatch(/guardOrThrow\(result, "drafting:generateProposal"\)/);
  });
});
