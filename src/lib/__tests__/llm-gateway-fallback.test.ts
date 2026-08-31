/**
 * The Vercel AI Gateway is the only AI credential a Vercel deployment can carry
 * without an admin-console round trip: enabling OIDC federation injects
 * `VERCEL_OIDC_TOKEN` at runtime. `resolvePlatformAgentModel` already prefers it
 * (`agents/platform/model.ts`), but `generateCompletion` — the entry point every
 * non-voice AI path uses — historically demanded a tenant provider row plus a
 * sealed key, so the same deployment could have a working copilot and a dead
 * 6-agent pipeline.
 *
 * These tests pin the two halves of the fix: the credential probe itself (real
 * process env, real module, no mocks) and the wiring that makes
 * `generateCompletion` consult it instead of giving up with `missing_key`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const GATEWAY_CREDENTIAL_VARS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "AI_GATEWAY_OIDC",
] as const;

/**
 * `gatewayAvailable()` reads `process.env` synchronously, so the only honest way
 * to exercise it is a real process with a real environment. Spawning also keeps
 * the parent's own credentials (if a developer has one exported) from deciding
 * the result.
 */
async function probeGatewayAvailable(
  env: Record<string, string | undefined>
): Promise<boolean> {
  const script = `
    const { gatewayAvailable } = await import("./src/lib/llm/gateway.ts");
    process.stdout.write(JSON.stringify({ available: gatewayAvailable() }));
  `;
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) base[key] = value;
  }
  for (const name of GATEWAY_CREDENTIAL_VARS) delete base[name];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete base[key];
    else base[key] = value;
  }

  const proc = Bun.spawn({
    cmd: [process.execPath, "-e", script],
    cwd: REPO_ROOT,
    env: base,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`probe exited ${exitCode}: ${stderr}`);
  }
  return (JSON.parse(stdout) as { available: boolean }).available;
}

describe("gatewayAvailable reads real gateway credentials", () => {
  test("no gateway credential means unavailable", async () => {
    expect(await probeGatewayAvailable({})).toBe(false);
  });

  test.each([...GATEWAY_CREDENTIAL_VARS])(
    "%s alone makes the gateway available",
    async (name) => {
      expect(await probeGatewayAvailable({ [name]: "probe-value" })).toBe(true);
    }
  );

  test.each([...GATEWAY_CREDENTIAL_VARS])(
    "%s set to whitespace is not a credential",
    async (name) => {
      expect(await probeGatewayAvailable({ [name]: "   " })).toBe(false);
    }
  );
});

describe("the gateway model id has one definition", () => {
  const gatewaySource = readFileSync(
    join(REPO_ROOT, "src/lib/llm/gateway.ts"),
    "utf8"
  );
  const modelSource = readFileSync(
    join(REPO_ROOT, "src/lib/agents/platform/model.ts"),
    "utf8"
  );

  test("gateway.ts exports a provider-qualified model id", () => {
    expect(gatewaySource).toMatch(
      /export const GATEWAY_MODEL_ID\s*=\s*"[a-z0-9-]+\/[a-z0-9.-]+"/
    );
  });

  test("model.ts consumes it rather than declaring its own", () => {
    expect(modelSource).toMatch(/GATEWAY_MODEL_ID/);
    // A second literal here is how the voice path and the pipeline path drifted
    // apart in the first place: one preferred the gateway, the other ignored it.
    expect(modelSource).not.toMatch(/const GATEWAY_DEFAULT_MODEL\s*=/);
  });
});

describe("generateCompletion falls through to the gateway", () => {
  const source = readFileSync(join(REPO_ROOT, "src/lib/llm/index.ts"), "utf8");

  // Anti-vacuous: if these anchors are ever renamed, the reachability assertion
  // below would pass for the wrong reason, so fail loudly here instead.
  test("the missing-key giving-up path still exists", () => {
    expect(source).toMatch(/failureKind: "missing_key"/);
  });

  test("it imports the gateway probe", () => {
    expect(source).toMatch(/from "\.\/gateway"/);
    expect(source).toMatch(/gatewayAvailable/);
  });

  test("the gateway is consulted before missing_key is returned", () => {
    const probeAt = source.indexOf("gatewayAvailable(");
    const giveUpAt = source.indexOf('failureKind: "missing_key"');
    expect(probeAt).toBeGreaterThan(-1);
    expect(giveUpAt).toBeGreaterThan(-1);
    expect(probeAt).toBeLessThan(giveUpAt);
  });

  test("a gateway completion is not reported as a fallback", () => {
    // `fallback: true` is what `AUTONOMY_REAL_AI_ONLY` refuses to ship and what
    // the UI labels as degraded output. A real gateway answer is neither.
    const gatewaySource = readFileSync(
      join(REPO_ROOT, "src/lib/llm/gateway.ts"),
      "utf8"
    );
    expect(gatewaySource).toMatch(/export async function callGateway/);
    expect(gatewaySource).not.toMatch(/fallback:\s*true/);
  });
});
