/**
 * The restore half of the off-platform backup, against a scripted database:
 * the size guard that stops an old dump overwriting a live tenant, the
 * trigger/truncate/insert/enable sequence inside one transaction, and the
 * generated column (`DocumentChunk.tsv`) that must never appear in an INSERT.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

type Statement = string;
const executed: Statement[] = [];
let liveTables: string[] = [];
let liveCounts: Record<string, number> = {};

const fakeTx = {
  $executeRawUnsafe: mock(async (sql: string) => {
    executed.push(sql);
    return 0;
  }),
};

mock.module("../db", () => ({
  db: {
    $queryRaw: mock(async () => liveTables.map((table_name) => ({ table_name }))),
    $queryRawUnsafe: mock(async (sql: string) => {
      const table = /FROM "([^"]+)"/.exec(sql)?.[1] ?? "";
      return [{ n: BigInt(liveCounts[table] ?? 0) }];
    }),
    $transaction: mock(async (fn: (tx: typeof fakeTx) => Promise<void>) => fn(fakeTx)),
  },
}));

const { restoreDatabaseBackup, BACKUP_FORMAT_VERSION } = await import("../database-backup");

function dump(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    version: BACKUP_FORMAT_VERSION,
    takenAt: "2026-09-07T04:00:00.000Z",
    database: "neondb",
    tables,
    counts: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.length])),
  };
}

beforeEach(() => {
  executed.length = 0;
  liveTables = ["User", "DocumentChunk", "_prisma_migrations"];
  liveCounts = {};
});

describe("restoreDatabaseBackup", () => {
  test("refuses when the live database holds more rows than the dump", async () => {
    liveCounts = { User: 5 };
    await expect(
      restoreDatabaseBackup(dump({ User: [{ id: "u1", name: "A" }] })),
    ).rejects.toThrow(/Refusing to restore.*5 rows.*dump 1/);
    expect(executed).toEqual([]);
  });

  test("force overrides the guard", async () => {
    liveCounts = { User: 5 };
    const result = await restoreDatabaseBackup(dump({ User: [{ id: "u1", name: "A" }] }), { force: true });
    expect(result.restored).toEqual({ User: 1 });
    expect(executed.some((s) => s.startsWith('INSERT INTO "User"'))).toBe(true);
  });

  test("disables triggers, truncates, inserts, re-enables — in that order, per table", async () => {
    const result = await restoreDatabaseBackup(
      dump({
        User: [
          { id: "u1", name: "O'Brien", createdAt: new Date("2026-09-06T19:31:00.000Z"), mfaLastUsedStep: 42n, deletedAt: null },
        ],
        _prisma_migrations: [{ id: "m1", migration_name: "20260722140000_postgres_baseline" }],
      }),
    );
    expect(result).toEqual({ restored: { User: 1, _prisma_migrations: 1 }, skipped: [] });
    expect(executed).toEqual([
      'ALTER TABLE "User" DISABLE TRIGGER ALL',
      'ALTER TABLE "_prisma_migrations" DISABLE TRIGGER ALL',
      'TRUNCATE TABLE "User"',
      'TRUNCATE TABLE "_prisma_migrations"',
      `INSERT INTO "User" ("id", "name", "createdAt", "mfaLastUsedStep", "deletedAt") VALUES ('u1', 'O''Brien', '2026-09-06T19:31:00.000Z', 42, NULL)`,
      `INSERT INTO "_prisma_migrations" ("id", "migration_name") VALUES ('m1', '20260722140000_postgres_baseline')`,
      'ALTER TABLE "User" ENABLE TRIGGER ALL',
      'ALTER TABLE "_prisma_migrations" ENABLE TRIGGER ALL',
    ]);
  });

  test("drops the generated tsv column from DocumentChunk inserts", async () => {
    await restoreDatabaseBackup(
      dump({ DocumentChunk: [{ id: "c1", content: "نص", tsv: "'نص':1", embeddingDim: 1536 }] }),
    );
    const insert = executed.find((s) => s.startsWith('INSERT INTO "DocumentChunk"'));
    expect(insert).toBe(`INSERT INTO "DocumentChunk" ("id", "content", "embeddingDim") VALUES ('c1', 'نص', 1536)`);
  });

  test("skips tables the live schema no longer has and honours a table filter", async () => {
    liveTables = ["User"];
    const result = await restoreDatabaseBackup(
      dump({ User: [{ id: "u1" }], Retired: [{ id: "r1" }], AuditLog: [{ id: "a1" }] }),
      { tables: ["User", "Retired"] },
    );
    expect(result).toEqual({ restored: { User: 1 }, skipped: ["Retired"] });
    expect(executed.filter((s) => s.includes("AuditLog"))).toEqual([]);
  });

  test("batches large tables into 500-row inserts", async () => {
    const rows = Array.from({ length: 1_201 }, (_, i) => ({ id: `u${i}` }));
    await restoreDatabaseBackup(dump({ User: rows }));
    const inserts = executed.filter((s) => s.startsWith('INSERT INTO "User"'));
    expect(inserts).toHaveLength(3);
    expect(inserts[2].split("\n")).toHaveLength(201);
  });

  test("rejects an unsafe identifier before any SQL runs", async () => {
    liveTables = ['User"; DROP TABLE "User'];
    await expect(
      restoreDatabaseBackup(dump({ ['User"; DROP TABLE "User']: [{ id: "x" }] })),
    ).rejects.toThrow(/Unsafe identifier/);
    expect(executed).toEqual([]);
  });
});
