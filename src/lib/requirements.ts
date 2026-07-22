import { db } from "./db";
import type { IngestionEntities, LinkedResourceType, RequirementStatus } from "./types";
import type { CoveragePlan } from "./agents/coverage";
import { coverageStatusToRequirementStatus } from "./agents/coverage";

type LinkCandidate = {
  type: LinkedResourceType;
  id: string;
  keywords: string[];
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(reqText: string, keywords: string[]): number {
  const tokens = new Set(tokenize(reqText));
  let hits = 0;
  for (const k of keywords) {
    const kt = tokenize(k);
    if (kt.some((t) => tokens.has(t)) || reqText.toLowerCase().includes(k.toLowerCase())) {
      hits++;
    }
  }
  return hits;
}

/**
 * Persist tender requirements from ingestion entities, linking to account assets.
 */
export async function persistTenderRequirements(
  projectId: string,
  workspaceId: string,
  entities: IngestionEntities | null,
  fullText: string
): Promise<number> {
  const extracted =
    entities?.requirements && entities.requirements.length > 0
      ? entities.requirements
      : extractRequirementsFromText(fullText, entities);

  if (extracted.length === 0) return 0;

  const [certs, staff, past, library, methods] = await Promise.all([
    db.certificate.findMany({ where: { workspaceId } }),
    db.staffMember.findMany({ where: { workspaceId, active: true } }),
    db.pastProject.findMany({ where: { workspaceId } }),
    db.contentLibraryItem.findMany({ where: { workspaceId, restricted: false } }),
    db.methodologyAsset.findMany({ where: { workspaceId, approved: true } }),
  ]);

  const candidates: LinkCandidate[] = [
    ...certs.map((c) => ({
      type: "CERTIFICATE" as const,
      id: c.id,
      keywords: [c.name, c.certType, c.number ?? ""].filter(Boolean),
    })),
    ...staff.map((s) => ({
      type: "STAFF" as const,
      id: s.id,
      keywords: [
        s.name,
        s.roleTitle,
        s.certifications ?? "",
        ...(safeJsonArray(s.requirementTags) ?? []),
      ].filter(Boolean),
    })),
    ...past.map((p) => ({
      type: "PAST_PROJECT" as const,
      id: p.id,
      keywords: [p.title, p.sector ?? "", p.summary.slice(0, 200)].filter(Boolean),
    })),
    ...library.map((l) => ({
      type: "LIBRARY" as const,
      id: l.id,
      keywords: [l.title, l.category, l.tags ?? ""].filter(Boolean),
    })),
    ...methods.map((m) => ({
      type: "METHODOLOGY" as const,
      id: m.id,
      keywords: [m.title, m.category].filter(Boolean),
    })),
  ];

  await db.tenderRequirement.deleteMany({ where: { projectId } });

  const rows = extracted.map((req, i) => {
    let best: LinkCandidate | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const s = scoreMatch(req.text, c.keywords);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    let status: RequirementStatus = "MISSING";
    let linkedResourceType: string | null = null;
    let linkedResourceId: string | null = null;
    if (best && bestScore >= 1) {
      status = bestScore >= 2 ? "COVERED" : "IN_PROGRESS";
      linkedResourceType = best.type;
      linkedResourceId = best.id;
    }
    return {
      projectId,
      text: req.text.slice(0, 2000),
      sectionRef: req.sectionRef ?? null,
      pageRef: req.pageRef ?? null,
      status,
      linkedResourceType,
      linkedResourceId,
      sortOrder: i,
    };
  });

  await db.tenderRequirement.createMany({ data: rows });
  return rows.length;
}

/**
 * Sync coverage-plan statuses onto persisted tender requirements.
 * Matches by requirement text overlap; remains best-effort.
 */
export async function applyCoveragePlanToRequirements(
  projectId: string,
  coverage: CoveragePlan
): Promise<number> {
  const existing = await db.tenderRequirement.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
  });

  if (existing.length === 0) {
    if (coverage.rows.length === 0) return 0;
    await db.tenderRequirement.createMany({
      data: coverage.rows.map((r, i) => ({
        projectId,
        text: r.requirementText.slice(0, 2000),
        sectionRef: r.sectionRef,
        pageRef: r.pageRef,
        status: coverageStatusToRequirementStatus(r.status) as RequirementStatus,
        linkedResourceType: null,
        linkedResourceId: r.evidenceIds[0] ?? null,
        sortOrder: i,
      })),
    });
    return coverage.rows.length;
  }

  let updated = 0;
  for (const row of coverage.rows) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < existing.length; i++) {
      const s = scoreMatch(row.requirementText, tokenize(existing[i].text));
      if (s > bestScore) {
        bestScore = s;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestScore < 1) continue;
    const target = existing[bestIdx];
    const status = coverageStatusToRequirementStatus(
      row.status
    ) as RequirementStatus;
    await db.tenderRequirement.update({
      where: { id: target.id },
      data: {
        status,
        linkedResourceId:
          row.evidenceIds[0] ?? target.linkedResourceId ?? null,
      },
    });
    updated++;
  }
  return updated;
}

function safeJsonArray(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : null;
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function extractRequirementsFromText(
  text: string,
  entities: IngestionEntities | null
): { text: string; sectionRef: string | null; pageRef: string | null }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reqs: { text: string; sectionRef: string | null; pageRef: string | null }[] = [];

  const bulletRe =
    /^(?:[-*•]|\d+[\.\)]|[a-z][\.\)])\s+(.{10,400})$/i;
  const pageRe = /(?:page|ص(?:فحة)?)\s*(\d+)/i;
  const sectionRe = /(?:section|بند|قسم)\s*([\d\.]+)/i;

  for (const line of lines) {
    const m = line.match(bulletRe);
    if (!m) continue;
    const body = m[1].trim();
    if (/shall|must|required|يجب|يلتزم|مطلوب/i.test(body) || body.length > 40) {
      reqs.push({
        text: body,
        sectionRef: sectionRe.exec(line)?.[1] ?? null,
        pageRef: pageRe.exec(line)?.[1] ?? null,
      });
    }
    if (reqs.length >= 80) break;
  }

  if (reqs.length === 0 && entities?.scope) {
    reqs.push({
      text: entities.scope.slice(0, 500),
      sectionRef: "SOW",
      pageRef: null,
    });
  }

  if (entities?.evidence) {
    for (const ev of entities.evidence.slice(0, 20)) {
      if (ev.length > 15) {
        reqs.push({ text: ev.slice(0, 500), sectionRef: null, pageRef: null });
      }
    }
  }

  return reqs;
}
