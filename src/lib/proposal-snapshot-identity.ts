import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type {
  LocalizedProposalText,
  ProposalBrandInput,
  ProposalSnapshot,
} from "./proposal-layouts";
import type { StructuredSnapshotDiagnostic } from "./proposal-snapshot-persistence";

export interface ProposalSnapshotServerIdentity {
  readonly projectTitle: LocalizedProposalText;
  readonly bidderName: LocalizedProposalText;
  readonly tenderReference: string | null;
  readonly brand: ProposalBrandInput;
}

export interface ProposalSnapshotIdentityRecords {
  readonly project: {
    readonly title: string;
    readonly titleAr: string | null;
    readonly etimadRef: string | null;
  };
  readonly workspace: {
    readonly name: string;
    readonly nameAr: string | null;
  };
  readonly brand: {
    readonly primaryColor: string;
    readonly secondaryColor: string;
    readonly accentColor: string;
  } | null;
}

function translatedOrSource(
  translated: string | null | undefined,
  source: string
): string {
  return translated?.trim() ? translated : source;
}

/**
 * Produce the one tenant-owned identity accepted by structured proposal
 * persistence. Missing Arabic display names fall back to the exact source
 * name; no translation is inferred.
 */
export function proposalSnapshotServerIdentityFromRecords(
  records: ProposalSnapshotIdentityRecords
): ProposalSnapshotServerIdentity {
  const secondaryColor =
    records.brand?.secondaryColor ?? "#0F172A";
  return Object.freeze({
    projectTitle: Object.freeze({
      en: records.project.title,
      ar: translatedOrSource(
        records.project.titleAr,
        records.project.title
      ),
    }),
    bidderName: Object.freeze({
      en: records.workspace.name,
      ar: translatedOrSource(
        records.workspace.nameAr,
        records.workspace.name
      ),
    }),
    tenderReference: records.project.etimadRef,
    brand: Object.freeze({
      primaryColor: records.brand?.primaryColor ?? "#1E3A8A",
      secondaryColor,
      accentColor: records.brand?.accentColor ?? "#0EA5E9",
      backgroundColor: "#FFFFFF",
      textColor: secondaryColor,
    }),
  });
}

function diagnostic(
  code: string,
  path: string,
  en: string,
  ar: string
): StructuredSnapshotDiagnostic {
  return {
    channel: "PERSISTENCE",
    code,
    path,
    message: { en, ar },
  };
}

function sameBrand(
  candidate: ProposalBrandInput,
  expected: ProposalBrandInput
): boolean {
  const keys = [
    "primaryColor",
    "secondaryColor",
    "accentColor",
    "backgroundColor",
    "textColor",
  ] as const;
  return keys.every((key) => candidate[key] === expected[key]);
}

/**
 * Bind document identity and tenant branding to current server records.
 * TENDER and WORKSPACE source kinds are rejected until their schema carries
 * an immutable server binding equivalent to APPROVED_KNOWLEDGE.
 */
export function validateProposalSnapshotServerIdentity(
  snapshot: ProposalSnapshot,
  expected: ProposalSnapshotServerIdentity
): readonly StructuredSnapshotDiagnostic[] {
  const diagnostics: StructuredSnapshotDiagnostic[] = [];
  if (
    snapshot.projectTitle.en !== expected.projectTitle.en ||
    snapshot.projectTitle.ar !== expected.projectTitle.ar
  ) {
    diagnostics.push(
      diagnostic(
        "PROJECT_IDENTITY_MISMATCH",
        "projectTitle",
        "Proposal project titles must exactly match the tenant project record.",
        "يجب أن تطابق عناوين مشروع العرض سجل مشروع مساحة العمل تماماً."
      )
    );
  }
  if (
    snapshot.bidderName.en !== expected.bidderName.en ||
    snapshot.bidderName.ar !== expected.bidderName.ar
  ) {
    diagnostics.push(
      diagnostic(
        "BIDDER_IDENTITY_MISMATCH",
        "bidderName",
        "Proposal bidder names must exactly match the tenant workspace record.",
        "يجب أن تطابق أسماء مقدم العرض سجل مساحة العمل تماماً."
      )
    );
  }
  if (snapshot.tenderReference !== expected.tenderReference) {
    diagnostics.push(
      diagnostic(
        "TENDER_IDENTITY_MISMATCH",
        "tenderReference",
        "The tender reference must exactly match the tenant project record.",
        "يجب أن يطابق مرجع المنافسة سجل مشروع مساحة العمل تماماً."
      )
    );
  }
  if (!sameBrand(snapshot.brand, expected.brand)) {
    diagnostics.push(
      diagnostic(
        "BRAND_IDENTITY_MISMATCH",
        "brand",
        "Structured proposal branding must match the current tenant brand profile.",
        "يجب أن تطابق هوية العرض المنظم ملف هوية مساحة العمل الحالي."
      )
    );
  }
  for (const source of snapshot.sources) {
    if (source.kind !== "TENDER" && source.kind !== "WORKSPACE") {
      continue;
    }
    diagnostics.push(
      diagnostic(
        "UNBOUND_PRIVILEGED_SOURCE",
        `sources.${source.id}.kind`,
        `${source.kind} provenance is not accepted without an immutable server binding; use USER_ENTRY or APPROVED_KNOWLEDGE.`,
        `لا يقبل مصدر ${source.kind} دون ارتباط خادم غير قابل للتغيير؛ استخدم USER_ENTRY أو APPROVED_KNOWLEDGE.`
      )
    );
  }
  return diagnostics.sort(
    (first, second) =>
      first.path.localeCompare(second.path) ||
      first.code.localeCompare(second.code)
  );
}

export async function loadProposalSnapshotServerIdentity(
  workspaceId: string,
  projectId: string,
  database: Pick<
    Prisma.TransactionClient,
    "workspace" | "tenderProject" | "brandProfile"
  > = db
): Promise<ProposalSnapshotServerIdentity | null> {
  const [workspace, project, brand] = await Promise.all([
    database.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, nameAr: true },
    }),
    database.tenderProject.findFirst({
      where: { id: projectId, workspaceId },
      select: { title: true, titleAr: true, etimadRef: true },
    }),
    database.brandProfile.findFirst({
      where: { workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
      },
    }),
  ]);
  if (!workspace || !project) return null;
  return proposalSnapshotServerIdentityFromRecords({
    workspace,
    project,
    brand,
  });
}
