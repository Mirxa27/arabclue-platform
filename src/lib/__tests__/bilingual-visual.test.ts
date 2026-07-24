import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";
import sharp from "sharp";
import type {
  BilingualDocumentSpec,
  BilingualInlineNode,
} from "../bilingual-layout";
import { renderBilingualArtifact } from "../bilingual-pdf";
import { synchronizeBilingualLayoutPage } from "../layout-sync";

const VISUAL_BASELINE_UPDATE_ENV = process.env.UPDATE_BILINGUAL_VISUAL_BASELINE;
if (
  VISUAL_BASELINE_UPDATE_ENV !== undefined &&
  VISUAL_BASELINE_UPDATE_ENV !== "0" &&
  VISUAL_BASELINE_UPDATE_ENV !== "1"
) {
  throw new Error("UPDATE_BILINGUAL_VISUAL_BASELINE must be exactly 0 or 1.");
}

const UPDATE_VISUAL_BASELINE = VISUAL_BASELINE_UPDATE_ENV === "1";
if (UPDATE_VISUAL_BASELINE && process.env.CI) {
  throw new Error(
    "Visual baselines cannot be updated in CI. Run `bun run update:bilingual:visual-baseline` locally and review the committed image.",
  );
}
if (UPDATE_VISUAL_BASELINE && process.env.PLAYWRIGHT_CHROMIUM !== "1") {
  throw new Error("Visual baseline updates require PLAYWRIGHT_CHROMIUM=1.");
}

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const VISUAL_BASELINE_PATH = path.join(
  TEST_DIRECTORY,
  "visual-baselines",
  "bilingual-layout.chromium.png",
);
const VISUAL_ARTIFACT_DIRECTORY = path.join(
  REPOSITORY_ROOT,
  "coverage",
  "bilingual-visual",
);

/**
 * Cross-platform normalization intentionally reduces the captured image by
 * half and applies a small Gaussian blur. This keeps glyph anti-aliasing
 * differences from macOS and Linux below the gate without masking geometry,
 * color, ordering, table, list, or image regressions.
 */
const VISUAL_DIFF_POLICY = Object.freeze({
  normalizedScale: 0.5,
  blurSigma: 0.5,
  changedPixelRmsThreshold: 24,
  maxDiffPixelRatio: 0.005,
} as const);

const SCREENSHOT_STABILITY_CSS = `
  *,
  *::before,
  *::after {
    animation: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }

  html,
  body,
  [data-bilingual-document] {
    background: #ffffff !important;
    color-scheme: light !important;
  }
`;

const FIXTURE_IMAGE_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAYCAIAAADF1mwTAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAQklEQVRYw+3XoQ0AIAxFwW6AZAc8W7G/hQEQ6E+uebbiVNOqNbMDAPgG0Pp4BgAAcC3u8AEAAEgHuAMAAAAeGoDkDiMsKnKVWfVXAAAAAElFTkSuQmCC";

interface DecodedVisualImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
}

interface VisualDiffResult {
  readonly changedPixels: number;
  readonly totalPixels: number;
  readonly diffPixelRatio: number;
  readonly maximumPixelRmsDelta: number;
  readonly diffPng: Buffer;
}

async function normalizeVisualScreenshot(screenshot: Buffer): Promise<Buffer> {
  const metadata = await sharp(screenshot).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Visual screenshot dimensions could not be decoded.");
  }

  return sharp(screenshot)
    .flatten({ background: "#ffffff" })
    .resize({
      width: Math.max(
        1,
        Math.round(metadata.width * VISUAL_DIFF_POLICY.normalizedScale),
      ),
      height: Math.max(
        1,
        Math.round(metadata.height * VISUAL_DIFF_POLICY.normalizedScale),
      ),
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .blur(VISUAL_DIFF_POLICY.blurSigma)
    .removeAlpha()
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      palette: false,
    })
    .toBuffer();
}

async function decodeVisualImage(png: Buffer): Promise<DecodedVisualImage> {
  const decoded = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: decoded.info.channels,
  };
}

async function compareVisualImages(
  baselinePng: Buffer,
  actualPng: Buffer,
): Promise<VisualDiffResult> {
  const [baseline, actual] = await Promise.all([
    decodeVisualImage(baselinePng),
    decodeVisualImage(actualPng),
  ]);
  if (
    baseline.width !== actual.width ||
    baseline.height !== actual.height ||
    baseline.channels !== actual.channels
  ) {
    throw new Error(
      `Visual baseline dimensions changed: expected ${String(
        baseline.width,
      )}x${String(baseline.height)}x${String(
        baseline.channels,
      )}, received ${String(actual.width)}x${String(
        actual.height,
      )}x${String(actual.channels)}.`,
    );
  }
  if (baseline.channels < 3) {
    throw new Error("Visual regression images must contain RGB channels.");
  }

  const totalPixels = baseline.width * baseline.height;
  const diffData = Buffer.alloc(baseline.data.length);
  let changedPixels = 0;
  let maximumPixelRmsDelta = 0;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const offset = pixel * baseline.channels;
    const redDelta = (baseline.data[offset] ?? 0) - (actual.data[offset] ?? 0);
    const greenDelta =
      (baseline.data[offset + 1] ?? 0) - (actual.data[offset + 1] ?? 0);
    const blueDelta =
      (baseline.data[offset + 2] ?? 0) - (actual.data[offset + 2] ?? 0);
    const rmsDelta = Math.sqrt(
      (redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta) /
        3,
    );
    maximumPixelRmsDelta = Math.max(maximumPixelRmsDelta, rmsDelta);
    const changed = rmsDelta > VISUAL_DIFF_POLICY.changedPixelRmsThreshold;

    if (changed) {
      changedPixels += 1;
      diffData[offset] = 255;
      diffData[offset + 1] = 0;
      diffData[offset + 2] = 255;
    } else {
      const luminance = Math.round(
        (baseline.data[offset] ?? 0) * 0.2126 +
          (baseline.data[offset + 1] ?? 0) * 0.7152 +
          (baseline.data[offset + 2] ?? 0) * 0.0722,
      );
      const muted = Math.round(192 + luminance * 0.25);
      diffData[offset] = muted;
      diffData[offset + 1] = muted;
      diffData[offset + 2] = muted;
    }
  }

  const diffPng = await sharp(diffData, {
    raw: {
      width: baseline.width,
      height: baseline.height,
      channels: baseline.channels as 3,
    },
  })
    .png({
      adaptiveFiltering: false,
      compressionLevel: 9,
      palette: false,
    })
    .toBuffer();

  return {
    changedPixels,
    totalPixels,
    diffPixelRatio: changedPixels / totalPixels,
    maximumPixelRmsDelta,
    diffPng,
  };
}

async function loadVisualBaseline(): Promise<Buffer> {
  try {
    return await readFile(VISUAL_BASELINE_PATH);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "The committed bilingual visual baseline is missing. Run `bun run update:bilingual:visual-baseline`, review it, and commit the generated PNG.",
      );
    }
    throw error;
  }
}

async function writeVisualDiagnostics(
  actualPng: Buffer,
  diffPng: Buffer,
): Promise<void> {
  await mkdir(VISUAL_ARTIFACT_DIRECTORY, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(VISUAL_ARTIFACT_DIRECTORY, "actual.normalized.png"),
      actualPng,
    ),
    writeFile(
      path.join(VISUAL_ARTIFACT_DIRECTORY, "diff.normalized.png"),
      diffPng,
    ),
  ]);
}

const inline = (text: string): readonly BilingualInlineNode[] => [
  { type: "text", text },
];

const visualFixture: BilingualDocumentSpec = {
  id: "visual-regression-fixture",
  title: {
    en: inline("Managed Cloud Services"),
    ar: inline("خدمات السحابة المُدارة"),
  },
  sections: [
    {
      id: "mixed-content",
      alignmentKey: "visual.mixed-content",
      title: {
        en: inline("Service scope"),
        ar: inline("نطاق الخدمة"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "mixed-direction",
          content: {
            en: inline(
              "The service reference PO-2026-18 includes 99.95% availability.",
            ),
            ar: inline(
              "يشمل مرجع الخدمة PO-2026-18 توافراً بنسبة 99.95% مع المراقبة والدعم والاستجابة للحوادث وإعداد تقارير الأداء الدورية.",
            ),
          },
        },
        {
          type: "list",
          id: "deliverables",
          ordered: true,
          items: [
            {
              id: "monitoring",
              content: {
                en: inline("Monitoring"),
                ar: inline("المراقبة"),
              },
            },
            {
              id: "reporting",
              content: {
                en: inline("Monthly reporting"),
                ar: inline("التقارير الشهرية"),
              },
            },
          ],
        },
        {
          type: "table",
          id: "service-levels",
          caption: {
            en: inline("Service levels"),
            ar: inline("مستويات الخدمة"),
          },
          columns: [
            {
              id: "metric",
              header: { en: inline("Metric"), ar: inline("المؤشر") },
            },
            {
              id: "target",
              header: { en: inline("Target"), ar: inline("المستهدف") },
              align: "numeric",
            },
          ],
          rows: [
            {
              id: "availability",
              cells: {
                metric: {
                  content: {
                    en: inline("Availability"),
                    ar: inline("التوافر"),
                  },
                },
                target: {
                  content: {
                    en: inline("99.95%"),
                    ar: inline("99.95%"),
                  },
                },
              },
            },
          ],
        },
        {
          type: "image",
          id: "brand-pattern",
          source: {
            kind: "data",
            uri: FIXTURE_IMAGE_DATA_URI,
          },
          alt: {
            en: "Saudi green service pattern",
            ar: "نمط خدمة باللون الأخضر السعودي",
          },
          caption: {
            en: inline("Service identity"),
            ar: inline("هوية الخدمة"),
          },
          visualBehavior: "never",
          widthPercent: 42,
        },
      ],
    },
  ],
};

test("visual pixel policy detects a material rendering regression", async () => {
  const width = 40;
  const height = 40;
  const channels = 3;
  const baselinePixels = Buffer.alloc(width * height * channels, 255);
  const changedPixels = Buffer.from(baselinePixels);

  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const offset = (y * width + x) * channels;
      changedPixels[offset] = 0;
      changedPixels[offset + 1] = 108;
      changedPixels[offset + 2] = 53;
    }
  }

  const encode = (data: Buffer): Promise<Buffer> =>
    sharp(data, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  const [baseline, changed] = await Promise.all([
    encode(baselinePixels),
    encode(changedPixels),
  ]);
  const result = await compareVisualImages(baseline, changed);

  expect(result.changedPixels).toBe(100);
  expect(result.diffPixelRatio).toBe(0.0625);
  expect(result.diffPixelRatio).toBeGreaterThan(
    VISUAL_DIFF_POLICY.maxDiffPixelRatio,
  );
});

test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
  "visual geometry keeps paired columns aligned and overflow-free",
  async () => {
    const { chromium } = await import("playwright");
    const artifact = await renderBilingualArtifact(visualFixture, {
      target: "print",
    });
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--disable-lcd-text",
        "--font-render-hinting=none",
        "--force-color-profile=srgb",
        "--force-device-scale-factor=1",
      ],
    });

    try {
      const context = await browser.newContext({
        colorScheme: "light",
        forcedColors: "none",
        javaScriptEnabled: true,
        locale: "en-US",
        reducedMotion: "reduce",
        serviceWorkers: "block",
        timezoneId: "UTC",
        viewport: { width: 900, height: 1_200 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.route("**/*", (route) => route.abort("blockedbyclient"));
      await page.emulateMedia({
        media: "print",
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await page.setContent(artifact.html, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: SCREENSHOT_STABILITY_CSS });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images).map(async (image) => {
            if (!image.complete) {
              await new Promise<void>((resolve, reject) => {
                image.addEventListener("load", () => resolve(), {
                  once: true,
                });
                image.addEventListener(
                  "error",
                  () => reject(new Error("Fixture image failed to load.")),
                  { once: true },
                );
              });
            }
            await image.decode();
          }),
        );
      });
      await synchronizeBilingualLayoutPage(page);

      const geometry = await page.evaluate(() => {
        const pairs = Array.from(
          document.querySelectorAll<HTMLElement>("[data-bilingual-pair]"),
        ).map((pair) => {
          const english = pair.querySelector<HTMLElement>(
            ':scope > [data-language="en"]',
          );
          const arabic = pair.querySelector<HTMLElement>(
            ':scope > [data-language="ar"]',
          );
          if (!english || !arabic) {
            return null;
          }
          const enRect = english.getBoundingClientRect();
          const arRect = arabic.getBoundingClientRect();
          return {
            enHeight: enRect.height,
            arHeight: arRect.height,
            enLeft: enRect.left,
            arLeft: arRect.left,
            enDirection: getComputedStyle(english).direction,
            arDirection: getComputedStyle(arabic).direction,
          };
        });
        return {
          pairs,
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          h1Count: document.querySelectorAll("h1").length,
          missingLanguageAttributes: document.querySelectorAll(
            ".bilingual-cell:not([lang]):not([dir])",
          ).length,
        };
      });

      expect(geometry.pairs.length).toBeGreaterThan(3);
      for (const pair of geometry.pairs) {
        expect(pair).not.toBeNull();
        if (!pair) continue;
        expect(Math.abs(pair.enHeight - pair.arHeight)).toBeLessThanOrEqual(
          0.5,
        );
        expect(pair.enLeft).toBeLessThan(pair.arLeft);
        expect(pair.enDirection).toBe("ltr");
        expect(pair.arDirection).toBe("rtl");
      }
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.h1Count).toBe(1);
      expect(geometry.missingLanguageAttributes).toBe(0);

      const screenshot = await page
        .locator("[data-bilingual-document]")
        .screenshot({
          type: "png",
          animations: "disabled",
          caret: "hide",
          scale: "css",
          style: SCREENSHOT_STABILITY_CSS,
        });
      expect(screenshot.byteLength).toBeGreaterThan(20_000);

      const normalizedScreenshot = await normalizeVisualScreenshot(screenshot);
      if (UPDATE_VISUAL_BASELINE) {
        await mkdir(path.dirname(VISUAL_BASELINE_PATH), {
          recursive: true,
        });
        await writeFile(VISUAL_BASELINE_PATH, normalizedScreenshot);
        process.stdout.write(
          `Updated ${path.relative(
            REPOSITORY_ROOT,
            VISUAL_BASELINE_PATH,
          )}. Review the PNG before committing it.\n`,
        );
      }

      const baseline = await loadVisualBaseline();
      const visualDiff = await compareVisualImages(
        baseline,
        normalizedScreenshot,
      );
      if (visualDiff.diffPixelRatio > VISUAL_DIFF_POLICY.maxDiffPixelRatio) {
        await writeVisualDiagnostics(normalizedScreenshot, visualDiff.diffPng);
        throw new Error(
          `Bilingual visual regression: ${String(
            visualDiff.changedPixels,
          )}/${String(visualDiff.totalPixels)} pixels (${(
            visualDiff.diffPixelRatio * 100
          ).toFixed(4)}%) exceeded an RMS RGB delta of ${String(
            VISUAL_DIFF_POLICY.changedPixelRmsThreshold,
          )}. The allowed changed-pixel ratio is ${(
            VISUAL_DIFF_POLICY.maxDiffPixelRatio * 100
          ).toFixed(2)}%. Diagnostics: ${path.relative(
            REPOSITORY_ROOT,
            VISUAL_ARTIFACT_DIRECTORY,
          )}. Maximum observed RMS delta: ${visualDiff.maximumPixelRmsDelta.toFixed(
            2,
          )}.`,
        );
      }
      expect(visualDiff.diffPixelRatio).toBeLessThanOrEqual(
        VISUAL_DIFF_POLICY.maxDiffPixelRatio,
      );
      await context.close();
    } finally {
      await browser.close();
    }
  },
  120_000,
);
