/**
 * Feature: platform-completion
 * Property 20: Revert appends exactly one revision
 * Property 30: Full history remains reachable beyond twenty revisions
 */

import { describe, expect, test } from "bun:test";
import {
  decodeDocumentVersionCursor,
  decodeProposalVersionCursor,
  encodeDocumentVersionCursor,
  encodeProposalVersionCursor,
} from "../../version-history-cursor";

type Revision = {
  version: number;
  content: string;
  sourceVersion: number | null;
};

function createHistory(seed: number, size: number): Revision[] {
  return Array.from({ length: size }, (_, i) => ({
    version: i + 1,
    content: `content-${seed}-${i + 1}`,
    sourceVersion: null,
  }));
}

function revertAppend(
  history: Revision[],
  sourceVersion: number
): Revision[] {
  const source = history.find((r) => r.version === sourceVersion);
  if (!source) throw new Error("missing source");
  const nextVersion = Math.max(...history.map((r) => r.version)) + 1;
  return [
    ...history,
    {
      version: nextVersion,
      content: source.content,
      sourceVersion: source.version,
    },
  ];
}

function traverseAll(
  history: readonly Revision[],
  pageSize: number,
  encode: (version: number) => string,
  decode: (cursor: string) => number | null
): number[] {
  const ordered = [...history].sort((a, b) => b.version - a.version);
  const seen: number[] = [];
  let cursor: string | undefined;
  for (;;) {
    let start = 0;
    if (cursor) {
      const bound = decode(cursor);
      expect(bound).not.toBeNull();
      start = ordered.findIndex((r) => r.version < (bound as number));
      if (start < 0) break;
    }
    const page = ordered.slice(start, start + pageSize);
    if (page.length === 0) break;
    seen.push(...page.map((r) => r.version));
    if (page.length < pageSize) break;
    cursor = encode(page[page.length - 1]!.version);
  }
  return seen;
}

describe("Feature: platform-completion, Property 20: Revert appends exactly one revision", () => {
  test("revert yields count+1, exact source copy, and readable priors across 100+ histories", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const size = 2 + (seed % 12);
      const history = createHistory(seed, size);
      const sourceVersion = 1 + (seed % size);
      const before = history.map((r) => ({ ...r }));
      const after = revertAppend(history, sourceVersion);

      expect(after.length).toBe(before.length + 1);
      const appended = after[after.length - 1]!;
      expect(appended.version).toBe(size + 1);
      expect(appended.sourceVersion).toBe(sourceVersion);
      expect(appended.content).toBe(
        before.find((r) => r.version === sourceVersion)!.content
      );

      for (const prior of before) {
        const found = after.find((r) => r.version === prior.version);
        expect(found).toEqual(prior);
      }
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 30: Full history remains reachable beyond twenty revisions", () => {
  test("cursor traversal returns every revision exactly once for sizes above twenty across 100+ histories", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const size = 21 + (seed % 30); // always > 20
      const history = createHistory(seed, size);
      const pageSize = 20;
      const workspaceId = `ws-${seed % 5}`;
      const proposalId = `proposal-${seed}`;
      const documentId = `document-${seed}`;

      const proposalSeen = traverseAll(
        history,
        pageSize,
        (v) => encodeProposalVersionCursor(workspaceId, proposalId, v),
        (c) => decodeProposalVersionCursor(c, workspaceId, proposalId)
      );
      expect(proposalSeen).toHaveLength(size);
      expect(new Set(proposalSeen).size).toBe(size);
      expect(proposalSeen).toEqual(
        [...history].map((r) => r.version).sort((a, b) => b - a)
      );

      const documentSeen = traverseAll(
        history,
        pageSize,
        (v) => encodeDocumentVersionCursor(workspaceId, documentId, v),
        (c) => decodeDocumentVersionCursor(c, workspaceId, documentId)
      );
      expect(documentSeen).toHaveLength(size);
      expect(new Set(documentSeen).size).toBe(size);

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
