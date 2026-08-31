import { describe, expect, test } from "bun:test";
import {
  AUTOPILOT_CONFIDENCE,
  classifyAttachment,
  normalizeAttachmentSource,
} from "@/lib/agents/platform/classify-attachment";
import { assertSafeExternalUrl, MISSION_CONNECTORS } from "@/lib/agents/platform/connectors";

describe("mission control domain", () => {
  test("exposes production-ready connectors only", () => {
    const ids = MISSION_CONNECTORS.map((c) => c.id);
    expect(ids).toContain("upload");
    expect(ids).toContain("url");
    expect(ids).toContain("email");
    expect(ids).toContain("google_drive");
    expect(ids).toContain("onedrive");
    expect(ids).not.toContain("drive");
    expect(MISSION_CONNECTORS.every((c) => c.status === "ready")).toBe(true);
    expect(MISSION_CONNECTORS.some((c) => c.importMode === "paste")).toBe(true);
  });

  test("preserves distinct import sources and accepts drive alias", () => {
    expect(normalizeAttachmentSource("email", "upload")).toBe("email");
    expect(normalizeAttachmentSource("google_drive", "upload")).toBe("google_drive");
    expect(normalizeAttachmentSource("onedrive", "upload")).toBe("onedrive");
    expect(normalizeAttachmentSource("drive", "upload")).toBe("google_drive");
    expect(normalizeAttachmentSource("unknown", "upload")).toBe("upload");
  });

  test("allows public https URLs", () => {
    const url = assertSafeExternalUrl("https://example.com/tender.pdf");
    expect(url.hostname).toBe("example.com");
  });

  test("blocks every private range, not just the four the regex listed", () => {
    // The original guard tested a literal-prefix regex plus a five-entry host
    // set, so 127.0.0.2, CGNAT space and *.internal all sailed through to a
    // server-side fetch whose body is handed back to the caller.
    for (const raw of [
      "http://127.0.0.2/secret",
      "http://127.1/secret",
      "http://2130706433/secret", // decimal-encoded 127.0.0.1
      "http://0x7f000001/secret", // hex-encoded 127.0.0.1
      "http://100.64.0.1/secret", // CGNAT
      "http://0.0.0.0/secret",
      "http://consul.internal/secret",
      "http://redis.local/secret",
      "http://[fd00::1]/secret",
      "http://[fe80::1]/secret",
    ]) {
      expect(() => assertSafeExternalUrl(raw)).toThrow();
    }
  });

  test("blocks IPv4-mapped IPv6, which reaches loopback and cloud metadata", () => {
    // new URL("http://[::ffff:127.0.0.1]/").hostname is "[::ffff:7f00:1]" — it
    // matches no IPv4 dotted-quad and no fc00::/fe80:: prefix, so a
    // prefix-matching guard passes it straight through to 127.0.0.1.
    expect(() => assertSafeExternalUrl("http://[::ffff:127.0.0.1]/")).toThrow();
    expect(() => assertSafeExternalUrl("http://[::ffff:7f00:1]/")).toThrow();
    expect(() => assertSafeExternalUrl("http://[::ffff:a9fe:a9fe]/")).toThrow();
  });

  test("classifier autopilot threshold is stable", () => {
    expect(AUTOPILOT_CONFIDENCE).toBeGreaterThan(0.7);
    const d = classifyAttachment({
      originalName: "مناقصة-كراسة.pdf",
      mimeType: "application/pdf",
      textPreview: "كراسة الشروط مناقصة اعتماد Scope of Work SLA evaluation criteria ".repeat(20),
    });
    expect(d.category).toBe("RFP");
    expect(d.runPipeline).toBe(true);
  });
});
