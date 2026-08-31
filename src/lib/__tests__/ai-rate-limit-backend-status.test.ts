import { describe, expect, test } from "bun:test";

/**
 * A downed limiter backend is not a rate limit, and the AI routes must not
 * say it is.
 *
 * `rateLimitAsync` reports which backend answered. When `REDIS_URL` is set the
 * limiter is required to be distributed, so an unreachable Redis fails closed
 * with `backend: "unavailable"` rather than silently falling back to
 * per-instance memory. Nine call sites already split that case out with
 * `describeRateLimitDenial` — 503 `rate_limit_service_unavailable`, not 429.
 *
 * `checkAiRateLimit` is the one helper that discarded `backend`, and it now
 * fronts every AI route that can spend provider credit. Answering 429 there
 * tells a client "you asked too often, retry in 5s" when the truth is "the
 * limiter is down"; a caller obeying that will keep retrying into an outage,
 * and ops alerting sees throttling instead of an infrastructure fault.
 *
 * Exercised in a subprocess against a blackhole endpoint rather than by
 * mocking the limiter, so the assertion covers the real failure path — same
 * approach as `rate-limit-fail-closed.test.ts`, which owns the latency budget
 * for that path.
 */
const BLACKHOLE_REDIS_URL = "redis://10.255.255.1:6379";

interface ProbeResult {
  readonly status?: number;
  readonly code?: string;
  readonly retryAfterHeader?: string | null;
}

/**
 * `REDIS_URL` decides whether the limiter is required to be distributed, so it
 * has to be set for the whole process — hence a subprocess rather than an
 * in-test env mutation that would leak into every other file.
 */
async function probe(env: Record<string, string>): Promise<ProbeResult> {
  const script = `
    const { checkAiRateLimit } = await import("./src/lib/ai-rate-limit.ts");

    // limit: 0 so the first call is refused regardless of which backend
    // answers. That isolates the status question from window bookkeeping.
    const res = await checkAiRateLimit({
      route: "ai.backend-status-probe",
      identifier: "probe-workspace",
      limit: 0,
      windowMs: 60_000,
    });
    const body = res === null ? {} : await res.json();
    console.log(JSON.stringify({
      status: res === null ? null : res.status,
      code: body.code,
      retryAfterHeader: res === null ? null : res.headers.get("Retry-After"),
    }));
  `;
  const child = Bun.spawn({
    cmd: [process.execPath, "-e", script],
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production", VERCEL: "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;

  const lines = stdout.trim().split("\n").filter(Boolean);
  const last = lines.at(-1);
  if (!last) throw new Error(`probe produced no output. stderr:\n${stderr}`);
  return JSON.parse(last) as ProbeResult;
}

describe("checkAiRateLimit reports why the call was refused", () => {
  test(
    "answers 503 when the distributed limiter backend is unreachable",
    async () => {
      const result = await probe({ REDIS_URL: BLACKHOLE_REDIS_URL });

      expect(result.status).toBe(503);
      expect(result.code).toBe("AI_RATE_LIMIT_UNAVAILABLE");
      // Still tells the caller when to come back, so a client that honours
      // Retry-After does not hot-loop against a downed backend.
      expect(result.retryAfterHeader).not.toBeNull();
    },
    30_000
  );

  test(
    "still answers 429 when a working backend refuses the call",
    async () => {
      // No REDIS_URL: the limiter is not required to be distributed, memory
      // answers, and an over-budget caller is genuinely rate limited.
      const result = await probe({ REDIS_URL: "" });

      expect(result.status).toBe(429);
      expect(result.code).toBe("AI_RATE_LIMITED");
    },
    30_000
  );
});
