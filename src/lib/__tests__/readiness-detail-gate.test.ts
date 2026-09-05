import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  READINESS_TOKEN_HEADER,
  publicReadinessBody,
  readinessTokenAuthorizes,
  roleMayViewReadinessDetails,
} from "../readiness-detail-gate";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const SECRET = "0123456789abcdef-cron-secret";

describe("readinessTokenAuthorizes", () => {
  test("accepts the exact CRON_SECRET", () => {
    expect(readinessTokenAuthorizes(SECRET, SECRET)).toBe(true);
    expect(readinessTokenAuthorizes(`  ${SECRET} `, SECRET)).toBe(true);
  });

  test("refuses a wrong, empty, or absent token", () => {
    expect(readinessTokenAuthorizes(`${SECRET}x`, SECRET)).toBe(false);
    expect(readinessTokenAuthorizes("", SECRET)).toBe(false);
    expect(readinessTokenAuthorizes(null, SECRET)).toBe(false);
    expect(readinessTokenAuthorizes(undefined, SECRET)).toBe(false);
  });

  test("refuses everything when CRON_SECRET is unset or too short", () => {
    // An unset secret must not make an empty header "match".
    expect(readinessTokenAuthorizes("", undefined)).toBe(false);
    expect(readinessTokenAuthorizes("short", "short")).toBe(false);
  });
});

describe("roleMayViewReadinessDetails", () => {
  test("platform administrators only", () => {
    expect(roleMayViewReadinessDetails("ADMIN")).toBe(true);
    expect(roleMayViewReadinessDetails("SUPER_ADMIN")).toBe(true);
    expect(roleMayViewReadinessDetails("BIDDER")).toBe(false);
    expect(roleMayViewReadinessDetails("REVIEWER")).toBe(false);
    expect(roleMayViewReadinessDetails(undefined)).toBe(false);
    expect(roleMayViewReadinessDetails(null)).toBe(false);
  });
});

describe("publicReadinessBody", () => {
  test("keeps only ready, service, and time", () => {
    // Arrange
    const report = {
      ready: false,
      service: "arabclue",
      time: "2026-09-05T12:00:00.000Z",
      checks: { database: { ok: false, detail: "database_unavailable" } },
      schema: { unappliedMigrations: ["20260905120000_hot_path_indexes"] },
    };

    // Act
    const body = publicReadinessBody(report);

    // Assert
    expect(body).toEqual({
      ready: false,
      service: "arabclue",
      time: "2026-09-05T12:00:00.000Z",
    });
    expect("checks" in body).toBe(false);
    expect("schema" in body).toBe(false);
  });
});

describe("the ready route applies the gate", () => {
  const source = read("src/app/api/ready/route.ts");

  test("anonymous callers get the public body; the token header is the documented one", () => {
    expect(source).toContain("publicReadinessBody(report)");
    expect(source).toContain("READINESS_TOKEN_HEADER");
    expect(READINESS_TOKEN_HEADER).toBe("x-readiness-token");
  });

  test("the full report is cached briefly and AI/email facets never gate readiness", () => {
    expect(source).toMatch(/REPORT_CACHE_TTL_MS = 5_000/);
    expect(source).toContain('"aiEngines"');
    expect(source).toContain('"aiCredential"');
    expect(source).toContain('"email"');
    expect(source).not.toContain("none_active_deterministic_fallback");
  });
});
