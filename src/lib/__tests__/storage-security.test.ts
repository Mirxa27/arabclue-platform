import { describe, expect, test } from "bun:test";
import {
  assertStoragePath,
  assertWorkspaceStoragePath,
  getUploadRoot,
  resolveStoragePath,
  resolveWorkspaceStoragePath,
} from "../storage";

describe("storage path trust boundary", () => {
  test("accepts canonical upload keys and proves local containment", () => {
    const key = "uploads/workspace-1/abc-logo.png";
    expect(assertStoragePath(key)).toBe(key);
    expect(assertWorkspaceStoragePath(key, "workspace-1")).toBe(key);
    expect(resolveStoragePath(key).startsWith(getUploadRoot())).toBe(true);
    expect(
      resolveWorkspaceStoragePath(key, "workspace-1").startsWith(
        `${getUploadRoot()}/workspace-1/`
      )
    ).toBe(true);
  });

  test("rejects absolute, traversal, URL, data and non-upload paths", () => {
    const invalid = [
      "/etc/passwd",
      "uploads/workspace-1/../workspace-2/secret",
      "uploads//workspace-1/logo.png",
      "https://attacker.example/logo.png",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
      "documents/logo.png",
      "uploads/workspace-1/logo.png?download=1",
      "uploads\\workspace-1\\logo.png",
    ];

    for (const value of invalid) {
      expect(() => assertStoragePath(value)).toThrow();
      expect(() => resolveStoragePath(value)).toThrow();
    }
  });

  test("rejects invalid scopes and cross-workspace keys", () => {
    expect(() =>
      assertWorkspaceStoragePath(
        "uploads/workspace-2/logo.png",
        "workspace-1"
      )
    ).toThrow();
    expect(() =>
      assertWorkspaceStoragePath("uploads/workspace-1/logo.png", "../root")
    ).toThrow();
  });
});
