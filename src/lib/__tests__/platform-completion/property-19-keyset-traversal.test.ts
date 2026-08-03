/**
 * Feature: platform-completion, Property 19: Keyset traversal has no duplicates or omissions
 */

import { describe, expect, test } from "bun:test";
import {
  decodeContractRevisionCursor,
  decodeDocumentVersionCursor,
  decodeProposalVersionCursor,
  decodeWorkspaceTemplateVersionCursor,
  encodeContractRevisionCursor,
  encodeDocumentVersionCursor,
  encodeProposalVersionCursor,
  encodeWorkspaceTemplateVersionCursor,
} from "../../version-history-cursor";

function traverseDescendingVersions(
  versions: readonly number[],
  pageSize: number,
  encode: (version: number) => string,
  decode: (cursor: string) => number | null
): number[] {
  const ordered = [...versions].sort((a, b) => b - a);
  const seen: number[] = [];
  let cursor: string | undefined;
  for (;;) {
    let start = 0;
    if (cursor) {
      const bound = decode(cursor);
      expect(bound).not.toBeNull();
      start = ordered.findIndex((v) => v < (bound as number));
      if (start < 0) break;
    }
    const page = ordered.slice(start, start + pageSize);
    if (page.length === 0) break;
    seen.push(...page);
    if (page.length < pageSize) break;
    cursor = encode(page[page.length - 1]!);
  }
  return seen;
}

describe("Feature: platform-completion, Property 19: Keyset traversal has no duplicates or omissions", () => {
  test("proposal/document/contract/template cursors traverse exact ordered identity sets across 100+ datasets", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const workspaceId = `ws-${seed % 7}`;
      const resourceId = `res-${seed}`;
      const count = 1 + (seed % 40);
      const pageSize = 1 + (seed % 10);
      const versions = Array.from({ length: count }, (_, i) => i + 1);

      const proposalSeen = traverseDescendingVersions(
        versions,
        pageSize,
        (v) => encodeProposalVersionCursor(workspaceId, resourceId, v),
        (c) => decodeProposalVersionCursor(c, workspaceId, resourceId)
      );
      expect(proposalSeen).toEqual([...versions].sort((a, b) => b - a));
      expect(new Set(proposalSeen).size).toBe(proposalSeen.length);

      const documentSeen = traverseDescendingVersions(
        versions,
        pageSize,
        (v) => encodeDocumentVersionCursor(workspaceId, resourceId, v),
        (c) => decodeDocumentVersionCursor(c, workspaceId, resourceId)
      );
      expect(documentSeen).toEqual([...versions].sort((a, b) => b - a));

      // Contract revisions use (revision, id) descending.
      const contractRows = versions.map((revision) => ({
        revision,
        id: `c-${revision.toString().padStart(4, "0")}`,
      }));
      const contractOrdered = [...contractRows].sort((a, b) => {
        if (a.revision !== b.revision) return b.revision - a.revision;
        return b.id.localeCompare(a.id);
      });
      const contractSeen: string[] = [];
      let contractCursor: string | undefined;
      for (;;) {
        let start = 0;
        if (contractCursor) {
          const bound = decodeContractRevisionCursor(
            contractCursor,
            workspaceId,
            resourceId
          );
          expect(bound).not.toBeNull();
          start = contractOrdered.findIndex(
            (row) =>
              row.revision < bound!.revision ||
              (row.revision === bound!.revision && row.id < bound!.id)
          );
          if (start < 0) break;
        }
        const page = contractOrdered.slice(start, start + pageSize);
        if (page.length === 0) break;
        contractSeen.push(...page.map((r) => `${r.revision}:${r.id}`));
        if (page.length < pageSize) break;
        const last = page[page.length - 1]!;
        contractCursor = encodeContractRevisionCursor(
          workspaceId,
          resourceId,
          last
        );
      }
      expect(contractSeen).toEqual(
        contractOrdered.map((r) => `${r.revision}:${r.id}`)
      );
      expect(new Set(contractSeen).size).toBe(contractSeen.length);

      // Template versions use (createdAt, id) descending.
      const templateRows = versions.map((n) => ({
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)),
        id: `tv-${n.toString().padStart(4, "0")}`,
      }));
      const templateOrdered = [...templateRows].sort((a, b) => {
        const dt = b.createdAt.getTime() - a.createdAt.getTime();
        if (dt !== 0) return dt;
        return b.id.localeCompare(a.id);
      });
      const templateSeen: string[] = [];
      let templateCursor: string | undefined;
      for (;;) {
        let start = 0;
        if (templateCursor) {
          const bound = decodeWorkspaceTemplateVersionCursor(
            templateCursor,
            workspaceId,
            resourceId
          );
          expect(bound).not.toBeNull();
          start = templateOrdered.findIndex(
            (row) =>
              row.createdAt.getTime() < bound!.createdAt.getTime() ||
              (row.createdAt.getTime() === bound!.createdAt.getTime() &&
                row.id < bound!.id)
          );
          if (start < 0) break;
        }
        const page = templateOrdered.slice(start, start + pageSize);
        if (page.length === 0) break;
        templateSeen.push(
          ...page.map((r) => `${r.createdAt.toISOString()}:${r.id}`)
        );
        if (page.length < pageSize) break;
        const last = page[page.length - 1]!;
        templateCursor = encodeWorkspaceTemplateVersionCursor(
          workspaceId,
          resourceId,
          last
        );
      }
      expect(templateSeen).toEqual(
        templateOrdered.map((r) => `${r.createdAt.toISOString()}:${r.id}`)
      );

      // Cross-scope cursor must not decode.
      const foreign = encodeProposalVersionCursor("other-ws", resourceId, 1);
      expect(
        decodeProposalVersionCursor(foreign, workspaceId, resourceId)
      ).toBeNull();

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
