import { MIGRATIONS, type MigrationRecord } from "./migration-registry";

/**
 * Runbook synchronization — Requirement 16.6.
 *
 * The production deployment runbook must document every migration with its
 * identifier, affected capabilities, ordered apply position, and either its
 * reverse action or an explicit statement that it has no reverse action.
 *
 * That table is *generated* from `migration-registry.ts` and validated by
 * executable code, so the runbook can never become an independent
 * hand-maintained second registry that silently drifts from the migration
 * directory. `scripts/sync-migration-runbook.mjs --write` rewrites the block and
 * `--check` (the default, also wired into `bun run deploy:safety`) fails when the
 * committed document differs from the generated output by a single byte.
 */

/** Path of the runbook, relative to the repository root. */
export const MIGRATION_RUNBOOK_PATH = "docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md";

/** Command an operator runs to repair a stale runbook. */
export const MIGRATION_RUNBOOK_SYNC_COMMAND =
  "bun scripts/sync-migration-runbook.mjs --write";

export const MIGRATION_LEDGER_BEGIN =
  "<!-- BEGIN GENERATED MIGRATION LEDGER — generated from src/lib/migration-registry.ts; do not edit by hand -->";
export const MIGRATION_LEDGER_END = "<!-- END GENERATED MIGRATION LEDGER -->";

export type MigrationRunbookCode =
  | "MIGRATION_RUNBOOK_MARKERS_MISSING"
  | "MIGRATION_RUNBOOK_MARKERS_OUT_OF_ORDER"
  | "MIGRATION_RUNBOOK_STALE";

export interface MigrationRunbookValidation {
  readonly ok: boolean;
  readonly code: MigrationRunbookCode | null;
  /** Operator-facing explanation. Never contains tenant data. */
  readonly detail: string;
  /** Declared identifiers the committed document does not document. */
  readonly missingMigrations: readonly string[];
  /** Identifiers the committed document documents that are no longer declared. */
  readonly staleMigrations: readonly string[];
}

/** Escapes the cell separator so a reverse action containing `|` cannot break the table. */
function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function capabilityList(migration: MigrationRecord): string {
  return migration.capabilities.join(", ");
}

function createdTables(migration: MigrationRecord): string {
  if (migration.createsTables.length === 0) {
    return "none — adds columns, indexes, or constraints only";
  }
  return migration.createsTables.map((table) => `\`${table}\``).join(", ");
}

function reverseAction(migration: MigrationRecord): string {
  return (
    migration.reverse ??
    "**None.** This migration has no reverse action; recover forward or restore the pre-release restore point."
  );
}

function renderIndexTable(migrations: readonly MigrationRecord[]): string {
  const rows = migrations.map(
    (migration) =>
      `| ${migration.position} | \`${migration.id}\` | ${
        migration.reverse === null ? "none" : "documented below"
      } | ${tableCell(capabilityList(migration))} |`
  );
  return [
    "| # | Migration identifier | Reverse action | Affected capabilities |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderMigrationSection(
  migration: MigrationRecord,
  total: number
): string {
  return [
    `### ${migration.position}. \`${migration.id}\``,
    "",
    `- **Apply position:** ${migration.position} of ${total}`,
    `- **Capabilities:** ${capabilityList(migration)}`,
    `- **Tables created:** ${createdTables(migration)}`,
    `- **Reverse action:** ${reverseAction(migration)}`,
  ].join("\n");
}

/**
 * The complete generated ledger block, markers included.
 *
 * The returned string is the single authority for the runbook region; the
 * validator compares it byte-for-byte with the committed document.
 */
export function renderMigrationLedger(
  migrations: readonly MigrationRecord[] = MIGRATIONS
): string {
  const total = migrations.length;
  const sections = migrations.map((migration) =>
    renderMigrationSection(migration, total)
  );

  return [
    MIGRATION_LEDGER_BEGIN,
    "",
    "## Migration ledger",
    "",
    `All ${total} migrations under \`prisma/migrations\` are listed below with their`,
    "identifiers, the capabilities they affect, their positions in the apply sequence,",
    "and their reverse actions. Prisma applies migrations in lexicographic directory",
    "order, so the positions below are the apply order.",
    "",
    "`GET /api/ready` compares this set against the `_prisma_migrations` ledger of the",
    "connected database and reports a not-ready state carrying",
    "`SCHEMA_MIGRATION_PENDING`, every unapplied identifier, and the affected",
    "capability names while any migration is absent. That readiness comparison is",
    "read-only and issues no data-definition statement.",
    "",
    "This block is generated from `src/lib/migration-registry.ts`. Do not edit it by",
    `hand: run \`${MIGRATION_RUNBOOK_SYNC_COMMAND}\` after changing the registry.`,
    "`bun run deploy:safety` and `src/lib/__tests__/migration-runbook.test.ts` both",
    "fail while this block differs from the registry, and",
    "`src/lib/__tests__/migration-registry.test.ts` fails while the registry differs",
    "from the migration directory.",
    "",
    "Apply the whole sequence with one `bun run db:migrate:deploy` from the",
    "controlled release job. Never apply a subset by hand.",
    "",
    renderIndexTable(migrations),
    "",
    ...sections.flatMap((section) => [section, ""]),
    MIGRATION_LEDGER_END,
  ].join("\n");
}

interface LedgerRegion {
  readonly beginIndex: number;
  readonly endIndex: number;
}

function locateLedgerRegion(document: string): LedgerRegion | null {
  const beginIndex = document.indexOf(MIGRATION_LEDGER_BEGIN);
  const endIndex = document.indexOf(MIGRATION_LEDGER_END);
  if (beginIndex === -1 || endIndex === -1) return null;
  return { beginIndex, endIndex };
}

/**
 * The committed document with the generated ledger block replaced.
 *
 * Content outside the markers is preserved exactly, so the hand-written release
 * procedure around the ledger is never rewritten by the generator.
 */
export function applyMigrationLedger(
  document: string,
  migrations: readonly MigrationRecord[] = MIGRATIONS
): string {
  const region = locateLedgerRegion(document);
  if (!region) {
    throw new Error(
      `${MIGRATION_RUNBOOK_PATH} is missing the generated migration ledger markers`
    );
  }
  if (region.endIndex < region.beginIndex) {
    throw new Error(
      `${MIGRATION_RUNBOOK_PATH} has the generated migration ledger markers out of order`
    );
  }
  return (
    document.slice(0, region.beginIndex) +
    renderMigrationLedger(migrations) +
    document.slice(region.endIndex + MIGRATION_LEDGER_END.length)
  );
}

/** Identifiers the committed document documents with a generated section heading. */
export function documentedMigrationIds(document: string): readonly string[] {
  const ids: string[] = [];
  const pattern = /^### \d+\. `([^`]+)`$/gm;
  for (const match of document.matchAll(pattern)) ids.push(match[1]);
  return ids;
}

/**
 * Validates that the committed runbook carries the generated ledger unchanged.
 * Never throws: every failure mode resolves to a stable code.
 */
export function validateMigrationRunbook(
  document: string,
  migrations: readonly MigrationRecord[] = MIGRATIONS
): MigrationRunbookValidation {
  const declared = migrations.map((migration) => migration.id);
  const documented = documentedMigrationIds(document);
  const missingMigrations = declared.filter((id) => !documented.includes(id));
  const staleMigrations = documented.filter((id) => !declared.includes(id));

  const region = locateLedgerRegion(document);
  if (!region) {
    return {
      ok: false,
      code: "MIGRATION_RUNBOOK_MARKERS_MISSING",
      detail: `${MIGRATION_RUNBOOK_PATH} is missing the generated migration ledger markers; run \`${MIGRATION_RUNBOOK_SYNC_COMMAND}\``,
      missingMigrations,
      staleMigrations,
    };
  }
  if (region.endIndex < region.beginIndex) {
    return {
      ok: false,
      code: "MIGRATION_RUNBOOK_MARKERS_OUT_OF_ORDER",
      detail: `${MIGRATION_RUNBOOK_PATH} has the generated migration ledger end marker before its begin marker`,
      missingMigrations,
      staleMigrations,
    };
  }

  const expected = renderMigrationLedger(migrations);
  const actual = document.slice(
    region.beginIndex,
    region.endIndex + MIGRATION_LEDGER_END.length
  );
  if (actual === expected) {
    return {
      ok: true,
      code: null,
      detail: `${MIGRATION_RUNBOOK_PATH} documents all ${declared.length} declared migrations`,
      missingMigrations: [],
      staleMigrations: [],
    };
  }

  const reasons: string[] = [];
  if (missingMigrations.length > 0) {
    reasons.push(`undocumented: ${missingMigrations.join(", ")}`);
  }
  if (staleMigrations.length > 0) {
    reasons.push(`no longer declared: ${staleMigrations.join(", ")}`);
  }
  if (reasons.length === 0) {
    reasons.push(
      `first difference at offset ${firstDifferenceOffset(expected, actual)} of the generated block`
    );
  }

  return {
    ok: false,
    code: "MIGRATION_RUNBOOK_STALE",
    detail: `${MIGRATION_RUNBOOK_PATH} is out of date with src/lib/migration-registry.ts (${reasons.join("; ")}); run \`${MIGRATION_RUNBOOK_SYNC_COMMAND}\``,
    missingMigrations,
    staleMigrations,
  };
}

function firstDifferenceOffset(expected: string, actual: string): number {
  const limit = Math.min(expected.length, actual.length);
  for (let index = 0; index < limit; index += 1) {
    if (expected[index] !== actual[index]) return index;
  }
  return limit;
}
