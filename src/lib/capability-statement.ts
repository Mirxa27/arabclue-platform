/**
 * Pure BusinessProfileSnapshot -> bilingual capability-statement adapter.
 *
 * This module intentionally performs no data access and accepts no HTML. Every
 * output fragment is a structured BilingualDocumentSpec node. Missing source
 * translations remain visible as diagnostic placeholders instead of silently
 * copying one language into the other.
 */

import type { BusinessProfileSnapshot } from "./business-profile";
import {
  parseBilingualDocument,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type BilingualTableCell,
  type BilingualTableRow,
  type BilingualValueKind,
  type Localized,
  type PairedBlock,
  type PairedSection,
  type SafeImageSource,
} from "./bilingual-layout";
import {
  createBidiValue,
  sanitizeBidiText,
  type DocumentLanguage,
} from "./bilingual-typography";

declare const capabilityDocumentIdBrand: unique symbol;
declare const capabilitySourcePathBrand: unique symbol;

/** Stable, engine-safe ID generated from the source workspace ID. */
export type CapabilityDocumentId = string & {
  readonly [capabilityDocumentIdBrand]: "CapabilityDocumentId";
};

/** Machine-readable path into the source BusinessProfileSnapshot. */
export type CapabilitySourcePath = string & {
  readonly [capabilitySourcePathBrand]: "CapabilitySourcePath";
};

export const TRANSLATION_UNAVAILABLE = Object.freeze({
  en: "Translation unavailable",
  ar: "الترجمة غير متاحة",
}) satisfies Localized<string>;

export const CAPABILITY_DIAGNOSTIC_HANDLING = [
  "block",
  "allow",
] as const;

export type CapabilityDiagnosticHandling =
  (typeof CAPABILITY_DIAGNOSTIC_HANDLING)[number];

export interface CapabilityStatementExportPolicy {
  readonly missingTranslation: CapabilityDiagnosticHandling;
  readonly missingSource: CapabilityDiagnosticHandling;
  readonly unsafeText: CapabilityDiagnosticHandling;
  readonly unsafeAsset: CapabilityDiagnosticHandling;
  readonly invalidValue: CapabilityDiagnosticHandling;
  readonly profileReadiness: CapabilityDiagnosticHandling;
}

export const DEFAULT_CAPABILITY_STATEMENT_POLICY: CapabilityStatementExportPolicy =
  Object.freeze({
    missingTranslation: "block",
    missingSource: "block",
    unsafeText: "block",
    unsafeAsset: "block",
    invalidValue: "block",
    profileReadiness: "block",
  });

export interface CapabilityStatementOptions {
  readonly includeLogo?: boolean;
  readonly exportPolicy?: Partial<CapabilityStatementExportPolicy>;
}

interface CapabilityDiagnosticBase {
  readonly severity: "error" | "warning";
  readonly blocking: boolean;
  readonly path: CapabilitySourcePath;
  readonly message: Localized<string>;
}

export type CapabilityStatementDiagnostic =
  | (CapabilityDiagnosticBase & {
      readonly code: "MISSING_TRANSLATION";
      readonly missingLanguage: DocumentLanguage;
    })
  | (CapabilityDiagnosticBase & {
      readonly code: "MISSING_SOURCE";
      readonly sourceKind: "field" | "collection";
    })
  | (CapabilityDiagnosticBase & {
      readonly code: "UNSAFE_BIDI_CONTROL_REMOVED";
      readonly removedControlCount: number;
    })
  | (CapabilityDiagnosticBase & {
      readonly code: "UNSAFE_ASSET_OMITTED";
      readonly assetKind: "logo";
    })
  | (CapabilityDiagnosticBase & {
      readonly code: "INVALID_SOURCE_VALUE";
      readonly valueKind: "count" | "percentage" | "date";
    })
  | (CapabilityDiagnosticBase & {
      readonly code: "PROFILE_NOT_READY";
      readonly missingRequirementCount: number;
    });

interface CapabilityStatementResultBase {
  readonly document: BilingualDocumentSpec;
  readonly diagnostics: readonly CapabilityStatementDiagnostic[];
  readonly blockingDiagnostics: readonly CapabilityStatementDiagnostic[];
  readonly policy: CapabilityStatementExportPolicy;
}

export interface ExportableCapabilityStatement
  extends CapabilityStatementResultBase {
  readonly status: "exportable";
  readonly canExport: true;
}

export interface BlockedCapabilityStatement
  extends CapabilityStatementResultBase {
  readonly status: "blocked";
  readonly canExport: false;
}

export type CapabilityStatementBuildResult =
  | ExportableCapabilityStatement
  | BlockedCapabilityStatement;

export class CapabilityStatementExportBlockedError extends Error {
  readonly diagnostics: readonly CapabilityStatementDiagnostic[];

  constructor(diagnostics: readonly CapabilityStatementDiagnostic[]) {
    super(
      `Capability statement export is blocked by ${diagnostics.length} diagnostic${
        diagnostics.length === 1 ? "" : "s"
      }.`
    );
    this.name = "CapabilityStatementExportBlockedError";
    this.diagnostics = diagnostics;
  }
}

interface AdapterContext {
  readonly diagnostics: CapabilityStatementDiagnostic[];
  readonly policy: CapabilityStatementExportPolicy;
}

const COPY = {
  capabilityStatement: {
    en: "Capability Statement",
    ar: "بيان القدرات",
  },
  companyIdentity: {
    en: "Cover and company identity",
    ar: "الغلاف وهوية الشركة",
  },
  companyName: { en: "Company name", ar: "اسم الشركة" },
  companyLogo: { en: "Company logo", ar: "شعار الشركة" },
  tagline: { en: "Tagline", ar: "الشعار النصي" },
  workspaceReference: {
    en: "Workspace reference",
    ar: "مرجع مساحة العمل",
  },
  workspaceSlug: { en: "Workspace slug", ar: "معرّف مساحة العمل" },
  plan: { en: "Plan", ar: "الخطة" },
  commercialRegistration: {
    en: "Commercial registration",
    ar: "السجل التجاري",
  },
  vatNumber: { en: "VAT number", ar: "الرقم الضريبي" },
  vision2030: {
    en: "Vision 2030 alignment",
    ar: "المواءمة مع رؤية السعودية 2030",
  },
  field: { en: "Field", ar: "الحقل" },
  value: { en: "Value", ar: "القيمة" },
  verifiedStatistics: {
    en: "Verified profile statistics",
    ar: "إحصاءات الملف الموثقة",
  },
  metric: { en: "Metric", ar: "المؤشر" },
  count: { en: "Count", ar: "العدد" },
  pastProjects: { en: "Past projects", ar: "المشاريع السابقة" },
  teamMembers: { en: "Team members", ar: "أعضاء الفريق" },
  certificates: { en: "Certificates", ar: "الشهادات" },
  partnerships: { en: "Partnerships", ar: "الشراكات" },
  targetSectors: { en: "Target sectors", ar: "القطاعات المستهدفة" },
  methodologies: { en: "Methodologies", ar: "المنهجيات" },
  project: { en: "Project", ar: "المشروع" },
  client: { en: "Client", ar: "العميل" },
  sector: { en: "Sector", ar: "القطاع" },
  outcome: { en: "Outcome", ar: "النتيجة" },
  summary: { en: "Summary", ar: "الملخص" },
  team: { en: "Team and human capital", ar: "الفريق ورأس المال البشري" },
  name: { en: "Name", ar: "الاسم" },
  role: { en: "Role", ar: "الدور" },
  certificate: { en: "Certificate", ar: "الشهادة" },
  issuer: { en: "Issuer", ar: "الجهة المصدرة" },
  partner: { en: "Partner", ar: "الشريك" },
  partnershipType: { en: "Partnership type", ar: "نوع الشراكة" },
  methodology: { en: "Methodology", ar: "المنهجية" },
  readinessEvidence: {
    en: "Readiness and evidence notes",
    ar: "ملاحظات الجاهزية والأدلة",
  },
  proposalReadiness: {
    en: "Proposal readiness",
    ar: "جاهزية تقديم العروض",
  },
  ready: { en: "Ready", ar: "جاهز" },
  notReady: { en: "Not ready", ar: "غير جاهز" },
  completedRequirements: {
    en: "Completed requirements",
    ar: "المتطلبات المكتملة",
  },
  completionScore: {
    en: "Completion score",
    ar: "نسبة الاكتمال",
  },
  generatedAt: { en: "Snapshot generated at", ar: "تاريخ إنشاء اللقطة" },
  diagnosticCount: {
    en: "Diagnostic placeholders",
    ar: "عناصر التشخيص النائبة",
  },
  missingEvidence: { en: "Missing evidence", ar: "الأدلة الناقصة" },
  noMissingEvidence: {
    en: "No missing evidence was reported in the supplied snapshot.",
    ar: "لم تُسجّل أدلة ناقصة في اللقطة الموردة.",
  },
  noSourceRecords: {
    en: "No source records are available for this section.",
    ar: "لا تتوفر سجلات مصدرية لهذا القسم.",
  },
  provenance: {
    en: "Generated only from the supplied business profile snapshot; missing translations were not inferred.",
    ar: "تم الإنشاء حصراً من لقطة ملف الأعمال الموردة؛ ولم يتم استنتاج الترجمات المفقودة.",
  },
} as const satisfies Readonly<Record<string, Localized<string>>>;

type CopyValue = (typeof COPY)[keyof typeof COPY];
type LocalizedInline = Localized<readonly BilingualInlineNode[]>;

function sourcePath(value: string): CapabilitySourcePath {
  // Paths are constructed internally from fixed property names and indices.
  return value as CapabilitySourcePath;
}

function policyFor(
  context: AdapterContext,
  key: keyof CapabilityStatementExportPolicy
): Pick<CapabilityDiagnosticBase, "severity" | "blocking"> {
  const blocking = context.policy[key] === "block";
  return {
    blocking,
    severity: blocking ? "error" : "warning",
  };
}

function recordMissingTranslation(
  context: AdapterContext,
  path: CapabilitySourcePath,
  missingLanguage: DocumentLanguage,
  label: CopyValue
): void {
  context.diagnostics.push({
    code: "MISSING_TRANSLATION",
    ...policyFor(context, "missingTranslation"),
    path,
    missingLanguage,
    message: {
      en: `${label.en}: ${TRANSLATION_UNAVAILABLE.en}.`,
      ar: `${label.ar}: ${TRANSLATION_UNAVAILABLE.ar}.`,
    },
  });
}

function recordMissingSource(
  context: AdapterContext,
  path: CapabilitySourcePath,
  sourceKind: "field" | "collection",
  label: CopyValue
): void {
  context.diagnostics.push({
    code: "MISSING_SOURCE",
    ...policyFor(context, "missingSource"),
    path,
    sourceKind,
    message: {
      en: `${label.en}: source data unavailable.`,
      ar: `${label.ar}: بيانات المصدر غير متاحة.`,
    },
  });
}

function recordUnsafeText(
  context: AdapterContext,
  path: CapabilitySourcePath,
  removedControlCount: number
): void {
  context.diagnostics.push({
    code: "UNSAFE_BIDI_CONTROL_REMOVED",
    ...policyFor(context, "unsafeText"),
    path,
    removedControlCount,
    message: {
      en: `${removedControlCount} unsafe Unicode direction control was removed from source text.`,
      ar: `تمت إزالة ${removedControlCount} من محارف التحكم غير الآمنة باتجاه النص من بيانات المصدر.`,
    },
  });
}

function recordUnsafeLogo(
  context: AdapterContext,
  path: CapabilitySourcePath
): void {
  context.diagnostics.push({
    code: "UNSAFE_ASSET_OMITTED",
    ...policyFor(context, "unsafeAsset"),
    path,
    assetKind: "logo",
    message: {
      en: "The logo was omitted because its source is not an allow-listed local or embedded image.",
      ar: "تم حذف الشعار لأن مصدره ليس صورة محلية أو مضمنة مسموحاً بها.",
    },
  });
}

function recordInvalidValue(
  context: AdapterContext,
  path: CapabilitySourcePath,
  valueKind: "count" | "percentage" | "date"
): void {
  context.diagnostics.push({
    code: "INVALID_SOURCE_VALUE",
    ...policyFor(context, "invalidValue"),
    path,
    valueKind,
    message: {
      en: `The supplied ${valueKind} value is invalid.`,
      ar: `قيمة ${valueKind} الموردة غير صالحة.`,
    },
  });
}

function recordProfileNotReady(
  context: AdapterContext,
  missingRequirementCount: number
): void {
  context.diagnostics.push({
    code: "PROFILE_NOT_READY",
    ...policyFor(context, "profileReadiness"),
    path: sourcePath("readiness.readyForProposals"),
    missingRequirementCount,
    message: {
      en: "The supplied profile is not marked ready for proposals.",
      ar: "الملف المورد غير مصنف على أنه جاهز لتقديم العروض.",
    },
  });
}

function staticInline(value: string): readonly BilingualInlineNode[] {
  return [{ type: "text", text: value }];
}

function staticLocalized(value: CopyValue): LocalizedInline {
  return {
    en: staticInline(value.en),
    ar: staticInline(value.ar),
  };
}

function unavailableInline(
  language: DocumentLanguage
): readonly BilingualInlineNode[] {
  return [
    {
      type: "emphasis",
      children: staticInline(TRANSLATION_UNAVAILABLE[language]),
    },
  ];
}

function unavailableLocalized(): LocalizedInline {
  return {
    en: unavailableInline("en"),
    ar: unavailableInline("ar"),
  };
}

function sanitizeSourceText(
  context: AdapterContext,
  value: string | null | undefined,
  path: CapabilitySourcePath
): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  const sanitized = sanitizeBidiText(value.trim());
  if (sanitized.removedControls.length > 0) {
    recordUnsafeText(context, path, sanitized.removedControls.length);
  }
  const normalized = sanitized.sanitizedText.trim();
  return normalized.length > 0 ? normalized : null;
}

function valueInline(
  value: string,
  language: DocumentLanguage,
  valueKind?: BilingualValueKind
): readonly BilingualInlineNode[] {
  return [
    {
      type: "value",
      value: createBidiValue(value, { baseLocale: language }),
      ...(valueKind ? { valueKind } : {}),
    },
  ];
}

interface LocalizedSourceField {
  readonly label: CopyValue;
  readonly sourcePath: CapabilitySourcePath;
  readonly enPath: CapabilitySourcePath;
  readonly arPath: CapabilitySourcePath;
  readonly en: string | null | undefined;
  readonly ar: string | null | undefined;
}

function localizedSourceField(
  context: AdapterContext,
  field: LocalizedSourceField
): LocalizedInline {
  const en = sanitizeSourceText(context, field.en, field.enPath);
  const ar = sanitizeSourceText(context, field.ar, field.arPath);

  if (en === null && ar === null) {
    recordMissingSource(context, field.sourcePath, "field", field.label);
    return unavailableLocalized();
  }
  if (en === null) {
    recordMissingTranslation(context, field.enPath, "en", field.label);
  }
  if (ar === null) {
    recordMissingTranslation(context, field.arPath, "ar", field.label);
  }

  return {
    en: en === null ? unavailableInline("en") : valueInline(en, "en"),
    ar: ar === null ? unavailableInline("ar") : valueInline(ar, "ar"),
  };
}

function sharedSourceValue(
  context: AdapterContext,
  value: string | null | undefined,
  path: CapabilitySourcePath,
  label: CopyValue,
  valueKind: BilingualValueKind
): LocalizedInline {
  const sanitized = sanitizeSourceText(context, value, path);
  if (sanitized === null) {
    recordMissingSource(context, path, "field", label);
    return unavailableLocalized();
  }
  return {
    en: valueInline(sanitized, "en", valueKind),
    ar: valueInline(sanitized, "ar", valueKind),
  };
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function sharedCount(
  context: AdapterContext,
  value: number,
  path: CapabilitySourcePath,
  label: CopyValue,
  suffix = ""
): LocalizedInline {
  if (!validCount(value) || (suffix === "%" && value > 100)) {
    recordInvalidValue(
      context,
      path,
      suffix === "%" ? "percentage" : "count"
    );
    return unavailableLocalized();
  }
  const text = `${String(value)}${suffix}`;
  return {
    en: valueInline(text, "en", "number"),
    ar: valueInline(text, "ar", "number"),
  };
}

function completedRequirementValue(
  context: AdapterContext,
  completed: number,
  total: number
): LocalizedInline {
  const completedPath = sourcePath("readiness.completedCount");
  const totalPath = sourcePath("readiness.totalRequired");
  let valid = true;
  if (!validCount(completed)) {
    recordInvalidValue(context, completedPath, "count");
    valid = false;
  }
  if (!validCount(total) || total === 0 || completed > total) {
    recordInvalidValue(context, totalPath, "count");
    valid = false;
  }
  if (!valid) return unavailableLocalized();

  const value = `${String(completed)}/${String(total)}`;
  return {
    en: valueInline(value, "en", "identifier"),
    ar: valueInline(value, "ar", "identifier"),
  };
}

function sharedDate(
  context: AdapterContext,
  value: string,
  path: CapabilitySourcePath
): LocalizedInline {
  const sanitized = sanitizeSourceText(context, value, path);
  if (sanitized === null || !Number.isFinite(Date.parse(sanitized))) {
    recordInvalidValue(context, path, "date");
    return unavailableLocalized();
  }
  return {
    en: valueInline(sanitized, "en", "date"),
    ar: valueInline(sanitized, "ar", "date"),
  };
}

function tableCell(content: LocalizedInline): BilingualTableCell {
  return { content };
}

function paddedIndex(index: number): string {
  return String(index + 1).padStart(4, "0");
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function safeIdSegment(value: string): string {
  const readable = value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${readable || "workspace"}-${fnv1a(value)}`;
}

function capabilityDocumentId(workspaceId: string): CapabilityDocumentId {
  const value = `capability-${safeIdSegment(workspaceId)}`;
  return value as CapabilityDocumentId;
}

const DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_EMBEDDED_IMAGE_BYTES = 8 * 1024 * 1024;

function safeLogoSource(value: string): SafeImageSource | null {
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.split(/[?#]/, 1)[0].split("/").includes("..")
  ) {
    return { kind: "public", path: value };
  }

  const dataMatch = value.match(DATA_IMAGE_PATTERN);
  if (!dataMatch) return null;
  const encoded = dataMatch[1];
  const estimatedBytes =
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  return estimatedBytes <= MAX_EMBEDDED_IMAGE_BYTES
    ? { kind: "data", uri: value }
    : null;
}

function emptyCollectionBlock(
  context: AdapterContext,
  id: string,
  path: CapabilitySourcePath,
  label: CopyValue
): PairedBlock {
  recordMissingSource(context, path, "collection", label);
  return {
    type: "paragraph",
    id,
    content: staticLocalized(COPY.noSourceRecords),
  };
}

function resolvePolicy(
  overrides?: Partial<CapabilityStatementExportPolicy>
): CapabilityStatementExportPolicy {
  return Object.freeze({
    missingTranslation:
      overrides?.missingTranslation ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.missingTranslation,
    missingSource:
      overrides?.missingSource ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.missingSource,
    unsafeText:
      overrides?.unsafeText ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.unsafeText,
    unsafeAsset:
      overrides?.unsafeAsset ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.unsafeAsset,
    invalidValue:
      overrides?.invalidValue ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.invalidValue,
    profileReadiness:
      overrides?.profileReadiness ??
      DEFAULT_CAPABILITY_STATEMENT_POLICY.profileReadiness,
  });
}

function freezeDiagnostics(
  diagnostics: readonly CapabilityStatementDiagnostic[]
): readonly CapabilityStatementDiagnostic[] {
  return Object.freeze(
    diagnostics.map((diagnostic) =>
      Object.freeze({
        ...diagnostic,
        message: Object.freeze({ ...diagnostic.message }),
      })
    )
  );
}

/**
 * Build a complete, deterministic bilingual capability statement.
 *
 * The same snapshot and options always produce byte-equivalent JSON. Source
 * arrays retain their supplied ordering because the snapshot loader already
 * provides business-significant recency order.
 */
export function buildCapabilityStatement(
  profile: BusinessProfileSnapshot,
  options: CapabilityStatementOptions = {}
): CapabilityStatementBuildResult {
  const policy = resolvePolicy(options.exportPolicy);
  const context: AdapterContext = { diagnostics: [], policy };

  if (!profile.readiness.readyForProposals) {
    recordProfileNotReady(context, profile.readiness.missing.length);
  }

  const companyName = localizedSourceField(context, {
    label: COPY.companyName,
    sourcePath: sourcePath("workspace.name"),
    enPath: sourcePath("workspace.name"),
    arPath: sourcePath("workspace.nameAr"),
    en: profile.workspace.name,
    ar: profile.workspace.nameAr,
  });
  const tagline = localizedSourceField(context, {
    label: COPY.tagline,
    sourcePath: sourcePath("brand.tagline"),
    enPath: sourcePath("brand.tagline"),
    arPath: sourcePath("brand.taglineAr"),
    en: profile.brand?.tagline,
    ar: profile.brand?.taglineAr,
  });
  const vision2030 = localizedSourceField(context, {
    label: COPY.vision2030,
    sourcePath: sourcePath("brand.vision2030Alignment"),
    enPath: sourcePath("brand.vision2030Alignment"),
    arPath: sourcePath("brand.vision2030AlignmentAr"),
    en: profile.brand?.vision2030Alignment,
    ar: null,
  });

  const identityRows: BilingualTableRow[] = [
    {
      id: "identity-company-name",
      cells: {
        field: tableCell(staticLocalized(COPY.companyName)),
        value: tableCell(companyName),
      },
    },
    {
      id: "identity-tagline",
      cells: {
        field: tableCell(staticLocalized(COPY.tagline)),
        value: tableCell(tagline),
      },
    },
    {
      id: "identity-workspace-reference",
      cells: {
        field: tableCell(staticLocalized(COPY.workspaceReference)),
        value: tableCell(
          sharedSourceValue(
            context,
            profile.workspace.id,
            sourcePath("workspace.id"),
            COPY.workspaceReference,
            "identifier"
          )
        ),
      },
    },
    {
      id: "identity-workspace-slug",
      cells: {
        field: tableCell(staticLocalized(COPY.workspaceSlug)),
        value: tableCell(
          sharedSourceValue(
            context,
            profile.workspace.slug,
            sourcePath("workspace.slug"),
            COPY.workspaceSlug,
            "identifier"
          )
        ),
      },
    },
    {
      id: "identity-plan",
      cells: {
        field: tableCell(staticLocalized(COPY.plan)),
        value: tableCell(
          sharedSourceValue(
            context,
            profile.workspace.plan,
            sourcePath("workspace.plan"),
            COPY.plan,
            "technical-term"
          )
        ),
      },
    },
    {
      id: "identity-commercial-registration",
      cells: {
        field: tableCell(staticLocalized(COPY.commercialRegistration)),
        value: tableCell(
          sharedSourceValue(
            context,
            profile.workspace.crNumber,
            sourcePath("workspace.crNumber"),
            COPY.commercialRegistration,
            "identifier"
          )
        ),
      },
    },
    {
      id: "identity-vat-number",
      cells: {
        field: tableCell(staticLocalized(COPY.vatNumber)),
        value: tableCell(
          sharedSourceValue(
            context,
            profile.workspace.vatNumber,
            sourcePath("workspace.vatNumber"),
            COPY.vatNumber,
            "identifier"
          )
        ),
      },
    },
    {
      id: "identity-vision-2030",
      cells: {
        field: tableCell(staticLocalized(COPY.vision2030)),
        value: tableCell(vision2030),
      },
    },
  ];

  const identityBlocks: PairedBlock[] = [];
  if (options.includeLogo !== false) {
    const rawLogo = profile.brand?.logoUrl?.trim() ?? "";
    const logoSource = rawLogo.length > 0 ? safeLogoSource(rawLogo) : null;
    if (logoSource) {
      identityBlocks.push({
        type: "image",
        id: "company-logo",
        source: logoSource,
        alt: {
          en: COPY.companyLogo.en,
          ar: COPY.companyLogo.ar,
        },
        visualBehavior: "never",
        widthPercent: 35,
      });
    } else {
      if (rawLogo.length > 0) {
        recordUnsafeLogo(context, sourcePath("brand.logoUrl"));
      } else {
        recordMissingSource(
          context,
          sourcePath("brand.logoUrl"),
          "field",
          COPY.companyLogo
        );
      }
      identityRows.push({
        id: "identity-company-logo",
        cells: {
          field: tableCell(staticLocalized(COPY.companyLogo)),
          value: tableCell(unavailableLocalized()),
        },
      });
    }
  }
  identityBlocks.push({
    type: "table",
    id: "company-identity-table",
    columns: [
      {
        id: "field",
        header: staticLocalized(COPY.field),
        widthPercent: 32,
      },
      {
        id: "value",
        header: staticLocalized(COPY.value),
        widthPercent: 68,
      },
    ],
    rows: identityRows,
  });

  const statisticDefinitions = [
    {
      key: "pastProjects",
      label: COPY.pastProjects,
    },
    { key: "staff", label: COPY.teamMembers },
    { key: "certificates", label: COPY.certificates },
    { key: "partnerships", label: COPY.partnerships },
    { key: "sectors", label: COPY.targetSectors },
    { key: "methodologies", label: COPY.methodologies },
  ] as const satisfies readonly {
    readonly key: keyof BusinessProfileSnapshot["stats"];
    readonly label: CopyValue;
  }[];
  const statisticRows: BilingualTableRow[] = statisticDefinitions.map(
    ({ key, label }) => ({
      id: `stat-${key}`,
      cells: {
        metric: tableCell(staticLocalized(label)),
        count: tableCell(
          sharedCount(
            context,
            profile.stats[key],
            sourcePath(`stats.${key}`),
            label
          )
        ),
      },
    })
  );

  const projectRows: BilingualTableRow[] =
    profile.highlights.pastProjects.map((project, index) => {
      const root = `highlights.pastProjects[${index}]`;
      return {
        id: `project-${paddedIndex(index)}`,
        cells: {
          project: tableCell(
            localizedSourceField(context, {
              label: COPY.project,
              sourcePath: sourcePath(`${root}.title`),
              enPath: sourcePath(`${root}.title`),
              arPath: sourcePath(`${root}.titleAr`),
              en: project.title,
              ar: project.titleAr,
            })
          ),
          client: tableCell(
            localizedSourceField(context, {
              label: COPY.client,
              sourcePath: sourcePath(`${root}.clientName`),
              enPath: sourcePath(`${root}.clientName`),
              arPath: sourcePath(`${root}.clientNameAr`),
              en: project.clientName,
              ar: null,
            })
          ),
          sector: tableCell(
            localizedSourceField(context, {
              label: COPY.sector,
              sourcePath: sourcePath(`${root}.sector`),
              enPath: sourcePath(`${root}.sector`),
              arPath: sourcePath(`${root}.sectorAr`),
              en: project.sector,
              ar: null,
            })
          ),
          outcome: tableCell(
            localizedSourceField(context, {
              label: COPY.outcome,
              sourcePath: sourcePath(`${root}.outcome`),
              enPath: sourcePath(`${root}.outcome`),
              arPath: sourcePath(`${root}.outcomeAr`),
              en: project.outcome,
              ar: null,
            })
          ),
          summary: tableCell(
            localizedSourceField(context, {
              label: COPY.summary,
              sourcePath: sourcePath(`${root}.summary`),
              enPath: sourcePath(`${root}.summary`),
              arPath: sourcePath(`${root}.summaryAr`),
              en: project.summary,
              ar: null,
            })
          ),
        },
      };
    });
  const projectBlocks: PairedBlock[] =
    projectRows.length > 0
      ? [
          {
            type: "table",
            id: "projects-table",
            repeatHeader: true,
            columns: [
              {
                id: "project",
                header: staticLocalized(COPY.project),
                widthPercent: 20,
              },
              {
                id: "client",
                header: staticLocalized(COPY.client),
                widthPercent: 17,
              },
              {
                id: "sector",
                header: staticLocalized(COPY.sector),
                widthPercent: 15,
              },
              {
                id: "outcome",
                header: staticLocalized(COPY.outcome),
                widthPercent: 18,
              },
              {
                id: "summary",
                header: staticLocalized(COPY.summary),
                widthPercent: 30,
              },
            ],
            rows: projectRows,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "projects-empty",
            sourcePath("highlights.pastProjects"),
            COPY.pastProjects
          ),
        ];

  const teamRows: BilingualTableRow[] = profile.highlights.staff.map(
    (member, index) => {
      const root = `highlights.staff[${index}]`;
      return {
        id: `team-member-${paddedIndex(index)}`,
        cells: {
          name: tableCell(
            localizedSourceField(context, {
              label: COPY.name,
              sourcePath: sourcePath(`${root}.name`),
              enPath: sourcePath(`${root}.name`),
              arPath: sourcePath(`${root}.nameAr`),
              en: member.name,
              ar: member.nameAr,
            })
          ),
          role: tableCell(
            localizedSourceField(context, {
              label: COPY.role,
              sourcePath: sourcePath(`${root}.title`),
              enPath: sourcePath(`${root}.title`),
              arPath: sourcePath(`${root}.titleAr`),
              en: member.title,
              ar: member.titleAr,
            })
          ),
        },
      };
    }
  );
  const teamBlocks: PairedBlock[] =
    teamRows.length > 0
      ? [
          {
            type: "table",
            id: "team-table",
            repeatHeader: true,
            columns: [
              {
                id: "name",
                header: staticLocalized(COPY.name),
                widthPercent: 50,
              },
              {
                id: "role",
                header: staticLocalized(COPY.role),
                widthPercent: 50,
              },
            ],
            rows: teamRows,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "team-empty",
            sourcePath("highlights.staff"),
            COPY.teamMembers
          ),
        ];

  const certificateRows: BilingualTableRow[] =
    profile.highlights.certificates.map((certificate, index) => {
      const root = `highlights.certificates[${index}]`;
      return {
        id: `certificate-${paddedIndex(index)}`,
        cells: {
          certificate: tableCell(
            localizedSourceField(context, {
              label: COPY.certificate,
              sourcePath: sourcePath(`${root}.name`),
              enPath: sourcePath(`${root}.name`),
              arPath: sourcePath(`${root}.nameAr`),
              en: certificate.name,
              ar: certificate.nameAr,
            })
          ),
          issuer: tableCell(
            localizedSourceField(context, {
              label: COPY.issuer,
              sourcePath: sourcePath(`${root}.issuer`),
              enPath: sourcePath(`${root}.issuer`),
              arPath: sourcePath(`${root}.issuerAr`),
              en: certificate.issuer,
              ar: null,
            })
          ),
        },
      };
    });
  const certificateBlocks: PairedBlock[] =
    certificateRows.length > 0
      ? [
          {
            type: "table",
            id: "certificates-table",
            repeatHeader: true,
            columns: [
              {
                id: "certificate",
                header: staticLocalized(COPY.certificate),
                widthPercent: 60,
              },
              {
                id: "issuer",
                header: staticLocalized(COPY.issuer),
                widthPercent: 40,
              },
            ],
            rows: certificateRows,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "certificates-empty",
            sourcePath("highlights.certificates"),
            COPY.certificates
          ),
        ];

  const partnershipRows: BilingualTableRow[] =
    profile.highlights.partnerships.map((partnership, index) => {
      const root = `highlights.partnerships[${index}]`;
      return {
        id: `partnership-${paddedIndex(index)}`,
        cells: {
          partner: tableCell(
            localizedSourceField(context, {
              label: COPY.partner,
              sourcePath: sourcePath(`${root}.name`),
              enPath: sourcePath(`${root}.name`),
              arPath: sourcePath(`${root}.nameAr`),
              en: partnership.name,
              ar: partnership.nameAr,
            })
          ),
          type: tableCell(
            localizedSourceField(context, {
              label: COPY.partnershipType,
              sourcePath: sourcePath(`${root}.kind`),
              enPath: sourcePath(`${root}.kind`),
              arPath: sourcePath(`${root}.kindAr`),
              en: partnership.kind,
              ar: null,
            })
          ),
        },
      };
    });
  const partnershipBlocks: PairedBlock[] =
    partnershipRows.length > 0
      ? [
          {
            type: "table",
            id: "partnerships-table",
            repeatHeader: true,
            columns: [
              {
                id: "partner",
                header: staticLocalized(COPY.partner),
                widthPercent: 60,
              },
              {
                id: "type",
                header: staticLocalized(COPY.partnershipType),
                widthPercent: 40,
              },
            ],
            rows: partnershipRows,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "partnerships-empty",
            sourcePath("highlights.partnerships"),
            COPY.partnerships
          ),
        ];

  const sectorItems = profile.highlights.sectors.map((sector, index) => {
    const root = `highlights.sectors[${index}]`;
    return {
      id: `sector-${paddedIndex(index)}`,
      content: localizedSourceField(context, {
        label: COPY.sector,
        sourcePath: sourcePath(`${root}.name`),
        enPath: sourcePath(`${root}.name`),
        arPath: sourcePath(`${root}.nameAr`),
        en: sector.name,
        ar: sector.nameAr,
      }),
    };
  });
  const sectorBlocks: PairedBlock[] =
    sectorItems.length > 0
      ? [
          {
            type: "list",
            id: "target-sectors-list",
            ordered: false,
            items: sectorItems,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "target-sectors-empty",
            sourcePath("highlights.sectors"),
            COPY.targetSectors
          ),
        ];

  const methodologyItems = profile.highlights.methodologies.map(
    (methodology, index) => {
      const root = `highlights.methodologies[${index}]`;
      return {
        id: `methodology-${paddedIndex(index)}`,
        content: localizedSourceField(context, {
          label: COPY.methodology,
          sourcePath: sourcePath(`${root}.title`),
          enPath: sourcePath(`${root}.title`),
          arPath: sourcePath(`${root}.titleAr`),
          en: methodology.title,
          ar: methodology.titleAr,
        }),
      };
    }
  );
  const methodologyBlocks: PairedBlock[] =
    methodologyItems.length > 0
      ? [
          {
            type: "list",
            id: "methodologies-list",
            ordered: false,
            items: methodologyItems,
          },
        ]
      : [
          emptyCollectionBlock(
            context,
            "methodologies-empty",
            sourcePath("highlights.methodologies"),
            COPY.methodologies
          ),
        ];

  const missingEvidenceItems = profile.readiness.missing.map(
    (missingItem, index) => {
      const root = `readiness.missing[${index}]`;
      return {
        id: `readiness-missing-${paddedIndex(index)}`,
        content: localizedSourceField(context, {
          label: COPY.missingEvidence,
          sourcePath: sourcePath(root),
          enPath: sourcePath(root),
          arPath: sourcePath(`${root}Ar`),
          en: missingItem,
          ar: null,
        }),
      };
    }
  );

  const generatedAt = sharedDate(
    context,
    profile.generatedAt,
    sourcePath("generatedAt")
  );
  const completedRequirements = completedRequirementValue(
    context,
    profile.readiness.completedCount,
    profile.readiness.totalRequired
  );
  const completionScore = sharedCount(
    context,
    profile.readiness.score,
    sourcePath("readiness.score"),
    COPY.completionScore,
    "%"
  );
  const diagnosticCount = context.diagnostics.length;
  const readinessRows: BilingualTableRow[] = [
    {
      id: "readiness-status",
      cells: {
        field: tableCell(staticLocalized(COPY.proposalReadiness)),
        value: tableCell(
          staticLocalized(
            profile.readiness.readyForProposals ? COPY.ready : COPY.notReady
          )
        ),
      },
    },
    {
      id: "readiness-completed",
      cells: {
        field: tableCell(staticLocalized(COPY.completedRequirements)),
        value: tableCell(completedRequirements),
      },
    },
    {
      id: "readiness-score",
      cells: {
        field: tableCell(staticLocalized(COPY.completionScore)),
        value: tableCell(completionScore),
      },
    },
    {
      id: "readiness-generated-at",
      cells: {
        field: tableCell(staticLocalized(COPY.generatedAt)),
        value: tableCell(generatedAt),
      },
    },
    {
      id: "readiness-diagnostics",
      cells: {
        field: tableCell(staticLocalized(COPY.diagnosticCount)),
        value: tableCell(
          sharedCount(
            context,
            diagnosticCount,
            sourcePath("adapter.diagnostics"),
            COPY.diagnosticCount
          )
        ),
      },
    },
  ];

  const readinessBlocks: PairedBlock[] = [
    {
      type: "table",
      id: "readiness-evidence-table",
      columns: [
        {
          id: "field",
          header: staticLocalized(COPY.field),
          widthPercent: 45,
        },
        {
          id: "value",
          header: staticLocalized(COPY.value),
          widthPercent: 55,
        },
      ],
      rows: readinessRows,
    },
    {
      type: "heading",
      id: "missing-evidence-heading",
      level: 3,
      keepWithNext: true,
      content: staticLocalized(COPY.missingEvidence),
    },
    missingEvidenceItems.length > 0
      ? {
          type: "list",
          id: "missing-evidence-list",
          ordered: false,
          items: missingEvidenceItems,
        }
      : {
          type: "paragraph",
          id: "no-missing-evidence",
          content: staticLocalized(COPY.noMissingEvidence),
        },
    {
      type: "paragraph",
      id: "capability-provenance-note",
      content: staticLocalized(COPY.provenance),
    },
  ];

  const sections = [
    {
      id: "cover-company-identity",
      alignmentKey: "capability.company-identity",
      title: staticLocalized(COPY.companyIdentity),
      blocks: identityBlocks,
    },
    {
      id: "verified-statistics",
      alignmentKey: "capability.verified-statistics",
      title: staticLocalized(COPY.verifiedStatistics),
      blocks: [
        {
          type: "table",
          id: "verified-statistics-table",
          columns: [
            {
              id: "metric",
              header: staticLocalized(COPY.metric),
              widthPercent: 70,
            },
            {
              id: "count",
              header: staticLocalized(COPY.count),
              align: "numeric",
              widthPercent: 30,
            },
          ],
          rows: statisticRows,
        },
      ],
    },
    {
      id: "projects",
      alignmentKey: "capability.projects",
      title: staticLocalized(COPY.pastProjects),
      blocks: projectBlocks,
      startOnNewPage: true,
    },
    {
      id: "team",
      alignmentKey: "capability.team",
      title: staticLocalized(COPY.team),
      blocks: teamBlocks,
    },
    {
      id: "certificates",
      alignmentKey: "capability.certificates",
      title: staticLocalized(COPY.certificates),
      blocks: certificateBlocks,
    },
    {
      id: "partnerships",
      alignmentKey: "capability.partnerships",
      title: staticLocalized(COPY.partnerships),
      blocks: partnershipBlocks,
    },
    {
      id: "target-sectors",
      alignmentKey: "capability.target-sectors",
      title: staticLocalized(COPY.targetSectors),
      blocks: sectorBlocks,
    },
    {
      id: "methodologies",
      alignmentKey: "capability.methodologies",
      title: staticLocalized(COPY.methodologies),
      blocks: methodologyBlocks,
    },
    {
      id: "readiness-evidence",
      alignmentKey: "capability.readiness-evidence",
      title: staticLocalized(COPY.readinessEvidence),
      blocks: readinessBlocks,
      startOnNewPage: true,
    },
  ] satisfies readonly PairedSection[];

  const documentTitle: LocalizedInline = {
    en: [
      ...staticInline(`${COPY.capabilityStatement.en} — `),
      ...companyName.en,
    ],
    ar: [
      ...staticInline(`${COPY.capabilityStatement.ar} — `),
      ...companyName.ar,
    ],
  };
  const document = parseBilingualDocument({
    id: capabilityDocumentId(profile.workspace.id),
    version: "phase-6-v1",
    title: documentTitle,
    layout: {
      mode: "parallel",
      columnRatio: [50, 50],
      mobileBreakpointPx: 768,
      mobileOrder: "ar-first",
      viewer: { mode: "both", defaultLanguage: "ar" },
    },
    sections,
  } satisfies BilingualDocumentSpec);

  const diagnostics = freezeDiagnostics(context.diagnostics);
  const blockingDiagnostics = Object.freeze(
    diagnostics.filter((diagnostic) => diagnostic.blocking)
  );
  const base = {
    document,
    diagnostics,
    blockingDiagnostics,
    policy,
  } satisfies CapabilityStatementResultBase;

  if (blockingDiagnostics.length === 0) {
    return Object.freeze({
      ...base,
      status: "exportable",
      canExport: true,
    } satisfies ExportableCapabilityStatement);
  }
  return Object.freeze({
    ...base,
    status: "blocked",
    canExport: false,
  } satisfies BlockedCapabilityStatement);
}

/** Narrow a result before passing its document to a final export boundary. */
export function assertCapabilityStatementExportable(
  result: CapabilityStatementBuildResult
): asserts result is ExportableCapabilityStatement {
  if (!result.canExport) {
    throw new CapabilityStatementExportBlockedError(
      result.blockingDiagnostics
    );
  }
}
