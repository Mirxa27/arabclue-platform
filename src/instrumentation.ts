/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Fail closed if production secrets are missing.
 * Schema migrations are an explicit production release step, never a build step.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionSecrets } = await import("./lib/crypto");
    assertProductionSecrets();

    // Warn when NEXTAUTH_SECRET is unset in dev — NextAuth auto-generates one
    // per server restart, which invalidates all existing CSRF tokens and session
    // cookies, causing 401 on /api/auth/callback/credentials after restarts.
    if (process.env.NODE_ENV !== "production") {
      const secret = process.env.NEXTAUTH_SECRET?.trim();
      if (!secret) {
        console.warn(
          "[instrumentation] NEXTAUTH_SECRET is not set — NextAuth will auto-generate a secret on each server restart. " +
            "This causes 401 errors on /api/auth/callback/credentials because CSRF tokens become invalid. " +
            "Set NEXTAUTH_SECRET in .env for stable sessions during development."
        );
      } else if (secret.length < 32) {
        console.warn(
          "[instrumentation] NEXTAUTH_SECRET is shorter than 32 characters — use a longer random string for security."
        );
      }
    }

    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      try {
        const { ensureDatabaseReady } = await import("./lib/ensure-db");
        await ensureDatabaseReady();
        const { getBootstrapContext } = await import("./lib/bootstrap");
        await getBootstrapContext();
      } catch (err) {
        console.error("[instrumentation] DB bootstrap failed", err);
      }
    }
  }
}
