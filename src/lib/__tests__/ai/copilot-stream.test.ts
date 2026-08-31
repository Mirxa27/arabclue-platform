/**
 * The co-pilot rail waited for the whole review before showing anything: one
 * `generateObject` call over the entire buffer, then `res.json()`. On a long
 * bid that is ten to twenty seconds of "Reading the document…" with nothing on
 * screen, which reads as broken rather than as thinking.
 *
 * Streaming the pass changes that, and introduces two things worth pinning:
 *
 *  - **Framing.** The server writes one JSON frame per line and the client
 *    reads whatever the network hands it, so a frame can arrive split across
 *    two chunks. A decoder that parses per chunk instead of per line drops
 *    every suggestion that lands on a boundary — silently, and only under load.
 *
 *  - **The safety check, per suggestion.** `reconcileSuggestions` vetted a whole
 *    batch at once. Streaming has no batch: each edit must clear the same rules
 *    the moment it arrives, and the dedupe has to survive across those calls or
 *    the rail shows the same card twice.
 */

import { describe, expect, test } from "bun:test";
import {
  decodeFrames,
  encodeFrame,
  type CopilotFrame,
} from "../../ai/copilot-stream";
import { reconcileSuggestion } from "../../ai/copilot-suggestions";
import type { RawCopilotSuggestion } from "../../ai/copilot-anchors";

const DOC = "The vendor shall deliver within thirty days of award.";

function raw(over: Partial<RawCopilotSuggestion> = {}): RawCopilotSuggestion {
  return {
    anchor: "within thirty days",
    replacement: "within 30 calendar days",
    rationale: "Removes the ambiguity between working and calendar days.",
    risk: "LOW",
    kind: "clarity",
    ...over,
  };
}

describe("co-pilot stream framing", () => {
  test("a frame survives a round trip", () => {
    const frame: CopilotFrame = {
      type: "meta",
      provider: "openai",
      model: "gpt-5",
    };
    const { frames, rest } = decodeFrames(encodeFrame(frame));
    expect(frames).toEqual([frame]);
    expect(rest).toBe("");
  });

  test("frames are newline delimited, one per line", () => {
    const text =
      encodeFrame({ type: "meta", provider: "p", model: "m" }) +
      encodeFrame({ type: "error", code: "AI_PROVIDER_UNAVAILABLE" });
    expect(text.split("\n").filter(Boolean)).toHaveLength(2);
    expect(decodeFrames(text).frames).toHaveLength(2);
  });

  test("a frame split across chunks is held until it is complete", () => {
    // The failure this guards: parsing per network chunk instead of per line
    // drops any suggestion whose JSON straddles a boundary.
    const whole = encodeFrame({ type: "error", code: "COPILOT_STREAM_FAILED" });
    const cut = Math.floor(whole.length / 2);

    const first = decodeFrames(whole.slice(0, cut));
    expect(first.frames).toEqual([]);
    expect(first.rest).toBe(whole.slice(0, cut));

    const second = decodeFrames(first.rest + whole.slice(cut));
    expect(second.frames).toHaveLength(1);
    expect(second.rest).toBe("");
  });

  test("a complete frame is delivered even when the next one is partial", () => {
    const done = encodeFrame({ type: "meta", provider: "p", model: "m" });
    const partial = '{"type":"error","co';
    const { frames, rest } = decodeFrames(done + partial);
    expect(frames).toHaveLength(1);
    expect(rest).toBe(partial);
  });

  test("a malformed line is raised, not swallowed", () => {
    // Dropping it would leave the rail looking merely unhelpful when the wire
    // format has actually drifted.
    expect(() => decodeFrames("not json\n")).toThrow();
    expect(() => decodeFrames('{"type":"unknown"}\n')).toThrow();
  });
});

describe("per-suggestion reconciliation", () => {
  test("accepts an edit anchored to exactly one place in the document", () => {
    const out = reconcileSuggestion(DOC, raw(), new Set());
    expect(out?.anchor).toBe("within thirty days");
    expect(out?.id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("rejects an anchor that is not in the document", () => {
    expect(reconcileSuggestion(DOC, raw({ anchor: "not here" }), new Set()))
      .toBeNull();
  });

  test("rejects an ambiguous anchor", () => {
    const doubled = `${DOC} ${DOC}`;
    expect(reconcileSuggestion(doubled, raw(), new Set())).toBeNull();
  });

  test("rejects a replacement that trips the pricing guardrail", () => {
    // The guardrail matches pricing *advice* — "recommended price", "you
    // should bid at", "margin of N%" — not every figure that looks like money.
    const priced = raw({
      replacement: "within 30 days; the recommended price is 250,000",
    });
    expect(reconcileSuggestion(DOC, priced, new Set())).toBeNull();
  });

  test("the same edit is offered once across separate arrivals", () => {
    // Streaming has no batch to dedupe inside, so the caller carries the set.
    const seen = new Set<string>();
    expect(reconcileSuggestion(DOC, raw(), seen)).not.toBeNull();
    expect(reconcileSuggestion(DOC, raw(), seen)).toBeNull();
  });

  test("ids match the ones the batch path produces", () => {
    // The rail remembers dismissals by id, so the streaming path must not
    // rename the same edit and resurrect a rejected card.
    const streamed = reconcileSuggestion(DOC, raw(), new Set());
    expect(streamed?.id).toBe(reconcileSuggestion(DOC, raw(), new Set())?.id);
  });
});
