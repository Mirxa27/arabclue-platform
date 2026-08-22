/**
 * Guard tests for the reconciliation trust boundary.
 *
 * Reconciliation exists to confirm local payment state against the gateway, so
 * accepting the gateway's answer from the browser defeats the entire operation.
 * The admin client used to send `providerState: "PAID"` with
 * `invoiceValue: null` for every selected row, and the server applied it
 * verbatim — the nulled amount also skipped the mismatch guard, so
 * "select all -> bulk apply" marked FAILED and EXPIRED checkouts as paid
 * without anyone acting maliciously.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const ROUTE = "src/app/api/admin/billing/reconcile/route.ts";
const CLIENT = "src/components/admin/billing-reconciliation.tsx";

describe("server re-verifies provider state", () => {
  const source = read(ROUTE);

  test("a single verification helper is the only source of provider state", () => {
    expect(source).toContain("async function verifyProviderResults");
  });

  test("the helper queries the payment gateway", () => {
    expect(source).toMatch(/verifyProviderResults[\s\S]*?getPaymentStatus/);
  });

  test("gateway calls are bounded by a deadline and concurrency limit", () => {
    expect(source).toMatch(/verifyProviderResults[\s\S]*?withProviderDeadline/);
    expect(source).toMatch(/verifyProviderResults[\s\S]*?RECONCILE_CONCURRENCY/);
  });

  test("the bulk apply path verifies before applying", () => {
    const bulkAt = source.indexOf("applyReconciliationBulk({");
    const verifyAt = source.indexOf("verifyProviderResults(\n        body.items");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(bulkAt);
  });

  test("no apply path forwards a client-supplied providerResult", () => {
    // The regression: `providerResult: body.providerResult` reaching apply.
    expect(source).not.toMatch(/providerResult:\s*body\.providerResult/);
    expect(source).not.toMatch(/items:\s*body\.items\b/);
  });
});

describe("client sends identifiers only", () => {
  const source = read(CLIENT);

  test("the bulk mutation does not assert a payment state", () => {
    expect(source).not.toMatch(/providerState:\s*["']PAID["']/);
  });

  test("the bulk mutation does not fabricate an invoice value", () => {
    expect(source).not.toMatch(/invoiceValue:\s*null/);
  });

  test("the bulk mutation sends only checkout identifiers", () => {
    expect(source).toMatch(/checkoutIds\.map\(\s*\(id\)\s*=>\s*\(\{\s*checkoutId:\s*id\s*\}\)\s*\)/);
  });
});
