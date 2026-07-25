import { describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import { isPrismaMissingTable } from "../prisma-missing-table";

describe("isPrismaMissingTable", () => {
  test("detects Prisma P2021 missing table", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'The table `public.AnalyticsEvent` does not exist in the current database.',
      { code: "P2021", clientVersion: "test" }
    );
    expect(isPrismaMissingTable(error)).toBe(true);
  });

  test("detects Prisma P2010 raw query missing relation", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Raw query failed. Code: `42P01`. Message: `relation \"CollaborationComment\" does not exist`",
      { code: "P2010", clientVersion: "test" }
    );
    expect(isPrismaMissingTable(error)).toBe(true);
  });

  test("detects message-based missing table errors", () => {
    expect(
      isPrismaMissingTable(
        new Error('relation "AnalyticsEvent" does not exist')
      )
    ).toBe(true);
    expect(
      isPrismaMissingTable(
        new Error("The table `public.AnalyticsEvent` does not exist in the current database.")
      )
    ).toBe(true);
  });

  test("returns false for unrelated errors", () => {
    expect(isPrismaMissingTable(new Error("Connection refused"))).toBe(false);
    expect(
      isPrismaMissingTable(
        new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        })
      )
    ).toBe(false);
    expect(isPrismaMissingTable(null)).toBe(false);
  });
});
