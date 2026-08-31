/**
 * ANALYTICS_EXPORT_FORMATS claims, in its own doc comment, to mirror the
 * download route's ProposalDownloadFormat union exactly. Nothing enforced that.
 *
 * The list is deliberately not imported from the route (the domain module stays
 * free of route-handler imports), which is exactly why the two can drift: adding
 * a format to the route leaves analytics rejecting the payload, so every export
 * of that format records nothing. Compare the declarations as source instead.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ANALYTICS_EXPORT_FORMATS } from "../analytics-collector";

/** Members of the route's exported ProposalDownloadFormat union. */
function routeFormats(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/api/proposals/[id]/download/route.ts"),
    "utf8"
  );
  const block = /export type ProposalDownloadFormat =([\s\S]*?);\n/.exec(
    source
  )?.[1];
  expect(block, "ProposalDownloadFormat declaration not found").toBeTruthy();
  return [...block!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("analytics export formats mirror the download route", () => {
  test("every format the route can serve is recordable", () => {
    const formats = routeFormats();
    // Anti-vacuous: a regex that matched nothing would pass the loop below.
    expect(formats.length).toBeGreaterThan(5);
    for (const format of formats) {
      expect(
        ANALYTICS_EXPORT_FORMATS as readonly string[],
        `route serves "${format}" but analytics would reject it`
      ).toContain(format);
    }
  });

  test("no recordable format is one the route cannot serve", () => {
    const formats = new Set(routeFormats());
    for (const format of ANALYTICS_EXPORT_FORMATS) {
      expect(
        formats.has(format),
        `analytics accepts "${format}" but no export produces it`
      ).toBe(true);
    }
  });
});
