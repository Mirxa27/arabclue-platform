/**
 * The bidder watches the proposal being written.
 *
 * With the pipeline a durable workflow, each run owns namespaced streams that
 * steps can write to and an API route can read back (foundations/streaming).
 * The drafting stage now streams the model's tokens into the run's `draft`
 * stream as it receives them — batched, so a 12 000-token draft is a few
 * hundred writes and not a few thousand round trips — and the agents page
 * plays them back as a live draft while the drafting card is running.
 *
 * Three pure pieces are tested directly: the OpenAI-compatible SSE reader
 * (DeepSeek puts usage on the last content chunk, OpenAI on an extra empty
 * one; both are real shapes from their current docs), the batching sink, and
 * the SSE encoding the route emits. The wiring is ratcheted by source.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readOpenAiCompatibleStream } from "../llm/sse-stream";
import {
  DRAFT_STREAM_NAMESPACE,
  createDraftStreamSink,
  encodeSseEvent,
  type DraftStreamChunk,
} from "../agents/draft-stream";
import { resolveTranslation } from "../i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}
function has(path: string, what: string, pattern: RegExp): void {
  expect(pattern.test(read(path)), `${path} — missing ${what}: ${pattern}`).toBe(true);
}

function bodyOf(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

describe("readOpenAiCompatibleStream", () => {
  test("DeepSeek shape: deltas arrive, usage rides on the last content chunk, [DONE] ends it", async () => {
    const deltas: string[] = [];
    const result = await readOpenAiCompatibleStream(
      bodyOf([
        sse({ choices: [{ delta: { content: "Hel" }, finish_reason: null }], usage: null }),
        sse({ choices: [{ delta: { content: "lo" }, finish_reason: null }], usage: null }),
        sse({ choices: [{ delta: { content: "" }, finish_reason: "stop" }], usage: { total_tokens: 42 } }),
        "data: [DONE]\n\n",
      ]),
      (t) => deltas.push(t),
    );
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toEqual({ text: "Hello", tokensUsed: 42, truncated: false });
  });

  test("OpenAI shape: a separate usage-only chunk with empty choices, and `length` means truncated", async () => {
    const result = await readOpenAiCompatibleStream(
      bodyOf([
        sse({ choices: [{ delta: { role: "assistant", content: "" }, finish_reason: null }] }),
        sse({ choices: [{ delta: { content: "Cut" }, finish_reason: null }] }),
        sse({ choices: [{ delta: {}, finish_reason: "length" }] }),
        sse({ choices: [], usage: { total_tokens: 7 } }),
        "data: [DONE]\n\n",
      ]),
      () => {},
    );
    expect(result).toEqual({ text: "Cut", tokensUsed: 7, truncated: true });
  });

  test("network chunks split mid-line and mid-event are reassembled; junk lines are skipped", async () => {
    const one = sse({ choices: [{ delta: { content: "ab" }, finish_reason: null }] });
    const two = sse({ choices: [{ delta: { content: "cd" }, finish_reason: null }] });
    const joined = one + ": keep-alive comment\n\n" + "data: not json\n\n" + two + "data: [DONE]\n\n";
    const parts = [joined.slice(0, 17), joined.slice(17, 61), joined.slice(61)];
    const result = await readOpenAiCompatibleStream(bodyOf(parts), () => {});
    expect(result.text).toBe("abcd");
    expect(result.truncated).toBe(false);
  });

  test("a stream that ends without [DONE] still yields what arrived", async () => {
    const result = await readOpenAiCompatibleStream(
      bodyOf([sse({ choices: [{ delta: { content: "partial" }, finish_reason: null }] })]),
      () => {},
    );
    expect(result.text).toBe("partial");
    expect(result.tokensUsed).toBe(0);
  });
});

function collectingWritable() {
  const chunks: DraftStreamChunk[] = [];
  let closed = false;
  const writable = new WritableStream<DraftStreamChunk>({
    write(chunk) {
      chunks.push(chunk);
    },
    close() {
      closed = true;
    },
  });
  return { writable, chunks, isClosed: () => closed };
}

describe("createDraftStreamSink", () => {
  test("small deltas coalesce into one write per flush window, in order", async () => {
    const { writable, chunks, isClosed } = collectingWritable();
    const sink = createDraftStreamSink(writable, { flushEveryMs: 20, flushAtChars: 1000 });
    sink.reset(1);
    sink.push("The ");
    sink.push("proposal ");
    sink.push("begins");
    await new Promise((r) => setTimeout(r, 60));
    sink.push(" here.");
    await sink.done(false);
    await sink.close();
    expect(chunks).toEqual([
      { kind: "reset", attempt: 1 },
      { kind: "delta", text: "The proposal begins" },
      { kind: "delta", text: " here." },
      { kind: "done", truncated: false },
    ]);
    expect(isClosed()).toBe(true);
  });

  test("a large burst flushes at the size threshold without waiting for the timer", async () => {
    const { writable, chunks } = collectingWritable();
    const sink = createDraftStreamSink(writable, { flushEveryMs: 10_000, flushAtChars: 10 });
    sink.push("0123456789ab");
    await new Promise((r) => setTimeout(r, 5));
    expect(chunks).toEqual([{ kind: "delta", text: "0123456789ab" }]);
    await sink.close();
  });

  test("release() leaves the stream open for the next attempt; close() ends it", async () => {
    // Run cmtjokzcz0007l204too32891 (2026-09-02): attempt 1 hit a provider 503,
    // its `finally` closed the stream, and attempts 2 and 3 were refused with
    // HTTP 409 on every write. Only a finished draft closes the stream.
    const first = collectingWritable();
    const sink = createDraftStreamSink(first.writable, { flushEveryMs: 5, flushAtChars: 1000 });
    sink.reset(1);
    sink.push("half a ");
    await sink.release();
    expect(first.isClosed()).toBe(false);
    expect(first.chunks).toEqual([{ kind: "reset", attempt: 1 }, { kind: "delta", text: "half a " }]);
    // The stream is unlocked again: a second sink on the same writable can go on.
    const second = createDraftStreamSink(first.writable, { flushEveryMs: 5, flushAtChars: 1000 });
    second.reset(2);
    await second.done(false);
    await second.close();
    expect(first.isClosed()).toBe(true);
    expect(first.chunks.slice(2)).toEqual([{ kind: "reset", attempt: 2 }, { kind: "done", truncated: false }]);
  });

  test("a broken stream never breaks the draft", async () => {
    const writable = new WritableStream<DraftStreamChunk>({
      write() {
        throw new Error("stream backend gone");
      },
    });
    const sink = createDraftStreamSink(writable, { flushEveryMs: 5, flushAtChars: 1000 });
    sink.push("still drafting");
    await expect(sink.done(true)).resolves.toBeUndefined();
    await expect(sink.close()).resolves.toBeUndefined();
    expect(sink.failed).toBe(true);
  });
});

describe("the route's wire format", () => {
  test("each chunk is one SSE event whose id is its stream index", () => {
    expect(encodeSseEvent(7, { kind: "delta", text: "a\nb" })).toBe(
      'id: 7\ndata: {"kind":"delta","text":"a\\nb"}\n\n',
    );
  });
  test("the namespace is fixed so writer and reader agree", () => {
    expect(DRAFT_STREAM_NAMESPACE).toBe("draft");
  });
});

describe("the wiring", () => {
  test("the transport streams when asked and the draft asks", () => {
    has("src/lib/llm/index.ts", "the onDelta option", /onDelta\?:\s*\(text: string\) => void/);
    has("src/lib/llm/index.ts", "the streaming reader", /readOpenAiCompatibleStream\(/);
    has("src/lib/llm/index.ts", "stream requested from the provider", /stream:\s*true/);
    has("src/lib/agents/drafting.ts", "the draft forwards deltas", /onDelta:\s*opts\.onDelta/);
  });

  test("the drafting step owns the run's draft stream and the stage writes to it", () => {
    has("src/lib/agents/pipeline-workflow.ts", "the stream opened in the step", /getWritable<DraftStreamChunk>\(\{\s*namespace:\s*DRAFT_STREAM_NAMESPACE\s*\}\)/);
    has("src/lib/agents/orchestrator.ts", "reset at the start of an attempt", /sink\?\.reset\(attempt\.attempt\)/);
    has("src/lib/agents/orchestrator.ts", "done with the truncation flag", /sink\?\.done\(draft\.truncated\)|sink\.done\(draft\.truncated\)/);
    // Closed only after a finished draft; a failed attempt releases the writer
    // so the retry can keep writing to the same stream.
    has("src/lib/agents/orchestrator.ts", "close after done, release otherwise", /finally\s*\{[\s\S]{0,200}draftStreamed\s*\?\s*sink\.close\(\)\s*:\s*sink\.release\(\)/);
  });

  test("the stream route reads the run's draft namespace, resumes from Last-Event-ID, and can be cancelled", () => {
    const route = "src/app/api/agents/runs/[id]/stream/route.ts";
    has(route, "the run looked up by workflow id", /getRun\(/);
    has(route, "the draft namespace", /namespace:\s*DRAFT_STREAM_NAMESPACE/);
    has(route, "resume from the client's last id", /last-event-id/i);
    has(route, "the SSE content type", /text\/event-stream/);
    has(route, "tenant check", /assertWorkspaceMatch\(/);
    const vercel = JSON.parse(read("vercel.json")) as { functions?: Record<string, { supportsCancellation?: boolean }> };
    const entry = Object.entries(vercel.functions ?? {}).find(([glob]) => /agents\/runs\/.*stream/.test(glob));
    // Vercel World limitations: a route piping run.getReadable() bills until
    // maxDuration after the client leaves unless it supports cancellation.
    expect(entry?.[1].supportsCancellation).toBe(true);
  });

  test("the agents page plays the draft back while the drafting card runs", () => {
    const panel = "src/components/dashboard/live-draft-panel.tsx";
    has(panel, "an EventSource on the stream route", /new EventSource\(/);
    has(panel, "reduced-motion awareness", /useReducedMotion\(/);
    has(panel, "bidirectional text", /dir="auto"/);
    has("src/components/dashboard/agent-workflow.tsx", "the panel mounted", /<LiveDraftPanel/);
  });

  test("the draft is rendered as the document it is, not raw markdown, and the page clears the dock", () => {
    const panel = "src/components/dashboard/live-draft-panel.tsx";
    // The production screenshot showed `**Limitations:**` and `| table |`
    // pipes as typed. The shared escaped renderer turns them into headings,
    // lists and tables; useDeferredValue keeps the page responsive while the
    // text grows (28 000 characters by the end of a draft).
    has(panel, "the shared escaped renderer", /markdownToHtml\(/);
    has(panel, "deferred rendering of a growing document", /useDeferredValue\(/);
    // The floating dock covered the panel's last lines at 375 px; the content
    // column now ends with clearance for it on every page.
    has("src/components/dashboard/app-shell.tsx", "bottom clearance for the dock", /pb-24/);
  });

  test("the panel's copy exists in both languages", () => {
    for (const key of ["live_draft_title", "live_draft_waiting", "live_draft_retrying", "live_draft_done", "live_draft_truncated", "live_draft_words"]) {
      for (const locale of ["ar", "en"] as const) {
        const r = resolveTranslation(key, locale);
        expect(r.missing, `${key} ${locale}`).toBe(false);
        expect(r.resolvedLocale, `${key} ${locale}`).toBe(locale);
      }
    }
  });
});
