/**
 * The clarification routes against an in-memory `TenderClarification` table.
 *
 * Covers the contract the UI depends on: an unparsed project answers
 * NO_TENDER_TEXT; a rules-only interrogation persists deterministic findings
 * with their quotes; a re-run keeps the team's triage and edits; the status
 * machine refuses illegal moves with CLARIFICATION_STATUS_INVALID; a team
 * question is kept on creation; the letter refuses when nothing is kept and
 * otherwise numbers the kept questions in both locales.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type Row = Record<string, unknown> & { id: string; projectId: string; fingerprint: string; status: string };

let rows: Row[] = [];
let chunks: Array<Record<string, unknown>> = [];
let seq = 0;

let listRoute: typeof import("@/app/api/projects/[id]/clarifications/route");
let interrogateRoute: typeof import("@/app/api/projects/[id]/clarifications/interrogate/route");
let patchRoute: typeof import("@/app/api/projects/[id]/clarifications/[cid]/route");
let letterRoute: typeof import("@/app/api/projects/[id]/clarifications/letter/route");

const PROJECT = { id: "proj-1", workspaceId: "ws-1", title: "Cloud Platform", titleAr: "منصة سحابية", etimadRef: "ET-77" };

function now() {
  return new Date();
}

beforeAll(async () => {
  process.env.ARABCLUE_LLM_DETERMINISTIC = "1";
  mock.module("@/lib/db", () => ({
    db: {
      tenderProject: { findUnique: mock(async ({ where }: { where: { id: string } }) => (where.id === PROJECT.id ? PROJECT : null)) },
      workspace: { findUnique: mock(async () => ({ name: "Najm Tech", nameAr: "شركة نجم" })) },
      documentChunk: { findMany: mock(async () => chunks) },
      auditLog: { create: mock(async () => ({ id: "a" })) },
      subscription: { updateMany: mock(async () => ({ count: 1 })), findFirst: mock(async () => null) },
      tenderClarification: {
        findMany: mock(async ({ where }: { where: { projectId: string } }) => rows.filter((r) => r.projectId === where.projectId)),
        findFirst: mock(async ({ where, orderBy }: { where: { id?: string; projectId: string }; orderBy?: unknown }) => {
          const list = rows.filter((r) => r.projectId === where.projectId && (!where.id || r.id === where.id));
          if (orderBy) return [...list].sort((a, b) => Number(b.sortOrder) - Number(a.sortOrder))[0] ?? null;
          return list[0] ?? null;
        }),
        create: mock(async ({ data }: { data: Record<string, unknown> }) => {
          seq += 1;
          const row = { id: `c${seq}`, status: "PROPOSED", answerMd: null, answeredAt: null, submittedAt: null, editedAt: null, createdAt: now(), updatedAt: now(), ...data } as Row;
          rows.push(row);
          return row;
        }),
        update: mock(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows.find((r) => r.id === where.id)!;
          Object.assign(row, data, { updatedAt: now() });
          return row;
        }),
        upsert: mock(async ({ where, create, update }: { where: { projectId_fingerprint: { projectId: string; fingerprint: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const key = where.projectId_fingerprint;
          const existing = rows.find((r) => r.projectId === key.projectId && r.fingerprint === key.fingerprint);
          if (existing) {
            Object.assign(existing, update, { updatedAt: now() });
            return existing;
          }
          seq += 1;
          const row = { id: `c${seq}`, answerMd: null, answeredAt: null, submittedAt: null, createdAt: now(), updatedAt: now(), ...create } as Row;
          rows.push(row);
          return row;
        }),
      },
    },
  }));

  const auth = await import("@/lib/auth");
  mock.module("@/lib/auth", () => ({
    ...auth,
    requireSession: mock(async () => ({ user: { id: "user-1", role: "BIDDER", emailVerified: true } })),
  }));
  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({ workspace: { id: "ws-1" }, brandProfile: null, userId: "user-1", membershipRole: "OWNER" })),
  }));
  // Rules-only interrogations never touch the token quota, the letter is
  // requested as JSON or Markdown (no plan gate), and no tokens are spent, so
  // `@/lib/quotas` runs for real and is not mocked — a module mock here would
  // outlive this file and break the quota tests that share the process.
  mock.module("@/lib/ai-rate-limit", () => ({ checkAiRateLimit: mock(async () => null) }));

  listRoute = await import("@/app/api/projects/[id]/clarifications/route");
  interrogateRoute = await import("@/app/api/projects/[id]/clarifications/interrogate/route");
  patchRoute = await import("@/app/api/projects/[id]/clarifications/[cid]/route");
  letterRoute = await import("@/app/api/projects/[id]/clarifications/letter/route");
});

beforeEach(() => {
  rows = [];
  seq = 0;
  chunks = [
    chunk(0, "نطاق العمل: تطوير منصة رقمية. آخر موعد لتقديم العروض هو 15/03/2026 عبر منصة اعتماد. الوزن الفني 70% والمالي 30%.", "RFP.pdf", "1"),
    chunk(1, "غرامة التأخير 1% أسبوعياً بحد أقصى 10% من قيمة العقد. The submission deadline for all bids is 20 March 2026.", "RFP.pdf", "2"),
    chunk(2, "The contractor shall respond within 10 days of notification and complete the forms in Annex 4.", "RFP.pdf", "3"),
  ];
});

function chunk(i: number, content: string, name: string, page: string) {
  return { id: `ch${i}`, documentId: "doc-1", chunkIndex: i, content, pageRef: page, sectionHeading: null, language: "mixed", document: { originalName: name } };
}

const params = { params: Promise.resolve({ id: PROJECT.id }) };
const json = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost:3000/api/projects/${PROJECT.id}/clarifications`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function interrogate() {
  const res = await interrogateRoute.POST(json("POST", { locale: "ar", withModel: false }), params);
  return { status: res.status, body: await res.json() };
}

describe("POST /clarifications/interrogate", () => {
  test("refuses a project with no parsed tender text", async () => {
    chunks = [];
    const { status, body } = await interrogate();
    expect(status).toBe(409);
    expect(body.code).toBe("NO_TENDER_TEXT");
    expect(body.message.ar).toContain("كراسة الشروط");
  });

  test("persists deterministic findings with their quotes and reports the AI pass as skipped", async () => {
    const { status, body } = await interrogate();
    expect(status).toBe(200);
    expect(body.ai.status).toBe("skipped");
    expect(body.created).toBeGreaterThanOrEqual(3);
    const kinds = body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toContain("CONTRADICTION");
    expect(kinds).toContain("MISSING_INFO");
    expect(kinds).toContain("AMBIGUITY");
    const deadline = body.items.find((i: { titleEn: string }) => i.titleEn.includes("deadline"));
    expect(deadline.quotes).toHaveLength(2);
    expect(deadline.quotes[0].documentName).toBe("RFP.pdf");
    expect(deadline.provenance).toBe("DETERMINISTIC");
    expect(body.summary.score).toBeLessThan(100);
  });

  test("a re-run keeps triage and edits and refreshes only untouched proposals", async () => {
    const first = await interrogate();
    const kept = first.body.items[0];
    await patchRoute.PATCH(json("PATCH", { status: "KEPT", questionAr: "سؤال معدّل من الفريق يطلب التوضيح" }), {
      params: Promise.resolve({ id: PROJECT.id, cid: kept.id }),
    });
    const second = await interrogate();
    expect(second.body.created).toBe(0);
    expect(second.body.refreshed).toBe(first.body.items.length - 1);
    const again = second.body.items.find((i: { id: string }) => i.id === kept.id);
    expect(again.status).toBe("KEPT");
    expect(again.questionAr).toBe("سؤال معدّل من الفريق يطلب التوضيح");
    expect(again.editedAt).not.toBeNull();
  });
});

describe("PATCH /clarifications/[cid]", () => {
  test("walks the status machine and refuses illegal moves", async () => {
    const { body } = await interrogate();
    const id = body.items[0].id;
    const move = async (status: string) => {
      const res = await patchRoute.PATCH(json("PATCH", { status }), { params: Promise.resolve({ id: PROJECT.id, cid: id }) });
      return { status: res.status, body: await res.json() };
    };
    expect((await move("SUBMITTED")).body.code).toBe("CLARIFICATION_STATUS_INVALID");
    expect((await move("KEPT")).body.item.status).toBe("KEPT");
    const submitted = await move("SUBMITTED");
    expect(submitted.body.item.status).toBe("SUBMITTED");
    expect(submitted.body.item.submittedAt).not.toBeNull();
    const answered = await patchRoute.PATCH(json("PATCH", { answerMd: "The 20 March date governs." }), {
      params: Promise.resolve({ id: PROJECT.id, cid: id }),
    });
    const answeredBody = await answered.json();
    expect(answeredBody.item.status).toBe("ANSWERED");
    expect(answeredBody.item.answerMd).toBe("The 20 March date governs.");
  });

  test("answers 404 for a clarification outside the project", async () => {
    const res = await patchRoute.PATCH(json("PATCH", { status: "KEPT" }), { params: Promise.resolve({ id: PROJECT.id, cid: "nope" }) });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("CLARIFICATION_NOT_FOUND");
  });
});

describe("POST /clarifications and GET /clarifications/letter", () => {
  test("the letter refuses when nothing is kept", async () => {
    await interrogate();
    const res = await letterRoute.GET(new NextRequest(`http://localhost:3000/x?format=json`), params);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NO_KEPT_CLARIFICATIONS");
  });

  test("a team question is kept on creation and the letter numbers kept questions in both locales", async () => {
    await interrogate();
    const created = await listRoute.POST(
      json("POST", {
        titleEn: "VAT treatment",
        titleAr: "معاملة ضريبة القيمة المضافة",
        questionEn: "We kindly request the Entity to confirm whether the financial forms are completed inclusive of VAT.",
        questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت النماذج المالية تُستكمل شاملةً ضريبة القيمة المضافة.",
      }),
      params
    );
    expect(created.status).toBe(201);
    expect((await created.json()).item.status).toBe("KEPT");

    const list = await (await listRoute.GET(json("GET"), params)).json();
    expect(list.summary.byStatus.KEPT).toBe(1);

    const res = await letterRoute.GET(new NextRequest(`http://localhost:3000/x?format=json`), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.markdown.ar).toContain("1. نرجو من الجهة الحكومية التكرم بتأكيد");
    expect(body.markdown.ar).toContain("ET-77");
    expect(body.markdown.en).toContain("Najm Tech");

    const md = await letterRoute.GET(new NextRequest(`http://localhost:3000/x?format=md&locale=en`), params);
    expect(md.headers.get("content-type")).toContain("text/markdown");
    expect(md.headers.get("content-disposition")).toContain("clarifications_ET-77_en.md");
  });
});
