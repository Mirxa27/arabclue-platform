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
  | { kind: "done"; truncated: boolean };

export interface DraftStreamSink {
  reset(attempt: number): void;
  push(text: string): void;
  done(truncated: boolean): Promise<void>;
  close(): Promise<void>;
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
    async done(truncated) {
      flush();
      write({ kind: "done", truncated });
      await queue;
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

/** One server-sent event per chunk; the id is the chunk's index in the stream so a client can resume. */
export function encodeSseEvent(index: number, chunk: DraftStreamChunk): string {
  return `id: ${index}\ndata: ${JSON.stringify(chunk)}\n\n`;
}
