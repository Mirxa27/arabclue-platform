/**
 * Transactional email. Two transports, chosen by whichever credential exists:
 * Resend's HTTP API, or a real SMTP relay. Graceful no-op (logged) when
 * neither is configured so cron jobs remain safe in degraded mode.
 */
import { Resend } from "resend";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type EmailProvider = "resend" | "smtp";

export type SendEmailResult =
  | { ok: true; id: string; provider: EmailProvider }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

export type EmailTransport =
  | { kind: "resend"; apiKey: string }
  | {
      kind: "smtp";
      host: string;
      port: number;
      secure: boolean;
      user: string;
      password: string;
    }
  | { kind: "none"; reason: "no_transport" | "smtp_incomplete" };

/** Implicit TLS, and the documented Hostinger default. */
const DEFAULT_SMTP_PORT = 465;
const MAX_PORT = 65535;
const SMTP_TIMEOUT_MS = 15_000;

function trimmed(value: string | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Pure, so the choice is testable without a network — and so the readiness
 * probe and the sender can never disagree about which transport is live.
 */
export function selectEmailTransport(
  env: Record<string, string | undefined>
): EmailTransport {
  // Resend first: an HTTP call needs no long-lived TCP connection, which is
  // the safer default on serverless.
  const apiKey = trimmed(env.RESEND_API_KEY);
  if (apiKey) return { kind: "resend", apiKey };

  const host = trimmed(env.SMTP_HOST);
  if (!host) return { kind: "none", reason: "no_transport" };

  // A relay host with no credential authenticates as nobody and then fails
  // once per message. Naming it unconfigured surfaces it at /api/ready instead.
  const user = trimmed(env.SMTP_USER);
  const password = trimmed(env.SMTP_PASSWORD);
  if (!user || !password) return { kind: "none", reason: "smtp_incomplete" };

  const declared = Number.parseInt(trimmed(env.SMTP_PORT), 10);
  const port =
    Number.isInteger(declared) && declared > 0 && declared <= MAX_PORT
      ? declared
      : DEFAULT_SMTP_PORT;

  return {
    kind: "smtp",
    host,
    port,
    // 465 is implicit TLS; 587 upgrades via STARTTLS after a plaintext
    // greeting. Pairing either with the other's flag fails the handshake.
    secure: port === DEFAULT_SMTP_PORT,
    user,
    password,
  };
}

function fromAddress(transport: EmailTransport): string {
  const configured =
    trimmed(process.env.EMAIL_FROM) || trimmed(process.env.RESEND_FROM);
  if (configured) return configured;
  // A relay rejects a From address it does not own, so the authenticated
  // mailbox is the only safe default for SMTP.
  if (transport.kind === "smtp") return transport.user;
  return "ArabClue <onboarding@resend.dev>";
}

export function isEmailConfigured(): boolean {
  return selectEmailTransport(process.env).kind !== "none";
}

/** Cap on the operator-facing failure detail persisted in an audit row. */
export const EMAIL_FAILURE_DETAIL_MAX = 300;

/**
 * The provider's own words for a failed send, bounded so a relay cannot write an
 * unbounded audit row. Callers pass this to an operator-only sink: it names the
 * outage (bad relay credentials, blocked port, rejected sender) that a fixed
 * `delivery_failed` category cannot distinguish.
 */
export function describeEmailFailure(
  result: SendEmailResult
): string | undefined {
  if (result.ok) return undefined;
  const detail = result.skipped ? result.reason : result.error;
  return detail.slice(0, EMAIL_FAILURE_DETAIL_MAX);
}

export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const transport = selectEmailTransport(process.env);
  if (transport.kind === "none") {
    // Recipient withheld deliberately: this line lands in shared logs.
    console.info(
      `[email] skipped — ${transport.reason}:`,
      input.subject
    );
    return { ok: false, skipped: true, reason: transport.reason };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  try {
    if (transport.kind === "resend") {
      const resend = new Resend(transport.apiKey);
      const { data, error } = await resend.emails.send({
        from: fromAddress(transport),
        to: recipients,
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
    }

    // Imported lazily: nodemailer opens raw sockets, so keeping it out of the
    // static graph stops it being bundled into routes that never send.
    const { createTransport } = await import("nodemailer");
    const mailer = createTransport({
      host: transport.host,
      port: transport.port,
      secure: transport.secure,
      // On a non-implicit-TLS port the mailbox password would otherwise be sent
      // in the clear if the relay simply failed to advertise STARTTLS. Require
      // the upgrade instead, so a downgrade is a failed send, not a leak.
      requireTLS: !transport.secure,
      auth: { user: transport.user, pass: transport.password },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    try {
      // Awaited, not fired off: a serverless instance is frozen once its
      // response returns, so an in-flight send is a send that never happens.
      const sent = await mailer.sendMail({
        from: fromAddress(transport),
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return { ok: true, id: sent.messageId, provider: "smtp" };
    } finally {
      mailer.close();
    }
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
