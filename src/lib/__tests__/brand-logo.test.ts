import { describe, expect, test } from "bun:test";
import { extractLogoStoragePath } from "../brand-logo";

describe("extractLogoStoragePath", () => {
  test("decodes path query from /api/files URL", () => {
    expect(
      extractLogoStoragePath(
        "/api/files?path=uploads%2Fws1%2Flogo.png&workspaceId=ws1"
      )
    ).toBe("uploads/ws1/logo.png");
  });

  test("returns null when path missing", () => {
    expect(extractLogoStoragePath("/api/files?workspaceId=ws1")).toBeNull();
    expect(extractLogoStoragePath("https://cdn.example/logo.png")).toBeNull();
  });
});
