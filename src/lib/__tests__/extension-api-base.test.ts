import { describe, expect, test } from "bun:test";
import { normalizeApiBase } from "../../../extensions/arabclue-agent/shared/messages.js";

describe("normalizeApiBase", () => {
  test("strips /app and other paths to origin", () => {
    expect(normalizeApiBase("https://arabclue.com/app")).toBe(
      "https://arabclue.com"
    );
    expect(normalizeApiBase("https://arabclue.com/app?view=copilot")).toBe(
      "https://arabclue.com"
    );
    expect(normalizeApiBase("https://arabclue.com/")).toBe(
      "https://arabclue.com"
    );
  });

  test("keeps valid origins", () => {
    expect(normalizeApiBase("https://arabclue.com")).toBe(
      "https://arabclue.com"
    );
    expect(normalizeApiBase("https://staging.arabclue.com")).toBe(
      "https://staging.arabclue.com"
    );
  });

  test("falls back on empty or junk", () => {
    expect(normalizeApiBase("")).toBe("https://arabclue.com");
    expect(normalizeApiBase("   ")).toBe("https://arabclue.com");
    expect(normalizeApiBase(null)).toBe("https://arabclue.com");
  });
});
