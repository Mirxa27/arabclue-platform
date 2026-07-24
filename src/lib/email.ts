/**
 * Transactional email — Resend when RESEND_API_KEY is set.
 * Graceful no-op (logged) when unset so cron jobs remain safe in degraded mode.
 */

import { Resend } from "resend";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { ok: true; id: string; provider: "resend" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

function fromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "ArabClue <onboarding@resend.dev>"
  );
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info(
      "[email] skipped — RESEND_API_KEY unset:",
      input.subject,
      "→",
      input.to
    );
    return {
      ok: false,
      skipped: true,
      reason: "RESEND_API_KEY not configured",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    if (error) {
      return {
        ok: false,
        skipped: false,
        error: error.message || "Resend send failed",
      };
    }
    return { ok: true, id: data?.id ?? "unknown", provider: "resend" };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
