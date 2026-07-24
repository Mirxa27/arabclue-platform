/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Fail closed if production secrets are missing.
 * Schema migrations are an explicit production release step, never a build step.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionSecrets } = await import("./lib/crypto");
    assertProductionSecrets();

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
