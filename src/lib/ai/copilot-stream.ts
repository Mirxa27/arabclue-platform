/**
 * The wire between the co-pilot route and the co-pilot rail.
 *
 * A review pass streams: the model emits edits one at a time and each is shown
 * the moment it clears the safety rules, instead of the rail sitting blank
 * until the whole batch lands. That means the response is no longer a single
 * JSON body, and both halves have to agree on how it is cut up.
 *
 * One frame per line, JSON, newline-terminated. Chosen over Server-Sent Events
 * because there is nothing here SSE would add — no reconnection, no event ids,
 * no browser `EventSource` (a POST cannot use one anyway) — and over the AI
 * SDK's own stream helpers because the suggestions must be vetted server-side
 * before they are sent, which those helpers stream past.
 *
 * Isomorphic on purpose: the encoder runs in the route and the decoder runs in
 * the browser, so a drift between the two is a drift inside one file.
 */

import type { CopilotSuggestion } from "./copilot-anchors";

export type CopilotFrame =
  /** Sent first, so attribution can render before any edit arrives. */
  | { type: "meta"; provider: string; model: string }
  | { type: "suggestion"; suggestion: CopilotSuggestion }
  /**
   * A failure after the response headers are out. The status line is already
   * 200 by then, so this is the only way left to say the pass did not finish.
   */
  | { type: "error"; code: string };

export function encodeFrame(frame: CopilotFrame): string {
  return `${JSON.stringify(frame)}\n`;
}

function asFrame(value: unknown): CopilotFrame {
  const f = value as Partial<CopilotFrame> & Record<string, unknown>;
  if (f?.type === "meta") {
    if (typeof f.provider === "string" && typeof f.model === "string") {
      return { type: "meta", provider: f.provider, model: f.model };
    }
  } else if (f?.type === "suggestion") {
    const s = f.suggestion as Partial<CopilotSuggestion> | undefined;
    if (typeof s?.id === "string" && typeof s.anchor === "string") {
      return { type: "suggestion", suggestion: s as CopilotSuggestion };
    }
  } else if (f?.type === "error" && typeof f.code === "string") {
    return { type: "error", code: f.code };
  }
  throw new Error("malformed co-pilot stream frame");
}

/**
 * Every complete frame in `buffer`, plus whatever is left over.
 *
 * The caller prepends `rest` to the next chunk: the network splits wherever it
 * likes, and a frame cut in half is the common case on a long pass, not an
 * edge case. Parsing per chunk instead of per line would drop those silently.
 */
export function decodeFrames(buffer: string): {
  frames: CopilotFrame[];
  rest: string;
} {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const frames = lines
    .filter((line) => line.trim() !== "")
    .map((line) => asFrame(JSON.parse(line) as unknown));
  return { frames, rest };
}
