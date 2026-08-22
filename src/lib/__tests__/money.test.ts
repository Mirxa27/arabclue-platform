import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { moneyLiteral, moneyNumber, withPublicMoney } from "@/lib/money";
import { amountsMatch } from "@/lib/myfatoorah";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("money helpers", () => {
  test("read a Decimal-like object as its literal and as a number", () => {
    const decimal = { toString: () => "299.00" };
    expect(moneyLiteral(decimal)).toBe("299.00");
    expect(moneyNumber(decimal)).toBe(299);
    expect(moneyLiteral("[object Object]")).toBe("[object Object]");
    expect(moneyLiteral({ toString: () => "[object Object]" })).toBeNull();
  });

  test("JSON responses still expose a number so existing UI keeps working", () => {
    const publicPlan = withPublicMoney(
      { name: "PRO", priceMonthly: { toString: () => "999.00" } },
      ["priceMonthly"]
    );
    expect(publicPlan.priceMonthly).toBe(999);
  });
});

describe("provider amount comparison keeps tolerance only for the paid side", () => {
  test("accepts a provider report one halala away and rejects further drift", () => {
    expect(
      amountsMatch({
        expectedSar: { toString: () => "100.00" },
        paidSar: 100.01,
        expectedCurrency: "SAR",
        paidCurrency: "SAR",
      })
    ).toBe(true);
    expect(
      amountsMatch({
        expectedSar: { toString: () => "100.00" },
        paidSar: 99.5,
        expectedCurrency: "SAR",
        paidCurrency: "SAR",
      })
    ).toBe(false);
  });
});

describe("schema stores plan and checkout money as Decimal(12,2)", () => {
  const schema = readFileSync(join(REPO_ROOT, "prisma/schema.prisma"), "utf8");

  test("the live money fields are Decimal, not Float", () => {
    expect(schema).toContain(
      'priceMonthly      Decimal  @default(0.00) @map("priceMonthlyDecimal") @db.Decimal(12, 2)'
    );
    expect(schema).toContain(
      'priceYearly       Decimal  @default(0.00) @map("priceYearlyDecimal") @db.Decimal(12, 2)'
    );
    expect(schema).toContain(
      'amount            Decimal  @map("amountDecimal") @db.Decimal(12, 2)'
    );
    expect(schema).toContain(
      'amount            Decimal   @map("amountDecimal") @db.Decimal(12, 2)'
    );
  });
});
