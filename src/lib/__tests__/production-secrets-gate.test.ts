import { describe, expect, test } from "bun:test";
import { assertProductionSecrets } from "../crypto";

const COMPLETE = {
  NODE_ENV: "production",
  NEXTAUTH_SECRET: "a-long-random-nextauth-secret-value",
  ARABCLUE_ENC_KEY: "a-long-random-encryption-key-value",
  NEXTAUTH_URL: "https://arabclue.com",
};

describe("assertProductionSecrets", () => {
  test("passes a complete production environment", () => {
    expect(() => assertProductionSecrets(COMPLETE)).not.toThrow();
  });

  test("names NEXTAUTH_URL among the missing secrets", () => {
    expect(() =>
      assertProductionSecrets({ ...COMPLETE, NEXTAUTH_URL: undefined })
    ).toThrow(/NEXTAUTH_URL/);
  });

  test("refuses an http:// NEXTAUTH_URL in production", () => {
    expect(() =>
      assertProductionSecrets({ ...COMPLETE, NEXTAUTH_URL: "http://arabclue.com" })
    ).toThrow(/https:\/\//);
  });

  test("lets a Vercel preview derive its URL from VERCEL_URL", () => {
    expect(() =>
      assertProductionSecrets({
        ...COMPLETE,
        NEXTAUTH_URL: undefined,
        VERCEL_ENV: "preview",
      })
    ).not.toThrow();
  });

  test("still reports the pre-existing secrets", () => {
    expect(() =>
      assertProductionSecrets({ ...COMPLETE, ARABCLUE_ENC_KEY: " " })
    ).toThrow(/ARABCLUE_ENC_KEY/);
  });

  test("is a no-op outside production", () => {
    expect(() => assertProductionSecrets({ NODE_ENV: "development" })).not.toThrow();
  });
});
