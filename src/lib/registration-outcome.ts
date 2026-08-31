/**
 * What a committed registration means for the next screen.
 *
 * The account, its workspace, and its verification token are persisted before
 * the email is attempted, so an undelivered verification still answers 2xx
 * (202, code `VERIFICATION_EMAIL_UNCONFIGURED` or `VERIFICATION_EMAIL_SEND_FAILED`).
 * Reading only `res.ok` therefore sent the user to the "check your inbox"
 * screen to wait for a message nothing was configured to send.
 */
export type RegistrationOutcome =
  /** Verification pending and the message is on its way. */
  | "verify_email"
  /** Committed, but no verification message left the server. */
  | "undeliverable"
  /** Verification not required — the account can sign in now. */
  | "signed_up";

export function readRegistrationOutcome(body: unknown): RegistrationOutcome {
  if (!body || typeof body !== "object") return "verify_email";
  const record = body as {
    verificationRequired?: unknown;
    emailDelivery?: unknown;
    account?: { emailVerified?: unknown };
  };

  if (
    record.verificationRequired === false ||
    record.account?.emailVerified === true
  ) {
    return "signed_up";
  }

  // Absence is not evidence of failure: a body that omits the field must
  // behave exactly as it did before this branch existed.
  const delivery = record.emailDelivery;
  if (typeof delivery === "string" && delivery !== "SENT") {
    return "undeliverable";
  }
  return "verify_email";
}
