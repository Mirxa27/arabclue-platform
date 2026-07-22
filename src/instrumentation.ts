/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Fail closed if production secrets are missing.
 * On Vercel serverless, seeds an ephemeral SQLite DB under /tmp (writable).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionSecrets } = await import("./lib/crypto");
    assertProductionSecrets();

    if (process.env.VERCEL && process.env.DATABASE_URL?.includes("/tmp")) {
      try {
        const { execSync } = await import("node:child_process");
        execSync("npx prisma db push --skip-generate", {
          stdio: "inherit",
          env: process.env,
        });
        const { getBootstrapContext } = await import("./lib/bootstrap");
        await getBootstrapContext();
      } catch (err) {
        console.error("[instrumentation] Vercel DB bootstrap failed", err);
      }
    }
  }
}
