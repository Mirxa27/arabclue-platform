import { describe, expect, test } from "bun:test";

describe("distributed rate-limit availability boundary", () => {
  test(
    "returns unavailable within a bounded interval for an unreachable Redis endpoint",
    async () => {
      const script = `
        const { rateLimitAsync } = await import("./src/lib/rate-limit.ts");
        const started = Date.now();
        const result = await rateLimitAsync({
          key: "blackhole-regression",
          limit: 1,
          windowMs: 1_000,
        });
        console.log(JSON.stringify({
          backend: result.backend,
          ok: result.ok,
          elapsedMs: Date.now() - started,
        }));
        process.exit(
          result.backend === "unavailable" && result.ok === false ? 0 : 1
        );
      `;
      const child = Bun.spawn({
        cmd: [process.execPath, "-e", script],
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          VERCEL: "",
          REDIS_URL: "redis://10.255.255.1:6379",
        },
        stdout: "pipe",
        stderr: "pipe",
      });

      const [exitCode, stdout] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
      ]);
      expect(exitCode).toBe(0);

      const lines = stdout.trim().split("\n");
      const result = JSON.parse(lines.at(-1) ?? "{}") as {
        backend?: string;
        ok?: boolean;
        elapsedMs?: number;
      };
      expect(result).toMatchObject({
        backend: "unavailable",
        ok: false,
      });
      expect(result.elapsedMs).toBeLessThan(2_500);
    },
    5_000
  );
});
