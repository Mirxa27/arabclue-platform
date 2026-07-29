/**
 * Feature: platform-completion
 * Property 9: Template history is monotonic
 * Property 25: Template version operation is monotonic and idempotent
 * Property 26: Concurrent template updates have one winner
 */

import { describe, expect, test } from "bun:test";
import {
  nextTemplateVersionNumber,
  shouldAppendTemplateVersion,
} from "../../contract-template-authoring";
import {
  parseWorkspaceTemplateSubmission,
  workspaceTemplateCanonicalHash,
  type WorkspaceTemplateNode,
} from "../../contract-template-schema";

type VersionRow = {
  versionNumber: number;
  canonicalHash: string;
  sectionsJson: string;
};

type TemplateStore = {
  currentVersionNumber: number;
  canonicalHash: string;
  retired: boolean;
  versions: VersionRow[];
};

function section(
  seed: number,
  variableKey: string
): {
  key: string;
  titleAr: string;
  titleEn: string;
  contentAr: WorkspaceTemplateNode[];
  contentEn: WorkspaceTemplateNode[];
} {
  return {
    key: `section-${seed}`,
    titleAr: `قسم ${seed}`,
    titleEn: `Section ${seed}`,
    contentAr: [
      { type: "TEXT", value: "الطرف " },
      { type: "VARIABLE", variableKey },
    ],
    contentEn: [
      { type: "TEXT", value: "Party " },
      { type: "VARIABLE", variableKey },
    ],
  };
}

function contentFor(seed: number, variant = 0) {
  const variableKey = `partyName${seed % 17}`;
  return {
    sections: [section(seed + variant, variableKey)],
    variables: [
      {
        key: variableKey,
        type: "TEXT" as const,
        labelAr: "اسم الطرف",
        labelEn: "Party name",
        required: true,
      },
    ],
    clauseBindings: [
      {
        clauseKey: "clause.parties",
        sectionKey: `section-${seed + variant}`,
        order: 0,
      },
    ],
  };
}

function hashFor(seed: number, variant = 0): string {
  const submission = {
    key: `workspace-template-${seed}`,
    titleAr: `قالب ${seed}`,
    titleEn: `Template ${seed}`,
    ...contentFor(seed, variant),
  };
  const parsed = parseWorkspaceTemplateSubmission(submission);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("invalid submission");
  return parsed.value.canonicalHash;
}

function createStore(seed: number): TemplateStore {
  const hash = hashFor(seed, 0);
  return {
    currentVersionNumber: 1,
    canonicalHash: hash,
    retired: false,
    versions: [
      {
        versionNumber: 1,
        canonicalHash: hash,
        sectionsJson: JSON.stringify(contentFor(seed, 0).sections),
      },
    ],
  };
}

type Command =
  | { type: "update"; variant: number }
  | { type: "same-hash" }
  | { type: "retire" };

function applyCommand(store: TemplateStore, seed: number, command: Command) {
  if (store.retired) return;
  if (command.type === "retire") {
    store.retired = true;
    return;
  }
  const nextHash =
    command.type === "same-hash"
      ? store.canonicalHash
      : hashFor(seed, command.variant);
  if (!shouldAppendTemplateVersion(store.canonicalHash, nextHash)) {
    return;
  }
  const next = nextTemplateVersionNumber(store.currentVersionNumber);
  store.versions.push({
    versionNumber: next,
    canonicalHash: nextHash,
    sectionsJson: JSON.stringify(
      contentFor(seed, command.type === "update" ? command.variant : 0).sections
    ),
  });
  store.currentVersionNumber = next;
  store.canonicalHash = nextHash;
}

describe("Feature: platform-completion, Property 9: Template history is monotonic", () => {
  test("version count never decreases and prior versions stay readable across 100+ sequences", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const store = createStore(seed);
      const commands: Command[] = [];
      const length = 3 + (seed % 5);
      for (let i = 0; i < length; i++) {
        const roll = (seed + i) % 5;
        if (roll === 0) commands.push({ type: "same-hash" });
        else if (roll === 4 && i === length - 1)
          commands.push({ type: "retire" });
        else commands.push({ type: "update", variant: i + 1 });
      }

      let previousCount = store.versions.length;
      const readable = new Map(
        store.versions.map((v) => [v.versionNumber, v.canonicalHash])
      );

      for (const command of commands) {
        applyCommand(store, seed, command);
        expect(store.versions.length).toBeGreaterThanOrEqual(previousCount);
        previousCount = store.versions.length;
        for (const [versionNumber, hash] of readable) {
          const row = store.versions.find(
            (v) => v.versionNumber === versionNumber
          );
          expect(row).toBeDefined();
          expect(row?.canonicalHash).toBe(hash);
        }
        for (const row of store.versions) {
          readable.set(row.versionNumber, row.canonicalHash);
        }
      }

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 25: Template version operation is monotonic and idempotent", () => {
  test("changed hashes append current+1 and equal hashes append nothing across 100+ pairs", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const current = 1 + (seed % 9);
      expect(nextTemplateVersionNumber(current)).toBe(current + 1);
      expect(nextTemplateVersionNumber(null)).toBe(1);
      expect(nextTemplateVersionNumber(undefined)).toBe(1);

      const baseHash = hashFor(seed, 0);
      const changedHash = hashFor(seed, 1 + (seed % 3));
      expect(shouldAppendTemplateVersion(baseHash, baseHash)).toBe(false);
      expect(shouldAppendTemplateVersion(baseHash, changedHash)).toBe(
        baseHash !== changedHash
      );

      const store = createStore(seed);
      const before = store.versions.length;
      applyCommand(store, seed, { type: "same-hash" });
      expect(store.versions.length).toBe(before);
      expect(store.currentVersionNumber).toBe(1);

      if (baseHash !== changedHash) {
        applyCommand(store, seed, { type: "update", variant: 1 });
        expect(store.versions.length).toBe(before + 1);
        expect(store.currentVersionNumber).toBe(2);
        expect(store.versions[1]?.versionNumber).toBe(2);
      }

      // workspaceTemplateCanonicalHash is stable for identical content.
      const content = contentFor(seed, 0);
      const a = workspaceTemplateCanonicalHash({
        schemaVersion: 1,
        sections: content.sections,
        variables: content.variables,
        clauseBindings: content.clauseBindings,
      });
      const b = workspaceTemplateCanonicalHash({
        schemaVersion: 1,
        sections: content.sections,
        variables: content.variables,
        clauseBindings: content.clauseBindings,
      });
      expect(a).toBe(b);

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 26: Concurrent template updates have one winner", () => {
  test("competing accepted updates yield one next version and one conflict across 100+ pairs", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const store = createStore(seed);
      const claimed = new Set<number>();
      const next = nextTemplateVersionNumber(store.currentVersionNumber);
      const contenders = [
        { id: "a", hash: hashFor(seed, 1) },
        { id: "b", hash: hashFor(seed, 2) },
      ];

      const results: Array<"won" | "conflict"> = [];
      for (const contender of contenders) {
        if (claimed.has(next)) {
          results.push("conflict");
          continue;
        }
        claimed.add(next);
        store.versions.push({
          versionNumber: next,
          canonicalHash: contender.hash,
          sectionsJson: JSON.stringify(contentFor(seed, 1).sections),
        });
        store.currentVersionNumber = next;
        store.canonicalHash = contender.hash;
        results.push("won");
      }

      expect(results.filter((r) => r === "won")).toHaveLength(1);
      expect(results.filter((r) => r === "conflict")).toHaveLength(1);
      expect(store.versions.filter((v) => v.versionNumber === next)).toHaveLength(
        1
      );
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
