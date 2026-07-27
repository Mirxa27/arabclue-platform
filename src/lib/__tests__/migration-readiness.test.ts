import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MIGRATION_READINESS_TIMEOUT_MS,
  checkMigrationReadiness,
  isConnectivityFailure,
  unappliedMigrationIds,
  unreadableLedgerReport,
} from "../migration-readiness";
import { MIGRATION_IDS } from "../migration-registry";

/**
 * Requirement 16.3, 16.4, 16.8 — the readiness comparison is read-only,
 * five-second bounded, never truncated, and never reports a ready state while a
 * declared migration is missing or the ledger is unreadable.
 *
 * Every case injects a ledger reader, so no test opens a database connection.
 */

const ALL_APPLIED = async () => [...MIGRATION_IDS];

describe("Requirement 16.3: read-only, bounded ledger comparison", () => {
  test("the five-second budget is the declared default", () => {
    expect(MIGRATION_READINESS_TIMEOUT_MS).toBe(5_000);
  });

  test("the module issues no data-definition or data-mutating statement", () => {
    const source = readFileSync(
      new URL("../migration-readiness.ts", import.meta.url),
      "utf8",
    );
    const sql = source.replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, "");
    for (const forbidden of [
      /\bCREATE\s+(?:TABLE|INDEX|SCHEMA|DATABASE)\b/i,
      /\bALTER\s+TABLE\b/i,
      /\bDROP\s+(?:TABLE|COLUMN|INDEX|SCHEMA|DATABASE)\b/i,
      /\bTRUNCATE\b/i,
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+"/i,
      /\bDELETE\s+FROM\b/i,
      /\$executeRaw/,
    ]) {
      expect(forbidden.test(sql)).toBe(false);
    }
  });

  test("reads the ledger exactly once per check", async () => {
    let calls = 0;
    await checkMigrationReadiness({
      readAppliedMigrations: async () => {
        calls += 1;
        return [...MIGRATION_IDS];
      },
    });
    expect(calls).toBe(1);
  });

  test("reports a whole-millisecond duration from the injected clock", async () => {
    let clock = 1_000;
    const report = await checkMigrationReadiness({
      readAppliedMigrations: ALL_APPLIED,
      now: () => {
        const value = clock;
        clock += 40;
        return value;
      },
    });
    expect(Number.isInteger(report.durationMs)).toBe(true);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("Requirement 16.4: pending migrations block readiness", () => {
  test("an empty ledger reports every declared migration, untruncated", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => [],
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect([...report.unapplied]).toEqual([...MIGRATION_IDS]);
    expect(report.unapplied.length).toBe(MIGRATION_IDS.length);
    expect(report.appliedCount).toBe(0);
    expect(report.declaredCount).toBe(MIGRATION_IDS.length);
    expect(report.capabilities.length).toBeGreaterThan(0);
  });

  test("a partially applied ledger reports only the missing identifiers in apply order", async () => {
    const applied = MIGRATION_IDS.slice(0, MIGRATION_IDS.length - 3);
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => [...applied],
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect([...report.unapplied]).toEqual([
      ...MIGRATION_IDS.slice(MIGRATION_IDS.length - 3),
    ]);
    expect(report.appliedCount).toBe(applied.length);
  });

  test("names the capabilities each unapplied migration affects", async () => {
    const report = await checkMigrationReadiness({
      declaredMigrationIds: ["20260725_phase4_proposal_system"],
      readAppliedMigrations: async () => [],
    });

    expect(report.capabilities).toContain("activity analytics");
    expect(report.capabilities).toContain("template marketplace");
  });

  test("a fully applied ledger reports ready with no unapplied identifier", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: ALL_APPLIED,
    });

    expect(report.ok).toBe(true);
    expect(report.code).toBeNull();
    expect(report.unapplied).toEqual([]);
    expect(report.capabilities).toEqual([]);
    expect(report.appliedCount).toBe(MIGRATION_IDS.length);
  });

  test("extra ledger rows from an out-of-band migration do not block readiness", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => [
        ...MIGRATION_IDS,
        "29991231000000_applied_out_of_band",
      ],
    });

    expect(report.ok).toBe(true);
    expect(report.appliedCount).toBe(MIGRATION_IDS.length);
  });
});

describe("Requirement 16.8: unreadable ledger never reports ready", () => {
  test("a timeout resolves to READINESS_TIMEOUT", async () => {
    const report = await checkMigrationReadiness({
      timeoutMs: 5,
      readAppliedMigrations: () =>
        new Promise((resolve) => setTimeout(() => resolve([]), 200)),
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("READINESS_TIMEOUT");
    expect(report.detail).toContain("5ms");
    expect([...report.unapplied]).toEqual([...MIGRATION_IDS]);
  });

  test("a connectivity failure resolves to READINESS_DATABASE_UNREACHABLE", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => {
        throw new Error("P1001: Can't reach database server at 127.0.0.1:1");
      },
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("READINESS_DATABASE_UNREACHABLE");
  });

  test("any other query failure resolves to READINESS_MIGRATION_QUERY_FAILED", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => {
        throw new Error(
          'relation "_prisma_migrations" does not exist for role reader',
        );
      },
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("READINESS_MIGRATION_QUERY_FAILED");
    expect(report.detail.length).toBeLessThanOrEqual(210);
  });

  test("a non-Error rejection still resolves to a stable code", async () => {
    const report = await checkMigrationReadiness({
      readAppliedMigrations: async () => {
        throw "ledger unavailable";
      },
    });

    expect(report.ok).toBe(false);
    expect(report.code).toBe("READINESS_MIGRATION_QUERY_FAILED");
  });

  test("connectivity classification distinguishes reachability from query errors", () => {
    expect(isConnectivityFailure(new Error("ECONNREFUSED 127.0.0.1:1"))).toBe(
      true,
    );
    expect(isConnectivityFailure(new Error("P1017"))).toBe(true);
    expect(isConnectivityFailure(new Error("permission denied"))).toBe(false);
  });

  test("the unreachable report keeps the full identifier and capability lists", () => {
    const report = unreadableLedgerReport(
      "READINESS_DATABASE_UNREACHABLE",
      "database unreachable; migration ledger not read",
    );

    expect(report.ok).toBe(false);
    expect(report.declaredCount).toBe(MIGRATION_IDS.length);
    expect([...report.unapplied]).toEqual([...MIGRATION_IDS]);
    expect(report.capabilities.length).toBeGreaterThan(0);
  });
});

describe("pure ledger difference", () => {
  test("preserves declared order and ignores applied order", () => {
    expect(unappliedMigrationIds(["a", "b", "c"], ["c", "a"])).toEqual(["b"]);
  });

  test("an empty declaration has nothing unapplied", () => {
    expect(unappliedMigrationIds([], ["a"])).toEqual([]);
  });
});
