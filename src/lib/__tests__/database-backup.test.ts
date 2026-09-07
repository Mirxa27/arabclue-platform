/**
 * The off-platform backup exists because Neon's Free-plan history is six hours
 * and the 2026-09-06 reset was discovered after that. These tests cover the
 * pure halves — encoding fidelity, retention arithmetic, SQL literal safety —
 * and the wiring (scheduled, authenticated, generous time budget). The
 * round trip against a database is in the operator script.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  BACKUP_EXCLUDED_TABLES,
  BACKUP_FORMAT_VERSION,
  BACKUP_RETENTION_DAYS,
  backupKey,
  decodeBackup,
  encodeBackup,
  keysToPrune,
  sqlLiteral,
  type BackupDocument,
} from "../database-backup";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("encoding", () => {
  test("round-trips bigint, Date, Buffer, JSON, null and strings exactly", () => {
    const doc: BackupDocument = {
      version: BACKUP_FORMAT_VERSION,
      takenAt: "2026-09-07T04:00:00.000Z",
      database: "neondb",
      tables: {
        User: [
          {
            id: "u1",
            mfaLastUsedStep: 9007199254740993n,
            createdAt: new Date("2026-09-06T19:31:00.000Z"),
            avatar: Buffer.from([0, 255, 10]),
            settings: { locale: "ar", nested: [1, "x"] },
            deletedAt: null,
            name: "O'Brien — عربي",
          },
        ],
        _prisma_migrations: [{ migration_name: "20260722140000_postgres_baseline" }],
      },
      counts: { User: 1, _prisma_migrations: 1 },
    };
    const decoded = decodeBackup(encodeBackup(doc));
    const row = decoded.tables.User[0];
    expect(row.mfaLastUsedStep).toBe(9007199254740993n);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect((row.createdAt as Date).toISOString()).toBe("2026-09-06T19:31:00.000Z");
    expect(Buffer.isBuffer(row.avatar)).toBe(true);
    expect((row.avatar as Buffer).equals(Buffer.from([0, 255, 10]))).toBe(true);
    expect(row.settings).toEqual({ locale: "ar", nested: [1, "x"] });
    expect(row.deletedAt).toBeNull();
    expect(row.name).toBe("O'Brien — عربي");
    expect(decoded.tables._prisma_migrations).toHaveLength(1);
    expect(decoded.counts).toEqual(doc.counts);
  });

  test("rejects a document that is not a backup", () => {
    expect(() => decodeBackup(gzipSync(Buffer.from('{"hello":1}')))).toThrow(/unknown format/);
  });

  test("the key is a sortable ISO stamp under the backup prefix", () => {
    expect(backupKey(new Date("2026-09-07T04:00:00.000Z"))).toBe(
      "backups/database/2026-09-07T04-00-00-000Z.json.gz",
    );
  });
});

describe("retention", () => {
  test("prunes only keys older than the window and ignores unparseable names", () => {
    const now = new Date("2026-10-10T04:00:00.000Z");
    const keys = [
      backupKey(new Date("2026-09-01T04:00:00.000Z")), // 39 days: prune
      backupKey(new Date("2026-09-09T04:00:00.000Z")), // 31 days: prune
      backupKey(new Date("2026-09-11T04:00:00.000Z")), // 29 days: keep
      backupKey(now),
      "backups/database/notes.json.gz",
    ];
    expect(keysToPrune(keys, now)).toEqual([keys[0], keys[1]]);
    expect(BACKUP_RETENTION_DAYS).toBeGreaterThanOrEqual(30);
  });

  test("only the transient rate-limit counters are excluded from the dump", () => {
    expect([...BACKUP_EXCLUDED_TABLES].sort()).toEqual(["RateLimitLease", "RateLimitWindow"]);
  });
});

describe("SQL literals for restore", () => {
  test("escapes quotes, renders bytes as hex, and keeps JSON as text", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(7n)).toBe("7");
    expect(sqlLiteral(true)).toBe("TRUE");
    expect(sqlLiteral("it's")).toBe("'it''s'");
    expect(sqlLiteral(new Date("2026-09-07T00:00:00.000Z"))).toBe("'2026-09-07T00:00:00.000Z'");
    expect(sqlLiteral(Buffer.from([1, 2]))).toBe("'\\x0102'");
    expect(sqlLiteral({ a: "b'c" })).toBe(`'{"a":"b''c"}'`);
  });
});

describe("wiring", () => {
  const vercel = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const route = readFileSync(join(REPO_ROOT, "src/app/api/cron/database-backup/route.ts"), "utf8");

  test("the backup runs daily, before the retention job deletes anything", () => {
    const backup = vercel.crons.find((c) => c.path === "/api/cron/database-backup");
    const retention = vercel.crons.find((c) => c.path === "/api/cron/analytics-retention");
    expect(backup?.schedule).toBe("0 4 * * *");
    expect(retention?.schedule).toBe("45 4 * * *");
  });

  test("the route is cron-authenticated and has a five-minute budget", () => {
    expect(route).toContain("authorizeCron(req)");
    expect(route).toContain("export const maxDuration = 300");
    expect(route).toContain("runDatabaseBackup()");
  });

  test("the operator script and package alias exist", () => {
    const scripts = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
    expect(scripts["db:backup"]).toBe("bun scripts/backup-database.ts");
    expect(readFileSync(join(REPO_ROOT, "scripts/backup-database.ts"), "utf8")).toContain("--apply");
  });
});
