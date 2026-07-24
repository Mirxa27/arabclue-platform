import { expect, test } from "bun:test";
import type {
  BilingualDocumentSpec,
  BilingualInlineNode,
} from "../bilingual-layout";
import { renderBilingualArtifact } from "../bilingual-pdf";

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
              "The service reference PO-2026-18 includes 99.95% availability."
            ),
            ar: inline(
              "يشمل مرجع الخدمة PO-2026-18 توافراً بنسبة 99.95% مع المراقبة والدعم والاستجابة للحوادث وإعداد تقارير الأداء الدورية."
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
      ],
    },
  ],
};

test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
  "visual geometry keeps paired columns aligned and overflow-free",
  async () => {
    const { chromium } = await import("playwright");
    const artifact = await renderBilingualArtifact(visualFixture, {
      target: "print",
    });
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage({
        viewport: { width: 900, height: 1_200 },
        deviceScaleFactor: 1,
      });
      await page.setContent(artifact.html, { waitUntil: "networkidle" });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      const geometry = await page.evaluate(() => {
        const pairs = Array.from(
          document.querySelectorAll<HTMLElement>("[data-bilingual-pair]")
        ).map((pair) => {
          const english = pair.querySelector<HTMLElement>(
            ':scope > [data-language="en"]'
          );
          const arabic = pair.querySelector<HTMLElement>(
            ':scope > [data-language="ar"]'
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
          missingLanguageAttributes:
            document.querySelectorAll(
              '.bilingual-cell:not([lang]):not([dir])'
            ).length,
        };
      });

      expect(geometry.pairs.length).toBeGreaterThan(3);
      for (const pair of geometry.pairs) {
        expect(pair).not.toBeNull();
        if (!pair) continue;
        expect(Math.abs(pair.enHeight - pair.arHeight)).toBeLessThanOrEqual(0.5);
        expect(pair.enLeft).toBeLessThan(pair.arLeft);
        expect(pair.enDirection).toBe("ltr");
        expect(pair.arDirection).toBe("rtl");
      }
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.h1Count).toBe(1);
      expect(geometry.missingLanguageAttributes).toBe(0);

      const screenshot = await page.screenshot({
        type: "png",
        fullPage: true,
        animations: "disabled",
      });
      expect(screenshot.byteLength).toBeGreaterThan(20_000);
    } finally {
      await browser.close();
    }
  },
  120_000
);
