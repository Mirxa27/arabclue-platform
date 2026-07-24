import { expect, test } from "bun:test";
import type {
  BrowserType,
  Page,
} from "playwright";
import type {
  BilingualDocumentSpec,
  BilingualInlineNode,
} from "../bilingual-layout";
import { renderBilingualArtifact } from "../bilingual-pdf";

const inline = (text: string): readonly BilingualInlineNode[] => [
  { type: "text", text },
];

const fixture: BilingualDocumentSpec = {
  id: "browser-compatibility",
  title: {
    en: inline("Browser compatibility"),
    ar: inline("توافق المتصفحات"),
  },
  sections: [
    {
      id: "delivery",
      alignmentKey: "browser.delivery",
      title: {
        en: inline("Delivery"),
        ar: inline("التسليم"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "delivery-summary",
          content: {
            en: inline("Reference PO-2026-18 remains readable and aligned."),
            ar: inline(
              "يبقى المرجع PO-2026-18 مقروءاً ومحاذياً في التخطيط ثنائي اللغة."
            ),
          },
        },
      ],
    },
  ],
};

interface BrowserGeometry {
  readonly pairCount: number;
  readonly h1Count: number;
  readonly overflow: number;
  readonly supportsGrid: boolean;
  readonly supportsLogicalPadding: boolean;
  readonly fontStatus: string;
  readonly arabicFontAvailable: boolean;
  readonly englishFontAvailable: boolean;
  readonly english: {
    readonly direction: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly order: string;
  };
  readonly arabic: {
    readonly direction: string;
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly order: string;
  };
}

type BrowserEngineName = "chromium" | "firefox" | "webkit";

const OPERATION_TIMEOUT_MS = 12_000;
const CLEANUP_TIMEOUT_MS = 8_000;

async function boundedOperation<T>(
  engine: BrowserEngineName,
  viewport: number | "browser",
  operation: string,
  task: () => Promise<T>,
  timeoutMs = OPERATION_TIMEOUT_MS
): Promise<T> {
  const startedAt = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `[${engine} ${String(viewport)}] ${operation} exceeded ${String(timeoutMs)}ms`
            )
          );
        }, timeoutMs);
      }),
    ]);
  } catch (cause) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    throw new Error(
      `[${engine} ${String(viewport)}] ${operation} failed after ${String(elapsedMs)}ms`,
      { cause }
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (process.env.PLAYWRIGHT_BROWSER_DIAGNOSTICS === "1") {
      const elapsedMs = Math.round(performance.now() - startedAt);
      console.info(
        `[browser-matrix] ${engine} ${String(viewport)} ${operation}: ${String(elapsedMs)}ms`
      );
    }
  }
}

async function measure(
  page: Page,
  engine: BrowserEngineName,
  html: string,
  width: number
): Promise<BrowserGeometry> {
  await boundedOperation(engine, width, "set viewport", () =>
    page.setViewportSize({ width, height: 900 })
  );
  await boundedOperation(engine, width, "emulate screen media", () =>
    page.emulateMedia({ media: "screen" })
  );
  await boundedOperation(engine, width, "install document HTML", () =>
    page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: OPERATION_TIMEOUT_MS,
    })
  );

  const pair = page.locator(
    '[data-alignment-key="browser.delivery"][data-fragment-index="0"]'
  );
  await boundedOperation(engine, width, "locate ready layout", () =>
    pair.waitFor({ state: "attached", timeout: OPERATION_TIMEOUT_MS })
  );

  // DOM readiness and font readiness are separate. Waiting for
  // FontFaceSet.status gives every engine the same bounded contract without
  // relying on an unbounded page.evaluate(document.fonts.ready).
  await boundedOperation(engine, width, "load embedded fonts", () =>
    page.waitForFunction(
      () => document.fonts.status === "loaded",
      undefined,
      { timeout: OPERATION_TIMEOUT_MS, polling: 50 }
    )
  );

  return await boundedOperation(engine, width, "measure layout", () =>
    pair.evaluate(
      (pairElement) => {
        const pair = pairElement as HTMLElement;
        const english = pair.querySelector<HTMLElement>(
          ':scope > [data-language="en"]'
        );
        const arabic = pair.querySelector<HTMLElement>(
          ':scope > [data-language="ar"]'
        );
        if (!english || !arabic) {
          throw new Error("Expected paired language cells were not rendered.");
        }

        const describe = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            direction: style.direction,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            order: style.order,
          };
        };

        return {
          pairCount: document.querySelectorAll("[data-bilingual-pair]").length,
          h1Count: document.querySelectorAll("h1").length,
          overflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          supportsGrid: CSS.supports("display", "grid"),
          supportsLogicalPadding: CSS.supports("padding-inline", "1rem"),
          fontStatus: document.fonts.status,
          arabicFontAvailable: document.fonts.check(
            '400 16px "IBM Plex Sans Arabic"',
            "توافق المتصفحات"
          ),
          englishFontAvailable: document.fonts.check(
            '400 16px "IBM Plex Sans"',
            "Browser compatibility"
          ),
          english: describe(english),
          arabic: describe(arabic),
        };
      },
      undefined,
      { timeout: OPERATION_TIMEOUT_MS }
    )
  );
}

async function runBrowserEngine(
  browserType: BrowserType,
  engine: BrowserEngineName,
  html: string
): Promise<Readonly<{ desktop: BrowserGeometry; mobile: BrowserGeometry }>> {
  const browser = await boundedOperation(
    engine,
    "browser",
    "launch browser",
    () =>
      browserType.launch({
        headless: true,
        timeout: OPERATION_TIMEOUT_MS,
      })
  );
  let primaryError: unknown;
  try {
    const context = await boundedOperation(
      engine,
      "browser",
      "create browser context",
      () =>
        browser.newContext({
          viewport: { width: 1_000, height: 900 },
          deviceScaleFactor: 1,
        })
    );
    const page = await boundedOperation(
      engine,
      "browser",
      "create page",
      () => context.newPage()
    );
    page.setDefaultTimeout(OPERATION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(OPERATION_TIMEOUT_MS);

    return {
      desktop: await measure(page, engine, html, 1_000),
      mobile: await measure(page, engine, html, 480),
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await boundedOperation(
        engine,
        "browser",
        "close browser",
        () => browser.close(),
        CLEANUP_TIMEOUT_MS
      );
    } catch (cleanupError) {
      if (primaryError) {
        throw new AggregateError(
          [primaryError, cleanupError],
          `[${engine}] browser run and cleanup both failed`
        );
      }
      if (!process.env.PLAYWRIGHT_BROWSER_ENGINE) {
        throw cleanupError;
      }
      // The package-level matrix isolates each engine in a bounded child
      // process. A browser can occasionally acknowledge close only after
      // Playwright's transport deadline; report that lifecycle fault while
      // preserving the completed compatibility result. The parent runner
      // enforces a hard process deadline and terminates the entire child tree.
      console.warn(
        `[browser-matrix] ${engine} layout measurements completed, but graceful browser cleanup exceeded ${String(CLEANUP_TIMEOUT_MS)}ms; isolated process teardown will finish cleanup`
      );
    }
  }
}

const browserMatrixEnabled =
  process.env.PLAYWRIGHT_BROWSER_MATRIX === "1";
const browserEngines = ["chromium", "firefox", "webkit"] as const;
const requestedBrowserEngine =
  process.env.PLAYWRIGHT_BROWSER_ENGINE;

if (
  requestedBrowserEngine !== undefined &&
  !browserEngines.includes(requestedBrowserEngine as BrowserEngineName)
) {
  throw new Error(
    `PLAYWRIGHT_BROWSER_ENGINE must be one of ${browserEngines.join(", ")}.`
  );
}

for (const engine of browserEngines) {
  if (requestedBrowserEngine && requestedBrowserEngine !== engine) continue;
  test.skipIf(!browserMatrixEnabled)(
    `${engine} preserves desktop pairing and the mobile Arabic-first fallback`,
    async () => {
      const playwright = await import("playwright");
      const browserType = playwright[engine];
      const artifact = await renderBilingualArtifact(fixture, {
        target: "screen",
      });
      const { desktop, mobile } = await runBrowserEngine(
        browserType,
        engine,
        artifact.html
      );

      for (const geometry of [desktop, mobile]) {
        expect(geometry.pairCount).toBeGreaterThanOrEqual(3);
        expect(geometry.h1Count).toBe(1);
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.supportsGrid).toBe(true);
        expect(geometry.supportsLogicalPadding).toBe(true);
        expect(geometry.fontStatus).toBe("loaded");
        expect(geometry.arabicFontAvailable).toBe(true);
        expect(geometry.englishFontAvailable).toBe(true);
        expect(geometry.english.direction).toBe("ltr");
        expect(geometry.arabic.direction).toBe("rtl");
      }

      expect(desktop.english.left).toBeLessThan(desktop.arabic.left);
      expect(
        Math.abs(desktop.english.height - desktop.arabic.height)
      ).toBeLessThanOrEqual(0.5);

      expect(mobile.arabic.order).toBe("1");
      expect(mobile.english.order).toBe("2");
      expect(mobile.arabic.top).toBeLessThan(mobile.english.top);
      expect(
        Math.abs(mobile.english.width - mobile.arabic.width)
      ).toBeLessThanOrEqual(0.5);
    },
    60_000
  );
}
