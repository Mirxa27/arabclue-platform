import { describe, expect, test } from "bun:test";

/**
 * The distributed limiter must fail closed, and must do so inside the caller's
 * budget, when REDIS_URL points at an unreachable endpoint.
 *
 * Two distinct costs are measured separately:
 * - the per-request latency, which is what a signed-in caller waits for. The
 *   `redis` module is already resident by then, so only the bounded connect
 *   attempt contributes.
 * - the cold path, where the first `import("redis")` of the process is also
 *   paid. `getRedis` bounds the whole acquisition so this cannot stall a request
 *   indefinitely.
 */
const BLACKHOLE_REDIS_URL = "redis://10.255.255.1:6379";

/** Matches REDIS_ACQUIRE_TIMEOUT_MS in src/lib/rate-limit.ts, plus scheduling slack. */
const COLD_PATH_BUDGET_MS = 2_000;
const SCHEDULING_SLACK_MS = 2_500;

interface ProbeResult {
  readonly backend?: string;
  readonly ok?: boolean;
  readonly warmElapsedMs?: number;
  readonly coldElapsedMs?: number;
}

async function probe(): Promise<{ exitCode: number; result: ProbeResult }> {
  const script = `
    const { rateLimitAsync } = await import("./src/lib/rate-limit.ts");

    // Cold path: also pays the first import("redis") of this process.
    const coldStarted = Date.now();
    const cold = await rateLimitAsync({
      key: "blackhole-regression-cold",
      limit: 1,
      windowMs: 1_000,
    });
    const coldElapsedMs = Date.now() - coldStarted;

    // The limiter enters a retry cooldown after a failed acquisition, so a
    // second call must still fail closed without contacting the endpoint.
    const warmStarted = Date.now();
    const warm = await rateLimitAsync({
      key: "blackhole-regression-warm",
      limit: 1,
      windowMs: 1_000,
    });
    const warmElapsedMs = Date.now() - warmStarted;

    console.log(JSON.stringify({
      backend: warm.backend,
      ok: warm.ok,
      coldBackend: cold.backend,
      coldOk: cold.ok,
      coldElapsedMs,
      warmElapsedMs,
    }));
    process.exit(
      cold.backend === "unavailable" &&
      cold.ok === false &&
      warm.backend === "unavailable" &&
      warm.ok === false
        ? 0
        : 1
    );
  `;
  const child = Bun.spawn({
    cmd: [process.execPath, "-e", script],
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      VERCEL: "",
      REDIS_URL: BLACKHOLE_REDIS_URL,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  const lines = stdout.trim().split("\n");
  return {
    exitCode,
    result: JSON.parse(lines.at(-1) ?? "{}") as ProbeResult,
  };
}

describe("distributed rate-limit availability boundary", () => {
  test(
    "fails closed for an unreachable Redis endpoint, on the cold and the warm path",
    async () => {
      const { exitCode, result } = await probe();

      expect(exitCode).toBe(0);
      expect(result).toMatchObject({ backend: "unavailable", ok: false });

      // Per-request latency once the module is resident: the acquisition is in
      // its retry cooldown, so the answer is immediate.
      expect(result.warmElapsedMs).toBeLessThan(SCHEDULING_SLACK_MS);

      // Cold path: bounded by the acquisition deadline rather than by the
      // operating system's connect behaviour.
      expect(result.coldElapsedMs).toBeLessThan(
        COLD_PATH_BUDGET_MS + SCHEDULING_SLACK_MS
      );
    },
    30_000
  );
});
