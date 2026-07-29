/**
 * Feature: platform-completion
 * Property 3: Translation values are non-empty
 * Property 4: Translation lookup closure
 * Property 34: Translation placeholders have parity
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  COMPLETION_TRANSLATION_KEY_MANIFEST,
  DYNAMIC_TRANSLATION_KEY_MANIFEST,
  isTranslationKey,
  localizationRegistry,
  type TranslationKey,
} from "../../i18n";

const PLACEHOLDER_PATTERN = /{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g;
const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06ff]/;

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_PATTERN)]
    .map((match) => match[1])
    .sort();
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "dist" ||
      entry === "coverage"
    ) {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkTsFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

describe("Feature: platform-completion, Property 3: Translation values are non-empty", () => {
  test("every registry key has non-whitespace AR/EN values; completion narrative Arabic contains Arabic script", () => {
    const keys = Object.keys(localizationRegistry) as TranslationKey[];
    expect(keys.length).toBeGreaterThan(100);

    for (const key of keys) {
      const pair = localizationRegistry[key];
      expect(pair.ar.trim().length, `${key}.ar`).toBeGreaterThan(0);
      expect(pair.en.trim().length, `${key}.en`).toBeGreaterThan(0);
    }

    // Completion surfaces require Arabic script (Req 18.1 narrative keys).
    for (const surfaceKeys of Object.values(COMPLETION_TRANSLATION_KEY_MANIFEST)) {
      for (const key of surfaceKeys) {
        expect(
          ARABIC_SCRIPT_PATTERN.test(localizationRegistry[key].ar),
          `${key} Arabic script`
        ).toBe(true);
      }
    }
  });
});

describe("Feature: platform-completion, Property 4: Translation lookup closure", () => {
  test("literal tr/translate calls and dynamic-key families resolve in the registry", () => {
    for (const [family, members] of Object.entries(
      DYNAMIC_TRANSLATION_KEY_MANIFEST
    )) {
      expect(Object.keys(members).length, family).toBeGreaterThan(0);
      for (const key of Object.values(members)) {
        expect(isTranslationKey(key), `${family}.${key}`).toBe(true);
      }
    }

    const root = path.join(process.cwd(), "src");
    const files = walkTsFiles(root);
    const callPattern =
      /\b(?:tr|translate)\(\s*["'`]([A-Za-z][A-Za-z0-9_]*)["'`]/g;
    const missing = new Set<string>();

    for (const file of files) {
      if (file.includes(`${path.sep}__tests__${path.sep}`)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(callPattern)) {
        const key = match[1]!;
        if (!isTranslationKey(key)) missing.add(`${key} @ ${path.relative(process.cwd(), file)}`);
      }
    }

    expect([...missing].sort()).toEqual([]);
  });
});

describe("Feature: platform-completion, Property 34: Translation placeholders have parity", () => {
  test("Arabic and English placeholder sets are identical for every registry pair", () => {
    for (const [key, pair] of Object.entries(localizationRegistry)) {
      expect(placeholders(pair.ar), `${key} Arabic placeholders`).toEqual(
        placeholders(pair.en)
      );
    }
  });
});
