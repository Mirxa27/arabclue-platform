import { expect, test } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { chromium } from "playwright";

test.skipIf(process.env.DOCUMENT_VIEWER_BROWSER !== "1")(
    "document readers preserve responsive geometry and interactive controls in both locales and themes",
    async () => {
        const root = join(import.meta.dir, "../../..");
        const bundle = await Bun.build({
            entrypoints: [join(import.meta.dir, "support/document-viewer-browser-entry.tsx")],
            target: "browser",
            format: "iife",
            define: { "process.env.NODE_ENV": JSON.stringify("production") },
        });
        expect(bundle.success).toBe(true);
        const script = await bundle.outputs[0].text();
        const cssPath = join(root, "src/app/globals.css");
        const stylesheet = await postcss([tailwindcss({ base: root })]).process(await readFile(cssPath, "utf8"), { from: cssPath });
        const fonts = `@font-face{font-family:ReaderLatin;src:url(data:font/woff2;base64,${(await readFile(join(root, "node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-Regular.woff2"))).toString("base64")})} @font-face{font-family:ReaderArabic;src:url(data:font/woff2;base64,${(await readFile(join(root, "node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-Regular.woff2"))).toString("base64")})} :root{--font-geist-sans:ReaderLatin;--font-ibm-arabic:ReaderArabic;--font-en:ReaderLatin;--font-ar:ReaderArabic} body{font-family:ReaderLatin,ReaderArabic,sans-serif} html[lang=ar] body{font-family:ReaderArabic,ReaderLatin,sans-serif}`;
        const output = join(root, "coverage/documents/viewer-ui");
        await mkdir(output, { recursive: true });
        const browser = await chromium.launch({ headless: true });
        try {
            for (const locale of ["en", "ar"] as const) {
                for (const theme of ["light", "dark"] as const) {
                    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
                        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce", colorScheme: theme });
                        const errors: string[] = [];
                        page.on("pageerror", (error) => errors.push(error.message));
                        await page.route("**/*", (route) => route.abort("blockedbyclient"));
                        await page.route("http://document-viewer.test/", (route) => route.fulfill({
                            contentType: "text/html",
                            body: `<html lang="${locale}" class="${theme}"><head><style>${stylesheet.css}\n${fonts}</style></head><body><div id="root"></div></body></html>`,
                        }));
                        await page.goto("http://document-viewer.test/");
                        await page.evaluate((language) => localStorage.setItem("arabclue-locale", language), locale);
                        await page.addScriptTag({ content: script });
                        const bilingual = page.getByRole("button", { name: locale === "ar" ? "ثنائي اللغة" : "Bilingual", exact: true });
                        try {
                            await bilingual.click({ timeout: 5_000 });
                        } catch (cause) {
                            throw new Error(JSON.stringify({ url: page.url(), errors, body: await page.locator("body").innerText() }), { cause });
                        }
                        expect(await bilingual.getAttribute("aria-pressed")).toBe("true");
                        await page.evaluate(() => document.fonts.ready);
                        const documentHeading = page.locator("article > header h1");
                        expect(await documentHeading.getAttribute("dir")).toBe("rtl");
                        expect(await documentHeading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(width < 640 ? 24 : 32);
                        const cellColors = await page.locator('[data-preview-section="0"]').getByRole("cell", { name: "Document control", exact: true }).evaluate((element) => {
                            const wrapper = element.closest("table")?.parentElement;
                            if (!wrapper) throw new Error("Document table wrapper missing");
                            return { cell: getComputedStyle(element).color, prose: getComputedStyle(wrapper).color };
                        });
                        expect(cellColors.cell).toBe(cellColors.prose);
                        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
                        await page.screenshot({ path: join(output, `builder-${locale}-${theme}-${width}.png`) });
                        await page.getByRole("combobox").selectOption("4");
                        const section = page.locator('[data-preview-section="4"]');
                        const sectionBounds = await section.boundingBox();
                        expect(sectionBounds?.y).toBeGreaterThanOrEqual(0);
                        expect(sectionBounds?.y).toBeLessThan(400);
                        await page.getByRole("button", { name: "Open attachment", exact: true }).click();
                        const dialog = page.getByRole("dialog");
                        await dialog.waitFor({ state: "visible" });
                        const bounds = await dialog.boundingBox();
                        expect(bounds?.width).toBeGreaterThan(width * 0.85);
                        expect(await dialog.locator("h2 button, h2 a").count()).toBe(0);
                        expect(await dialog.getByRole("heading").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(18);
                        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
                        if (width >= 640) {
                            const expand = dialog.getByRole("button", { name: locale === "ar" ? "توسيع العرض" : "Expand view", exact: true });
                            await expand.click();
                            expect(await expand.getAttribute("aria-pressed")).toBe("true");
                        }
                        await page.screenshot({ path: join(output, `attachment-${locale}-${theme}-${width}.png`) });
                        await page.keyboard.press("Escape");
                        await dialog.waitFor({ state: "hidden" });
                        await page.getByRole("button", { name: "Generated preview", exact: true }).click();
                        await page.getByRole("alert").waitFor({ state: "visible" });
                        expect(await page.getByRole("button", { name: locale === "ar" ? "تنزيل" : "Download", exact: true }).isDisabled()).toBe(true);
                        const expandLabel = locale === "ar" ? "توسيع العرض" : "Expand view";
                        await page.getByRole("button", { name: expandLabel, exact: true }).click();
                        const expandedPreview = page.getByRole("dialog");
                        await expandedPreview.waitFor({ state: "visible", timeout: 3_000 });
                        await page.waitForFunction(() => {
                            const dialog = document.querySelector('[role="dialog"]');
                            return dialog !== null && dialog.getBoundingClientRect().width > innerWidth * 0.95;
                        });
                        const previewBounds = await expandedPreview.boundingBox();
                        expect(previewBounds?.width).toBeGreaterThan(width * 0.95);
                        expect(await expandedPreview.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
                        await page.screenshot({ path: join(output, `generated-error-${locale}-${theme}-${width}.png`) });
                        await page.keyboard.press("Escape");
                        await expandedPreview.waitFor({ state: "hidden" });
                        await page.waitForFunction((label) => document.activeElement?.getAttribute("aria-label") === label, expandLabel);

                        await page.route((url) => (
                            url.origin === "http://document-viewer.test" &&
                            url.pathname === "/api/proposals/browser-test/download" &&
                            url.searchParams.size === 2 &&
                            url.searchParams.get("format") === "html" &&
                            url.searchParams.get("locale") === locale
                        ), (route) => {
                            if (route.request().method() !== "GET") return route.abort("blockedbyclient");
                            return route.fulfill({
                                contentType: "text/html",
                                body: `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><style>body{margin:24px;background:white;color:#222;font-family:sans-serif}main{min-height:4000px}button{position:fixed;top:8px;inset-inline-end:8px}</style></head><body><button type="button">Document action</button><main><h1>Loaded test document</h1><p>Isolated reader fixture, not a production API response.</p></main></body></html>`,
                            });
                        });
                        await page.getByRole("button", { name: locale === "ar" ? "تحديث المعاينة" : "Refresh preview", exact: true }).click();
                        const frame = page.frameLocator("iframe");
                        await frame.getByRole("heading", { name: "Loaded test document" }).waitFor({ state: "visible" });
                        expect(await page.getByRole("alert").count()).toBe(0);
                        expect(await page.locator("iframe").getAttribute("sandbox")).not.toContain("allow-scripts");
                        await frame.locator("body").evaluate((element) => element.ownerDocument.defaultView?.scrollTo(0, 800));
                        await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.scrollingElement?.scrollTop === 800);
                        await page.getByRole("button", { name: expandLabel, exact: true }).click();
                        await expandedPreview.waitFor({ state: "visible" });
                        await frame.getByRole("heading", { name: "Loaded test document" }).waitFor({ state: "attached" });
                        await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.scrollingElement?.scrollTop === 800);
                        expect(await frame.locator("body").evaluate((element) => element.ownerDocument.scrollingElement?.scrollTop)).toBe(800);
                        await frame.getByRole("button", { name: "Document action" }).press("Escape");
                        await expandedPreview.waitFor({ state: "hidden" });
                        await page.waitForFunction((label) => document.activeElement?.getAttribute("aria-label") === label, expandLabel);
                        await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.scrollingElement?.scrollTop === 800);
                        expect(await frame.locator("body").evaluate((element) => element.ownerDocument.scrollingElement?.scrollTop)).toBe(800);
                        await page.getByRole("button", { name: expandLabel, exact: true }).click();
                        await expandedPreview.waitFor({ state: "visible" });
                        await frame.getByRole("button", { name: "Document action" }).waitFor({ state: "visible" });
                        await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.scrollingElement?.scrollTop === 800);
                        expect(await frame.locator("body").evaluate((element) => element.ownerDocument.scrollingElement?.scrollTop)).toBe(800);
                        await page.getByRole("button", { name: locale === "ar" ? "تصغير العرض" : "Exit expanded view", exact: true }).click();
                        await expandedPreview.waitFor({ state: "hidden" });
                        await page.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.scrollingElement?.scrollTop === 800);
                        expect(await frame.locator("body").evaluate((element) => element.ownerDocument.scrollingElement?.scrollTop)).toBe(800);
                        expect(errors).toEqual([]);
                        await page.close();
                    }
                }
            }
        } finally {
            await browser.close();
        }
    },
    120_000,
);