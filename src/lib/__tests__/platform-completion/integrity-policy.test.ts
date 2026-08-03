/**
 * Integrity scanner coverage — §12.3 (Requirement 19.1–19.11).
 *
 * Tests the narrow static scanners for:
 * - Orphaned capabilities (no UI/scheduler/callback edge)
 * - Missing-schema synthetic success responses
 * - Not-implemented/coming-soon stub responses
 * - Runtime fixtures/stubs/random display values
 * - User-visible literals
 * - Prohibited monetary computations
 * - Exemption of test files, frozen catalogs, and validation comparisons
 */

import { describe, expect, test } from "bun:test";
import {
  isExemptPath,
  scanForOrphanedCapabilities,
  scanProductionIntegritySource,
  scanSourceForMissingSchemaSyntheticSuccess,
  scanSourceForMonetaryCompute,
  scanSourceForRuntimeFixtures,
  scanSourceForStubResponses,
  scanSourceForUserLiterals,
  validateCapabilityReachability,
} from "@/lib/production-integrity-scanner";
import { CAPABILITY_REACHABILITY_MANIFEST } from "@/lib/capability-reachability-manifest";

describe("§12.3: Capability reachability manifest (Requirement 19.1, 19.2)", () => {
  test("manifest has entries for every introduced capability", () => {
    expect(CAPABILITY_REACHABILITY_MANIFEST.length).toBeGreaterThan(10);
  });

  test("every manifest entry has id, kind, target, inbound, and via", () => {
    for (const entry of CAPABILITY_REACHABILITY_MANIFEST) {
      expect(typeof entry.id).toBe("string");
      expect(entry.id.length).toBeGreaterThan(0);
      expect(typeof entry.kind).toBe("string");
      expect(["ui", "scheduler", "external-callback", "library"]).toContain(entry.kind);
      expect(typeof entry.target).toBe("string");
      expect(entry.target.length).toBeGreaterThan(0);
      expect(typeof entry.inbound).toBe("string");
      expect(entry.inbound.length).toBeGreaterThan(0);
      expect(typeof entry.via).toBe("string");
      expect(entry.via.length).toBeGreaterThan(0);
    }
  });

  test("every manifest edge points at existing source files", () => {
    const findings = validateCapabilityReachability(process.cwd());
    expect(findings).toEqual([]);
  });

  test("no orphaned capabilities (every capability has an inbound edge)", () => {
    const findings = scanForOrphanedCapabilities(process.cwd());
    expect(findings).toEqual([]);
  });
});

describe("§12.3: Stub response scanner (Requirement 19.3)", () => {
  test("detects NOT_IMPLEMENTED", () => {
    const findings = scanSourceForStubResponses(
      'return jsonError("NOT_IMPLEMENTED", 501);',
      "src/app/api/example/route.ts"
    );
    expect(findings.some((f) => f.code === "STUB_RESPONSE")).toBe(true);
  });

  test("detects 'coming soon'", () => {
    const findings = scanSourceForStubResponses(
      'return { message: "coming soon" };',
      "src/app/api/example/route.ts"
    );
    expect(findings.some((f) => f.code === "STUB_RESPONSE")).toBe(true);
  });

  test("detects TODO: implement", () => {
    const findings = scanSourceForStubResponses(
      "// TODO: implement this endpoint",
      "src/app/api/example/route.ts"
    );
    expect(findings.some((f) => f.code === "STUB_RESPONSE")).toBe(true);
  });

  test("does not flag clean production code", () => {
    const findings = scanSourceForStubResponses(
      'export const ok = true;\nexport function handler() { return { ok: true }; }',
      "src/app/api/example/route.ts"
    );
    expect(findings).toEqual([]);
  });

  test("exempts test files", () => {
    const findings = scanSourceForStubResponses(
      'return jsonError("NOT_IMPLEMENTED", 501);',
      "src/lib/__tests__/example.test.ts"
    );
    expect(findings).toEqual([]);
  });
});

describe("§12.3: Runtime fixture scanner (Requirement 19.7, 19.10)", () => {
  test("detects Math.random()", () => {
    const findings = scanSourceForRuntimeFixtures(
      "const n = Math.random();",
      "src/components/dashboard/example.tsx"
    );
    expect(findings.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);
  });

  test("detects fakeDelay", () => {
    const findings = scanSourceForRuntimeFixtures(
      "await fakeDelay(1000);",
      "src/components/dashboard/example.tsx"
    );
    expect(findings.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);
  });

  test("detects artificialDelay", () => {
    const findings = scanSourceForRuntimeFixtures(
      "await artificialDelay(500);",
      "src/components/dashboard/example.tsx"
    );
    expect(findings.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);
  });

  test("does not flag clean code", () => {
    const findings = scanSourceForRuntimeFixtures(
      'export const data = await fetch("/api/data");',
      "src/components/dashboard/example.tsx"
    );
    expect(findings).toEqual([]);
  });

  test("exempts test files", () => {
    const findings = scanSourceForRuntimeFixtures(
      "const n = Math.random();",
      "src/lib/__tests__/example.test.ts"
    );
    expect(findings).toEqual([]);
  });
});

describe("§12.3: Monetary compute scanner (Requirement 19.11)", () => {
  test("detects computeBidPrice", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function computeBidPrice() { return 1; }",
      "src/lib/pricing.ts"
    );
    expect(findings.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);
  });

  test("detects calculateProration", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function calculateProration() { return 0; }",
      "src/lib/billing.ts"
    );
    expect(findings.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);
  });

  test("detects optimizeMargin", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function optimizeMargin() { return 0; }",
      "src/lib/billing.ts"
    );
    expect(findings.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);
  });

  test("detects recommendPrice", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function recommendPrice() { return 0; }",
      "src/lib/billing.ts"
    );
    expect(findings.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);
  });

  test("does not flag amount/currency validation comparisons", () => {
    const findings = scanSourceForMonetaryCompute(
      'if (amount === expectedAmount && currency === "SAR") { return true; }',
      "src/lib/billing.ts"
    );
    expect(findings).toEqual([]);
  });

  test("exempts test files", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function computeBidPrice() { return 1; }",
      "src/lib/__tests__/example.test.ts"
    );
    expect(findings).toEqual([]);
  });

  test("exempts frozen catalogs (document-templates)", () => {
    const findings = scanSourceForMonetaryCompute(
      "export function computeBidPrice() { return 1; }",
      "src/lib/document-templates/contract-templates.ts"
    );
    expect(findings).toEqual([]);
  });
});

describe("§12.3: User-visible literal scanner (Requirement 18.1, 18.5)", () => {
  test("detects JSX text without tr() in dashboard components", () => {
    const source = `export function Example() {
      return <div>Hello World</div>;
    }`;
    const findings = scanSourceForUserLiterals(source, "src/components/dashboard/example.tsx");
    expect(findings.some((f) => f.code === "USER_LITERAL")).toBe(true);
  });

  test("does not flag components that use tr()", () => {
    const source = `import { tr } from "@/lib/i18n";
    export function Example({ locale }) {
      return <div>{tr("appName", locale)}</div>;
    }`;
    const findings = scanSourceForUserLiterals(source, "src/components/dashboard/example.tsx");
    expect(findings).toEqual([]);
  });

  test("does not flag non-dashboard components", () => {
    const source = `export function Example() {
      return <div>Hello World</div>;
    }`;
    const findings = scanSourceForUserLiterals(source, "src/components/marketing/example.tsx");
    expect(findings).toEqual([]);
  });

  test("exempts test files", () => {
    const source = `export function Example() {
      return <div>Hello World</div>;
    }`;
    const findings = scanSourceForUserLiterals(source, "src/lib/__tests__/example.test.tsx");
    expect(findings).toEqual([]);
  });

  test("does not flag approved technical tokens", () => {
    const source = `export function Example() {
      return <div>NORA-1.2.3</div>;
    }`;
    const findings = scanSourceForUserLiterals(source, "src/components/dashboard/example.tsx");
    expect(findings).toEqual([]);
  });
});

describe("§12.3: Missing-schema synthetic success scanner (Requirement 19.7)", () => {
  test("detects synthetic 200 OK without database interaction", () => {
    const source = `export async function GET() {
      return NextResponse.json({ ok: true }, { status: 200 });
    }`;
    const findings = scanSourceForMissingSchemaSyntheticSuccess(
      source,
      "src/app/api/example/route.ts"
    );
    expect(findings.some((f) => f.code === "MISSING_SCHEMA_SYNTHETIC_SUCCESS")).toBe(true);
  });

  test("does not flag handlers with database interaction", () => {
    const source = `export async function GET() {
      const data = await db.user.findUnique({ where: { id: "1" } });
      return NextResponse.json({ ok: true }, { status: 200 });
    }`;
    const findings = scanSourceForMissingSchemaSyntheticSuccess(
      source,
      "src/app/api/example/route.ts"
    );
    expect(findings).toEqual([]);
  });

  test("does not flag non-API files", () => {
    const source = `export async function GET() {
      return NextResponse.json({ ok: true }, { status: 200 });
    }`;
    const findings = scanSourceForMissingSchemaSyntheticSuccess(
      source,
      "src/components/dashboard/example.tsx"
    );
    expect(findings).toEqual([]);
  });

  test("exempts test files", () => {
    const source = `export async function GET() {
      return NextResponse.json({ ok: true }, { status: 200 });
    }`;
    const findings = scanSourceForMissingSchemaSyntheticSuccess(
      source,
      "src/lib/__tests__/example.test.ts"
    );
    expect(findings).toEqual([]);
  });
});

describe("§12.3: Combined scanner (Requirement 19.10)", () => {
  test("scanProductionIntegritySource runs all scanners", () => {
    const source = `
      const n = Math.random();
      return jsonError("NOT_IMPLEMENTED", 501);
      export function computeBidPrice() { return 1; }
    `;
    const findings = scanProductionIntegritySource(source, "src/app/api/example/route.ts");
    expect(findings.some((f) => f.code === "STUB_RESPONSE")).toBe(true);
    expect(findings.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);
    expect(findings.some((f) => f.code === "MONETARY_COMPUTE")).toBe(true);
  });

  test("exempts test files from all scanners", () => {
    const source = `
      const n = Math.random();
      return jsonError("NOT_IMPLEMENTED", 501);
      export function computeBidPrice() { return 1; }
    `;
    const findings = scanProductionIntegritySource(source, "src/lib/__tests__/example.test.ts");
    expect(findings).toEqual([]);
  });

  test("exempts frozen catalogs from all scanners", () => {
    const source = `
      const n = Math.random();
      return jsonError("NOT_IMPLEMENTED", 501);
    `;
    const findings = scanProductionIntegritySource(
      source,
      "src/lib/document-templates/contract-templates.ts"
    );
    expect(findings).toEqual([]);
  });

  test("does not exempt production fallback data", () => {
    // Production fallback data is NOT exempt — it must be scanned.
    const source = `
      const fallbackData = { value: Math.random() };
      return jsonError("NOT_IMPLEMENTED", 501);
    `;
    const findings = scanProductionIntegritySource(
      source,
      "src/lib/fallback-data.ts"
    );
    expect(findings.some((f) => f.code === "STUB_RESPONSE")).toBe(true);
    expect(findings.some((f) => f.code === "RUNTIME_FIXTURE")).toBe(true);
  });
});

describe("§12.3: Exemption policy (Requirement 19.10)", () => {
  test("isExemptPath returns true for test files", () => {
    expect(isExemptPath("src/lib/__tests__/example.test.ts")).toBe(true);
    expect(isExemptPath("src/lib/__tests__/platform-completion/example.test.ts")).toBe(true);
  });

  test("isExemptPath returns true for frozen catalogs", () => {
    expect(isExemptPath("src/lib/document-templates/contract-templates.ts")).toBe(true);
    expect(isExemptPath("src/lib/document-templates/contract-template-renderer.ts")).toBe(true);
  });

  test("isExemptPath returns false for production code", () => {
    expect(isExemptPath("src/lib/billing.ts")).toBe(false);
    expect(isExemptPath("src/app/api/billing/checkout/route.ts")).toBe(false);
    expect(isExemptPath("src/components/dashboard/sidebar.tsx")).toBe(false);
  });
});
