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

/**
 * True when email verification gates and token delivery should be skipped.
 *
 * The flag is ignored in production and refuses to start the process if it is
 * set there. It disables an account-security control globally, so a value
 * copied from a local `.env` into a production environment must fail loudly
 * rather than silently admit unverified accounts. `assertProductionSecrets`
 * checks only for *missing* secrets, so this guard lives here where the flag is
 * read.
 */
export function isEmailVerificationSkipped(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const requested = parseFlag(env.SKIP_EMAIL_VERIFICATION);
  if (requested && env.NODE_ENV === "production") {
    throw new Error(
      "SKIP_EMAIL_VERIFICATION must not be enabled in production: it disables the account email-verification gate for every user."
    );
  }
  return requested;
}

/** Effective verification claim for a session/user under the current policy. */
export function resolveEmailVerifiedClaim(
  storedVerified: boolean | null | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (isEmailVerificationSkipped(env)) return true;
  return !!storedVerified;
}
