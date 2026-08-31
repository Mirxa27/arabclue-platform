import { describe, expect, test } from "bun:test";
import { summarizeEngineCredentials } from "@/lib/ai-credential-readiness";

/**
 * Checking only the DEFAULT engine hid two real production defects: a
 * COMPLIANCE connection naming a credential outside the provider allowlist,
 * and a DRAFTING connection whose credential was sealed empty. Both engines
 * fabricated every answer while DEFAULT stayed healthy and the probe stayed
 * green.
 */
describe("engine credential readiness", () => {
  test("reports ready when every engine resolves a credential", () => {
    const summary = summarizeEngineCredentials([
      { engine: "DEFAULT", resolved: true },
      { engine: "COMPLIANCE", resolved: true },
      { engine: "DRAFTING", resolved: true },
    ]);

    expect(summary.ok).toBe(true);
    expect(summary.detail).toBe("engines_ok:3");
  });

  test("names the engine that would fabricate", () => {
    const summary = summarizeEngineCredentials([
      { engine: "DEFAULT", resolved: true },
      { engine: "COMPLIANCE", resolved: false },
    ]);

    expect(summary.ok).toBe(false);
    expect(summary.detail).toBe("degraded:COMPLIANCE");
  });

  test("names every degraded engine in a stable order", () => {
    const summary = summarizeEngineCredentials([
      { engine: "DRAFTING", resolved: false },
      { engine: "DEFAULT", resolved: true },
      { engine: "COMPLIANCE", resolved: false },
    ]);

    expect(summary.ok).toBe(false);
    expect(summary.detail).toBe("degraded:COMPLIANCE,DRAFTING");
  });

  test("treats an empty sweep as not ready rather than vacuously ready", () => {
    // `every` on an empty array is true, which would report a deployment with
    // no active provider at all as healthy.
    const summary = summarizeEngineCredentials([]);

    expect(summary.ok).toBe(false);
    expect(summary.detail).toBe("no_engines_checked");
  });

  test("never reveals which credential or provider was involved", () => {
    const summary = summarizeEngineCredentials([
      { engine: "COMPLIANCE", resolved: false },
    ]);

    expect(summary.detail).not.toContain("API_KEY");
    expect(summary.detail).not.toContain("sk-");
    expect(summary.detail.toLowerCase()).not.toContain("openai");
    expect(summary.detail.toLowerCase()).not.toContain("zai");
  });
});
