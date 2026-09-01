/**
 * ANALYTICS_EXPORT_FORMATS claims, in its own doc comment, to mirror the
 * download route's accepted formats exactly. Nothing enforced that.
 *
 * The list is deliberately not imported from the route (the domain module stays
 * free of route-handler imports), which is exactly why the two can drift: adding
 * a format to the route leaves analytics rejecting the payload, so every export
 * of that format records nothing. A test has no such constraint, so it holds the
 * two declarations against each other directly.
 */

import { describe, expect, test } from "bun:test";
import { ANALYTICS_EXPORT_FORMATS } from "../analytics-collector";
import { PROPOSAL_DOWNLOAD_FORMATS } from "../../app/api/proposals/[id]/download/route";

describe("analytics export formats mirror the download route", () => {
  test("every format the route can serve is recordable", () => {
    // Anti-vacuous: an empty route list would pass the loop below.
    expect(PROPOSAL_DOWNLOAD_FORMATS.length).toBeGreaterThan(5);
    for (const format of PROPOSAL_DOWNLOAD_FORMATS) {
      expect(
        ANALYTICS_EXPORT_FORMATS as readonly string[],
        `route serves "${format}" but analytics would reject it`,
      ).toContain(format);
    }
  });

  test("no recordable format is one the route cannot serve", () => {
    const formats = new Set<string>(PROPOSAL_DOWNLOAD_FORMATS);
    for (const format of ANALYTICS_EXPORT_FORMATS) {
      expect(
        formats.has(format),
        `analytics accepts "${format}" but no export produces it`,
      ).toBe(true);
    }
  });
});
