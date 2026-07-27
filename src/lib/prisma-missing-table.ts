import { Prisma } from "@prisma/client";

/**
 * True when Prisma reports a schema object the connected database does not
 * contain (common on Neon while a migration is unapplied).
 *
 * Three driver conditions qualify, because all three mean the generated client
 * is ahead of the database and the request must fail closed with 503 rather than
 * a 500 (requirements 16.2, 16.7):
 * - `P2021` — the table does not exist;
 * - `P2022` — the table exists but a column the client selects does not, which
 *   is what an additive column-only migration produces while unapplied;
 * - `P2010` — a raw query failed, typically with `42P01 relation ... does not exist`.
 *
 * The name is retained for its existing call sites; the condition it recognizes
 * is "missing schema object", not strictly a missing table.
 */
export function isPrismaMissingTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === "P2021" || error.code === "P2022" || error.code === "P2010"
    );
  }
  if (error instanceof Error) {
    return /does not exist|P2021|P2022|P2010/i.test(error.message);
  }
  return false;
}

/**
 * Typed missing-relation failure recognized centrally by the API failure mapper
 * (requirements 16.2 and 16.7).
 *
 * Domain services throw this instead of returning an empty or synthesized
 * success payload. The mapper turns it into HTTP 503 `SCHEMA_MIGRATION_PENDING`
 * carrying the relation name and both languages. The relation name is supplied
 * by the caller — `schema-guard.ts` owns extraction from driver errors — so this
 * module stays free of a circular dependency on the guard.
 */
export class SchemaMigrationPendingError extends Error {
  readonly code = "SCHEMA_MIGRATION_PENDING" as const;
  readonly status = 503 as const;
  /** Relation reported missing, or `null` when the driver named none. */
  readonly missingTable: string | null;

  constructor(
    missingTable: string | null,
    options?: { readonly cause?: unknown; readonly message?: string }
  ) {
    super(
      options?.message ??
        `Schema migration pending for relation ${missingTable ?? "unknown"}`
    );
    this.name = "SchemaMigrationPendingError";
    this.missingTable = missingTable;
    if (options && "cause" in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** True for the typed schema-pending failure. */
export function isSchemaMigrationPendingError(
  error: unknown
): error is SchemaMigrationPendingError {
  return error instanceof SchemaMigrationPendingError;
}
