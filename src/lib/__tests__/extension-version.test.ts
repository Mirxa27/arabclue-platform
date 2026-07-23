import { describe, expect, test } from "bun:test";
import { isVersionOutdated } from "@/components/dashboard/mission-extension-bridge";

describe("extension version comparison", () => {
  test("detects older installed versions", () => {
    expect(isVersionOutdated("1.0.0", "1.1.0")).toBe(true);
    expect(isVersionOutdated("1.0.9", "1.1.0")).toBe(true);
    expect(isVersionOutdated("0.9.0", "1.0.0")).toBe(true);
    expect(isVersionOutdated("1.1", "1.1.1")).toBe(true);
  });

  test("equal or newer versions are not outdated", () => {
    expect(isVersionOutdated("1.1.0", "1.1.0")).toBe(false);
    expect(isVersionOutdated("1.2.0", "1.1.0")).toBe(false);
    expect(isVersionOutdated("2.0.0", "1.9.9")).toBe(false);
    expect(isVersionOutdated("1.1", "1.1.0")).toBe(false);
  });

  test("tolerates v prefixes and junk segments", () => {
    expect(isVersionOutdated("v1.0.0", "v1.1.0")).toBe(true);
    expect(isVersionOutdated("v1.1.0", "1.1.0")).toBe(false);
    expect(isVersionOutdated("1.x.0", "1.0.1")).toBe(true);
  });
});
