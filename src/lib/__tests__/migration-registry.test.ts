import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATIONS,
  MIGRATION_IDS,
  PLATFORM_COMPLETION_SPEC,
  capabilitiesForMigrations,
  migrationForTable,
  migrationsIntroducedBySpec,
} from "../migration-registry";
import {
  formatMigrationSqlViolations,
  migrationSqlViolations,
  parseMigrationSql,
} from "../migration-sql-policy";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => statSync(join(MIGRATIONS_DIR, entry)).isDirectory())
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function migrationSql(id: string): string {
  return readFileSync(join(MIGRATIONS_DIR, id, "migration.sql"), "utf8");
}

describe("migration registry parity with prisma/migrations", () => {
  test("declares exactly the migrations present on disk", () => {
    expect([...MIGRATION_IDS]).toEqual(migrationDirectories());
  });

  test("every declared migration has a migration.sql file", () => {
    for (const id of MIGRATION_IDS) {
      expect(() => migrationSql(id)).not.toThrow();
    }
  });

  test("positions are 1-based, contiguous, and match lexicographic apply order", () => {
    const positions = MIGRATIONS.map((m) => m.position);
    expect(positions).toEqual(MIGRATIONS.map((_, index) => index + 1));

    const sorted = [...MIGRATION_IDS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect([...MIGRATION_IDS]).toEqual(sorted);
  });

  test("identifiers are unique", () => {
    expect(new Set(MIGRATION_IDS).size).toBe(MIGRATION_IDS.length);
  });

  test("every migration names at least one affected capability", () => {
    for (const migration of MIGRATIONS) {
      expect(migration.capabilities.length).toBeGreaterThan(0);
      for (const capability of migration.capabilities) {
        expect(capability.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("every migration declares a reverse action or an explicit absence", () => {
    for (const migration of MIGRATIONS) {
      expect(migration.reverse === null || migration.reverse.length > 0).toBe(true);
    }
  });

  test("declared created tables match the CREATE TABLE statements on disk", () => {
    for (const migration of MIGRATIONS) {
      const sql = migrationSql(migration.id);
      const created = new Set<string>();
      const pattern = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"([A-Za-z0-9_]+)"/gi;
      for (const match of sql.matchAll(pattern)) {
        created.add(match[1]);
      }
      // `_prisma_migrations` is managed by Prisma itself, never by our SQL.
      created.delete("_prisma_migrations");
      expect([...created].sort()).toEqual([...migration.createsTables].sort());
    }
  });

  test("only the platform-completion baseline is marked as introduced by that spec", () => {
    expect(
      migrationsIntroducedBySpec(PLATFORM_COMPLETION_SPEC).map((m) => m.id)
    ).toEqual(["20260726000000_platform_completion"]);
    expect(migrationsIntroducedBySpec("unknown-spec")).toEqual([]);
    expect(migrationsIntroducedBySpec("")).toEqual([]);
  });

  test("the five named platform-completion prerequisites are declared", () => {
    const required = [
      "20260724231500_proposal_structured_snapshot",
      "20260725001000_knowledge_evidence_integrity",
      "20260725003000_contract_draft_persistence",
      "20260725004000_contract_render_snapshot",
      "20260725_phase4_proposal_system",
    ];
    for (const id of required) {
      expect(MIGRATION_IDS).toContain(id);
    }
  });
});

describe("capability resolution", () => {
  test("resolves the union of capabilities for the supplied migrations", () => {
    const capabilities = capabilitiesForMigrations([
      "20260725_phase4_proposal_system",
    ]);
    expect(capabilities).toContain("activity analytics");
    expect(capabilities).toContain("template marketplace");
  });

  test("deduplicates capabilities shared by several migrations", () => {
    const capabilities = capabilitiesForMigrations([...MIGRATION_IDS]);
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  test("reports an unregistered identifier rather than dropping it", () => {
    expect(capabilitiesForMigrations(["99999999_not_declared"])).toEqual([
      "unregistered migration 99999999_not_declared",
    ]);
  });

  test("empty input yields no capabilities", () => {
    expect(capabilitiesForMigrations([])).toEqual([]);
  });
});

describe("migrationForTable", () => {
  test("maps a created table to its migration", () => {
    expect(migrationForTable("WorkspaceInvitation")?.id).toBe(
      "20260726000000_platform_completion"
    );
    expect(migrationForTable("AnalyticsEvent")?.id).toBe(
      "20260725_phase4_proposal_system"
    );
  });

  test("is case-insensitive and whitespace tolerant", () => {
    expect(migrationForTable("  analyticsevent  ")?.id).toBe(
      "20260725_phase4_proposal_system"
    );
  });

  test("returns null for an unknown or empty table name", () => {
    expect(migrationForTable("NotATable")).toBeNull();
    expect(migrationForTable("")).toBeNull();
    expect(migrationForTable("   ")).toBeNull();
  });
});

/**
 * Property 32 is owned by
 * `__tests__/platform-completion/property-32-migration-sql.test.ts`, which
 * enforces the full additive policy on the migrations this specification
 * introduces. The checks below reuse the same parser — never a second
 * implementation — to keep the destructive rules applied to every migration on
 * disk, including the ones that predate the specification. Those older files are
 * not held to the additive statement vocabulary, hence
 * `allowUnclassifiedStatements`.
 */
describe("no migration on disk removes, renames, retypes, or empties schema", () => {
  const LEGACY_POLICY = { allowUnclassifiedStatements: true } as const;

  test("every migration file parses into at least one statement", () => {
    for (const id of MIGRATION_IDS) {
      expect(parseMigrationSql(migrationSql(id)).length).toBeGreaterThan(0);
    }
  });

  test("no migration drops, renames, retypes, or truncates existing schema", () => {
    const offences: string[] = [];
    for (const id of MIGRATION_IDS) {
      offences.push(
        ...formatMigrationSqlViolations(
          migrationSqlViolations(migrationSql(id), LEGACY_POLICY),
          id
        )
      );
    }
    expect(offences).toEqual([]);
  });
});
