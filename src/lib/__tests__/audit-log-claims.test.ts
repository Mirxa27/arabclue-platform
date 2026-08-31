/**
 * The admin console may describe the audit log as append-only, not immutable.
 *
 * Those are different claims and only one of them is true here. AuditLog
 * (schema.prisma:880) has no hash chain, no sequence number, no signature, and
 * no grant that withholds UPDATE or DELETE from the application role — so
 * nothing stops the row from changing. What is true is that the application
 * only ever appends: audit.ts calls create and the read routes call findMany,
 * groupBy and count, and no call site anywhere mutates a row.
 *
 * "Immutable" on a security surface reads as tamper-evidence, and an operator
 * who believed it would be wrong about what the log can prove. So this file
 * pins the weaker, accurate claim and — more importantly — pins the discipline
 * that makes even the weaker claim true, so a future `deleteMany` for a
 * retention job fails here rather than silently falsifying the copy.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** Prisma writes that would end the append-only property. */
const MUTATIONS = ["update", "updateMany", "delete", "deleteMany", "upsert"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every source file, minus tests and the one-line generated SQL blob. */
function sourceFiles(): string[] {
  return walk(resolve(process.cwd(), "src")).filter(
    (f) => !f.includes("__tests") && !f.includes("schema-sql")
  );
}

describe("the audit log is append-only in fact", () => {
  test("no call site mutates an audit row", () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");
      for (const op of MUTATIONS) {
        if (src.includes(`auditLog.${op}(`)) {
          hits.push(`${file.split("/src/")[1]} — auditLog.${op}(`);
        }
      }
    }
    expect(hits, `audit rows are mutated:\n${hits.join("\n")}`).toEqual([]);
  });

  test("there is an audit log to describe", () => {
    // Anti-vacuous: deleting the logging entirely would satisfy the scan above.
    const audit = readFileSync(resolve(process.cwd(), "src/lib/audit.ts"), "utf8");
    expect(audit).toContain("auditLog.create(");
  });
});

/**
 * Refusals that describe a rule the route enforces on the spot, rather than
 * selling tamper-evidence. The DELETE handlers gate on
 * isKnowledgeHardDeleteAllowed and throw instead of deleting, so "immutable
 * audit record" here is an accurate account of what just happened to the
 * caller's request — not a claim about what the stored row can prove.
 */
const ENFORCED_REFUSALS = [
  "app/api/methodologies/route.ts",
  "app/api/library/route.ts",
  "app/api/certificates/route.ts",
];

/**
 * The claim, in every wording the codebase has actually used for it.
 *
 * An earlier version of this scan only looked at lines that also said "audit",
 * and so walked straight past `bodyEn: "Reviewer chain, immutable log, …"` on
 * the landing page. The lesson is that the subject drifts — log, trail,
 * record — while the promise stays the same, so these patterns carry their own
 * subject instead of leaning on a topic filter, and PHRASINGS below keeps them
 * honest. Arabic says it three ways: غير قابل للتغيير (cannot be changed), غير
 * قابل للتعديل (cannot be edited), لا يُمس (cannot be touched).
 */
const OVERCLAIMS = [
  /immutable[^.\n]{0,24}\b(logs?|trails?|audit|records?)\b/i,
  /\b(logs?|trails?|audit|records?)\b[^.\n]{0,24}immutable/i,
  /tamper[- ]?(proof|evident)/i,
  /سجل(ات)?[^.\n]{0,24}(غير قابلة? لل(تغيير|تعديل)|لا يُمس)/,
];

/** Wordings that shipped and had to be corrected. Each must stay caught. */
const PHRASINGS = [
  'bodyEn: "Reviewer chain, immutable log, and PDPL/NCA-aware workflow controls."',
  "maintain immutable audit trails for regulated environments",
  "// Immutable audit trail logger — appends to AuditLog table.",
  "subtitle: 'Immutable audit trail'",
  "a tamper-proof record of every action",
  "سجل تدقيق غير قابل للتغيير لإجراءات الإدارة",
  "سلسلة مراجعين، سجل لا يُمس، وضوابط سير عمل",
  "سجلات تدقيق غير قابلة للتغيير للبيئات الخاضعة للتنظيم",
];

describe("the admin console does not overclaim what the log guarantees", () => {
  test("no surface calls the trail immutable or tamper-proof", () => {
    const hits: string[] = [];
    for (const file of sourceFiles()) {
      const relative = file.split("/src/")[1] ?? file;
      if (ENFORCED_REFUSALS.includes(relative)) continue;
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (OVERCLAIMS.some((p) => p.test(line))) {
          hits.push(`${relative} — ${line.trim()}`);
        }
      }
    }
    expect(hits, `audit log overclaimed:\n${hits.join("\n")}`).toEqual([]);
  });

  test("the scan still catches every wording that got through before", () => {
    // Anti-vacuous, and the specific failure this file has already had twice:
    // patterns narrow enough to pass are patterns narrow enough to miss.
    const missed = PHRASINGS.filter((p) => !OVERCLAIMS.some((r) => r.test(p)));
    expect(missed, `overclaim no longer detected:\n${missed.join("\n")}`).toEqual([]);
  });

  test("the scan does not fire on ordinary uses of the word", () => {
    // The other direction: a pattern that matches everything would also pass
    // the scan above by making the codebase impossible to write.
    const benign = [
      "const next = { ...state }; // immutable update",
      "Immutable data structures avoid a whole class of bug.",
      "records: await db.auditLog.findMany({ where: { workspaceId } }),",
      "سجل التدقيق متاح للمسؤولين",
    ];
    const wrong = benign.filter((b) => OVERCLAIMS.some((r) => r.test(b)));
    expect(wrong, `benign line flagged:\n${wrong.join("\n")}`).toEqual([]);
  });

  test("each exemption still names a route that enforces the refusal", () => {
    // Anti-vacuous: a stale exemption would silently widen the scan's blind
    // spot, so every entry has to still be a file that gates the delete.
    for (const relative of ENFORCED_REFUSALS) {
      const src = readFileSync(resolve(process.cwd(), "src", relative), "utf8");
      expect(src, `${relative} no longer gates the delete`).toContain(
        "isKnowledgeHardDeleteAllowed"
      );
    }
  });

  test("the admin audit surface still exists to be described", () => {
    // Anti-vacuous: removing the view would pass the scan above for the wrong
    // reason, and the claim being corrected here is the view's own subtitle.
    const views = readFileSync(
      resolve(process.cwd(), "src/components/dashboard/views.tsx"),
      "utf8"
    );
    expect(views).toContain("function AdminAuditView()");
  });
});
