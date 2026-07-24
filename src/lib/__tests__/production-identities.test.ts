import { describe, expect, test } from "bun:test";
import {
  isProductionBlockedDevelopmentIdentity,
  isProductionRuntime,
  isReservedDevelopmentIdentity,
} from "../production-identities";

describe("production identity boundary", () => {
  test("recognizes the reserved development domain case-insensitively", () => {
    expect(isReservedDevelopmentIdentity("tester@arabclue.local")).toBe(true);
    expect(isReservedDevelopmentIdentity(" TESTER@ARABCLUE.LOCAL ")).toBe(true);
    expect(isReservedDevelopmentIdentity("user@arabclue.com")).toBe(false);
  });

  test("blocks reserved identities in production and Vercel only", () => {
    expect(isProductionRuntime({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionRuntime({ VERCEL: "1" })).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: "development" })).toBe(false);
    expect(
      isProductionBlockedDevelopmentIdentity("tester@arabclue.local", {
        NODE_ENV: "production",
      })
    ).toBe(true);
    expect(
      isProductionBlockedDevelopmentIdentity("tester@arabclue.local", {
        NODE_ENV: "development",
        VERCEL: "1",
      })
    ).toBe(true);
    expect(
      isProductionBlockedDevelopmentIdentity("tester@arabclue.local", {
        NODE_ENV: "development",
      })
    ).toBe(false);
    expect(
      isProductionBlockedDevelopmentIdentity("user@arabclue.com", {
        NODE_ENV: "production",
      })
    ).toBe(false);
  });
});
