/**
 * Helpers for voice Mission Control regulatory synthesis tools.
 */

import { db } from "@/lib/db";
import type { ComplianceMatrixRow, IngestionEntities } from "@/lib/types";
import { researchSaudiLawForContract } from "@/lib/saudi-law-research";
import {
  REGULATORY_POLICY_REGISTRY,
  LEGAL_DISCLAIMER,
} from "@/lib/procurement-rules";

export function mapDbChecksToMatrixRows(
  checks: Array<{
    controlId: string;
    title: string;
    framework: string;
    status: string;
    evidence?: string | null;
    remediation?: string | null;
  }>
): ComplianceMatrixRow[] {
  return checks.map((c) => ({
    frameworkId: c.framework,
    controlId: c.controlId,
    title: c.title,
    status: c.status as ComplianceMatrixRow["status"],
    evidence: c.evidence || "Pending evidence from tender corpus.",
    remediation: c.remediation ?? undefined,
    sourceCategory: "INTERNAL_RECOMMENDATION" as const,
    legalReviewStatus: "REQUIRED" as const,
  }));
}

export async function loadProjectEntities(
  projectId: string,
  workspaceId: string
): Promise<IngestionEntities | null> {
  const doc = await db.uploadedDocument.findFirst({
    where: {
      projectId,
      workspaceId,
      extractedEntities: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { extractedEntities: true },
  });
  if (!doc?.extractedEntities) return null;
  try {
    return JSON.parse(doc.extractedEntities) as IngestionEntities;
  } catch {
    return null;
  }
}

export async function synthesizeSaudiLawForProject(opts: {
  workspaceId: string;
  projectId: string;
  projectTitle: string;
}): Promise<{
  ok: true;
  research: ReturnType<typeof researchSaudiLawForContract>;
  projectId: string;
  checksUsed: number;
} | { ok: false; error: string }> {
  const project = await db.tenderProject.findFirst({
    where: { id: opts.projectId, workspaceId: opts.workspaceId },
    select: { id: true, title: true, titleAr: true },
  });
  if (!project) return { ok: false, error: "project not found" };

  const checks = await db.complianceCheck.findMany({
    where: { projectId: project.id },
    orderBy: [{ framework: "asc" }, { controlId: "asc" }],
    take: 200,
  });
  const entities = await loadProjectEntities(project.id, opts.workspaceId);
  const research = researchSaudiLawForContract({
    entities,
    complianceRows: mapDbChecksToMatrixRows(checks),
    projectTitle: opts.projectTitle || project.title,
  });

  return {
    ok: true,
    research,
    projectId: project.id,
    checksUsed: checks.length,
  };
}

export function listRegistrySnapshot() {
  return {
    disclaimer: LEGAL_DISCLAIMER,
    instruments: REGULATORY_POLICY_REGISTRY.filter((p) => !p.superseded).map(
      (p) => ({
        id: p.id,
        name: p.instrumentName,
        nameAr: p.instrumentNameAr ?? p.instrumentName,
        authority: p.authority,
        version: p.version,
        effectiveDate: p.effectiveDate,
        reviewDate: p.reviewDate,
        sourceReference: p.sourceReference,
        approvalStatus: p.humanApprovalStatus,
      })
    ),
  };
}

export function parseProposalArtifacts(raw: string | null | undefined): {
  research?: unknown;
  articles?: unknown[];
} {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!first || typeof first !== "object") return {};
    const obj = first as Record<string, unknown>;
    return {
      research: obj.research,
      articles: Array.isArray(obj.articles) ? obj.articles : undefined,
    };
  } catch {
    return {};
  }
}
