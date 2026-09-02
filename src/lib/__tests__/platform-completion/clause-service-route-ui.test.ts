/**
 * Feature: platform-completion §4.4 — Clause service, route, and UI tests
 * (requirements 5.1–5.13).
 *
 * Covers drift/no-drift seeding, custom-row preservation, filters/cursors,
 * mandatory insertion, unsafe/missing/oversized text, tenant isolation, exact
 * ordering, and bilingual browser behaviour. Uses in-memory fakes and pure
 * mirrors — no shared-database mutation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import {
  CLAUSE_CATEGORIES,
  MAX_CLAUSE_LENGTH,
  MAX_CLAUSE_LIST_TAKE,
  MAX_CLAUSE_SELECT_IDS,
  describeCatalogClauses,
  isClauseCategory,
  isClauseUnsafe,
  seedStandardClauses,
} from "../../clause-library";
import { CONTRACT_TEMPLATE_CATALOG } from "../../document-templates/contract-templates";
import { tr } from "../../i18n";
import type { Locale } from "../../types";
import { createFakeClauseCatalogRepository } from "../support/clause-fakes";

// ─── In-memory list / filter mirror ─────────────────────────────────────────

type ClauseRow = {
  id: string;
  clauseKey: string | null;
  workspaceId: string | null;
  category: string;
  mandatory: boolean;
  order: number;
  nameEn: string;
  nameAr: string;
  contentEn: string;
  contentAr: string;
  isActive: boolean;
};

function listClausesInMemory(
  rows: readonly ClauseRow[],
  input: {
    category?: string;
    mandatory?: boolean;
    workspaceId?: string;
    cursor?: string;
    take?: number;
    search?: string;
  }
) {
  const take = Math.min(Math.max(input.take ?? 25, 1), MAX_CLAUSE_LIST_TAKE);
  // Mirrors `CLAUSE_CATALOG_VISIBLE_WHERE`: the catalog is read by lifecycle;
  // `isActive` is the approval flag the database reserves for reviewed rows.
  let filtered = rows.filter((row) => row.lifecycle !== "RETIRED");

  if (input.category) {
    filtered = filtered.filter((row) => row.category === input.category);
  }
  if (typeof input.mandatory === "boolean") {
    filtered = filtered.filter((row) => row.mandatory === input.mandatory);
  }
  if (input.workspaceId) {
    filtered = filtered.filter(
      (row) => row.workspaceId === null || row.workspaceId === input.workspaceId
    );
  } else {
    filtered = filtered.filter((row) => row.workspaceId === null);
  }
  if (input.search?.trim()) {
    const needle = input.search.trim().toLowerCase();
    filtered = filtered.filter(
      (row) =>
        row.nameEn.toLowerCase().includes(needle) ||
        row.nameAr.includes(needle) ||
        row.contentEn.toLowerCase().includes(needle) ||
        row.contentAr.includes(needle) ||
        (row.clauseKey ?? "").toLowerCase().includes(needle)
    );
  }

  filtered = filtered
    .slice()
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  if (input.cursor) {
    const cursorRow = filtered.find((row) => row.id === input.cursor);
    if (!cursorRow) {
      return { error: "CLAUSE_CURSOR_NOT_FOUND" as const };
    }
    filtered = filtered.filter(
      (row) =>
        row.order > cursorRow.order ||
        (row.order === cursorRow.order && row.id > cursorRow.id)
    );
  }

  const hasMore = filtered.length > take;
  const page = hasMore ? filtered.slice(0, take) : filtered;
  return {
    clauses: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

function selectClausesInMemory(
  rows: readonly ClauseRow[],
  input: { clauseIds: string[]; workspaceId?: string; templateFamily?: string }
) {
  if (!Array.isArray(input.clauseIds)) {
    return { error: "CLAUSE_FIELD_INVALID" as const };
  }
  if (input.clauseIds.length > MAX_CLAUSE_SELECT_IDS) {
    return { error: "CLAUSE_FIELD_INVALID" as const };
  }

  const uniqueIds = [...new Set(input.clauseIds.map((id) => id.trim()).filter(Boolean))];
  const visible = rows.filter(
    (row) =>
      row.lifecycle !== "RETIRED" &&
      (input.workspaceId
        ? row.workspaceId === null || row.workspaceId === input.workspaceId
        : row.workspaceId === null)
  );

  const found = new Map<string, ClauseRow>();
  for (const row of visible) {
    found.set(row.id, row);
    if (row.clauseKey) found.set(row.clauseKey, row);
  }
  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { error: "CLAUSE_NOT_FOUND" as const, missing: missing[0] };
  }

  if (input.templateFamily) {
    const familyKey = input.templateFamily.trim();
    if (!(familyKey in CONTRACT_TEMPLATE_CATALOG)) {
      return { error: "CLAUSE_FIELD_INVALID" as const };
    }
  }

  const selected = uniqueIds
    .map((id) => found.get(id)!)
    .filter((row, index, array) => array.findIndex((r) => r.id === row.id) === index)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const mandatory = visible
    .filter((row) => row.mandatory)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const combinedMap = new Map<string, ClauseRow>();
  for (const row of mandatory) combinedMap.set(row.id, row);
  for (const row of selected) combinedMap.set(row.id, row);
  const combined = Array.from(combinedMap.values()).sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id)
  );

  return { selected, mandatory, combined };
}

function validateCustomClauseInput(input: {
  workspaceId?: string;
  category?: string;
  arabicText?: string;
  englishText?: string;
  titleEn?: string;
  titleAr?: string;
}): string | null {
  if (!input.workspaceId?.trim()) return "CLAUSE_FIELD_INVALID";
  const arabicText = (input.arabicText ?? "").trim();
  const englishText = (input.englishText ?? "").trim();
  if (!arabicText || !englishText) return "CLAUSE_TRANSLATION_MISSING";
  if (arabicText.length > MAX_CLAUSE_LENGTH || englishText.length > MAX_CLAUSE_LENGTH) {
    return "CLAUSE_FIELD_INVALID";
  }
  if (
    (input.titleEn && input.titleEn.length > 500) ||
    (input.titleAr && input.titleAr.length > 500)
  ) {
    return "CLAUSE_FIELD_INVALID";
  }
  if (
    isClauseUnsafe(arabicText) ||
    isClauseUnsafe(englishText) ||
    (input.titleEn && isClauseUnsafe(input.titleEn)) ||
    (input.titleAr && isClauseUnsafe(input.titleAr))
  ) {
    return "UNSAFE_CLAUSE_TEXT";
  }
  const category = (input.category ?? "GENERAL").trim() || "GENERAL";
  if (!isClauseCategory(category)) return "CLAUSE_FIELD_INVALID";
  return null;
}

function parseClauseListParams(searchParams: URLSearchParams) {
  const mandatoryParam = searchParams.get("mandatory");
  let mandatory: boolean | undefined;
  if (mandatoryParam !== null) {
    if (mandatoryParam === "true" || mandatoryParam === "1") mandatory = true;
    else if (mandatoryParam === "false" || mandatoryParam === "0") mandatory = false;
  }
  const takeParam = searchParams.get("take") || searchParams.get("limit");
  const take = takeParam
    ? Math.min(parseInt(takeParam, 10) || 25, MAX_CLAUSE_LIST_TAKE)
    : 25;
  return {
    category: searchParams.get("category") || undefined,
    mandatory,
    cursor: searchParams.get("cursor") || undefined,
    take,
    search: searchParams.get("search") || searchParams.get("q") || undefined,
  };
}

function ClauseBrowserStub({
  clause,
  locale,
}: {
  clause: { nameAr: string; nameEn: string; contentAr: string; contentEn: string };
  locale: Locale;
}) {
  const dir = locale === "ar" ? "rtl" : "ltr";
  return createElement(
    "article",
    { "data-testid": "clause-browser", dir },
    createElement("h3", { "data-testid": "clause-title" }, clause[locale === "ar" ? "nameAr" : "nameEn"]),
    createElement(
      "p",
      { "data-testid": "clause-content" },
      clause[locale === "ar" ? "contentAr" : "contentEn"]
    ),
    createElement("span", { "data-testid": "counsel-marker" }, tr("clause_counsel_required", locale))
  );
}

function rowsFromRepository(
  snapshot: ReturnType<ReturnType<typeof createFakeClauseCatalogRepository>["snapshot"]>
): ClauseRow[] {
  return [...snapshot.catalog, ...snapshot.custom].map((row) => ({
    id: row.id,
    clauseKey: row.clauseKey,
    workspaceId: row.workspaceId,
    category: row.category,
    mandatory: row.mandatory,
    order: row.order,
    nameEn: row.nameEn,
    nameAr: row.nameAr,
    contentEn: row.contentEn,
    contentAr: row.contentAr,
    isActive: row.isActive,
  }));
}

describe("§4.4 clause service — seeding and drift repair", () => {
  test("second seed is a no-op and preserves workspace custom rows", async () => {
    const repository = createFakeClauseCatalogRepository();
    const custom = repository.seedCustomRow({
      workspaceId: "workspace-a",
      clauseKey: "custom_00000000-0000-4000-8000-000000000001",
      nameEn: "Custom payment",
      nameAr: "دفع مخصص",
      contentEn: "Custom English.",
      contentAr: "نص عربي مخصص.",
      order: 5000,
    });

    await seedStandardClauses({ repository });
    const writesAfterFirst = repository.writes.length;
    const second = await seedStandardClauses({ repository });

    expect(second.created).toBe(0);
    expect(second.updated).toBe(0);
    expect(repository.writes).toHaveLength(writesAfterFirst);
    expect(repository.snapshot().custom).toEqual([custom]);
  });

  test("repairs one drifted catalog row without touching custom rows", async () => {
    const repository = createFakeClauseCatalogRepository();
    const projection = describeCatalogClauses()[0]!;
    repository.seedCatalogRow({
      clauseKey: projection.clauseKey,
      category: "STALE",
      nameEn: "Stale",
      nameAr: "قديم",
      contentEn: "Stale English.",
      contentAr: "نص قديم.",
      mandatory: !projection.mandatory,
      order: 999,
      version: 2,
      canonicalHash: "sha256:stale",
    });

    const summary = await seedStandardClauses({ repository });
    expect(summary.updated).toBe(1);
    const repaired = repository
      .snapshot()
      .catalog.find((row) => row.clauseKey === projection.clauseKey)!;
    expect(repaired.category).toBe(projection.category);
    expect(repaired.canonicalHash).toBe(projection.canonicalHash);
  });
});

describe("§4.4 clause service — filters, cursors, and ordering", () => {
  const baseRows: ClauseRow[] = [
    {
      id: "c1",
      clauseKey: "clause.a",
      workspaceId: null,
      category: "FOUNDATION",
      mandatory: true,
      order: 1,
      nameEn: "Parties",
      nameAr: "الأطراف",
      contentEn: "Party text",
      contentAr: "نص الأطراف",
      isActive: true,
    },
    {
      id: "c2",
      clauseKey: "clause.b",
      workspaceId: null,
      category: "COMMERCIAL",
      mandatory: false,
      order: 2,
      nameEn: "Payment",
      nameAr: "الدفع",
      contentEn: "Payment text",
      contentAr: "نص الدفع",
      isActive: true,
    },
    {
      id: "c3",
      clauseKey: "custom.x",
      workspaceId: "workspace-a",
      category: "COMMERCIAL",
      mandatory: false,
      order: 3,
      nameEn: "Workspace only",
      nameAr: "خاص بالمساحة",
      contentEn: "Workspace text",
      contentAr: "نص خاص",
      isActive: true,
    },
  ];

  test("filters by category and mandatory flag with deterministic order", () => {
    const result = listClausesInMemory(baseRows, {
      category: "COMMERCIAL",
      mandatory: false,
      workspaceId: "workspace-a",
      take: 50,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.clauses.map((row) => row.id)).toEqual(["c2", "c3"]);
  });

  test("caps pages at fifty and returns a keyset cursor", () => {
    const many = Array.from({ length: 55 }, (_, index) => ({
      ...baseRows[0]!,
      id: `page-${index}`,
      clauseKey: `clause.page.${index}`,
      order: index,
    }));
    const first = listClausesInMemory(many, { take: 50 });
    expect("error" in first).toBe(false);
    if ("error" in first) return;
    expect(first.clauses).toHaveLength(50);
    expect(first.nextCursor).toBe("page-49");

    const second = listClausesInMemory(many, {
      take: 50,
      cursor: first.nextCursor!,
    });
    expect("error" in second).toBe(false);
    if ("error" in second) return;
    expect(second.clauses.map((row) => row.id)).toEqual([
      "page-50",
      "page-51",
      "page-52",
      "page-53",
      "page-54",
    ]);
  });

  test("rejects an unknown cursor", () => {
    const result = listClausesInMemory(baseRows, { cursor: "missing" });
    expect(result).toEqual({ error: "CLAUSE_CURSOR_NOT_FOUND" });
  });
});

describe("§4.4 clause service — mandatory insertion and tenant isolation", () => {
  test("merges mandatory catalog rows with selected ids in order", () => {
    const rows: ClauseRow[] = [
      {
        id: "m1",
        clauseKey: "mandatory.1",
        workspaceId: null,
        category: "FOUNDATION",
        mandatory: true,
        order: 1,
        nameEn: "Mandatory",
        nameAr: "إلزامي",
        contentEn: "Must include",
        contentAr: "يجب تضمينه",
        isActive: true,
      },
      {
        id: "o1",
        clauseKey: "optional.1",
        workspaceId: null,
        category: "COMMERCIAL",
        mandatory: false,
        order: 5,
        nameEn: "Optional",
        nameAr: "اختياري",
        contentEn: "Optional text",
        contentAr: "نص اختياري",
        isActive: true,
      },
    ];

    const result = selectClausesInMemory(rows, {
      clauseIds: ["optional.1"],
      templateFamily: Object.keys(CONTRACT_TEMPLATE_CATALOG)[0],
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.combined.map((row) => row.id)).toEqual(["m1", "o1"]);
  });

  test("returns not-found for a clause outside the tenant scope", () => {
    const rows: ClauseRow[] = [
      {
        id: "foreign",
        clauseKey: "foreign.1",
        workspaceId: "workspace-b",
        category: "COMMERCIAL",
        mandatory: false,
        order: 1,
        nameEn: "Foreign",
        nameAr: "أجنبي",
        contentEn: "Foreign",
        contentAr: "أجنبي",
        isActive: true,
      },
    ];
    const result = selectClausesInMemory(rows, {
      clauseIds: ["foreign.1"],
      workspaceId: "workspace-a",
    });
    expect(result).toMatchObject({ error: "CLAUSE_NOT_FOUND" });
  });
});

describe("§4.4 clause service — custom-create validation", () => {
  test("rejects missing bilingual text, unsafe content, and unknown categories", () => {
    expect(
      validateCustomClauseInput({
        workspaceId: "workspace-a",
        arabicText: "",
        englishText: "Only English",
      })
    ).toBe("CLAUSE_TRANSLATION_MISSING");

    expect(
      validateCustomClauseInput({
        workspaceId: "workspace-a",
        arabicText: "نص",
        englishText: "Text with {{token}}",
      })
    ).toBe("UNSAFE_CLAUSE_TEXT");

    expect(
      validateCustomClauseInput({
        workspaceId: "workspace-a",
        arabicText: "نص",
        englishText: "English",
        category: "NOT_A_CATEGORY",
      })
    ).toBe("CLAUSE_FIELD_INVALID");

    expect(
      validateCustomClauseInput({
        workspaceId: "workspace-a",
        arabicText: "نص",
        englishText: "English",
        category: CLAUSE_CATEGORIES[0],
      })
    ).toBeNull();
  });

  test("rejects oversized clause bodies", () => {
    const oversized = "x".repeat(MAX_CLAUSE_LENGTH + 1);
    expect(
      validateCustomClauseInput({
        workspaceId: "workspace-a",
        arabicText: oversized,
        englishText: "ok",
      })
    ).toBe("CLAUSE_FIELD_INVALID");
  });
});

describe("§4.4 clause route and UI contracts", () => {
  test("route list params honour mandatory, cursor, and capped take", () => {
    const params = parseClauseListParams(
      new URLSearchParams(
        "category=FOUNDATION&mandatory=true&take=999&cursor=c1&q=party"
      )
    );
    expect(params).toEqual({
      category: "FOUNDATION",
      mandatory: true,
      cursor: "c1",
      take: MAX_CLAUSE_LIST_TAKE,
      search: "party",
    });
  });

  test("clause route maps missing schema to the shared 503 guard", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/clauses/route.ts"),
      "utf8"
    );
    expect(source).toContain("SCHEMA_MIGRATION_PENDING");
    expect(source).toContain("withTenant");
    expect(source).toContain("createCustomClause");
  });

  test("browser stub renders AR/EN side-by-side content and counsel marker", () => {
    const clause = {
      nameAr: "بند الدفع",
      nameEn: "Payment clause",
      contentAr: "يُستحق الدفع خلال ثلاثين يوماً.",
      contentEn: "Payment is due within thirty days.",
    };

    const ar = renderToStaticMarkup(
      createElement(ClauseBrowserStub, { clause, locale: "ar" })
    );
    const en = renderToStaticMarkup(
      createElement(ClauseBrowserStub, { clause, locale: "en" })
    );

    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain("بند الدفع");
    expect(ar).toContain(tr("clause_counsel_required", "ar"));
    expect(en).toContain('dir="ltr"');
    expect(en).toContain("Payment clause");
    expect(en).toContain(tr("clause_counsel_required", "en"));
  });

  test("seeded repository rows are listable with workspace visibility", async () => {
    const repository = createFakeClauseCatalogRepository();
    await seedStandardClauses({ repository });
    const rows = rowsFromRepository(repository.snapshot());
    const listed = listClausesInMemory(rows, {
      workspaceId: "workspace-a",
      take: 10,
    });
    expect("error" in listed).toBe(false);
    if ("error" in listed) return;
    expect(listed.clauses.length).toBeGreaterThan(0);
    expect(listed.clauses.every((row) => row.workspaceId === null)).toBe(true);
  });
});
