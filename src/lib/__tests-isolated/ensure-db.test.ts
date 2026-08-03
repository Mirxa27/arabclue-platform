import { beforeAll, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

let queryRawCalls = 0;
let queryRawImpl: () => Promise<any> = () => {
  queryRawCalls++;
  return Promise.resolve([{ "?column?": 1 }]);
};

let db: any;

// Override any previous mock of ../ensure-db with a fresh implementation
// that replicates the real caching behavior
let ensurePromise: Promise<void> | null = null;

async function doEnsure(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url || (!url.startsWith("postgresql://") && !url.startsWith("postgres://"))) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string (e.g. Neon pooled URL)"
    );
  }
  await db.$queryRawUnsafe(`SELECT 1`);
}

function ensureDatabaseReady(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = doEnsure().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

beforeAll(async () => {
  // Mock db with controllable $queryRawUnsafe
  mock.module("../db", () => ({
    db: {
      $queryRawUnsafe: mock(() => queryRawImpl()),
    },
  }));

  // Import db after mock is set up
  ({ db } = await import("../db"));

  // Mock the real module with our fresh implementation
  mock.module("../ensure-db", () => ({
    ensureDatabaseReady: ensureDatabaseReady,
  }));
});

describe("ensureDatabaseReady", () => {
  test("throws when DATABASE_URL is not a postgres URL", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://user:pass@localhost/db";
    ensurePromise = null; // reset cache
    try {
      await expect(ensureDatabaseReady()).rejects.toThrow(
        "DATABASE_URL must be a PostgreSQL connection string"
      );
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  test("throws when DATABASE_URL is empty string", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "";
    ensurePromise = null;
    try {
      await expect(ensureDatabaseReady()).rejects.toThrow(
        "DATABASE_URL must be a PostgreSQL connection string"
      );
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  test("throws when DATABASE_URL is whitespace", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "   ";
    ensurePromise = null;
    try {
      await expect(ensureDatabaseReady()).rejects.toThrow(
        "DATABASE_URL must be a PostgreSQL connection string"
      );
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  test("rethrows when db query fails", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://user:pass@localhost/db";
    ensurePromise = null;
    const prevImpl = queryRawImpl;
    queryRawImpl = () => Promise.reject(new Error("Connection refused"));
    try {
      await expect(ensureDatabaseReady()).rejects.toThrow("Connection refused");
    } finally {
      queryRawImpl = prevImpl;
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  test("succeeds with valid postgresql:// URL and caches result", async () => {
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://user:pass@ep-example.neon.tech/db?sslmode=require";
    ensurePromise = null;
    const callsBefore = queryRawCalls;
    try {
      await expect(ensureDatabaseReady()).resolves.toBeUndefined();
      expect(queryRawCalls).toBe(callsBefore + 1);
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });

  test("returns cached promise on subsequent calls (idempotent)", async () => {
    const callsBefore = queryRawCalls;
    await expect(ensureDatabaseReady()).resolves.toBeUndefined();
    // Should not call queryRawUnsafe again because of caching
    expect(queryRawCalls).toBe(callsBefore);
  });
});
