import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/components/dashboard/contract-template-catalog.tsx"
  ),
  "utf8"
);

describe("contract template catalog persistence UI", () => {
  test("pins the visible catalog identity and uses a unique idempotency key", () => {
    expect(source).toContain('expectedVersionId: template.versionId');
    expect(source).toContain(
      "expectedCanonicalHash: template.canonicalHash"
    );
    expect(source).toContain(
      "retryRequestIds.current.get(template.key) ?? crypto.randomUUID()"
    );
    expect(source).toContain("retryRequestIds.current.set");
    expect(source).toContain("clientRequestId,");
    expect(source).toContain('mode: "PREVIEW"');
    expect(source).toContain("projectId: activeProjectId");
  });

  test("saves through the tenant route and exposes saved source as a download", () => {
    expect(source).toContain('>("/api/contracts/drafts",');
    expect(source).toContain(
      "`/api/contracts/drafts/${encodeURIComponent(draft.id)}`"
    );
    expect(source).toContain("Save draft");
    expect(source).toContain("Saved catalog drafts");
    expect(source).toContain("non-executable");
  });

  test("provides confirmed quota recovery and cursor pagination in both locales", () => {
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("window.confirm");
    expect(source).toContain("Delete this unreviewed draft?");
    expect(source).toContain("هل تريد حذف هذه المسودة غير المراجعة؟");
    expect(source).toContain("query.set(\"cursor\", pageParam)");
    expect(source).toContain("lastPage.nextCursor");
    expect(source).toContain("fetchNextPage()");
    expect(source).toContain("Load more");
    expect(source).toContain("تحميل المزيد");
    expect(source).toContain("invalidateQueries");
  });
});
