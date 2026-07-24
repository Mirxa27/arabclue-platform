import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  DEFAULT_DOCUMENT_BRAND_FONT,
  extractLogoStoragePath,
  inlineBrandLogoForPdf,
  normalizeBrandForDocument,
  safeBrandLogoUrlForDocument,
  validateAndNormalizeLogoImage,
} from "../brand-logo";

describe("workspace-scoped brand logo URLs", () => {
  test("extracts the one canonical path for the requested workspace", () => {
    expect(
      extractLogoStoragePath(
        "/api/files?path=uploads%2Fws1%2Flogo.png",
        "ws1"
      )
    ).toBe("uploads/ws1/logo.png");
  });

  test("rejects cross-workspace, traversal, absolute, remote and data inputs", () => {
    const invalid = [
      "/api/files?path=uploads%2Fws2%2Flogo.png",
      "/api/files?path=uploads%2Fws1%2F..%2Fws2%2Flogo.png",
      "/api/files?path=%2Fetc%2Fpasswd",
      "/api/files?path=uploads%2Fws1%2Flogo.png&path=uploads%2Fws1%2Fb.png",
      "/api/files?path=uploads%2Fws1%2Flogo.png&download=1",
      "https://attacker.example/logo.png",
      "//attacker.example/logo.png",
      "data:image/png;base64,AAAA",
      "file:///etc/passwd",
    ];
    for (const value of invalid) {
      expect(extractLogoStoragePath(value, "ws1")).toBeNull();
    }
  });

  test("selects local logos by default and embedded images only explicitly", () => {
    const local = "/api/files?path=uploads%2Fws1%2Flogo.png";
    const embedded = `data:image/png;base64,${Buffer.from("png").toString(
      "base64"
    )}`;

    expect(safeBrandLogoUrlForDocument(local, "ws1")).toBe(local);
    expect(safeBrandLogoUrlForDocument(embedded, "ws1")).toBeNull();
    expect(
      safeBrandLogoUrlForDocument(embedded, "ws1", {
        allowEmbedded: true,
      })
    ).toBe(embedded);
    expect(
      safeBrandLogoUrlForDocument(
        "https://attacker.example/logo.png",
        "ws1",
        { allowEmbedded: true }
      )
    ).toBeNull();
  });

  test("PDF inlining removes an untrusted logo instead of returning it", async () => {
    const result = await inlineBrandLogoForPdf(
      {
        logoUrl: "https://attacker.example/tracker.svg",
        primaryColor: `red}</style><script>alert(1)</script>`,
      },
      "ws1"
    );

    expect(result.inlined).toBe(false);
    expect(result.brand?.logoUrl).toBeNull();
    expect(result.brand?.primaryColor).toBe(
      DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
    );
    expect(result.warning).toContain("rejected");
  });
});

describe("brand render-boundary normalization", () => {
  test("falls back from CSS/script payloads and preserves allowed values", () => {
    const normalized = normalizeBrandForDocument({
      primaryColor: `red}</style><script>alert(1)</script>`,
      secondaryColor: "#abcdef",
      accentColor: "url(https://attacker.example)",
      fontFamily: `x';</style><script>alert(1)</script>`,
    });

    expect(normalized?.primaryColor).toBe(
      DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
    );
    expect(normalized?.secondaryColor).toBe("#ABCDEF");
    expect(normalized?.accentColor).toBe(
      DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
    );
    expect(normalized?.fontFamily).toBe(DEFAULT_DOCUMENT_BRAND_FONT);
  });
});

describe("brand logo byte validation", () => {
  test("verifies magic bytes and fully decodes a PNG", async () => {
    const source = await sharp({
      create: {
        width: 8,
        height: 6,
        channels: 4,
        background: "#0D9488",
      },
    })
      .png()
      .toBuffer();

    const image = await validateAndNormalizeLogoImage(
      source,
      "uploads/ws1/logo.png"
    );

    expect(image.mimeType).toBe("image/png");
    expect(image.width).toBe(8);
    expect(image.height).toBe(6);
    expect(image.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test("rejects extension spoofing, SVG and corrupt magic bytes", async () => {
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();

    await expect(
      validateAndNormalizeLogoImage(png, "uploads/ws1/logo.jpg")
    ).rejects.toThrow();
    await expect(
      validateAndNormalizeLogoImage(
        Buffer.from("<svg><script>alert(1)</script></svg>"),
        "uploads/ws1/logo.svg"
      )
    ).rejects.toThrow();
    await expect(
      validateAndNormalizeLogoImage(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        "uploads/ws1/logo.png"
      )
    ).rejects.toThrow();
  });

  test("rejects animated images at the decode boundary", async () => {
    const frame = async (background: string) =>
      sharp({
        create: {
          width: 4,
          height: 3,
          channels: 4,
          background,
        },
      })
        .png()
        .toBuffer();
    const animatedWebp = await sharp(
      [await frame("#ffffff"), await frame("#0D9488")],
      { join: { animated: true } }
    )
      .webp({ loop: 0, delay: [50, 50] })
      .toBuffer();

    await expect(
      validateAndNormalizeLogoImage(
        animatedWebp,
        "uploads/ws1/animated.webp"
      )
    ).rejects.toThrow();
  });
});
