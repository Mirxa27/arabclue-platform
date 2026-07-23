/**
 * Optional outbound webhook for audit / mission events when WEBHOOK_URL is set.
 * Fire-and-forget with timeout; never blocks the primary request path.
 */

import { z } from "zod";

const payloadSchema = z.object({
  event: z.string().min(1).max(120),
  at: z.string().datetime().optional(),
  workspaceId: z.string().optional(),
  userId: z.string().optional(),
  resource: z.string().optional(),
  resourceId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type OutboundWebhookPayload = z.infer<typeof payloadSchema>;

export async function dispatchOutboundWebhook(
  input: OutboundWebhookPayload
): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  const url = process.env.WEBHOOK_URL?.trim();
  if (!url) return { ok: true, skipped: true };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, error: "Invalid WEBHOOK_URL" };
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return { ok: false, error: "WEBHOOK_URL must be http(s)" };
  }

  const payload = payloadSchema.parse({
    ...input,
    at: input.at ?? new Date().toISOString(),
  });

  try {
    const res = await fetch(parsedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "ArabClue-Webhook/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `webhook ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "webhook failed",
    };
  }
}

/** Non-blocking helper for hot paths. */
export function notifyWebhook(input: OutboundWebhookPayload): void {
  void dispatchOutboundWebhook(input).catch((err) => {
    console.warn("[webhook]", err);
  });
}
