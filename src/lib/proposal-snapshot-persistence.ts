import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  compileProposalLayoutDocument,
  type ProposalLayoutExportDiagnostic,
} from "./proposal-layout-export";
import {
  PROPOSAL_LAYOUT_KEYS,
  PROPOSAL_MODULE_KEYS,
  compileProposalLayout,
  type LocalizedProposalText,
  type ProposalChannel,
  type ProposalLayoutDiagnostic,
  type ProposalLayoutKey,
  type ProposalKnowledgeSourceBinding,
  type ProposalSnapshot,
} from "./proposal-layouts";
import {
  validateProposalOutput,
  type ValidationReport,
} from "./validation-gate";
import type {
  ComplianceMatrixRow,
  IngestionEntities,
} from "./types";

export const MAX_PROPOSAL_SNAPSHOT_BODY_BYTES = 1_000_000;

const boundedText = z.string().max(250_000);
const identifier = z.string().trim().min(1).max(200);
const sourceReference = z.string().trim().min(1).max(200);
const localizedTextSchema = z
  .object({
    en: boundedText,
    ar: boundedText,
  })
  .strict();

const knowledgeBindingSchema = z
  .object({
    recordType: z.enum([
      "CERTIFICATE",
      "PAST_PROJECT",
      "METHODOLOGY",
      "LIBRARY_ITEM",
    ]),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    evidenceRef: z.string().trim().min(1).max(2_000),
    reviewStatus: z.literal("APPROVED"),
    reviewedById: identifier,
    approvedAt: z.string().datetime(),
    provenance: z
      .object({
        sourceKind: z.literal("UPLOADED_DOCUMENT"),
        sourceId: identifier,
        version: z.number().int().positive(),
        checksum: z.string().regex(/^[a-f0-9]{64}$/),
        originalName: z.string().trim().min(1).max(500),
        capturedAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

const sourceSchema = z
  .object({
    id: identifier,
    kind: z.enum([
      "TENDER",
      "USER_ENTRY",
      "APPROVED_KNOWLEDGE",
      "WORKSPACE",
      "DERIVED",
    ]),
    title: localizedTextSchema,
    locator: z.string().max(2_000).optional(),
    asOf: z.string().max(200).optional(),
    knowledgeBinding: knowledgeBindingSchema.optional(),
  })
  .strict();

const blockBase = {
  key: identifier,
  title: localizedTextSchema,
  sourceRequired: z.boolean(),
  sourceRefs: z.array(sourceReference).max(500),
};

const narrativeBlockSchema = z
  .object({
    type: z.literal("NARRATIVE"),
    ...blockBase,
    body: localizedTextSchema,
  })
  .strict();

const bulletListBlockSchema = z
  .object({
    type: z.literal("BULLET_LIST"),
    ...blockBase,
    items: z.array(localizedTextSchema).min(1).max(1_000),
  })
  .strict();

const tableBlockSchema = z
  .object({
    type: z.literal("TABLE"),
    ...blockBase,
    columns: z
      .array(
        z
          .object({
            key: identifier,
            label: localizedTextSchema,
          })
          .strict()
      )
      .min(1)
      .max(100),
    rows: z
      .array(
        z
          .object({
            key: identifier,
            cells: z.record(identifier, localizedTextSchema),
          })
          .strict()
      )
      .max(2_000),
  })
  .strict();

const kpiBlockSchema = z
  .object({
    type: z.literal("KPI"),
    ...blockBase,
    label: localizedTextSchema,
    value: z.string().max(5_000).nullable(),
    unit: localizedTextSchema.optional(),
    asOf: z.string().max(200).nullable(),
  })
  .strict();

const evidenceRegisterBlockSchema = z
  .object({
    type: z.literal("EVIDENCE_REGISTER"),
    ...blockBase,
    entries: z
      .array(
        z
          .object({
            key: identifier,
            label: localizedTextSchema,
            status: z.enum(["VERIFIED", "PENDING", "NOT_AVAILABLE"]),
            sourceRefs: z.array(sourceReference).max(500),
          })
          .strict()
      )
      .min(1)
      .max(2_000),
  })
  .strict();

const commercialHandoffBlockSchema = z
  .object({
    type: z.literal("COMMERCIAL_HANDOFF"),
    ...blockBase,
    instruction: localizedTextSchema,
    pricingStatus: z.enum([
      "USER_ENTRY_REQUIRED",
      "VERIFIED_SOURCE_VALUES",
    ]),
    entries: z
      .array(
        z
          .object({
            key: identifier,
            description: localizedTextSchema,
            amount: z.string().max(5_000).nullable(),
            currency: z.string().max(100).nullable(),
            sourceRefs: z.array(sourceReference).max(500),
          })
          .strict()
      )
      .max(2_000),
  })
  .strict();

const diagramBlockSchema = z
  .object({
    type: z.literal("DIAGRAM"),
    ...blockBase,
    description: localizedTextSchema,
    altText: localizedTextSchema,
    assetRef: z.string().trim().min(1).max(2_000),
  })
  .strict();

const blockSchema = z.discriminatedUnion("type", [
  narrativeBlockSchema,
  bulletListBlockSchema,
  tableBlockSchema,
  kpiBlockSchema,
  evidenceRegisterBlockSchema,
  commercialHandoffBlockSchema,
  diagramBlockSchema,
]);

export const proposalSnapshotInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: identifier,
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    intent: z.enum([
      "FULL_SUBMISSION",
      "EXECUTIVE_REVIEW",
      "TECHNICAL_EVALUATION",
      "COMPLIANCE_RESPONSE",
      "BILINGUAL_SUBMISSION",
      "ADDENDUM",
    ]),
    languageMode: z.enum(["EN", "AR", "BILINGUAL"]),
    projectTitle: localizedTextSchema,
    bidderName: localizedTextSchema,
    tenderReference: z.string().max(500).nullable(),
    brand: z
      .object({
        primaryColor: z.string().max(32).optional(),
        secondaryColor: z.string().max(32).optional(),
        accentColor: z.string().max(32).optional(),
        backgroundColor: z.string().max(32).optional(),
        textColor: z.string().max(32).optional(),
      })
      .strict(),
    sources: z.array(sourceSchema).max(5_000),
    modules: z
      .array(
        z
          .object({
            key: z.enum(PROPOSAL_MODULE_KEYS),
            title: localizedTextSchema,
            requiredBlockKeys: z.array(identifier).max(500),
            blocks: z.array(blockSchema).max(2_000),
          })
          .strict()
      )
      .min(1)
      .max(PROPOSAL_MODULE_KEYS.length),
  })
  .strict();

export const proposalSnapshotWriteSchema = z
  .object({
    snapshot: proposalSnapshotInputSchema,
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    presetKey: z.enum(PROPOSAL_LAYOUT_KEYS).optional(),
  })
  .strict();

export interface StructuredSnapshotDiagnostic {
  readonly channel: ProposalChannel | "PERSISTENCE";
  readonly code: string;
  readonly path: string;
  readonly message: LocalizedProposalText;
}

export interface CanonicalProposalSnapshot {
  readonly snapshot: ProposalSnapshot;
  readonly canonicalJson: string;
  readonly hash: string;
  readonly revision: number;
  readonly presetKey: ProposalLayoutKey;
}

export interface StructuredApprovedEvidenceBinding {
  readonly id: string;
  readonly title: LocalizedProposalText;
  readonly locator: string;
  readonly asOf: string;
  readonly knowledgeBinding: ProposalKnowledgeSourceBinding;
}

/** Privileged knowledge identities rendered or referenced by this snapshot. */
export function claimedStructuredKnowledgeIds(
  snapshot: ProposalSnapshot
): readonly string[] {
  return snapshot.sources
    .filter((source) => source.kind === "APPROVED_KNOWLEDGE")
    .map((source) => source.id)
    .sort();
}

/**
 * Enforce the trust boundary that the structural engine cannot prove itself.
 * Client-authored USER_ENTRY references are never accepted as verified
 * evidence, and APPROVED_KNOWLEDGE identities must resolve server-side.
 */
export function validateStructuredSnapshotEvidence(
  snapshot: ProposalSnapshot,
  approvedEvidence: readonly StructuredApprovedEvidenceBinding[]
): readonly StructuredSnapshotDiagnostic[] {
  const approved = new Map(
    approvedEvidence.map((binding) => [binding.id, binding])
  );
  const sources = new Map(snapshot.sources.map((source) => [source.id, source]));
  const diagnostics: StructuredSnapshotDiagnostic[] = [];
  for (const source of snapshot.sources) {
    if (source.kind === "TENDER" || source.kind === "WORKSPACE") {
      diagnostics.push(
        persistenceDiagnostic(
          "UNBOUND_PRIVILEGED_SOURCE",
          `sources.${source.id}.kind`,
          `${source.kind} provenance requires an immutable server binding and cannot be self-declared.`,
          `يتطلب مصدر ${source.kind} ارتباط خادم غير قابل للتغيير ولا يمكن إعلانه ذاتياً.`
        )
      );
    }
    if (
      source.kind !== "APPROVED_KNOWLEDGE" &&
      source.knowledgeBinding !== undefined
    ) {
      diagnostics.push(
        persistenceDiagnostic(
          "UNEXPECTED_KNOWLEDGE_BINDING",
          `sources.${source.id}.knowledgeBinding`,
          "Only APPROVED_KNOWLEDGE sources may carry a privileged knowledge binding.",
          "يمكن فقط لمصادر المعرفة المعتمدة حمل ارتباط معرفة ذي صلاحية."
        )
      );
    }
  }
  for (const id of claimedStructuredKnowledgeIds(snapshot)) {
    const source = sources.get(id);
    const binding = approved.get(id);
    if (!source || !binding) {
      diagnostics.push(
        persistenceDiagnostic(
          "UNAPPROVED_KNOWLEDGE_SOURCE",
          `sources.${id}`,
          `Knowledge source "${id}" is not an eligible approved record in this workspace.`,
          `مصدر المعرفة "${id}" ليس سجلاً مؤهلاً ومعتمداً في مساحة العمل هذه.`
        )
      );
      continue;
    }
    const exactMatch =
      source.title.en === binding.title.en &&
      source.title.ar === binding.title.ar &&
      source.locator === binding.locator &&
      source.asOf === binding.asOf &&
      source.knowledgeBinding !== undefined &&
      source.knowledgeBinding.recordType ===
        binding.knowledgeBinding.recordType &&
      source.knowledgeBinding.contentHash ===
        binding.knowledgeBinding.contentHash &&
      source.knowledgeBinding.evidenceRef ===
        binding.knowledgeBinding.evidenceRef &&
      source.knowledgeBinding.reviewStatus === "APPROVED" &&
      source.knowledgeBinding.reviewedById ===
        binding.knowledgeBinding.reviewedById &&
      source.knowledgeBinding.approvedAt ===
        binding.knowledgeBinding.approvedAt &&
      JSON.stringify(source.knowledgeBinding.provenance) ===
        JSON.stringify(binding.knowledgeBinding.provenance);
    if (!exactMatch) {
      diagnostics.push(
        persistenceDiagnostic(
          "KNOWLEDGE_BINDING_MISMATCH",
          `sources.${id}`,
          `Knowledge source "${id}" does not exactly match its current server-approved title, locator, content hash, evidence provenance, and approval version.`,
          `مصدر المعرفة "${id}" لا يطابق تماماً عنوانه وموقعه وبصمة محتواه ومصدر دليله وإصدار اعتماده الحالي على الخادم.`
        )
      );
    }
  }
  for (const snapshotModule of snapshot.modules) {
    for (const block of snapshotModule.blocks) {
      if (
        block.type === "COMMERCIAL_HANDOFF" &&
        block.pricingStatus === "VERIFIED_SOURCE_VALUES"
      ) {
        for (const entry of block.entries) {
          if (entry.amount === null && entry.currency === null) continue;
          const invalidRefs = entry.sourceRefs.filter((ref) => {
            const source = sources.get(ref);
            return (
              source?.kind !== "APPROVED_KNOWLEDGE" ||
              !approved.has(ref)
            );
          });
          if (
            entry.sourceRefs.length === 0 ||
            invalidRefs.length > 0
          ) {
            diagnostics.push(
              persistenceDiagnostic(
                "UNVERIFIED_COMMERCIAL_VALUES",
                `modules.${snapshotModule.key}.blocks.${block.key}.entries.${entry.key}.sourceRefs`,
                "Values labeled as verified must reference only currently approved tenant knowledge. User, workspace, and self-declared tender values remain unverified.",
                "يجب أن تشير القيم المصنفة موثقة فقط إلى معرفة مساحة العمل المعتمدة حالياً. وتظل قيم المستخدم ومساحة العمل والمنافسة المعلنة ذاتياً غير موثقة."
              )
            );
          }
        }
      }
      if (block.type !== "EVIDENCE_REGISTER") continue;
      for (const entry of block.entries) {
        if (entry.status !== "VERIFIED") continue;
        const invalidRefs = entry.sourceRefs.filter((ref) => {
          const source = sources.get(ref);
          return (
            source?.kind !== "APPROVED_KNOWLEDGE" || !approved.has(ref)
          );
        });
        if (entry.sourceRefs.length === 0 || invalidRefs.length > 0) {
          diagnostics.push(
            persistenceDiagnostic(
              "UNVERIFIED_EVIDENCE_STATUS",
              `modules.${snapshotModule.key}.blocks.${block.key}.entries.${entry.key}.status`,
              "VERIFIED evidence must reference only currently approved tenant knowledge; USER_ENTRY and self-declared sources remain draft evidence.",
              "يجب أن تشير الأدلة الموثقة فقط إلى معرفة معتمدة حالياً في مساحة العمل؛ وتظل إدخالات المستخدم والمصادر المعلنة ذاتياً أدلة مسودة."
            )
          );
        }
      }
    }
  }
  return sortDiagnostics(diagnostics);
}

function appendLocalized(
  target: string[],
  value: LocalizedProposalText | undefined
): void {
  if (!value) return;
  target.push(value.en, value.ar);
}

/**
 * Project the exact renderable structured content into the existing proposal
 * safety gate. This is a validation projection only; it is never rendered and
 * it never invents translations, prices, evidence, or tender claims.
 */
export function structuredProposalValidationText(
  snapshot: ProposalSnapshot
): string {
  const text: string[] = [];
  appendLocalized(text, snapshot.projectTitle);
  appendLocalized(text, snapshot.bidderName);
  if (snapshot.tenderReference) text.push(snapshot.tenderReference);
  for (const source of snapshot.sources) {
    appendLocalized(text, source.title);
    if (source.locator) text.push(source.locator);
    if (source.asOf) text.push(source.asOf);
  }
  for (const snapshotModule of snapshot.modules) {
    appendLocalized(text, snapshotModule.title);
    for (const block of snapshotModule.blocks) {
      appendLocalized(text, block.title);
      switch (block.type) {
        case "NARRATIVE":
          appendLocalized(text, block.body);
          break;
        case "BULLET_LIST":
          block.items.forEach((item) => appendLocalized(text, item));
          break;
        case "TABLE":
          block.columns.forEach((column) =>
            appendLocalized(text, column.label)
          );
          block.rows.forEach((row) =>
            Object.values(row.cells).forEach((cell) =>
              appendLocalized(text, cell)
            )
          );
          break;
        case "KPI":
          appendLocalized(text, block.label);
          if (block.value) text.push(block.value);
          appendLocalized(text, block.unit);
          if (block.asOf) text.push(block.asOf);
          break;
        case "EVIDENCE_REGISTER":
          block.entries.forEach((entry) => {
            appendLocalized(text, entry.label);
            text.push(entry.status, ...entry.sourceRefs);
          });
          break;
        case "COMMERCIAL_HANDOFF":
          appendLocalized(text, block.instruction);
          block.entries.forEach((entry) => {
            appendLocalized(text, entry.description);
            if (entry.amount) text.push(entry.amount);
            if (entry.currency) text.push(entry.currency);
            text.push(...entry.sourceRefs);
          });
          break;
        case "DIAGRAM":
          appendLocalized(text, block.description);
          appendLocalized(text, block.altText);
          text.push(block.assetRef);
          break;
      }
      text.push(...block.sourceRefs);
    }
  }
  return text.join("\n");
}

export function validateStructuredProposalOutput(
  snapshot: ProposalSnapshot,
  context: {
    readonly entities: IngestionEntities | null | undefined;
    readonly complianceRows:
      | readonly ComplianceMatrixRow[]
      | null
      | undefined;
    readonly restrictions?: readonly string[];
    readonly approvedEvidenceIds?: readonly string[];
  }
): ValidationReport {
  return validateProposalOutput({
    contentMd: structuredProposalValidationText(snapshot),
    financial: null,
    entities: context.entities,
    complianceRows: context.complianceRows
      ? [...context.complianceRows]
      : context.complianceRows,
    restrictions: context.restrictions ? [...context.restrictions] : undefined,
    approvedEvidenceIds: context.approvedEvidenceIds
      ? [...context.approvedEvidenceIds]
      : undefined,
    claimedEvidenceIds: [...claimedStructuredKnowledgeIds(snapshot)],
  });
}

export type CanonicalProposalSnapshotResult =
  | Readonly<{
      ok: true;
      value: CanonicalProposalSnapshot;
    }>
  | Readonly<{
      ok: false;
      code:
        | "INVALID_SNAPSHOT_SHAPE"
        | "INVALID_SNAPSHOT_IDENTITY"
        | "INVALID_SNAPSHOT_REVISION"
        | "INVALID_SNAPSHOT_CONTENT"
        | "PERSISTED_SNAPSHOT_METADATA_MISMATCH";
      diagnostics: readonly StructuredSnapshotDiagnostic[];
    }>;

function persistenceDiagnostic(
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

function layoutDiagnostic(
  channel: ProposalChannel,
  diagnostic: ProposalLayoutDiagnostic | ProposalLayoutExportDiagnostic
): StructuredSnapshotDiagnostic {
  return {
    channel,
    code: diagnostic.code,
    path: diagnostic.path,
    message: diagnostic.message,
  };
}

function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value !== "object") {
    throw new TypeError("Snapshot contains a non-JSON value.");
  }
  const entries = Object.entries(value).sort(([first], [second]) =>
    first.localeCompare(second)
  );
  return `{${entries
    .map(
      ([key, child]) =>
        `${JSON.stringify(key)}:${canonicalizeJson(child)}`
    )
    .join(",")}}`;
}

function sortDiagnostics(
  diagnostics: readonly StructuredSnapshotDiagnostic[]
): readonly StructuredSnapshotDiagnostic[] {
  return [...diagnostics].sort(
    (first, second) =>
      first.channel.localeCompare(second.channel) ||
      first.path.localeCompare(second.path) ||
      first.code.localeCompare(second.code)
  );
}

/**
 * Strictly validate one write candidate across every production Phase 4
 * channel. No values are inferred, translated, merged with Markdown, or
 * populated from tenant data.
 */
export function canonicalizeProposalSnapshot(
  input: unknown,
  options: {
    readonly proposalId: string;
    readonly expectedRevision: number;
    readonly presetKey?: ProposalLayoutKey;
  }
): CanonicalProposalSnapshotResult {
  const parsed = proposalSnapshotInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT_SHAPE",
      diagnostics: parsed.error.issues.map((issue) =>
        persistenceDiagnostic(
          "INVALID_SNAPSHOT_SHAPE",
          issue.path.join(".") || "$",
          issue.message,
          "بنية لقطة العرض غير صالحة."
        )
      ),
    };
  }

  const snapshot = parsed.data as ProposalSnapshot;
  if (snapshot.snapshotId !== options.proposalId) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT_IDENTITY",
      diagnostics: [
        persistenceDiagnostic(
          "INVALID_SNAPSHOT_IDENTITY",
          "snapshotId",
          "snapshotId must exactly match the target proposal id.",
          "يجب أن يطابق معرف اللقطة معرف العرض المستهدف تماماً."
        ),
      ],
    };
  }

  const revision = options.expectedRevision + 1;
  if (snapshot.version !== revision) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT_REVISION",
      diagnostics: [
        persistenceDiagnostic(
          "INVALID_SNAPSHOT_REVISION",
          "version",
          `Snapshot version must be ${revision} for the supplied expected revision.`,
          `يجب أن يكون إصدار اللقطة ${revision} للمراجعة المتوقعة المقدمة.`
        ),
      ],
    };
  }

  const html = compileProposalLayoutDocument(snapshot, {
    channel: "HTML",
    presetKey: options.presetKey,
  });
  const pdf = compileProposalLayoutDocument(snapshot, {
    channel: "PDF",
    presetKey: options.presetKey,
  });
  const pptx = compileProposalLayout(snapshot, {
    channel: "PPTX",
    presetKey: options.presetKey,
  });
  const diagnostics: StructuredSnapshotDiagnostic[] = [
    ...html.diagnostics.map((diagnostic) =>
      layoutDiagnostic("HTML", diagnostic)
    ),
    ...pdf.diagnostics.map((diagnostic) =>
      layoutDiagnostic("PDF", diagnostic)
    ),
    ...pptx.diagnostics.map((diagnostic) =>
      layoutDiagnostic("PPTX", diagnostic)
    ),
  ];
  if (
    html.status !== "READY" ||
    pdf.status !== "READY" ||
    pptx.status !== "VALID" ||
    diagnostics.length > 0
  ) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT_CONTENT",
      diagnostics: sortDiagnostics(diagnostics),
    };
  }

  if (
    html.metadata.snapshotHash !== pdf.metadata.snapshotHash ||
    html.metadata.snapshotHash !== pptx.snapshotHash ||
    html.metadata.presetKey !== pdf.metadata.presetKey ||
    html.metadata.presetKey !== pptx.presetKey
  ) {
    return {
      ok: false,
      code: "INVALID_SNAPSHOT_CONTENT",
      diagnostics: [
        persistenceDiagnostic(
          "NONDETERMINISTIC_COMPILATION",
          "$",
          "Structured proposal channel compilation did not produce one canonical identity.",
          "لم ينتج تجميع قنوات العرض المنظم هوية معيارية واحدة."
        ),
      ],
    };
  }

  return {
    ok: true,
    value: {
      snapshot,
      canonicalJson: canonicalizeJson(snapshot),
      hash: html.metadata.snapshotHash,
      revision,
      presetKey: html.metadata.presetKey,
    },
  };
}

/**
 * Revalidate a database value before export. A missing or mismatched metadata
 * field is corruption, never a reason to fall back to Markdown.
 */
export function validatePersistedProposalSnapshot(
  input: unknown,
  metadata: {
    readonly proposalId: string;
    readonly hash: string | null;
    readonly revision: number;
    readonly presetKey: string | null;
  }
): CanonicalProposalSnapshotResult {
  const preset = PROPOSAL_LAYOUT_KEYS.includes(
    metadata.presetKey as ProposalLayoutKey
  )
    ? (metadata.presetKey as ProposalLayoutKey)
    : undefined;
  if (
    metadata.revision < 1 ||
    metadata.hash === null ||
    preset === undefined
  ) {
    return {
      ok: false,
      code: "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
      diagnostics: [
        persistenceDiagnostic(
          "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
          "$",
          "Persisted structured proposal metadata is incomplete.",
          "بيانات لقطة العرض المنظمة المحفوظة غير مكتملة."
        ),
      ],
    };
  }

  const result = canonicalizeProposalSnapshot(input, {
    proposalId: metadata.proposalId,
    expectedRevision: metadata.revision - 1,
    presetKey: preset,
  });
  if (!result.ok) return result;
  if (
    result.value.hash !== metadata.hash ||
    result.value.revision !== metadata.revision ||
    result.value.presetKey !== preset
  ) {
    return {
      ok: false,
      code: "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
      diagnostics: [
        persistenceDiagnostic(
          "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
          "$",
          "Persisted structured proposal content does not match its canonical metadata.",
          "محتوى لقطة العرض المنظمة المحفوظة لا يطابق بياناتها المعيارية."
        ),
      ],
    };
  }
  return result;
}

export type ProposalDownloadEngineSelection =
  | Readonly<{
      kind: "LEGACY";
    }>
  | Readonly<{
      kind: "STRUCTURED";
      channel: "HTML" | "PDF" | "PPTX" | "XLSX";
    }>
  | Readonly<{
      /** Structured snapshot required; packages built from structured + live sheets. */
      kind: "STRUCTURED_SUPPLEMENTAL";
    }>
  | Readonly<{
      kind: "STRUCTURED_FORMAT_UNSUPPORTED";
    }>;

/**
 * A persisted structured snapshot is authoritative. It may never silently
 * fall through to a legacy Markdown renderer.
 */
export function selectProposalDownloadEngine(
  hasStructuredSnapshot: boolean,
  format: string
): ProposalDownloadEngineSelection {
  if (!hasStructuredSnapshot) return { kind: "LEGACY" };
  if (format === "html") return { kind: "STRUCTURED", channel: "HTML" };
  if (format === "pdf") return { kind: "STRUCTURED", channel: "PDF" };
  if (format === "pptx") return { kind: "STRUCTURED", channel: "PPTX" };
  if (format === "xlsx") return { kind: "STRUCTURED", channel: "XLSX" };
  if (
    format === "zip" ||
    format === "xlsx-matrix" ||
    format === "xlsx-boq" ||
    format === "slides" ||
    format === "manifest"
  ) {
    return { kind: "STRUCTURED_SUPPLEMENTAL" };
  }
  return { kind: "STRUCTURED_FORMAT_UNSUPPORTED" };
}

export function requiresStructuredSnapshotForAuthoritativeExport(input: {
  readonly proposalType: string;
  readonly proposalStatus: string;
}): boolean {
  return (
    input.proposalType !== "CONTRACT" &&
    (input.proposalStatus === "APPROVED" ||
      input.proposalStatus === "EXPORTED")
  );
}

export const STRUCTURED_SNAPSHOT_INVALIDATION = Object.freeze({
  structuredSnapshot: Prisma.DbNull,
  structuredSnapshotHash: null,
  structuredSnapshotPreset: null,
  structuredSnapshotUpdatedAt: null,
  structuredSnapshotUpdatedById: null,
  structuredSnapshotRevision: { increment: 1 as const },
});
