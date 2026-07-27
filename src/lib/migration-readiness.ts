import { db } from "./db";
import {
  MIGRATION_IDS,
  capabilitiesForMigrations,
} from "./migration-registry";

/**
 * Migration readiness — Requirement 16.3, 16.4, and 16.8.
 *
 * Compares every migration declared for `prisma/migrations` against the
 * `_prisma_migrations` ledger of the connected database. The comparison is
 * strictly read-only: it issues one `SELECT` and never emits a data-definition
 * statement, so a probe can never repair, create, or alter a schema object.
 *
 * The whole check is bounded by a five-second deadline and reports every
 * unapplied identifier without truncation, separately from the liveness result
 * served by `/api/health`.
 */

/** Hard budget for the whole check, per Requirement 16.3. */
export const MIGRATION_READINESS_TIMEOUT_MS = 5_000;

export type MigrationReadinessCode =
  | "SCHEMA_MIGRATION_PENDING"
  | "READINESS_DATABASE_UNREACHABLE"
  | "READINESS_MIGRATION_QUERY_FAILED"
  | "READINESS_TIMEOUT";

export interface MigrationReadinessReport {
  readonly ok: boolean;
  /** Stable machine-readable code. Absent only when every migration is applied. */
  readonly code: MigrationReadinessCode | null;
  /** Every declared migration identifier absent from the ledger, in apply order. Never truncated. */
  readonly unapplied: readonly string[];
  /** Capability names blocked by the unapplied migrations. */
  readonly capabilities: readonly string[];
  /** Count of declared migrations the ledger reports as applied. */
  readonly appliedCount: number;
  /** Count of migrations declared for `prisma/migrations`. */
  readonly declaredCount: number;
  /** Wall-clock duration of the check in whole milliseconds. */
  readonly durationMs: number;
  /** Short diagnostic for the operator. Never contains tenant data. */
  readonly detail: string;
}

/**
 * Reads the migration names the connected database records as applied.
 * Injectable so unit tests exercise every branch without a database connection.
 */
export type AppliedMigrationReader = () => Promise<readonly string[]>;

export interface MigrationReadinessOptions {
  /** Deadline for the whole check. Defaults to {@link MIGRATION_READINESS_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Ledger reader. Defaults to the read-only `_prisma_migrations` query. */
  readonly readAppliedMigrations?: AppliedMigrationReader;
  /** Declared identifiers to compare. Defaults to the migration registry. */
  readonly declaredMigrationIds?: readonly string[];
  /** Injectable clock, in epoch milliseconds. */
  readonly now?: () => number;
}

interface LedgerRow {
  migration_name: string;
}

/**
 * Migration names the ledger reports as successfully applied and not rolled back.
 *
 * Prisma marks a completed migration with a non-null `finished_at` and leaves
 * `rolled_back_at` null. A migration that failed part way through, or that was
 * rolled back, is therefore correctly reported as unapplied.
 */
export const readAppliedMigrationNames: AppliedMigrationReader = async () => {
  const rows = await db.$queryRaw<LedgerRow[]>`
    SELECT "migration_name"
    FROM "_prisma_migrations"
    WHERE "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
  `;
  return rows.map((row) => row.migration_name);
};

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<{ timedOut: false; value: T } | { timedOut: true; value: null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true, value: null });
    }, timeoutMs);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function isConnectivityFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /can't reach database|connection (refused|closed|terminated)|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|P1001|P1002|P1017/i.test(
    message
  );
}

/**
 * Declared identifiers the ledger does not report as applied, in apply order.
 * Pure: the caller supplies both sides of the comparison.
 */
export function unappliedMigrationIds(
  declared: readonly string[],
  applied: Iterable<string>
): readonly string[] {
  const appliedSet = new Set(applied);
  return declared.filter((id) => !appliedSet.has(id));
}

/**
 * Not-ready report for a database the probe could not reach or read.
 *
 * Requirement 16.8 forbids a ready state here, and Requirement 16.4 still
 * requires the full unapplied identifier and capability lists, so an unreadable
 * ledger reports every declared migration as unapplied rather than an empty set.
 */
export function unreadableLedgerReport(
  code: Exclude<MigrationReadinessCode, "SCHEMA_MIGRATION_PENDING">,
  detail: string,
  declaredMigrationIds: readonly string[] = MIGRATION_IDS,
  durationMs = 0
): MigrationReadinessReport {
  return {
    ok: false,
    code,
    unapplied: declaredMigrationIds,
    capabilities: capabilitiesForMigrations(declaredMigrationIds),
    appliedCount: 0,
    declaredCount: declaredMigrationIds.length,
    durationMs,
    detail,
  };
}

/**
 * Runs the readiness comparison. Never throws: every failure mode resolves to a
 * not-ready report carrying a stable code, per Requirement 16.8.
 */
export async function checkMigrationReadiness(
  options: MigrationReadinessOptions = {}
): Promise<MigrationReadinessReport> {
  const {
    timeoutMs = MIGRATION_READINESS_TIMEOUT_MS,
    readAppliedMigrations = readAppliedMigrationNames,
    declaredMigrationIds = MIGRATION_IDS,
    now = Date.now,
  } = options;

  const startedAt = now();
  const declaredCount = declaredMigrationIds.length;
  const elapsed = () => Math.max(0, now() - startedAt);

  let applied: readonly string[];
  try {
    const outcome = await withTimeout(readAppliedMigrations(), timeoutMs);
    if (outcome.timedOut) {
      return unreadableLedgerReport(
        "READINESS_TIMEOUT",
        `migration ledger query exceeded ${timeoutMs}ms`,
        declaredMigrationIds,
        elapsed()
      );
    }
    applied = outcome.value;
  } catch (error) {
    if (isConnectivityFailure(error)) {
      return unreadableLedgerReport(
        "READINESS_DATABASE_UNREACHABLE",
        "database unreachable while reading the migration ledger",
        declaredMigrationIds,
        elapsed()
      );
    }
    return unreadableLedgerReport(
      "READINESS_MIGRATION_QUERY_FAILED",
      error instanceof Error
        ? `migration ledger unreadable: ${error.message.slice(0, 160)}`
        : "migration ledger unreadable",
      declaredMigrationIds,
      elapsed()
    );
  }

  const unapplied = unappliedMigrationIds(declaredMigrationIds, applied);
  const appliedCount = declaredCount - unapplied.length;

  if (unapplied.length > 0) {
    return {
      ok: false,
      code: "SCHEMA_MIGRATION_PENDING",
      unapplied,
      capabilities: capabilitiesForMigrations(unapplied),
      appliedCount,
      declaredCount,
      durationMs: elapsed(),
      detail: `${unapplied.length} of ${declaredCount} declared migrations are not recorded as applied`,
    };
  }

  return {
    ok: true,
    code: null,
    unapplied: [],
    capabilities: [],
    appliedCount,
    declaredCount,
    durationMs: elapsed(),
    detail: `all ${declaredCount} declared migrations applied`,
  };
}
