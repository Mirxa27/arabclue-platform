/**
 * Off-platform logical backups of the production database.
 *
 * Neon's Free plan keeps six hours of history. On 2026-09-06 the production
 * schema was reset by a mis-targeted `prisma migrate diff`, and that window had
 * closed before anyone could restore — every row was lost. This module is the
 * answer: a daily, self-contained dump that lives somewhere Neon cannot reach
 * (Vercel Blob in production, a local folder elsewhere), so the recovery
 * question is never again "was it within six hours?".
 *
 * Format — one gzip'd JSON document per run:
 *   { version, takenAt, database, tables: { [Table]: Row[] }, counts }
 * Rows are read with `SELECT *` through Prisma's raw layer, so pgvector and
 * tsvector columns arrive as their text form and every table is covered,
 * including ones the Prisma client has no model for (`_prisma_migrations`).
 *
 * Restore is `restoreDatabaseBackup`: it disables triggers per table for the
 * transaction (so foreign-key order and the two FK cycles in the contract
 * template models do not matter), truncates, and re-inserts. It refuses to run
 * against a database that has more rows than the dump unless forced, because
 * the most likely mistake is restoring an old dump over a live tenant.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";
import { db } from "./db";

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_PREFIX = "backups/database";
/** Days of daily dumps to keep. Beyond this, the oldest are deleted after a successful run. */
export const BACKUP_RETENTION_DAYS = 30;
/** Transient counters; regenerated within minutes and not worth the dump size. */
export const BACKUP_EXCLUDED_TABLES: readonly string[] = ["RateLimitWindow", "RateLimitLease"];

/** Columns Postgres computes itself; they must not be present in an INSERT. */
const GENERATED_COLUMNS: Record<string, readonly string[]> = {
  DocumentChunk: ["tsv"],
};

export type BackupDocument = {
  version: number;
  takenAt: string;
  database: string;
  tables: Record<string, Array<Record<string, unknown>>>;
  counts: Record<string, number>;
};

export type BackupSummary = {
  key: string;
  takenAt: string;
  bytes: number;
  tables: number;
  rows: number;
  destination: "blob" | "local";
  pruned: string[];
};

// JSON.stringify runs `toJSON()` (Date → string, Buffer → {type,data}) before
// the replacer sees the value, so the original is read from the holder.
function jsonReplacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (typeof raw === "bigint") return { $bigint: raw.toString() };
  if (raw instanceof Date) return { $date: raw.toISOString() };
  if (Buffer.isBuffer(raw)) return { $bytes: raw.toString("base64") };
  return value;
}

function jsonReviver(_key: string, value: unknown) {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.$bigint === "string") return BigInt(record.$bigint);
    if (typeof record.$date === "string") return new Date(record.$date);
    if (typeof record.$bytes === "string") return Buffer.from(record.$bytes, "base64");
  }
  return value;
}

export function encodeBackup(doc: BackupDocument): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(doc, jsonReplacer), "utf8"));
}

export function decodeBackup(bytes: Buffer): BackupDocument {
  const doc = JSON.parse(gunzipSync(bytes).toString("utf8"), jsonReviver) as BackupDocument;
  if (doc.version !== BACKUP_FORMAT_VERSION || !doc.tables || !doc.takenAt) {
    throw new Error("Not an Arabclue database backup (unknown format)");
  }
  return doc;
}

export function backupKey(takenAt: Date): string {
  return `${BACKUP_PREFIX}/${takenAt.toISOString().replace(/[:.]/g, "-")}.json.gz`;
}

/** Pure: which backup keys fall outside the retention window. */
export function keysToPrune(keys: readonly string[], now: Date, retentionDays = BACKUP_RETENTION_DAYS): string[] {
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return keys.filter((key) => {
    const stamp = key.slice(key.lastIndexOf("/") + 1).replace(/\.json\.gz$/, "");
    // 2026-09-07T04-00-00-000Z -> 2026-09-07T04:00:00.000Z
    const iso = stamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
    const time = Date.parse(iso);
    return Number.isFinite(time) && time < cutoff;
  });
}

function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe identifier: ${name}`);
  return `"${name}"`;
}

async function listPublicTables(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name).filter((t) => !BACKUP_EXCLUDED_TABLES.includes(t));
}

export async function dumpDatabase(now = new Date()): Promise<BackupDocument> {
  const tables = await listPublicTables();
  const dbName = await db.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
  const doc: BackupDocument = {
    version: BACKUP_FORMAT_VERSION,
    takenAt: now.toISOString(),
    database: dbName[0]?.current_database ?? "unknown",
    tables: {},
    counts: {},
  };
  for (const table of tables) {
    const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM ${quoteIdent(table)}`);
    doc.tables[table] = rows;
    doc.counts[table] = rows.length;
  }
  return doc;
}

function localBackupDir(): string {
  return path.join(process.cwd(), "backups");
}

function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function writeBackup(key: string, bytes: Buffer): Promise<"blob" | "local"> {
  if (usesBlob()) {
    await put(key, bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/gzip",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return "blob";
  }
  const file = path.join(localBackupDir(), path.basename(key));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return "local";
}

export async function listBackupKeys(): Promise<string[]> {
  if (usesBlob()) {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${BACKUP_PREFIX}/`, cursor, token: process.env.BLOB_READ_WRITE_TOKEN });
      keys.push(...page.blobs.map((b) => b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return keys.sort();
  }
  try {
    const names = await readdir(localBackupDir());
    return names.filter((n) => n.endsWith(".json.gz")).sort().map((n) => `${BACKUP_PREFIX}/${n}`);
  } catch {
    return [];
  }
}

async function deleteBackups(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  if (usesBlob()) {
    await del([...keys], { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }
  await Promise.all(keys.map((k) => unlink(path.join(localBackupDir(), path.basename(k))).catch(() => undefined)));
}

export async function readBackup(key: string): Promise<BackupDocument> {
  if (usesBlob()) {
    const result = await get(key, { access: "private", token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error(`Backup not found: ${key}`);
    return decodeBackup(Buffer.from(await new Response(result.stream).arrayBuffer()));
  }
  return decodeBackup(await readFile(path.join(localBackupDir(), path.basename(key))));
}

/** Dump, store, and prune. The prune runs only after the new dump is durable. */
export async function runDatabaseBackup(now = new Date()): Promise<BackupSummary> {
  const doc = await dumpDatabase(now);
  const bytes = encodeBackup(doc);
  const key = backupKey(now);
  const destination = await writeBackup(key, bytes);
  const pruned = keysToPrune((await listBackupKeys()).filter((k) => k !== key), now);
  await deleteBackups(pruned);
  return {
    key,
    takenAt: doc.takenAt,
    bytes: bytes.length,
    tables: Object.keys(doc.tables).length,
    rows: Object.values(doc.counts).reduce((a, b) => a + b, 0),
    destination,
    pruned,
  };
}

export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Buffer.isBuffer(value)) return `'\\x${value.toString("hex")}'`;
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

export type RestoreOptions = {
  /** Proceed even when the live database currently holds more rows than the dump. */
  force?: boolean;
  /** Restore only these tables (default: every table in the dump). */
  tables?: readonly string[];
};

export type RestoreSummary = { restored: Record<string, number>; skipped: string[] };

/**
 * Replace the contents of every table in the dump with the dump's rows, in one
 * transaction. Refuses (without `force`) when the live database is "bigger"
 * than the dump — the guard against restoring stale data over a live tenant.
 */
export async function restoreDatabaseBackup(doc: BackupDocument, options: RestoreOptions = {}): Promise<RestoreSummary> {
  const wanted = options.tables ? new Set(options.tables) : null;
  const tables = Object.keys(doc.tables).filter((t) => !wanted || wanted.has(t));
  const liveTables = new Set(await listPublicTables());
  const skipped = tables.filter((t) => !liveTables.has(t));
  const targets = tables.filter((t) => liveTables.has(t));

  if (!options.force) {
    let liveRows = 0;
    for (const table of targets) {
      const [{ n }] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM ${quoteIdent(table)}`);
      liveRows += Number(n);
    }
    const dumpRows = targets.reduce((sum, t) => sum + doc.tables[t].length, 0);
    if (liveRows > dumpRows) {
      throw new Error(
        `Refusing to restore: the live database holds ${liveRows} rows across these tables and the dump ${dumpRows}. Pass force to overwrite.`,
      );
    }
  }

  const restored: Record<string, number> = {};
  await db.$transaction(
    async (tx) => {
      for (const table of targets) await tx.$executeRawUnsafe(`ALTER TABLE ${quoteIdent(table)} DISABLE TRIGGER ALL`);
      for (const table of targets) await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoteIdent(table)}`);
      for (const table of targets) {
        const rows = doc.tables[table];
        restored[table] = rows.length;
        if (rows.length === 0) continue;
        const generated = new Set(GENERATED_COLUMNS[table] ?? []);
        const columns = Object.keys(rows[0]).filter((c) => !generated.has(c));
        const columnSql = columns.map(quoteIdent).join(", ");
        for (let i = 0; i < rows.length; i += 500) {
          const values = rows
            .slice(i, i + 500)
            .map((row) => `(${columns.map((c) => sqlLiteral(row[c])).join(", ")})`)
            .join(",\n");
          await tx.$executeRawUnsafe(`INSERT INTO ${quoteIdent(table)} (${columnSql}) VALUES ${values}`);
        }
      }
      for (const table of targets) await tx.$executeRawUnsafe(`ALTER TABLE ${quoteIdent(table)} ENABLE TRIGGER ALL`);
    },
    { timeout: 10 * 60 * 1000 },
  );
  return { restored, skipped };
}

