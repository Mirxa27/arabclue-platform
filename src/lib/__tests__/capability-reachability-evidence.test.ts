/**
 * The reachability guard has to actually check reachability.
 *
 * capability-reachability-manifest.ts opens by promising that every entry has
 * "a valid inbound UI, scheduler, or external-callback edge". The validator
 * behind that promise only called existsSync on the two paths, so an entry
 * could name any file in the repo as its inbound edge and pass. That is how
 * `ai.vendor-match` came to claim agent-workflow.tsx reaches it while
 * agent-workflow.tsx contains no reference to it at all — the capability was
 * unreachable and its own reachability test was green.
 *
 * A guard that cannot fail is worse than no guard: it manufactures confidence.
 * So each entry now carries `evidence` — a literal string that must appear in
 * the inbound file — and the validator checks it. Prose in `via` stays for
 * humans; `evidence` is the part a machine can hold us to.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAPABILITY_REACHABILITY_MANIFEST,
  UNREACHABLE_CAPABILITIES,
} from "../capability-reachability-manifest";
import { validateCapabilityReachability } from "../production-integrity-scanner";

const root = process.cwd();

describe("the reachability manifest describes edges that exist", () => {
  test("every declared edge is backed by evidence in the inbound file", () => {
    const findings = validateCapabilityReachability(root);
    const detail = findings.map((f) => `${f.code} ${f.path} — ${f.detail}`);
    expect(detail, `unreachable capability claimed:\n${detail.join("\n")}`).toEqual([]);
  });

  test("the validator rejects an edge whose evidence is absent", () => {
    // Anti-vacuous, and the exact hole this file exists to close: if the
    // validator ever regresses to existsSync, this passes a real file as the
    // inbound edge for a capability it does not reference, and must still fail.
    const findings = validateCapabilityReachability(root, [
      {
        id: "test.fabricated-edge",
        kind: "ui",
        target: "src/lib/capability-reachability-manifest.ts",
        inbound: "src/lib/production-integrity-scanner.ts",
        via: "a file that exists but does not contain the evidence",
        evidence: "ThisSymbolIsNotInThatFile",
      },
    ]);
    expect(findings.map((f) => f.code)).toContain("UNREACHABLE_INBOUND");
  });

  test("the validator still catches a missing file", () => {
    const findings = validateCapabilityReachability(root, [
      {
        id: "test.missing",
        kind: "ui",
        target: "src/does-not-exist.ts",
        inbound: "src/also-does-not-exist.tsx",
        via: "neither path is real",
        evidence: "irrelevant",
      },
    ]);
    const codes = findings.map((f) => f.code);
    expect(codes).toContain("MISSING_TARGET");
    expect(codes).toContain("MISSING_INBOUND");
  });

  test("the manifest is not empty", () => {
    // Anti-vacuous: an empty manifest satisfies every scan above.
    expect(CAPABILITY_REACHABILITY_MANIFEST.length).toBeGreaterThan(15);
  });
});

describe("capabilities recorded as unreachable really are unreachable", () => {
  test("nothing in src reaches an entry on the unreachable list", () => {
    // Otherwise the list becomes a place to park inconvenient failures. If a
    // capability has grown a real inbound edge, it belongs in the manifest.
    const reached: string[] = [];
    for (const entry of UNREACHABLE_CAPABILITIES) {
      for (const file of entry.wouldBeReachableVia) {
        const src = readFileSync(resolve(root, file), "utf8");
        if (src.includes(entry.evidence)) {
          reached.push(`${entry.id} — ${file} now contains ${entry.evidence}`);
        }
      }
    }
    expect(reached, `promote these to the manifest:\n${reached.join("\n")}`).toEqual([]);
  });

  test("each unreachable entry still names files that exist", () => {
    for (const entry of UNREACHABLE_CAPABILITIES) {
      for (const file of [entry.target, ...entry.wouldBeReachableVia]) {
        expect(() => readFileSync(resolve(root, file), "utf8"), `${entry.id}: ${file}`).not.toThrow();
      }
    }
  });
});
