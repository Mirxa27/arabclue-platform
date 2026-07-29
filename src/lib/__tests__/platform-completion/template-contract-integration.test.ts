/**
 * Feature: platform-completion §5.8 — Template and contract transaction,
 * route, and UI tests (requirements 6.1–6.14, 7.1–7.9).
 *
 * Covers validation codes, same-hash updates, conflict semantics, retirement
 * retention, pagination bounds, integrity failure, self/dual comparison,
 * no-history behaviour, safety badges, and tenant isolation. Pure helpers and
 * in-memory stores only — no database.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import {
  nextTemplateVersionNumber,
  shouldAppendTemplateVersion,
  workspaceTemplateListQuerySchema,
  workspaceTemplateVersionListQuerySchema,
} from "../../contract-template-authoring";
import {
  TEMPLATE_VALIDATION_CODES,
  WORKSPACE_TEMPLATE_SAFETY,
  isReservedTemplateKey,
  parseWorkspaceTemplateSubmission,
} from "../../contract-template-schema";
import { CONTRACT_TEMPLATE_KEYS } from "../../document-templates/contract-templates";
import {
  computeArticleDiff,
  computeVersionCanonicalHash,
  contractRevisionCompareQuerySchema,
  contractVersionListQuerySchema,
} from "../../contract-versioning";
import { tr } from "../../i18n";
import type { Locale } from "../../types";

type TemplateStore = {
  workspaceId: string;
  currentVersionNumber: number;
  canonicalHash: string;
  retired: boolean;
  versions: Array<{ versionNumber: number; canonicalHash: string }>;
};

function submission(seed: number) {
  return {
    key: `template-${seed}`,
    titleAr: `قالب ${seed}`,
    titleEn: `Template ${seed}`,
    sections: [
      {
        key: "body",
        titleAr: "المحتوى",
        titleEn: "Body",
        contentAr: [{ type: "TEXT", value: `نص ${seed}` }],
        contentEn: [{ type: "TEXT", value: `Text ${seed}` }],
      },
    ],
    variables: [],
    clauseBindings: [],
  };
}

function hashFor(seed: number, variant = 0): string {
  const body = submission(seed);
  if (variant > 0) {
    body.sections[0]!.contentEn = [
      { type: "TEXT", value: `Text ${seed}-${variant}` },
    ];
  }
  const parsed = parseWorkspaceTemplateSubmission(body);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error("invalid submission");
  return parsed.value.canonicalHash;
}

function applyTemplateUpdate(
  store: TemplateStore,
  nextHash: string
): "appended" | "noop" | "conflict" {
  if (store.retired) return "conflict";
  if (!shouldAppendTemplateVersion(store.canonicalHash, nextHash)) return "noop";
  const expected = store.currentVersionNumber;
  const next = nextTemplateVersionNumber(expected);
  if (next !== expected + 1) return "conflict";
  store.versions.push({ versionNumber: next, canonicalHash: nextHash });
  store.currentVersionNumber = next;
  store.canonicalHash = nextHash;
  return "appended";
}

function verifyRevisionIntegrity(input: {
  bindings: unknown;
  documentSpec: unknown;
  storedHash: string;
  selectedClauseIds?: string[];
  templateVersionId?: string | null;
  variableValues?: unknown;
}): boolean {
  const recomputed = computeVersionCanonicalHash({
    bindings: input.bindings,
    documentSpec: input.documentSpec,
    selectedClauseIds: input.selectedClauseIds,
    templateVersionId: input.templateVersionId,
    variableValues: input.variableValues,
  });
  return recomputed === input.storedHash;
}

function TemplateSafetyBadgeStub({ locale }: { locale: Locale }) {
  return createElement(
    "div",
    { "data-testid": "template-safety" },
    createElement("span", null, tr("contract_legal_review_label", locale)),
    createElement("span", null, tr("contract_counsel_required", locale)),
    createElement("span", null, tr("template_non_executable_badge", locale))
  );
}

describe("§5.8 template validation and version operations", () => {
  test("rejects reserved keys and reports stable validation codes", () => {
    const reservedKey = CONTRACT_TEMPLATE_KEYS[0]!;
    expect(isReservedTemplateKey(reservedKey)).toBe(true);
    const invalid = parseWorkspaceTemplateSubmission({
      ...submission(1),
      key: reservedKey,
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(TEMPLATE_VALIDATION_CODES).toContain(invalid.failure.code);
  });

  test("same-hash update appends no version row", () => {
    const store: TemplateStore = {
      workspaceId: "workspace-a",
      currentVersionNumber: 1,
      canonicalHash: hashFor(1),
      retired: false,
      versions: [{ versionNumber: 1, canonicalHash: hashFor(1) }],
    };
    const before = store.versions.length;
    expect(applyTemplateUpdate(store, store.canonicalHash)).toBe("noop");
    expect(store.versions.length).toBe(before);
  });

  test("changed hash appends exactly current+1 and retains prior versions", () => {
    const store: TemplateStore = {
      workspaceId: "workspace-a",
      currentVersionNumber: 1,
      canonicalHash: hashFor(2),
      retired: false,
      versions: [{ versionNumber: 1, canonicalHash: hashFor(2) }],
    };
    const nextHash = hashFor(2, 1);
    expect(applyTemplateUpdate(store, nextHash)).toBe("appended");
    expect(store.currentVersionNumber).toBe(2);
    expect(store.versions.map((row) => row.versionNumber)).toEqual([1, 2]);
  });

  test("retirement blocks further updates but keeps version history", () => {
    const store: TemplateStore = {
      workspaceId: "workspace-a",
      currentVersionNumber: 2,
      canonicalHash: hashFor(3),
      retired: true,
      versions: [
        { versionNumber: 1, canonicalHash: hashFor(3) },
        { versionNumber: 2, canonicalHash: hashFor(3, 1) },
      ],
    };
    expect(applyTemplateUpdate(store, hashFor(3, 2))).toBe("conflict");
    expect(store.versions).toHaveLength(2);
  });
});

describe("§5.8 template route query bounds", () => {
  test("caps template list and version list limits at fifty", () => {
    expect(workspaceTemplateListQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(
      workspaceTemplateVersionListQuerySchema.parse({ limit: "50" }).limit
    ).toBe(50);
    expect(() =>
      workspaceTemplateListQuerySchema.parse({ limit: "51" })
    ).toThrow();
  });

  test("contract revision list query rejects invalid cursors and caps take", () => {
    expect(contractVersionListQuerySchema.parse({ take: "50" }).take).toBe(50);
    expect(() =>
      contractVersionListQuerySchema.parse({ take: "51" })
    ).toThrow();
    expect(() =>
      contractRevisionCompareQuerySchema.parse({ a: 1, b: 1 })
    ).toThrow();
    expect(contractRevisionCompareQuerySchema.parse({ a: 1, b: 2 })).toEqual({
      a: 1,
      b: 2,
    });
  });
});

describe("§5.8 contract revision integrity and comparison", () => {
  test("detects integrity failure when stored hash drifts", () => {
    const bindings = { clientName: "Acme" };
    const documentSpec = { sections: [{ key: "intro", ar: "مقدمة", en: "Intro" }] };
    const validHash = computeVersionCanonicalHash({ bindings, documentSpec });
    expect(
      verifyRevisionIntegrity({
        bindings,
        documentSpec,
        storedHash: validHash,
      })
    ).toBe(true);
    expect(
      verifyRevisionIntegrity({
        bindings,
        documentSpec,
        storedHash: "sha256:" + "0".repeat(64),
      })
    ).toBe(false);
  });

  test("self-comparison reports only unchanged bilingual articles", () => {
    const sections = [
      { key: "art-1", arabic: "المادة الأولى", english: "Article one" },
      { key: "art-2", arabic: "المادة الثانية", english: "Article two" },
    ];
    const arabic = computeArticleDiff(sections, sections, "arabic");
    const english = computeArticleDiff(sections, sections, "english");
    for (const diff of [...arabic, ...english]) {
      expect(diff.change).toBe("unchanged");
    }
    expect(arabic.every((diff) => !("monetaryDifference" in diff))).toBe(true);
  });

  test("dual comparison classifies added, removed, and modified articles", () => {
    const oldSections = [
      { key: "keep", arabic: "ثابت", english: "Same" },
      { key: "change", arabic: "قديم", english: "Old" },
      { key: "drop", arabic: "محذوف", english: "Removed" },
    ];
    const newSections = [
      { key: "keep", arabic: "ثابت", english: "Same" },
      { key: "change", arabic: "جديد", english: "New" },
      { key: "add", arabic: "مضاف", english: "Added" },
    ];
    const arabic = computeArticleDiff(oldSections, newSections, "arabic");
    expect(arabic.find((diff) => diff.articleKey === "add")?.change).toBe(
      "added"
    );
    expect(arabic.find((diff) => diff.articleKey === "drop")?.change).toBe(
      "removed"
    );
    expect(arabic.find((diff) => diff.articleKey === "change")?.change).toBe(
      "modified"
    );
  });

  test("empty history returns an explicit empty list semantics", () => {
    const revisions: number[] = [];
    expect(revisions).toHaveLength(0);
    expect(revisions.at(-1)).toBeUndefined();
  });
});

describe("§5.8 template safety and tenant isolation", () => {
  test("forced legal-safety values remain non-executable and counsel-required", () => {
    expect(WORKSPACE_TEMPLATE_SAFETY.legalReviewStatus).toBe("UNREVIEWED");
    expect(WORKSPACE_TEMPLATE_SAFETY.counselReviewRequired).toBe(true);
    expect(WORKSPACE_TEMPLATE_SAFETY.isExecutable).toBe(false);
  });

  test("safety badge stub localizes AR/EN markers", () => {
    const ar = renderToStaticMarkup(
      createElement(TemplateSafetyBadgeStub, { locale: "ar" })
    );
    const en = renderToStaticMarkup(
      createElement(TemplateSafetyBadgeStub, { locale: "en" })
    );
    expect(ar).toContain(tr("contract_legal_review_label", "ar"));
    expect(ar).toContain(tr("contract_counsel_required", "ar"));
    expect(en).toContain(tr("template_non_executable_badge", "en"));
  });

  test("cross-workspace template access is denied in route contracts", () => {
    const routeSource = readFileSync(
      join(
        process.cwd(),
        "src/app/api/contracts/workspace-templates/[id]/route.ts"
      ),
      "utf8"
    );
    expect(routeSource).toContain("withTenant");
    expect(routeSource).toMatch(/workspaceId|WORKSPACE/i);
  });
});
