/**
 * Feature: platform-completion, Property 35: Introduced capabilities are reachable
 */

import { describe, expect, test } from "bun:test";
import { CAPABILITY_REACHABILITY_MANIFEST } from "../../capability-reachability-manifest";
import {
  scanProductionIntegritySource,
  validateCapabilityReachability,
} from "../../production-integrity-scanner";

describe("Feature: platform-completion, Property 35: Introduced capabilities are reachable", () => {
  test("every manifest edge has existing target and inbound source files", () => {
    expect(CAPABILITY_REACHABILITY_MANIFEST.length).toBeGreaterThan(10);
    const findings = validateCapabilityReachability(process.cwd());
    expect(findings).toEqual([]);
  });

  test("scanner rejects stub/fixture/monetary-compute fixtures under test control", () => {
    const stub = scanProductionIntegritySource(
      'return jsonError("coming soon", 501, "NOT_IMPLEMENTED");',
      "src/app/api/example/route.ts"
    );
    expect(stub.some((f) => f.code === "STUB_RESPONSE")).toBe(true);

    const fixture = scanProductionIntegritySource(
      "const n = Math.random();",
      "src/components/dashboard/example.tsx"
    );
    expect(fixture.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);

    const money = scanProductionIntegritySource(
      "export function computeBidPrice() { return 1; }",
      "src/lib/pricing.ts"
    );
    expect(money.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);

    const clean = scanProductionIntegritySource(
      'export const ok = true;\n',
      "src/lib/clean.ts"
    );
    expect(clean).toEqual([]);
  });
});
