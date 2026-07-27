import { NextResponse } from "next/server";
import { isPrismaMissingTable } from "./prisma-missing-table";
import { migrationForTable } from "./migration-registry";

/**
 * Schema_Guard — Requirement 16.2 and 16.7.
 *
 * When a route handler reaches a table the connected database does not contain,
 * the platform must fail closed with HTTP 503, the stable code
 * `SCHEMA_MIGRATION_PENDING`, the missing table name, and an Arabic and English
 * message. It must never answer with a success status carrying an empty or
 * synthesized result, and it must never issue DDL to repair the schema.
 */

export const SCHEMA_MIGRATION_PENDING = "SCHEMA_MIGRATION_PENDING" as const;

/**
 * Name of the schema object a Prisma missing-schema error reports.
 *
 * Covers the shapes Prisma produces:
 * - P2021: `The table \`public.AnalyticsEvent\` does not exist in the current database.`
 * - P2022: `The column \`User.emailVerified\` does not exist in the current database.`
 * - P2010: `Raw query failed. Code: \`42P01\`. Message: \`relation "CollaborationComment" does not exist\``
 *
 * A missing column is reported as the qualified `Table.column` identifier rather
 * than the bare table. The table alone would resolve through
 * `migrationForTable` to whichever migration *created* that table — already
 * applied — and would name the wrong migration and the wrong capabilities. The
 * qualified identifier matches no `createsTables` entry, so no migration is
 * attributed and the operator is pointed at `/api/ready`, which compares the
 * whole ledger and names the genuinely unapplied migrations.
 */
export function extractMissingTableName(error: unknown): string | null {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return null;

  // `The column `User.emailVerified` does not exist` — checked before the table
  // patterns because the column message names no table.
  const backtickedColumn = message.match(/column\s+`([^`]+)`/i);
  if (backtickedColumn?.[1]) return qualifiedColumnName(backtickedColumn[1]);

  // `column User.emailVerified does not exist`
  const bareColumn = message.match(
    /column\s+([A-Za-z0-9_.]+)\s+does not exist/i
  );
  if (bareColumn?.[1]) return qualifiedColumnName(bareColumn[1]);

  // `The table `public.Foo` does not exist` / `The table `Foo` does not exist`
  const backticked = message.match(/table\s+`([^`]+)`/i);
  if (backticked?.[1]) return stripSchemaQualifier(backticked[1]);

  // `relation "public.Foo" does not exist` / `relation "Foo" does not exist`
  const quoted = message.match(/relation\s+"([^"]+)"/i);
  if (quoted?.[1]) return stripSchemaQualifier(quoted[1]);

  // Prisma model-level phrasing: `The table Foo does not exist in the current database.`
  const bare = message.match(/table\s+([A-Za-z0-9_.]+)\s+does not exist/i);
  if (bare?.[1]) return stripSchemaQualifier(bare[1]);

  return null;
}

function stripSchemaQualifier(identifier: string): string {
  const trimmed = identifier.trim().replace(/^"|"$/g, "");
  const lastDot = trimmed.lastIndexOf(".");
  return lastDot >= 0 ? trimmed.slice(lastDot + 1) : trimmed;
}

/**
 * `Table.column` for a missing column, dropping any leading schema qualifier so
 * `public.User.emailVerified` and `User.emailVerified` report identically.
 */
function qualifiedColumnName(identifier: string): string {
  const segments = identifier
    .trim()
    .replace(/^"|"$/g, "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) return identifier.trim();
  return segments.slice(-2).join(".");
}

export interface SchemaMigrationPendingBody {
  readonly error: { readonly ar: string; readonly en: string };
  readonly code: typeof SCHEMA_MIGRATION_PENDING;
  /** Missing table name, or `null` when the driver did not report one. */
  readonly missingTable: string | null;
  /** Identifier of the migration that creates the missing table, when known. */
  readonly migration: string | null;
  /** Capability names blocked while the migration is unapplied. */
  readonly capabilities: readonly string[];
}

/** Bilingual body for a missing-table condition. Never contains tenant data. */
export function schemaMigrationPendingBody(
  error: unknown
): SchemaMigrationPendingBody {
  const missingTable = extractMissingTableName(error);
  const migration = missingTable ? migrationForTable(missingTable) : null;
  const tableEn = missingTable ?? "unknown";
  const tableAr = missingTable ?? "غير معروف";

  return {
    error: {
      ar: `ترحيل مخطط قاعدة البيانات قيد الانتظار: الجدول «${tableAr}» غير موجود في قاعدة البيانات المتصلة. لم يُحفظ أي تغيير. يرجى تطبيق الترحيلات ثم إعادة المحاولة.`,
      en: `Database schema migration pending: table "${tableEn}" is absent from the connected database. No change was saved. Apply the migrations and retry.`,
    },
    code: SCHEMA_MIGRATION_PENDING,
    missingTable,
    migration: migration?.id ?? null,
    capabilities: migration?.capabilities ?? [],
  };
}

/**
 * HTTP 503 response for a missing-table condition.
 *
 * Fails closed: the caller must return this instead of an empty success body.
 */
export function schemaMigrationPendingResponse(error: unknown): NextResponse {
  return NextResponse.json(schemaMigrationPendingBody(error), { status: 503 });
}

/**
 * Route-handler guard. Returns the bilingual 503 when `error` is a missing-table
 * error, or `null` when the caller should keep its own error handling.
 *
 * ```ts
 * catch (error) {
 *   const pending = schemaGuard(error);
 *   if (pending) return pending;
 *   throw error;
 * }
 * ```
 */
export function schemaGuard(error: unknown): NextResponse | null {
  return isPrismaMissingTable(error) ? schemaMigrationPendingResponse(error) : null;
}

/**
 * Runs `operation`, converting a missing-table failure into the bilingual 503.
 * Any other failure propagates unchanged so existing handling still applies.
 */
export async function withSchemaGuard(
  operation: () => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    return await operation();
  } catch (error) {
    const pending = schemaGuard(error);
    if (pending) return pending;
    throw error;
  }
}
