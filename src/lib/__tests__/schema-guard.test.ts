import { describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import {
  SCHEMA_MIGRATION_PENDING,
  extractMissingTableName,
  schemaGuard,
  schemaMigrationPendingBody,
  schemaMigrationPendingResponse,
  withSchemaGuard,
} from "../schema-guard";
import { NextResponse } from "next/server";

function p2021(table: string): Error {
  return new Prisma.PrismaClientKnownRequestError(
    `The table \`public.${table}\` does not exist in the current database.`,
    { code: "P2021", clientVersion: "test" }
  );
}

function p2010(relation: string): Error {
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: \`42P01\`. Message: \`relation "${relation}" does not exist\``,
    { code: "P2010", clientVersion: "test" }
  );
}

describe("extractMissingTableName", () => {
  test("reads the table name from a P2021 error and strips the schema qualifier", () => {
    expect(extractMissingTableName(p2021("WorkspaceInvitation"))).toBe(
      "WorkspaceInvitation"
    );
  });

  test("reads the relation name from a P2010 raw-query error", () => {
    expect(extractMissingTableName(p2010("CollaborationComment"))).toBe(
      "CollaborationComment"
    );
  });

  test("strips the schema qualifier from a quoted relation name", () => {
    expect(
      extractMissingTableName(
        new Error('relation "public.AnalyticsEvent" does not exist')
      )
    ).toBe("AnalyticsEvent");
  });

  test("handles the unquoted phrasing", () => {
    expect(
      extractMissingTableName(
        new Error("The table ProposalPresence does not exist in the current database.")
      )
    ).toBe("ProposalPresence");
  });

  test("returns null when no table name is reported", () => {
    expect(extractMissingTableName(new Error("Connection refused"))).toBeNull();
    expect(extractMissingTableName(null)).toBeNull();
    expect(extractMissingTableName(undefined)).toBeNull();
    expect(extractMissingTableName(42)).toBeNull();
  });
});

describe("schemaMigrationPendingBody", () => {
  test("carries the stable code, the missing table, and both languages", () => {
    const body = schemaMigrationPendingBody(p2021("WorkspaceInvitation"));
    expect(body.code).toBe(SCHEMA_MIGRATION_PENDING);
    expect(body.missingTable).toBe("WorkspaceInvitation");
    expect(body.error.ar.trim().length).toBeGreaterThan(0);
    expect(body.error.en.trim().length).toBeGreaterThan(0);
  });

  test("names the missing table inside both messages", () => {
    const body = schemaMigrationPendingBody(p2021("AnalyticsEvent"));
    expect(body.error.ar).toContain("AnalyticsEvent");
    expect(body.error.en).toContain("AnalyticsEvent");
  });

  test("the Arabic message contains Arabic script", () => {
    const body = schemaMigrationPendingBody(p2021("AnalyticsEvent"));
    expect(/[\u0600-\u06FF]/.test(body.error.ar)).toBe(true);
  });

  test("the English message contains no Arabic script", () => {
    const body = schemaMigrationPendingBody(p2021("AnalyticsEvent"));
    expect(/[\u0600-\u06FF]/.test(body.error.en)).toBe(false);
  });

  test("resolves the owning migration and the capabilities it blocks", () => {
    const body = schemaMigrationPendingBody(p2021("WorkspaceInvitation"));
    expect(body.migration).toBe("20260726000000_platform_completion");
    expect(body.capabilities).toContain("workspace invitations");
  });

  test("degrades safely when the table name is unknown", () => {
    const body = schemaMigrationPendingBody(new Error("something else"));
    expect(body.missingTable).toBeNull();
    expect(body.migration).toBeNull();
    expect(body.capabilities).toEqual([]);
    expect(body.error.en).toContain("unknown");
    expect(body.error.ar).toContain("غير معروف");
  });

  test("carries no tenant data", () => {
    const body = schemaMigrationPendingBody(p2021("AnalyticsEvent"));
    expect(JSON.stringify(body)).not.toMatch(/workspace-[0-9a-f]|user-[0-9a-f]/i);
  });
});

describe("schemaMigrationPendingResponse", () => {
  test("answers 503, never a success status", async () => {
    const response = schemaMigrationPendingResponse(p2021("AnalyticsEvent"));
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.code).toBe(SCHEMA_MIGRATION_PENDING);
    expect(payload.missingTable).toBe("AnalyticsEvent");
  });

  test("does not answer 200, 202, or 501", () => {
    for (const table of ["AnalyticsEvent", "ProposalPresence", "RecoveryToken"]) {
      const status = schemaMigrationPendingResponse(p2021(table)).status;
      expect([200, 201, 202, 204, 501]).not.toContain(status);
    }
  });
});

describe("schemaGuard", () => {
  test("returns a 503 for a missing-table error", () => {
    const response = schemaGuard(p2010("ProposalPresence"));
    expect(response).not.toBeNull();
    expect(response!.status).toBe(503);
  });

  test("returns null for an unrelated error so existing handling applies", () => {
    expect(schemaGuard(new Error("Connection refused"))).toBeNull();
    expect(
      schemaGuard(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        })
      )
    ).toBeNull();
  });
});

describe("withSchemaGuard", () => {
  test("passes a successful result through untouched", async () => {
    const response = await withSchemaGuard(async () =>
      NextResponse.json({ ok: true }, { status: 200 })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("converts a missing-table failure into the bilingual 503", async () => {
    const response = await withSchemaGuard(async () => {
      throw p2021("TemplateMarketplaceRating");
    });
    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.missingTable).toBe("TemplateMarketplaceRating");
  });

  test("rethrows an unrelated failure", async () => {
    await expect(
      withSchemaGuard(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
  });
});
