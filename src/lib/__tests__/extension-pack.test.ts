import { describe, expect, test } from "bun:test";
import { buildStoreZip, packExtensionZipToBuffer } from "@/lib/extension-pack";

describe("extension packer", () => {
  test("builds a valid store zip with PK headers", () => {
    const buf = buildStoreZip(
      [
        { name: "manifest.json", data: Buffer.from('{"manifest_version":3}') },
        { name: "background/sw.js", data: Buffer.from("console.log(1)") },
      ],
      "arabclue-agent"
    );
    expect(buf.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
    expect(buf.length).toBeGreaterThan(40);
  });

  test("packs real extension source", async () => {
    const buf = await packExtensionZipToBuffer();
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });
});
