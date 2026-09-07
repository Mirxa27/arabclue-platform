/**
 * Tender Clarification Intelligence — persistence and triage.
 *
 * Everything here reads or writes `TenderClarification` rows and nothing
 * here can reach a model: the list, patch, create and letter routes import
 * this module, and the rate-limit ratchet (`ai-route-rate-limits.test.ts`)
 * relies on that boundary to tell a route that spends provider credit from
 * one that does not. The model pass lives in `src/lib/ai/tender-interrogation.ts`.
 */

import { db } from "../db";
import { fingerprintUserQuestion } from "./fingerprint";
import { summarizeClarity, type ClaritySummary } from "./clarity";
import {
  CLARIFICATION_STATUSES,
  type ClarificationKind,
  type ClarificationProvenance,
  type ClarificationQuote,
  type ClarificationSeverity,
  type ClarificationStatus,
  type Finding,
} from "./types";

export type ClarificationRecord = Readonly<{
  id: string;
  projectId: string;
  kind: ClarificationKind;
  severity: ClarificationSeverity;
  status: ClarificationStatus;
  titleEn: string;
  titleAr: string;
  rationaleEn: string;
  rationaleAr: string;
  questionEn: string;
  questionAr: string;
  quotes: readonly ClarificationQuote[];
  answerMd: string | null;
  answeredAt: string | null;
  submittedAt: string | null;
  provenance: ClarificationProvenance;
  provenanceDetail: Readonly<Record<string, string | number>>;
  editedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}>;

type Row = Awaited<ReturnType<typeof db.tenderClarification.findMany>>[number];

function parseJsonArray<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject(json: string | null): Record<string, string | number> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string | number>)
      : {};
  } catch {
    return {};
  }
}

export function toClarificationRecord(row: Row): ClarificationRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind as ClarificationKind,
    severity: row.severity as ClarificationSeverity,
    status: row.status as ClarificationStatus,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    rationaleEn: row.rationaleEn,
    rationaleAr: row.rationaleAr,
    questionEn: row.questionEn,
    questionAr: row.questionAr,
    quotes: parseJsonArray<ClarificationQuote>(row.quotesJson),
    answerMd: row.answerMd,
    answeredAt: row.answeredAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    provenance: row.provenance as ClarificationProvenance,
    provenanceDetail: parseJsonObject(row.provenanceJson),
    editedAt: row.editedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SEVERITY_SORT: Record<ClarificationSeverity, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };

export async function listClarifications(projectId: string): Promise<ClarificationRecord[]> {
  const rows = await db.tenderClarification.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows
    .map(toClarificationRecord)
    .sort((a, b) => SEVERITY_SORT[a.severity] - SEVERITY_SORT[b.severity] || a.sortOrder - b.sortOrder);
}

export function summarizeClarifications(items: readonly ClarificationRecord[]): ClaritySummary {
  return summarizeClarity(items.map((i) => ({ severity: i.severity, status: i.status })));
}

/**
 * Upsert findings by (projectId, fingerprint). A new fingerprint becomes a
 * PROPOSED row. An existing row keeps its status, its answer and any text a
 * person edited; only untouched PROPOSED rows take the refreshed wording.
 */
export async function upsertFindings(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
  findings: readonly Finding[];
}): Promise<{ created: number; refreshed: number }> {
  const existing = await db.tenderClarification.findMany({
    where: { projectId: opts.projectId },
    select: { id: true, fingerprint: true, status: true, editedAt: true },
  });
  const byFingerprint = new Map(existing.map((e) => [e.fingerprint, e]));
  let created = 0;
  let refreshed = 0;
  let order = 0;
  for (const f of opts.findings) {
    order += 1;
    const current = byFingerprint.get(f.fingerprint);
    const text = {
      kind: f.kind,
      severity: f.severity,
      titleEn: f.titleEn,
      titleAr: f.titleAr,
      rationaleEn: f.rationaleEn,
      rationaleAr: f.rationaleAr,
      questionEn: f.questionEn,
      questionAr: f.questionAr,
      quotesJson: JSON.stringify(f.quotes),
      provenance: f.provenance,
      provenanceJson: JSON.stringify(f.provenanceDetail),
    };
    if (!current) {
      await db.tenderClarification.create({
        data: {
          ...text,
          projectId: opts.projectId,
          workspaceId: opts.workspaceId,
          createdById: opts.userId,
          fingerprint: f.fingerprint,
          sortOrder: order,
        },
      });
      created += 1;
      continue;
    }
    if (current.status === "PROPOSED" && !current.editedAt) {
      await db.tenderClarification.update({ where: { id: current.id }, data: { ...text, sortOrder: order } });
      refreshed += 1;
    } else {
      await db.tenderClarification.update({ where: { id: current.id }, data: { sortOrder: order } });
    }
  }
  return { created, refreshed };
}


/** Transitions a person may make. Anything else answers CLARIFICATION_STATUS_INVALID. */
export const STATUS_TRANSITIONS: Readonly<Record<ClarificationStatus, readonly ClarificationStatus[]>> = Object.freeze({
  PROPOSED: ["KEPT", "DROPPED"],
  KEPT: ["DROPPED", "SUBMITTED", "PROPOSED"],
  DROPPED: ["PROPOSED", "KEPT"],
  SUBMITTED: ["ANSWERED", "KEPT"],
  ANSWERED: ["SUBMITTED"],
});

export function canTransition(from: ClarificationStatus, to: ClarificationStatus): boolean {
  return (CLARIFICATION_STATUSES as readonly string[]).includes(to) && STATUS_TRANSITIONS[from].includes(to);
}

export type ClarificationPatch = Readonly<{
  status?: ClarificationStatus;
  titleEn?: string;
  titleAr?: string;
  questionEn?: string;
  questionAr?: string;
  answerMd?: string | null;
}>;

export class ClarificationStatusError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move a clarification from ${from} to ${to}.`);
    this.name = "ClarificationStatusError";
  }
}

export async function patchClarification(opts: {
  id: string;
  projectId: string;
  patch: ClarificationPatch;
}): Promise<ClarificationRecord | null> {
  const row = await db.tenderClarification.findFirst({ where: { id: opts.id, projectId: opts.projectId } });
  if (!row) return null;
  const now = new Date();
  const data: Record<string, unknown> = {};
  const p = opts.patch;
  const edited = [p.titleEn, p.titleAr, p.questionEn, p.questionAr].some((v) => v !== undefined);
  if (p.titleEn !== undefined) data.titleEn = p.titleEn.trim();
  if (p.titleAr !== undefined) data.titleAr = p.titleAr.trim();
  if (p.questionEn !== undefined) data.questionEn = p.questionEn.trim();
  if (p.questionAr !== undefined) data.questionAr = p.questionAr.trim();
  if (edited) data.editedAt = now;
  if (p.answerMd !== undefined) {
    data.answerMd = p.answerMd?.trim() || null;
    data.answeredAt = p.answerMd?.trim() ? now : null;
  }
  if (p.status !== undefined && p.status !== row.status) {
    if (!canTransition(row.status as ClarificationStatus, p.status)) {
      throw new ClarificationStatusError(row.status, p.status);
    }
    data.status = p.status;
    if (p.status === "SUBMITTED") data.submittedAt = now;
    if (p.status === "ANSWERED" && !data.answeredAt && !row.answeredAt) data.answeredAt = now;
  }
  // Recording an answer on a submitted question answers it.
  if (p.answerMd?.trim() && (data.status ?? row.status) === "SUBMITTED") data.status = "ANSWERED";
  const updated = await db.tenderClarification.update({ where: { id: row.id }, data });
  return toClarificationRecord(updated);
}

export async function createUserQuestion(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
  titleEn: string;
  titleAr: string;
  questionEn: string;
  questionAr: string;
  severity?: ClarificationSeverity;
}): Promise<ClarificationRecord> {
  const last = await db.tenderClarification.findFirst({
    where: { projectId: opts.projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const row = await db.tenderClarification.upsert({
    where: { projectId_fingerprint: { projectId: opts.projectId, fingerprint: fingerprintUserQuestion(opts.questionEn, opts.questionAr) } },
    create: {
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      createdById: opts.userId,
      kind: "AMBIGUITY",
      severity: opts.severity ?? "MAJOR",
      status: "KEPT",
      titleEn: opts.titleEn.trim(),
      titleAr: opts.titleAr.trim(),
      rationaleEn: "Raised by the bid team.",
      rationaleAr: "أُثير من فريق العطاء.",
      questionEn: opts.questionEn.trim(),
      questionAr: opts.questionAr.trim(),
      quotesJson: "[]",
      provenance: "USER_AUTHORED",
      provenanceJson: JSON.stringify({ author: opts.userId }),
      fingerprint: fingerprintUserQuestion(opts.questionEn, opts.questionAr),
      editedAt: new Date(),
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
    update: { status: "KEPT" },
  });
  return toClarificationRecord(row);
}

/** Rows the letter and the proposal draw on: kept, submitted, answered. */
export const LETTER_STATUSES: readonly ClarificationStatus[] = ["KEPT", "SUBMITTED"];
export const REGISTER_STATUSES: readonly ClarificationStatus[] = ["KEPT", "SUBMITTED", "ANSWERED"];
