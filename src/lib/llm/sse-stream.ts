/**
 * Reads an OpenAI-compatible `chat/completions` stream.
 *
 * Tokens arrive as data-only server-sent events, one JSON `chat.completion.chunk`
 * per `data:` line, terminated by `data: [DONE]`. Two usage shapes exist in the
 * wild and both are handled: DeepSeek puts `usage` on the last content chunk
 * (api-docs.deepseek.com, create-chat-completion: "no separate usage-only chunk
 * is emitted"), OpenAI sends one more chunk with empty `choices` and `usage`
 * when `stream_options.include_usage` is set. `finish_reason: "length"` means
 * the cap was hit, exactly as on the non-streaming response.
 */

export interface OpenAiStreamResult {
  text: string;
  tokensUsed: number;
  truncated: boolean;
}

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { total_tokens?: number } | null;
}

/** Splits buffered SSE text into complete events (blank-line separated) and the unfinished rest. */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  return { events: parts, rest };
}

/** The `data:` payload of one event, or null for comments and blank events. */
export function sseEventData(event: string): string | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  return data.length > 0 ? data : null;
}

export async function readOpenAiCompatibleStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<OpenAiStreamResult> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  let text = "";
  let tokensUsed = 0;
  let truncated = false;

  const consume = (payload: string) => {
    if (payload === "[DONE]") return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(payload) as StreamChunk;
    } catch {
      return; // a keep-alive or a malformed frame; the next one carries on
    }
    const choice = chunk.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string" && delta.length > 0) {
      text += delta;
      onDelta(delta);
    }
    if (choice?.finish_reason === "length" || choice?.finish_reason === "stop_sequence") {
      truncated = true;
    }
    if (typeof chunk.usage?.total_tokens === "number") {
      tokensUsed = chunk.usage.total_tokens;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = splitSseEvents(buffer);
      buffer = rest;
      for (const event of events) {
        const payload = sseEventData(event);
        if (payload !== null) consume(payload);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const payload = sseEventData(buffer);
      if (payload !== null) consume(payload);
    }
  } finally {
    reader.releaseLock();
  }

  return { text, tokensUsed, truncated };
}
