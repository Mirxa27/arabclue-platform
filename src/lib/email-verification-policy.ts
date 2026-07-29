/**
 * Temporary policy switch for skipping account email verification.
 *
 * Set SKIP_EMAIL_VERIFICATION=true in the local (or staging) environment to
 * admit unverified sessions and treat new registrations as verified. Do not
 * leave this enabled in production once Resend + migrations are ready.
 */

function parseFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

/** True when email verification gates and token delivery should be skipped. */
export function isEmailVerificationSkipped(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return parseFlag(env.SKIP_EMAIL_VERIFICATION);
}

/** Effective verification claim for a session/user under the current policy. */
export function resolveEmailVerifiedClaim(
  storedVerified: boolean | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isEmailVerificationSkipped(env)) return true;
  return !!storedVerified;
}
