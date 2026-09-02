/**
 * The run's live draft: what the drafting stage writes, what the route reads.
 *
 * Chunks are typed so a reader can tell a fresh attempt from a continuation:
 * a retried stage appends to the same namespaced stream, so it announces
 * itself with `reset` and the page starts over. Writes are batched — the
 * stream backend is a network hop per chunk, and a token at a time would turn
 * a two-minute draft into thousands of round trips. Streaming is best effort:
 * a failed write is remembered and the draft carries on without it.
 */

export const DRAFT_STREAM_NAMESPACE = "draft";

export type DraftStreamChunk =
  | { kind: "reset"; attempt: number }
  | { kind: "delta"; text: string }
  /** `continues` — the draft was cut off and a continuation will follow on this same stream. */
  | { kind: "done"; truncated: boolean; continues?: boolean };

export interface DraftStreamSink {
  reset(attempt: number): void;
  push(text: string): void;
  done(truncated: boolean, opts?: { continues?: boolean }): Promise<void>;
  /** Ends the stream. Only after a finished draft: a closed stream refuses every later write (HTTP 409). */
  close(): Promise<void>;
  /** Flushes and unlocks the writer, leaving the stream open for a retried attempt. */
  release(): Promise<void>;
  readonly failed: boolean;
}

const DEFAULT_FLUSH_EVERY_MS = 250;
const DEFAULT_FLUSH_AT_CHARS = 400;

export function createDraftStreamSink(
  writable: WritableStream<DraftStreamChunk>,
  opts: { flushEveryMs?: number; flushAtChars?: number } = {},
): DraftStreamSink {
  const flushEveryMs = opts.flushEveryMs ?? DEFAULT_FLUSH_EVERY_MS;
  const flushAtChars = opts.flushAtChars ?? DEFAULT_FLUSH_AT_CHARS;
  const writer = writable.getWriter();
  let pending = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let failed = false;
  let closed = false;

  const write = (chunk: DraftStreamChunk) => {
    if (failed || closed) return;
    queue = queue.then(async () => {
      if (failed) return;
      try {
        await writer.write(chunk);
      } catch (err) {
        failed = true;
        console.warn("[draft-stream] write failed; continuing without the live draft", err);
      }
    });
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!pending) return;
    const text = pending;
    pending = "";
    write({ kind: "delta", text });
  };

  return {
    get failed() {
      return failed;
    },
    reset(attempt) {
      flush();
      write({ kind: "reset", attempt });
    },
    push(text) {
      if (!text) return;
      pending += text;
      if (pending.length >= flushAtChars) {
        flush();
        return;
      }
      if (!timer) timer = setTimeout(flush, flushEveryMs);
    },
    async done(truncated, opts) {
      flush();
      write(opts?.continues ? { kind: "done", truncated, continues: true } : { kind: "done", truncated });
      await queue;
    },
    async release() {
      flush();
      await queue;
      if (closed) return;
      closed = true;
      try {
        writer.releaseLock();
      } catch {
        // already released
      }
    },
    async close() {
      flush();
      await queue;
      if (closed) return;
      closed = true;
      try {
        if (!failed) await writer.close();
      } catch (err) {
        failed = true;
        console.warn("[draft-stream] close failed", err);
      } finally {
        try {
          writer.releaseLock();
        } catch {
          // already released by a failed close
        }
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The reader's view of the stream                                            */
/* -------------------------------------------------------------------------- */

export type DraftViewPhase = "waiting" | "writing" | "retrying" | "continuing" | "done";

export interface DraftView {
  text: string;
  phase: DraftViewPhase;
  truncated: boolean;
  /** Whether the reader should keep the connection open. */
  listening: boolean;
}

export function initialDraftView(): DraftView {
  return { text: "", phase: "waiting", truncated: false, listening: true };
}

/**
 * How one chunk changes what the page shows. Pure, so the panel is a thin
 * shell around it. A `done` marked `continues` is not the end: the workflow's
 * continuation step keeps writing to the same stream and sends the final
 * `done` itself, with `truncated` telling whether it too ran out of room.
 */
export function reduceDraftChunk(view: DraftView, chunk: DraftStreamChunk): DraftView {
  switch (chunk.kind) {
    case "reset":
      return { text: "", phase: chunk.attempt > 1 ? "retrying" : "waiting", truncated: false, listening: true };
    case "delta":
      return { ...view, text: view.text + chunk.text, phase: "writing", truncated: false };
    case "done":
      return chunk.continues
        ? { ...view, phase: "continuing", truncated: true, listening: true }
        : { ...view, phase: "done", truncated: chunk.truncated, listening: false };
    default:
      return view;
  }
}

/** One server-sent event per chunk; the id is the chunk's index in the stream so a client can resume. */
export function encodeSseEvent(index: number, chunk: DraftStreamChunk): string {
  return `id: ${index}\ndata: ${JSON.stringify(chunk)}\n\n`;
}
