import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const BILINGUAL_FONT_TRACE_ROUTES = Object.freeze([
  ".next/server/app/api/proposals/[id]/download/route.js.nft.json",
  ".next/server/app/api/contracts/templates/[key]/preview/route.js.nft.json",
  ".next/server/app/api/business-profile/export/route.js.nft.json",
]);

const notoWeights = Object.freeze([300, 400, 500, 600, 700]);

export const REQUIRED_BILINGUAL_FONT_ASSETS = Object.freeze([
  ...notoWeights.map(
    (weight) =>
      `node_modules/@fontsource/noto-sans/files/noto-sans-latin-${weight}-normal.woff2`
  ),
  ...notoWeights.map(
    (weight) =>
      `node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-${weight}-normal.woff2`
  ),
  ...[
    "Light",
    "Regular",
    "Medium",
    "SemiBold",
    "Bold",
  ].map(
    (weight) =>
      `node_modules/@ibm/plex-sans/fonts/complete/woff2/IBMPlexSans-${weight}.woff2`
  ),
  ...[
    "Light",
    "Regular",
    "Medium",
    "SemiBold",
    "Bold",
  ].map(
    (weight) =>
      `node_modules/@ibm/plex-sans-arabic/fonts/complete/woff2/IBMPlexSansArabic-${weight}.woff2`
  ),
]);

/**
 * What the PDF renderer loads at runtime through paths the tracer cannot
 * follow. `playwright-core` reads `browsers.json` (and its `package.json`)
 * via `require(path.join(packageRoot, …))`; `@sparticuz/chromium` inflates
 * its brotli archives from a `../../bin` it computes at call time. Production
 * answered 503 `PDF_UNAVAILABLE` — "Cannot find module '/…json'" — because
 * `browsers.json` never shipped, and the archives would have been next.
 */
export const REQUIRED_PDF_RUNTIME_ASSETS = Object.freeze([
  "node_modules/playwright-core/package.json",
  "node_modules/playwright-core/browsers.json",
  "node_modules/@sparticuz/chromium/bin/chromium.br",
  "node_modules/@sparticuz/chromium/bin/al2023.tar.br",
  "node_modules/@sparticuz/chromium/bin/fonts.tar.br",
  "node_modules/@sparticuz/chromium/bin/swiftshader.tar.br",
]);

function normalized(value) {
  return value.replaceAll("\\", "/");
}

function missingFrom(files, required) {
  const normalizedFiles = files.map(normalized);
  return required.filter(
    (asset) =>
      !normalizedFiles.some(
        (candidate) => candidate === asset || candidate.endsWith(`/${asset}`)
      )
  );
}

export function missingBilingualFontAssets(files) {
  return missingFrom(files, REQUIRED_BILINGUAL_FONT_ASSETS);
}

export function missingPdfRuntimeAssets(files) {
  return missingFrom(files, REQUIRED_PDF_RUNTIME_ASSETS);
}

export async function assertBilingualFontTraces(repositoryRoot) {
  const failures = [];
  for (const route of BILINGUAL_FONT_TRACE_ROUTES) {
    const tracePath = path.join(repositoryRoot, route);
    let parsed;
    try {
      parsed = JSON.parse(await readFile(tracePath, "utf8"));
    } catch (error) {
      failures.push(
        `${route}: ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.files) ||
      !parsed.files.every((file) => typeof file === "string")
    ) {
      failures.push(`${route}: invalid Next.js trace manifest`);
      continue;
    }
    const missing = [
      ...missingBilingualFontAssets(parsed.files),
      ...missingPdfRuntimeAssets(parsed.files),
    ];
    if (missing.length > 0) {
      failures.push(`${route}: missing ${missing.join(", ")}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(
      `Bilingual PDF route tracing is incomplete:\n${failures.join("\n")}`
    );
  }
}

if (import.meta.main) {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  await assertBilingualFontTraces(repositoryRoot);
  process.stdout.write(
    `[font-trace] Verified ${REQUIRED_BILINGUAL_FONT_ASSETS.length} embedded font assets and ${REQUIRED_PDF_RUNTIME_ASSETS.length} PDF runtime files in ${BILINGUAL_FONT_TRACE_ROUTES.length} route traces.\n`
  );
}
