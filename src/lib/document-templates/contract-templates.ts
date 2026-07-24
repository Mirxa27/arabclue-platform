/**
 * Draft-only Saudi procurement contract-template catalog.
 *
 * This foundation is intentionally additive and persistence-agnostic. It
 * contains structured bilingual drafting nodes, typed variable schemas, and
 * explicit legal-review placeholders. It does not contain executable template
 * code, raw HTML, tender-specific commercial terms, or any claim of legal
 * approval.
 */

import { createHash } from "node:crypto";

export const CONTRACT_TEMPLATE_KEYS = deepFreeze([
  "it-services-v1",
  "goods-supply-v1",
  "professional-services-v1",
  "nda-v1",
  "subcontract-v1",
  "framework-calloff-v1",
  "saas-data-v1",
] as const);

export type ContractTemplateKey = (typeof CONTRACT_TEMPLATE_KEYS)[number];

export const CONTRACT_CLAUSE_IDS = deepFreeze([
  "clause.parties",
  "clause.definitions",
  "clause.scope",
  "clause.deliverables",
  "clause.governance",
  "clause.acceptance",
  "clause.service-levels",
  "clause.change-control",
  "clause.intellectual-property",
  "clause.confidentiality",
  "clause.liability",
  "clause.term",
  "clause.termination",
  "clause.disputes",
  "clause.signatures",
  "clause.goods-specifications",
  "clause.delivery-inspection",
  "clause.title-risk-warranty",
  "clause.professional-team",
  "clause.client-dependencies",
  "clause.conflicts",
  "clause.nda-purpose",
  "clause.disclosures",
  "clause.return-destruction",
  "clause.data-security",
  "clause.subcontract-flow-down",
  "clause.compliance",
  "clause.payment-schedule",
  "clause.indemnity-handover",
  "clause.framework-orders",
  "clause.saas-subscription",
  "clause.support-suspension",
  "clause.exit-continuity",
] as const);

export type ContractClauseId = (typeof CONTRACT_CLAUSE_IDS)[number];

export interface LocalizedText {
  readonly en: string;
  readonly ar: string;
}

export type TemplateVariableType =
  | "STRING"
  | "RICH_TEXT"
  | "NUMBER"
  | "MONEY"
  | "PERCENT"
  | "DATE"
  | "BOOLEAN"
  | "ENTITY"
  | "LIST";

export type TemplateSourcePolicy =
  | "PROJECT"
  | "WORKSPACE"
  | "BRAND"
  | "APPROVED_KNOWLEDGE"
  | "USER_ENTRY"
  | "DERIVED";

export type TemplateValueDirection = "LOCALIZED" | "DIRECTION_NEUTRAL";

export interface VariableValidation {
  readonly min?: number;
  readonly max?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
}

export interface TemplateVariableDefinition {
  readonly key: string;
  readonly type: TemplateVariableType;
  readonly label: LocalizedText;
  readonly required: boolean;
  readonly sourcePolicy: TemplateSourcePolicy;
  /**
   * LOCALIZED values require independently supplied English and Arabic
   * content. DIRECTION_NEUTRAL is reserved for explicit identifiers,
   * entities, dates, booleans, and numeric/money values that are semantically
   * identical in both columns.
   */
  readonly valueDirection: TemplateValueDirection;
  readonly format?: string;
  readonly validation?: VariableValidation;
}

export interface TemplateTextNode {
  readonly type: "TEXT";
  readonly value: string;
}

export interface TemplateVariableNode {
  readonly type: "VARIABLE";
  readonly variableKey: string;
}

export type TemplateInlineNode = TemplateTextNode | TemplateVariableNode;

export interface BilingualTemplateContent {
  readonly en: readonly TemplateInlineNode[];
  readonly ar: readonly TemplateInlineNode[];
  readonly precedence: "UNSPECIFIED";
  readonly translationStatus: "DRAFT";
}

export interface TemplateParagraphBlock {
  readonly type: "PARAGRAPH";
  readonly key: string;
  readonly role: "LEGAL_DRAFT";
  readonly sensitivity: "CONFIDENTIAL";
  readonly content: BilingualTemplateContent;
}

export type ClauseApplicability =
  | "GENERAL"
  | "TENDER_SPECIFIC"
  | "COUNSEL_DECISION";

export interface ClauseProvenance {
  readonly jurisdiction: "Kingdom of Saudi Arabia";
  readonly sources: readonly [];
  readonly sourceStatus: "PENDING_OFFICIAL_SOURCE_REVIEW";
  readonly legalReview: {
    readonly status: "UNREVIEWED";
    readonly reviewedAt: null;
    readonly reviewerId: null;
    readonly reviewBy: null;
    readonly notes: LocalizedText;
  };
}

export interface ContractClauseDefinition {
  readonly id: ContractClauseId;
  readonly version: 1;
  readonly versionId: string;
  readonly canonicalHash: string;
  readonly lifecycle: "DRAFT";
  readonly counselReviewRequired: true;
  readonly category: string;
  readonly title: LocalizedText;
  readonly applicability: ClauseApplicability;
  readonly applicabilityNotes: LocalizedText;
  readonly variables: readonly TemplateVariableDefinition[];
  readonly blocks: readonly TemplateParagraphBlock[];
  readonly provenance: ClauseProvenance;
}

export interface ContractTemplateSection {
  readonly key: string;
  readonly title: LocalizedText;
  readonly clauseIds: readonly ContractClauseId[];
}

export interface ContractTemplateDefinition {
  readonly key: ContractTemplateKey;
  readonly version: 1;
  readonly versionId: string;
  readonly schemaVersion: 1;
  readonly canonicalHash: string;
  readonly lifecycle: "DRAFT";
  readonly name: LocalizedText;
  readonly summary: LocalizedText;
  readonly intendedUse: LocalizedText;
  readonly jurisdiction: "Kingdom of Saudi Arabia";
  readonly languagePolicy: {
    readonly mode: "BILINGUAL";
    readonly layout: "PARALLEL";
    readonly precedence: "UNSPECIFIED";
  };
  readonly counselReviewRequired: true;
  readonly legalReview: {
    readonly status: "UNREVIEWED";
    readonly reviewedAt: null;
    readonly reviewerId: null;
    readonly reviewBy: null;
  };
  readonly disclaimer: LocalizedText;
  readonly reviewFocus: LocalizedText;
  readonly variables: readonly TemplateVariableDefinition[];
  readonly sections: readonly ContractTemplateSection[];
}

export interface MoneyBindingValue {
  readonly amount: number;
  readonly currency: string;
}

export interface LocalizedStringBindingValue {
  readonly en: string;
  readonly ar: string;
}

export interface LocalizedListBindingValue {
  readonly en: readonly string[];
  readonly ar: readonly string[];
}

export type TemplateBindingValue =
  | string
  | number
  | boolean
  | MoneyBindingValue
  | LocalizedStringBindingValue
  | LocalizedListBindingValue;

export type BoundRenderableValue =
  | string
  | number
  | boolean
  | MoneyBindingValue
  | readonly string[];

export interface BoundValueNode {
  readonly type: "VALUE";
  readonly variableKey: string;
  readonly language: "en" | "ar";
  readonly valueDirection: TemplateValueDirection;
  readonly value: BoundRenderableValue;
}

export interface BoundPlaceholderNode {
  readonly type: "PLACEHOLDER";
  readonly variableKey: string;
  readonly label: string;
  readonly required: boolean;
}

export type BoundInlineNode =
  | TemplateTextNode
  | BoundValueNode
  | BoundPlaceholderNode;

export interface BoundParagraphBlock {
  readonly type: "PARAGRAPH";
  readonly key: string;
  readonly role: "LEGAL_DRAFT";
  readonly sensitivity: "CONFIDENTIAL";
  readonly content: {
    readonly en: readonly BoundInlineNode[];
    readonly ar: readonly BoundInlineNode[];
    readonly precedence: "UNSPECIFIED";
    readonly translationStatus: "DRAFT";
  };
}

export interface BoundContractClause {
  readonly id: ContractClauseId;
  readonly versionId: string;
  readonly title: LocalizedText;
  readonly blocks: readonly BoundParagraphBlock[];
  readonly provenance: ClauseProvenance;
}

export interface BoundContractDocument {
  readonly schemaVersion: 1;
  readonly documentKind: "CONTRACT";
  readonly template: {
    readonly key: ContractTemplateKey;
    readonly version: 1;
    readonly versionId: string;
    readonly canonicalHash: string;
  };
  readonly lifecycle: "DRAFT";
  readonly languageMode: "BILINGUAL";
  readonly bilingualLayout: "PARALLEL";
  readonly legalReviewStatus: "UNREVIEWED";
  readonly counselReviewRequired: true;
  readonly disclaimer: LocalizedText;
  readonly sections: readonly {
    readonly key: string;
    readonly title: LocalizedText;
    readonly clauses: readonly BoundContractClause[];
  }[];
}

export type BindingDiagnosticCode =
  | "UNKNOWN_TEMPLATE"
  | "UNKNOWN_VARIABLE"
  | "MISSING_REQUIRED_VARIABLE"
  | "OPTIONAL_VARIABLE_OMITTED"
  | "MISSING_BINDING_LOCALE"
  | "INVALID_VARIABLE_TYPE"
  | "UNSAFE_BINDING_VALUE";

export interface BindingDiagnostic {
  readonly code: BindingDiagnosticCode;
  readonly severity: "ERROR" | "INFO";
  readonly path: string;
  readonly variableKey: string | null;
  readonly message: string;
}

export type ContractBindingResult =
  | {
      readonly status: "READY";
      readonly mode: "PREVIEW" | "FINAL";
      readonly document: BoundContractDocument;
      readonly diagnostics: readonly BindingDiagnostic[];
    }
  | {
      readonly status: "READY_WITH_DIAGNOSTICS";
      readonly mode: "PREVIEW";
      readonly document: BoundContractDocument;
      readonly diagnostics: readonly BindingDiagnostic[];
    }
  | {
      readonly status: "BLOCKED";
      readonly mode: "PREVIEW" | "FINAL";
      readonly document: null;
      readonly diagnostics: readonly BindingDiagnostic[];
    };

interface VariableReference {
  readonly kind: "VARIABLE_REFERENCE";
  readonly key: TemplateVariableKey;
}

interface ClauseSeed {
  readonly id: ContractClauseId;
  readonly category: string;
  readonly title: LocalizedText;
  readonly applicability: ClauseApplicability;
  readonly applicabilityNotes: LocalizedText;
  readonly variableKeys: readonly TemplateVariableKey[];
  readonly content: {
    readonly en: readonly ClausePart[];
    readonly ar: readonly ClausePart[];
  };
}

interface TemplateSeed {
  readonly key: ContractTemplateKey;
  readonly name: LocalizedText;
  readonly summary: LocalizedText;
  readonly intendedUse: LocalizedText;
  readonly reviewFocus: LocalizedText;
  readonly sections: readonly ContractTemplateSection[];
}

type ClausePart = string | VariableReference;

const DRAFT_DISCLAIMER = {
  en: "Drafting framework only. It is not legal advice, is not approved for legal use, and must not be executed or exported as a final contract until qualified Saudi counsel reviews the completed terms and evidence.",
  ar: "إطار للصياغة الأولية فقط. ليست استشارة قانونية وليست معتمدة قانونياً، ولا يجوز توقيعها أو تصديرها كعقد نهائي قبل مراجعة محامٍ مؤهل في المملكة للشروط والأدلة المكتملة.",
} as const satisfies LocalizedText;

const VARIABLE_DEFINITIONS = {
  "input.clientLegalName": defineVariable(
    "input.clientLegalName",
    "ENTITY",
    "Client legal name",
    "الاسم القانوني للعميل"
  ),
  "input.supplierLegalName": defineVariable(
    "input.supplierLegalName",
    "ENTITY",
    "Supplier legal name",
    "الاسم القانوني للمورد"
  ),
  "input.effectiveDate": defineVariable(
    "input.effectiveDate",
    "DATE",
    "Effective date",
    "تاريخ السريان"
  ),
  "input.tenderReference": defineVariable(
    "input.tenderReference",
    "STRING",
    "Tender or project reference",
    "مرجع المنافسة أو المشروع",
    false,
    undefined,
    "DIRECTION_NEUTRAL"
  ),
  "input.scopeDescription": defineVariable(
    "input.scopeDescription",
    "RICH_TEXT",
    "Evidence-backed scope description",
    "وصف نطاق العمل المستند إلى الأدلة"
  ),
  "input.deliverablesSchedule": defineVariable(
    "input.deliverablesSchedule",
    "RICH_TEXT",
    "Deliverables schedule",
    "جدول المخرجات"
  ),
  "input.governanceContacts": defineVariable(
    "input.governanceContacts",
    "LIST",
    "Governance contacts",
    "جهات اتصال الحوكمة"
  ),
  "input.acceptanceCriteria": defineVariable(
    "input.acceptanceCriteria",
    "RICH_TEXT",
    "Acceptance criteria",
    "معايير القبول"
  ),
  "input.acceptancePeriodDays": defineVariable(
    "input.acceptancePeriodDays",
    "NUMBER",
    "Acceptance review period in days",
    "مدة مراجعة القبول بالأيام",
    false,
    { min: 0 }
  ),
  "input.serviceLevelSchedule": defineVariable(
    "input.serviceLevelSchedule",
    "RICH_TEXT",
    "Tender-evidenced service-level schedule",
    "جدول مستويات الخدمة المستند إلى وثائق المنافسة"
  ),
  "input.serviceCreditPercent": defineVariable(
    "input.serviceCreditPercent",
    "PERCENT",
    "Tender-stated service credit percentage",
    "نسبة حسم مستوى الخدمة الواردة في المنافسة",
    false
  ),
  "input.changeAuthority": defineVariable(
    "input.changeAuthority",
    "ENTITY",
    "Authorized change approver",
    "صاحب صلاحية اعتماد التغيير"
  ),
  "input.ipPosition": defineVariable(
    "input.ipPosition",
    "STRING",
    "Counsel-reviewed intellectual-property position",
    "موقف الملكية الفكرية بعد مراجعة المستشار"
  ),
  "input.confidentialityPeriodMonths": defineVariable(
    "input.confidentialityPeriodMonths",
    "NUMBER",
    "Confidentiality period in months",
    "مدة السرية بالأشهر",
    true,
    { min: 0 }
  ),
  "input.liabilityCap": defineVariable(
    "input.liabilityCap",
    "MONEY",
    "Counsel-reviewed liability cap",
    "حد المسؤولية بعد مراجعة المستشار"
  ),
  "input.termStartDate": defineVariable(
    "input.termStartDate",
    "DATE",
    "Term start date",
    "تاريخ بدء المدة"
  ),
  "input.termEndDate": defineVariable(
    "input.termEndDate",
    "DATE",
    "Term end date",
    "تاريخ انتهاء المدة"
  ),
  "input.terminationNoticeDays": defineVariable(
    "input.terminationNoticeDays",
    "NUMBER",
    "Termination notice period in days",
    "مدة إشعار الإنهاء بالأيام",
    true,
    { min: 0 }
  ),
  "input.disputeForum": defineVariable(
    "input.disputeForum",
    "STRING",
    "Counsel-selected dispute forum",
    "جهة تسوية النزاع التي يحددها المستشار"
  ),
  "input.clientSigner": defineVariable(
    "input.clientSigner",
    "ENTITY",
    "Authorized client signatory",
    "المفوض بالتوقيع عن العميل"
  ),
  "input.supplierSigner": defineVariable(
    "input.supplierSigner",
    "ENTITY",
    "Authorized supplier signatory",
    "المفوض بالتوقيع عن المورد"
  ),
  "input.goodsSpecifications": defineVariable(
    "input.goodsSpecifications",
    "RICH_TEXT",
    "Goods specifications",
    "مواصفات الأصناف"
  ),
  "input.quantitiesSchedule": defineVariable(
    "input.quantitiesSchedule",
    "RICH_TEXT",
    "Quantities schedule",
    "جدول الكميات"
  ),
  "input.deliveryLocation": defineVariable(
    "input.deliveryLocation",
    "STRING",
    "Delivery location",
    "مكان التسليم"
  ),
  "input.inspectionPeriodDays": defineVariable(
    "input.inspectionPeriodDays",
    "NUMBER",
    "Inspection period in days",
    "مدة الفحص بالأيام",
    true,
    { min: 0 }
  ),
  "input.riskTransferPoint": defineVariable(
    "input.riskTransferPoint",
    "STRING",
    "Title and risk transfer point",
    "نقطة انتقال الملكية والمخاطر"
  ),
  "input.warrantyPeriodMonths": defineVariable(
    "input.warrantyPeriodMonths",
    "NUMBER",
    "Warranty period in months",
    "مدة الضمان بالأشهر",
    true,
    { min: 0 }
  ),
  "input.keyPersonnel": defineVariable(
    "input.keyPersonnel",
    "LIST",
    "Approved key personnel",
    "الكوادر الرئيسية المعتمدة"
  ),
  "input.professionalLicenseEvidence": defineVariable(
    "input.professionalLicenseEvidence",
    "LIST",
    "Professional license evidence",
    "أدلة التراخيص المهنية",
    false,
    { minItems: 1 }
  ),
  "input.clientDependencies": defineVariable(
    "input.clientDependencies",
    "RICH_TEXT",
    "Client dependencies and duties",
    "التزامات العميل والمتطلبات التابعة"
  ),
  "input.conflictDisclosure": defineVariable(
    "input.conflictDisclosure",
    "RICH_TEXT",
    "Conflict disclosure",
    "الإفصاح عن تعارض المصالح",
    false
  ),
  "input.ndaPurpose": defineVariable(
    "input.ndaPurpose",
    "RICH_TEXT",
    "Permitted disclosure purpose",
    "غرض الإفصاح المسموح"
  ),
  "input.permittedRecipients": defineVariable(
    "input.permittedRecipients",
    "LIST",
    "Permitted recipient categories",
    "فئات المستلمين المسموح لهم"
  ),
  "input.requiredDisclosureProcess": defineVariable(
    "input.requiredDisclosureProcess",
    "RICH_TEXT",
    "Required-disclosure process",
    "إجراءات الإفصاح الإلزامي"
  ),
  "input.returnDestructionMethod": defineVariable(
    "input.returnDestructionMethod",
    "STRING",
    "Return or destruction method",
    "طريقة الإعادة أو الإتلاف"
  ),
  "input.personalDataIncluded": defineVariable(
    "input.personalDataIncluded",
    "BOOLEAN",
    "Personal data is included",
    "يشمل بيانات شخصية",
    false
  ),
  "input.dataProcessingSchedule": defineVariable(
    "input.dataProcessingSchedule",
    "RICH_TEXT",
    "Data-processing schedule",
    "ملحق معالجة البيانات",
    false
  ),
  "input.securitySchedule": defineVariable(
    "input.securitySchedule",
    "RICH_TEXT",
    "Verified security schedule",
    "ملحق الضوابط الأمنية المتحقق منه"
  ),
  "input.hostingLocation": defineVariable(
    "input.hostingLocation",
    "STRING",
    "Verified hosting location",
    "موقع الاستضافة المتحقق منه"
  ),
  "input.primeContractReference": defineVariable(
    "input.primeContractReference",
    "STRING",
    "Prime contract reference",
    "مرجع العقد الرئيسي",
    true,
    undefined,
    "DIRECTION_NEUTRAL"
  ),
  "input.flowDownRegister": defineVariable(
    "input.flowDownRegister",
    "RICH_TEXT",
    "Verified flow-down register",
    "سجل الالتزامات المنقولة المتحقق منه"
  ),
  "input.complianceSchedule": defineVariable(
    "input.complianceSchedule",
    "RICH_TEXT",
    "Tender compliance schedule",
    "جدول الامتثال للمنافسة"
  ),
  "input.priceSchedule": defineVariable(
    "input.priceSchedule",
    "RICH_TEXT",
    "User-entered price schedule",
    "جدول الأسعار المدخل من المستخدم"
  ),
  "input.paymentMilestones": defineVariable(
    "input.paymentMilestones",
    "LIST",
    "Evidence-backed payment milestones",
    "معالم الدفع المستندة إلى الأدلة",
    false
  ),
  "input.minimumCommitment": defineVariable(
    "input.minimumCommitment",
    "MONEY",
    "Counsel-reviewed minimum commitment",
    "الحد الأدنى للالتزام بعد مراجعة المستشار",
    false
  ),
  "input.indemnityScope": defineVariable(
    "input.indemnityScope",
    "RICH_TEXT",
    "Counsel-reviewed indemnity scope",
    "نطاق التعويض بعد مراجعة المستشار"
  ),
  "input.handoverPlan": defineVariable(
    "input.handoverPlan",
    "RICH_TEXT",
    "Handover plan",
    "خطة التسليم الانتقالي"
  ),
  "input.orderingProcedure": defineVariable(
    "input.orderingProcedure",
    "RICH_TEXT",
    "Call-off ordering procedure",
    "إجراءات إصدار أوامر الشراء"
  ),
  "input.calloffAuthority": defineVariable(
    "input.calloffAuthority",
    "ENTITY",
    "Authorized call-off issuer",
    "الجهة المخولة بإصدار أوامر الشراء"
  ),
  "input.precedencePolicy": defineVariable(
    "input.precedencePolicy",
    "STRING",
    "Counsel-reviewed order of precedence",
    "ترتيب الأولوية بعد مراجعة المستشار"
  ),
  "input.subscriptionPlan": defineVariable(
    "input.subscriptionPlan",
    "STRING",
    "Subscription plan",
    "خطة الاشتراك"
  ),
  "input.authorizedUsers": defineVariable(
    "input.authorizedUsers",
    "NUMBER",
    "Authorized user count",
    "عدد المستخدمين المصرح لهم",
    true,
    { min: 0 }
  ),
  "input.acceptableUsePolicy": defineVariable(
    "input.acceptableUsePolicy",
    "RICH_TEXT",
    "Acceptable-use policy",
    "سياسة الاستخدام المقبول"
  ),
  "input.supportSchedule": defineVariable(
    "input.supportSchedule",
    "RICH_TEXT",
    "Support schedule",
    "جدول الدعم"
  ),
  "input.suspensionConditions": defineVariable(
    "input.suspensionConditions",
    "RICH_TEXT",
    "Counsel-reviewed suspension conditions",
    "شروط التعليق بعد مراجعة المستشار"
  ),
  "input.exitExportFormat": defineVariable(
    "input.exitExportFormat",
    "STRING",
    "Exit data export format",
    "صيغة تصدير البيانات عند الخروج",
    true,
    undefined,
    "DIRECTION_NEUTRAL"
  ),
  "input.businessContinuityPlan": defineVariable(
    "input.businessContinuityPlan",
    "RICH_TEXT",
    "Business-continuity plan",
    "خطة استمرارية الأعمال"
  ),
  "input.subprocessorList": defineVariable(
    "input.subprocessorList",
    "LIST",
    "Verified subprocessor list",
    "قائمة المعالجين الفرعيين المتحقق منها",
    false
  ),
} as const satisfies Record<string, TemplateVariableDefinition>;

type TemplateVariableKey = keyof typeof VARIABLE_DEFINITIONS;

function defineVariable(
  key: string,
  type: TemplateVariableType,
  en: string,
  ar: string,
  required = true,
  validation?: VariableValidation,
  valueDirection: TemplateValueDirection = defaultValueDirection(type)
): TemplateVariableDefinition {
  return {
    key,
    type,
    label: { en, ar },
    required,
    sourcePolicy: "USER_ENTRY",
    valueDirection,
    ...(validation ? { validation } : {}),
  };
}

function defaultValueDirection(
  type: TemplateVariableType
): TemplateValueDirection {
  return type === "STRING" || type === "RICH_TEXT" || type === "LIST"
    ? "LOCALIZED"
    : "DIRECTION_NEUTRAL";
}

function variableReference(key: TemplateVariableKey): VariableReference {
  return { kind: "VARIABLE_REFERENCE", key };
}

const ref = variableReference;

function localized(en: string, ar: string): LocalizedText {
  return { en, ar };
}

function createInlineNodes(
  parts: readonly ClausePart[]
): readonly TemplateInlineNode[] {
  return parts.map((part) =>
    typeof part === "string"
      ? { type: "TEXT", value: part }
      : { type: "VARIABLE", variableKey: part.key }
  );
}

function createClause(seed: ClauseSeed): ContractClauseDefinition {
  const version = 1 as const;
  const base = {
    id: seed.id,
    version,
    versionId: `${seed.id}@${version}`,
    lifecycle: "DRAFT" as const,
    counselReviewRequired: true as const,
    category: seed.category,
    title: seed.title,
    applicability: seed.applicability,
    applicabilityNotes: seed.applicabilityNotes,
    variables: seed.variableKeys.map((key) => VARIABLE_DEFINITIONS[key]),
    blocks: [
      {
        type: "PARAGRAPH" as const,
        key: `${seed.id}.body`,
        role: "LEGAL_DRAFT" as const,
        sensitivity: "CONFIDENTIAL" as const,
        content: {
          en: createInlineNodes(seed.content.en),
          ar: createInlineNodes(seed.content.ar),
          precedence: "UNSPECIFIED" as const,
          translationStatus: "DRAFT" as const,
        },
      },
    ],
    provenance: {
      jurisdiction: "Kingdom of Saudi Arabia" as const,
      sources: [] as const,
      sourceStatus: "PENDING_OFFICIAL_SOURCE_REVIEW" as const,
      legalReview: {
        status: "UNREVIEWED" as const,
        reviewedAt: null,
        reviewerId: null,
        reviewBy: null,
        notes: localized(
          "Official sources, applicability, and wording require qualified Saudi counsel review before publication.",
          "تتطلب المصادر الرسمية ونطاق التطبيق والصياغة مراجعة محامٍ مؤهل في المملكة قبل النشر."
        ),
      },
    },
  };

  return deepFreeze({
    ...base,
    canonicalHash: computeCanonicalHash(base),
  });
}

export const CONTRACT_CLAUSE_CATALOG = deepFreeze({
  "clause.parties": createClause({
    id: "clause.parties",
    category: "FOUNDATION",
    title: localized("Parties and authority", "الأطراف والصلاحيات"),
    applicability: "GENERAL",
    applicabilityNotes: localized(
      "Use only after legal identities and signing authority are verified.",
      "يستخدم فقط بعد التحقق من الهويات القانونية وصلاحيات التوقيع."
    ),
    variableKeys: ["input.clientLegalName", "input.supplierLegalName"],
    content: {
      en: [
        "This draft identifies ",
        ref("input.clientLegalName"),
        " as the client and ",
        ref("input.supplierLegalName"),
        " as the supplier. Legal identity and authority remain subject to verification.",
      ],
      ar: [
        "تحدد هذه المسودة ",
        ref("input.clientLegalName"),
        " بصفته العميل و",
        ref("input.supplierLegalName"),
        " بصفته المورد، مع بقاء الهوية القانونية والصلاحية خاضعتين للتحقق.",
      ],
    },
  }),
  "clause.definitions": createClause({
    id: "clause.definitions",
    category: "FOUNDATION",
    title: localized("Definitions and effective date", "التعريفات وتاريخ السريان"),
    applicability: "GENERAL",
    applicabilityNotes: localized(
      "Defined terms must be reconciled with the complete tender and schedules.",
      "يجب مواءمة المصطلحات المعرفة مع وثائق المنافسة والملاحق المكتملة."
    ),
    variableKeys: ["input.effectiveDate", "input.tenderReference"],
    content: {
      en: [
        "Defined terms apply from ",
        ref("input.effectiveDate"),
        ". The optional tender or project reference is ",
        ref("input.tenderReference"),
        ". Definitions require consistency review.",
      ],
      ar: [
        "تسري المصطلحات المعرفة اعتباراً من ",
        ref("input.effectiveDate"),
        ". ومرجع المنافسة أو المشروع الاختياري هو ",
        ref("input.tenderReference"),
        ". وتخضع التعريفات لمراجعة الاتساق.",
      ],
    },
  }),
  "clause.scope": createClause({
    id: "clause.scope",
    category: "PERFORMANCE",
    title: localized("Scope of work", "نطاق العمل"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Bind only to scope text supported by tender evidence or explicit user entry.",
      "يربط فقط بنطاق تؤيده وثائق المنافسة أو إدخال صريح من المستخدم."
    ),
    variableKeys: ["input.scopeDescription"],
    content: {
      en: [
        "The proposed scope is ",
        ref("input.scopeDescription"),
        ". Any ambiguity or exclusion requires explicit completion and review.",
      ],
      ar: [
        "نطاق العمل المقترح هو ",
        ref("input.scopeDescription"),
        ". ويتطلب أي غموض أو استثناء استكمالاً ومراجعة صريحة.",
      ],
    },
  }),
  "clause.deliverables": createClause({
    id: "clause.deliverables",
    category: "PERFORMANCE",
    title: localized("Deliverables and milestones", "المخرجات والمعالم"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Confirm every deliverable, dependency, and milestone against the tender.",
      "يجب تأكيد كل مخرج واعتمادية ومعلم مقابل وثائق المنافسة."
    ),
    variableKeys: ["input.deliverablesSchedule"],
    content: {
      en: [
        "The draft deliverables and milestones are recorded in ",
        ref("input.deliverablesSchedule"),
        ". Dates and acceptance dependencies are not inferred by this template.",
      ],
      ar: [
        "تسجل المخرجات والمعالم الأولية في ",
        ref("input.deliverablesSchedule"),
        ". ولا يستنتج هذا القالب التواريخ أو متطلبات القبول.",
      ],
    },
  }),
  "clause.governance": createClause({
    id: "clause.governance",
    category: "GOVERNANCE",
    title: localized("Governance and notices", "الحوكمة والإشعارات"),
    applicability: "GENERAL",
    applicabilityNotes: localized(
      "Verify the named roles and their authority before use.",
      "يجب التحقق من الأدوار المسماة وصلاحياتها قبل الاستخدام."
    ),
    variableKeys: ["input.governanceContacts"],
    content: {
      en: [
        "The proposed governance contacts are ",
        ref("input.governanceContacts"),
        ". Escalation and notice authority must be confirmed by both parties.",
      ],
      ar: [
        "جهات اتصال الحوكمة المقترحة هي ",
        ref("input.governanceContacts"),
        ". ويجب أن يؤكد الطرفان صلاحيات التصعيد والإشعارات.",
      ],
    },
  }),
  "clause.acceptance": createClause({
    id: "clause.acceptance",
    category: "PERFORMANCE",
    title: localized("Inspection and acceptance", "الفحص والقبول"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Tender acceptance mechanics and deemed-acceptance risks require review.",
      "تتطلب آليات القبول ومخاطر القبول الحكمي الواردة في المنافسة المراجعة."
    ),
    variableKeys: [
      "input.acceptanceCriteria",
      "input.acceptancePeriodDays",
    ],
    content: {
      en: [
        "Acceptance will be assessed against ",
        ref("input.acceptanceCriteria"),
        ". The optional review period is ",
        ref("input.acceptancePeriodDays"),
        " days and must be verified rather than inferred.",
      ],
      ar: [
        "يقاس القبول وفق ",
        ref("input.acceptanceCriteria"),
        ". ومدة المراجعة الاختيارية هي ",
        ref("input.acceptancePeriodDays"),
        " يوماً ويجب التحقق منها دون افتراض.",
      ],
    },
  }),
  "clause.service-levels": createClause({
    id: "clause.service-levels",
    category: "PERFORMANCE",
    title: localized("Service levels", "مستويات الخدمة"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Never seed service levels or credits; use tender evidence and counsel review.",
      "لا تدرج مستويات خدمة أو حسومات افتراضية؛ تستخدم أدلة المنافسة ومراجعة المستشار."
    ),
    variableKeys: [
      "input.serviceLevelSchedule",
      "input.serviceCreditPercent",
    ],
    content: {
      en: [
        "Service levels are limited to the verified schedule ",
        ref("input.serviceLevelSchedule"),
        ". Any stated service credit percentage, if present, is ",
        ref("input.serviceCreditPercent"),
        " and remains subject to validation.",
      ],
      ar: [
        "تقتصر مستويات الخدمة على الجدول المتحقق منه ",
        ref("input.serviceLevelSchedule"),
        ". وأي نسبة حسم مذكورة، إن وجدت، هي ",
        ref("input.serviceCreditPercent"),
        " وتظل خاضعة للتحقق.",
      ],
    },
  }),
  "clause.change-control": createClause({
    id: "clause.change-control",
    category: "GOVERNANCE",
    title: localized("Change control", "إدارة التغيير"),
    applicability: "GENERAL",
    applicabilityNotes: localized(
      "Confirm the change authority and effects on scope, schedule, and price.",
      "يجب تأكيد صلاحية التغيير وآثاره على النطاق والجدول والسعر."
    ),
    variableKeys: ["input.changeAuthority"],
    content: {
      en: [
        "No proposed change becomes effective without documented approval from ",
        ref("input.changeAuthority"),
        ". Commercial effects require explicit user entry and review.",
      ],
      ar: [
        "لا يصبح أي تغيير مقترح نافذاً دون موافقة موثقة من ",
        ref("input.changeAuthority"),
        ". وتتطلب الآثار التجارية إدخالاً صريحاً ومراجعة.",
      ],
    },
  }),
  "clause.intellectual-property": createClause({
    id: "clause.intellectual-property",
    category: "RISK",
    title: localized("Intellectual property", "الملكية الفكرية"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Ownership, licensing, and pre-existing materials require counsel decision.",
      "تتطلب الملكية والترخيص والمواد السابقة قراراً من المستشار."
    ),
    variableKeys: ["input.ipPosition"],
    content: {
      en: [
        "The proposed intellectual-property position is ",
        ref("input.ipPosition"),
        ". This field is not a legal conclusion and requires counsel approval outside this catalog.",
      ],
      ar: [
        "موقف الملكية الفكرية المقترح هو ",
        ref("input.ipPosition"),
        ". ولا يمثل هذا الحقل نتيجة قانونية ويتطلب اعتماد المستشار خارج هذا الفهرس.",
      ],
    },
  }),
  "clause.confidentiality": createClause({
    id: "clause.confidentiality",
    category: "RISK",
    title: localized("Confidentiality", "السرية"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Confirm protected information, exclusions, permitted use, and survival.",
      "يجب تأكيد المعلومات المحمية والاستثناءات والاستخدام المسموح واستمرار الالتزام."
    ),
    variableKeys: ["input.confidentialityPeriodMonths"],
    content: {
      en: [
        "The proposed confidentiality period is ",
        ref("input.confidentialityPeriodMonths"),
        " months. Scope, exclusions, and survival require completion and counsel review.",
      ],
      ar: [
        "مدة السرية المقترحة هي ",
        ref("input.confidentialityPeriodMonths"),
        " شهراً. ويتطلب النطاق والاستثناءات والاستمرار استكمالاً ومراجعة قانونية.",
      ],
    },
  }),
  "clause.liability": createClause({
    id: "clause.liability",
    category: "RISK",
    title: localized("Liability allocation", "توزيع المسؤولية"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Caps, exclusions, and indemnity interaction must be decided by counsel.",
      "يجب أن يقرر المستشار الحدود والاستثناءات والتداخل مع التعويض."
    ),
    variableKeys: ["input.liabilityCap"],
    content: {
      en: [
        "The user-entered liability cap under review is ",
        ref("input.liabilityCap"),
        ". The catalog does not recommend an amount or determine enforceability.",
      ],
      ar: [
        "حد المسؤولية المدخل من المستخدم والخاضع للمراجعة هو ",
        ref("input.liabilityCap"),
        ". ولا يوصي الفهرس بمبلغ ولا يحدد قابلية النفاذ.",
      ],
    },
  }),
  "clause.term": createClause({
    id: "clause.term",
    category: "FOUNDATION",
    title: localized("Term", "المدة"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Dates must come from verified tender evidence or explicit entry.",
      "يجب أن تأتي التواريخ من أدلة المنافسة المتحققة أو الإدخال الصريح."
    ),
    variableKeys: ["input.termStartDate", "input.termEndDate"],
    content: {
      en: [
        "The proposed term begins on ",
        ref("input.termStartDate"),
        " and ends on ",
        ref("input.termEndDate"),
        ", subject to verified commencement and extension mechanics.",
      ],
      ar: [
        "تبدأ المدة المقترحة في ",
        ref("input.termStartDate"),
        " وتنتهي في ",
        ref("input.termEndDate"),
        " مع مراعاة آليات البدء والتمديد المتحقق منها.",
      ],
    },
  }),
  "clause.termination": createClause({
    id: "clause.termination",
    category: "RISK",
    title: localized("Termination", "الإنهاء"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Grounds, cure periods, convenience rights, and effects require counsel review.",
      "تتطلب الأسباب ومدد المعالجة وحقوق الإنهاء وآثاره مراجعة المستشار."
    ),
    variableKeys: ["input.terminationNoticeDays"],
    content: {
      en: [
        "The proposed notice period is ",
        ref("input.terminationNoticeDays"),
        " days. Termination grounds and consequences remain unreviewed.",
      ],
      ar: [
        "مدة الإشعار المقترحة هي ",
        ref("input.terminationNoticeDays"),
        " يوماً. وتظل أسباب الإنهاء وآثاره غير مراجعة.",
      ],
    },
  }),
  "clause.disputes": createClause({
    id: "clause.disputes",
    category: "RISK",
    title: localized("Dispute resolution", "تسوية النزاعات"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Forum, governing law, escalation, and language precedence require counsel.",
      "تتطلب الجهة المختصة والنظام الحاكم والتصعيد وأولوية اللغة مراجعة المستشار."
    ),
    variableKeys: ["input.disputeForum"],
    content: {
      en: [
        "The proposed dispute forum is ",
        ref("input.disputeForum"),
        ". No jurisdictional or enforceability conclusion is made by this template.",
      ],
      ar: [
        "جهة تسوية النزاع المقترحة هي ",
        ref("input.disputeForum"),
        ". ولا يقدم هذا القالب نتيجة بشأن الاختصاص أو قابلية النفاذ.",
      ],
    },
  }),
  "clause.signatures": createClause({
    id: "clause.signatures",
    category: "FOUNDATION",
    title: localized("Signatures", "التوقيعات"),
    applicability: "GENERAL",
    applicabilityNotes: localized(
      "Verify identity, authority, signature method, and execution formalities.",
      "يجب التحقق من الهوية والصلاحية وطريقة التوقيع ومتطلبات الإبرام."
    ),
    variableKeys: ["input.clientSigner", "input.supplierSigner"],
    content: {
      en: [
        "The proposed signatories are ",
        ref("input.clientSigner"),
        " for the client and ",
        ref("input.supplierSigner"),
        " for the supplier. Authority must be independently verified.",
      ],
      ar: [
        "المفوضان المقترحان للتوقيع هما ",
        ref("input.clientSigner"),
        " عن العميل و",
        ref("input.supplierSigner"),
        " عن المورد. ويجب التحقق من الصلاحية بصورة مستقلة.",
      ],
    },
  }),
  "clause.goods-specifications": createClause({
    id: "clause.goods-specifications",
    category: "GOODS",
    title: localized("Specifications and quantities", "المواصفات والكميات"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Use only verified technical specifications and quantities.",
      "تستخدم فقط المواصفات الفنية والكميات المتحقق منها."
    ),
    variableKeys: ["input.goodsSpecifications", "input.quantitiesSchedule"],
    content: {
      en: [
        "The goods specifications are ",
        ref("input.goodsSpecifications"),
        " and the quantities are ",
        ref("input.quantitiesSchedule"),
        ". Substitutions are not inferred.",
      ],
      ar: [
        "مواصفات الأصناف هي ",
        ref("input.goodsSpecifications"),
        " والكميات هي ",
        ref("input.quantitiesSchedule"),
        ". ولا يفترض القالب بدائل.",
      ],
    },
  }),
  "clause.delivery-inspection": createClause({
    id: "clause.delivery-inspection",
    category: "GOODS",
    title: localized("Delivery and inspection", "التسليم والفحص"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Confirm delivery location, documents, timing, and inspection mechanics.",
      "يجب تأكيد مكان التسليم ومستنداته وتوقيته وآليات الفحص."
    ),
    variableKeys: ["input.deliveryLocation", "input.inspectionPeriodDays"],
    content: {
      en: [
        "Delivery is proposed at ",
        ref("input.deliveryLocation"),
        " with an inspection period of ",
        ref("input.inspectionPeriodDays"),
        " days, each subject to tender verification.",
      ],
      ar: [
        "يقترح التسليم في ",
        ref("input.deliveryLocation"),
        " وبمدة فحص قدرها ",
        ref("input.inspectionPeriodDays"),
        " يوماً، وكلاهما يخضع للتحقق من المنافسة.",
      ],
    },
  }),
  "clause.title-risk-warranty": createClause({
    id: "clause.title-risk-warranty",
    category: "GOODS",
    title: localized("Title, risk, and warranty", "الملكية والمخاطر والضمان"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Transfer terms, Incoterms, defects, and warranty remedies require review.",
      "تتطلب شروط الانتقال والإنكوترمز والعيوب ومعالجات الضمان المراجعة."
    ),
    variableKeys: ["input.riskTransferPoint", "input.warrantyPeriodMonths"],
    content: {
      en: [
        "The proposed transfer point is ",
        ref("input.riskTransferPoint"),
        " and the proposed warranty period is ",
        ref("input.warrantyPeriodMonths"),
        " months. Remedies remain unreviewed.",
      ],
      ar: [
        "نقطة الانتقال المقترحة هي ",
        ref("input.riskTransferPoint"),
        " ومدة الضمان المقترحة هي ",
        ref("input.warrantyPeriodMonths"),
        " شهراً. وتظل المعالجات غير مراجعة.",
      ],
    },
  }),
  "clause.professional-team": createClause({
    id: "clause.professional-team",
    category: "PROFESSIONAL_SERVICES",
    title: localized("Professional team", "الفريق المهني"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Verify named personnel, substitutions, licensing, and tender commitments.",
      "يجب التحقق من الكوادر والاستبدال والتراخيص والتزامات المنافسة."
    ),
    variableKeys: [
      "input.keyPersonnel",
      "input.professionalLicenseEvidence",
    ],
    content: {
      en: [
        "The proposed key personnel are ",
        ref("input.keyPersonnel"),
        ". Available professional-license evidence is ",
        ref("input.professionalLicenseEvidence"),
        " and requires verification.",
      ],
      ar: [
        "الكوادر الرئيسية المقترحة هي ",
        ref("input.keyPersonnel"),
        ". وأدلة التراخيص المهنية المتاحة هي ",
        ref("input.professionalLicenseEvidence"),
        " وتتطلب التحقق.",
      ],
    },
  }),
  "clause.client-dependencies": createClause({
    id: "clause.client-dependencies",
    category: "PERFORMANCE",
    title: localized("Client duties and dependencies", "التزامات العميل والاعتماديات"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Dependencies must not override mandatory supplier obligations.",
      "يجب ألا تلغي الاعتماديات التزامات المورد الإلزامية."
    ),
    variableKeys: ["input.clientDependencies"],
    content: {
      en: [
        "The identified client duties and dependencies are ",
        ref("input.clientDependencies"),
        ". Their schedule effect requires explicit agreement.",
      ],
      ar: [
        "التزامات العميل والاعتماديات المحددة هي ",
        ref("input.clientDependencies"),
        ". ويتطلب أثرها على الجدول اتفاقاً صريحاً.",
      ],
    },
  }),
  "clause.conflicts": createClause({
    id: "clause.conflicts",
    category: "PROFESSIONAL_SERVICES",
    title: localized("Conflicts of interest", "تعارض المصالح"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Professional conflict obligations depend on the engagement and licensing.",
      "تعتمد التزامات تعارض المصالح المهنية على المهمة والترخيص."
    ),
    variableKeys: ["input.conflictDisclosure"],
    content: {
      en: [
        "The optional conflict disclosure is ",
        ref("input.conflictDisclosure"),
        ". The parties must complete any profession-specific review.",
      ],
      ar: [
        "الإفصاح الاختياري عن التعارض هو ",
        ref("input.conflictDisclosure"),
        ". ويجب على الطرفين استكمال أي مراجعة خاصة بالمهنة.",
      ],
    },
  }),
  "clause.nda-purpose": createClause({
    id: "clause.nda-purpose",
    category: "CONFIDENTIALITY",
    title: localized("Disclosure purpose", "غرض الإفصاح"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Confirm mutual or unilateral structure and the permitted purpose.",
      "يجب تأكيد ما إذا كان الالتزام متبادلاً أو أحادياً والغرض المسموح."
    ),
    variableKeys: ["input.ndaPurpose"],
    content: {
      en: [
        "Confidential information may be considered only for ",
        ref("input.ndaPurpose"),
        ". The protected-information definition remains subject to counsel review.",
      ],
      ar: [
        "يجوز النظر في المعلومات السرية فقط لغرض ",
        ref("input.ndaPurpose"),
        ". ويظل تعريف المعلومات المحمية خاضعاً لمراجعة المستشار.",
      ],
    },
  }),
  "clause.disclosures": createClause({
    id: "clause.disclosures",
    category: "CONFIDENTIALITY",
    title: localized("Permitted and required disclosures", "الإفصاحات المسموحة والإلزامية"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Recipient categories and legally required disclosure steps need review.",
      "تحتاج فئات المستلمين وخطوات الإفصاح الإلزامي نظاماً إلى المراجعة."
    ),
    variableKeys: [
      "input.permittedRecipients",
      "input.requiredDisclosureProcess",
    ],
    content: {
      en: [
        "Proposed permitted recipients are ",
        ref("input.permittedRecipients"),
        ". The required-disclosure process is ",
        ref("input.requiredDisclosureProcess"),
        ".",
      ],
      ar: [
        "فئات المستلمين المقترحة هي ",
        ref("input.permittedRecipients"),
        ". وإجراءات الإفصاح الإلزامي هي ",
        ref("input.requiredDisclosureProcess"),
        ".",
      ],
    },
  }),
  "clause.return-destruction": createClause({
    id: "clause.return-destruction",
    category: "CONFIDENTIALITY",
    title: localized("Return or destruction", "الإعادة أو الإتلاف"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Retention duties, backups, and certification mechanics require review.",
      "تتطلب واجبات الاحتفاظ والنسخ الاحتياطية وآليات الإثبات المراجعة."
    ),
    variableKeys: ["input.returnDestructionMethod"],
    content: {
      en: [
        "The proposed return or destruction method is ",
        ref("input.returnDestructionMethod"),
        ". Mandatory retention and backup exceptions must be completed.",
      ],
      ar: [
        "طريقة الإعادة أو الإتلاف المقترحة هي ",
        ref("input.returnDestructionMethod"),
        ". ويجب استكمال استثناءات الاحتفاظ الإلزامي والنسخ الاحتياطية.",
      ],
    },
  }),
  "clause.data-security": createClause({
    id: "clause.data-security",
    category: "DATA_AND_SECURITY",
    title: localized("Data processing and security", "معالجة البيانات والأمن"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Verify actual data roles, hosting, controls, transfers, and evidence.",
      "يجب التحقق من أدوار البيانات والاستضافة والضوابط والنقل والأدلة الفعلية."
    ),
    variableKeys: [
      "input.personalDataIncluded",
      "input.dataProcessingSchedule",
      "input.securitySchedule",
      "input.hostingLocation",
    ],
    content: {
      en: [
        "Personal-data inclusion is recorded as ",
        ref("input.personalDataIncluded"),
        ". The proposed data schedule is ",
        ref("input.dataProcessingSchedule"),
        ", the verified security schedule is ",
        ref("input.securitySchedule"),
        ", and the stated hosting location is ",
        ref("input.hostingLocation"),
        ". No compliance conclusion is implied.",
      ],
      ar: [
        "يسجل شمول البيانات الشخصية بالقيمة ",
        ref("input.personalDataIncluded"),
        ". وملحق البيانات المقترح هو ",
        ref("input.dataProcessingSchedule"),
        " وملحق الأمن المتحقق منه هو ",
        ref("input.securitySchedule"),
        " وموقع الاستضافة المصرح به هو ",
        ref("input.hostingLocation"),
        ". ولا يفهم من ذلك تقرير الامتثال.",
      ],
    },
  }),
  "clause.subcontract-flow-down": createClause({
    id: "clause.subcontract-flow-down",
    category: "SUBCONTRACT",
    title: localized("Prime contract and flow-down", "العقد الرئيسي والالتزامات المنقولة"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Use only when the prime obligations and incorporated documents are available.",
      "يستخدم فقط عند توفر التزامات العقد الرئيسي والمستندات المدمجة."
    ),
    variableKeys: [
      "input.primeContractReference",
      "input.flowDownRegister",
    ],
    content: {
      en: [
        "The stated prime contract reference is ",
        ref("input.primeContractReference"),
        " and the verified flow-down register is ",
        ref("input.flowDownRegister"),
        ". Unavailable prime obligations must be flagged, not invented.",
      ],
      ar: [
        "مرجع العقد الرئيسي المصرح به هو ",
        ref("input.primeContractReference"),
        " وسجل الالتزامات المنقولة المتحقق منه هو ",
        ref("input.flowDownRegister"),
        ". ويجب الإبلاغ عن الالتزامات غير المتاحة دون اختلاقها.",
      ],
    },
  }),
  "clause.compliance": createClause({
    id: "clause.compliance",
    category: "COMPLIANCE",
    title: localized("Tender and regulatory compliance", "الامتثال للمنافسة والمتطلبات النظامية"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Compliance claims require cited evidence and counsel review where legal.",
      "تتطلب ادعاءات الامتثال أدلة مرجعية ومراجعة المستشار عند تعلقها بأمر قانوني."
    ),
    variableKeys: ["input.complianceSchedule"],
    content: {
      en: [
        "The evidence-backed compliance schedule is ",
        ref("input.complianceSchedule"),
        ". This drafting clause does not certify regulatory compliance.",
      ],
      ar: [
        "جدول الامتثال المستند إلى الأدلة هو ",
        ref("input.complianceSchedule"),
        ". ولا يشهد بند الصياغة هذا بالامتثال النظامي.",
      ],
    },
  }),
  "clause.payment-schedule": createClause({
    id: "clause.payment-schedule",
    category: "COMMERCIAL",
    title: localized("Price and payment schedule", "جدول السعر والدفع"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "All commercial values must come from explicit authorized user entry.",
      "يجب أن تأتي جميع القيم التجارية من إدخال صريح ومصرح به من المستخدم."
    ),
    variableKeys: [
      "input.priceSchedule",
      "input.paymentMilestones",
      "input.minimumCommitment",
    ],
    content: {
      en: [
        "The user-entered price schedule is ",
        ref("input.priceSchedule"),
        ", the optional payment milestones are ",
        ref("input.paymentMilestones"),
        ", and any proposed minimum commitment is ",
        ref("input.minimumCommitment"),
        ". The catalog supplies no prices.",
      ],
      ar: [
        "جدول الأسعار المدخل من المستخدم هو ",
        ref("input.priceSchedule"),
        " ومعالم الدفع الاختيارية هي ",
        ref("input.paymentMilestones"),
        " وأي حد أدنى مقترح للالتزام هو ",
        ref("input.minimumCommitment"),
        ". ولا يقدم الفهرس أي أسعار.",
      ],
    },
  }),
  "clause.indemnity-handover": createClause({
    id: "clause.indemnity-handover",
    category: "RISK",
    title: localized("Indemnity and handover", "التعويض والتسليم الانتقالي"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Indemnity scope and exit obligations require specific counsel review.",
      "يتطلب نطاق التعويض والتزامات الخروج مراجعة قانونية محددة."
    ),
    variableKeys: ["input.indemnityScope", "input.handoverPlan"],
    content: {
      en: [
        "The proposed indemnity scope is ",
        ref("input.indemnityScope"),
        " and the proposed handover plan is ",
        ref("input.handoverPlan"),
        ". Neither is approved by this catalog.",
      ],
      ar: [
        "نطاق التعويض المقترح هو ",
        ref("input.indemnityScope"),
        " وخطة التسليم الانتقالي المقترحة هي ",
        ref("input.handoverPlan"),
        ". ولا يعتمد هذا الفهرس أياً منهما.",
      ],
    },
  }),
  "clause.framework-orders": createClause({
    id: "clause.framework-orders",
    category: "FRAMEWORK",
    title: localized("Call-off orders and precedence", "أوامر الشراء وترتيب الأولوية"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Confirm order authority, formation, precedence, and commitment rules.",
      "يجب تأكيد صلاحية إصدار الأوامر وتكوينها وترتيب الأولوية وقواعد الالتزام."
    ),
    variableKeys: [
      "input.orderingProcedure",
      "input.calloffAuthority",
      "input.precedencePolicy",
    ],
    content: {
      en: [
        "The proposed ordering procedure is ",
        ref("input.orderingProcedure"),
        ", the proposed issuing authority is ",
        ref("input.calloffAuthority"),
        ", and the unreviewed precedence policy is ",
        ref("input.precedencePolicy"),
        ".",
      ],
      ar: [
        "إجراءات إصدار الأوامر المقترحة هي ",
        ref("input.orderingProcedure"),
        " والجهة المخولة المقترحة هي ",
        ref("input.calloffAuthority"),
        " وسياسة ترتيب الأولوية غير المراجعة هي ",
        ref("input.precedencePolicy"),
        ".",
      ],
    },
  }),
  "clause.saas-subscription": createClause({
    id: "clause.saas-subscription",
    category: "SAAS",
    title: localized("Subscription and acceptable use", "الاشتراك والاستخدام المقبول"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Verify subscription metrics, user scope, and acceptable-use evidence.",
      "يجب التحقق من مقاييس الاشتراك ونطاق المستخدمين وأدلة الاستخدام المقبول."
    ),
    variableKeys: [
      "input.subscriptionPlan",
      "input.authorizedUsers",
      "input.acceptableUsePolicy",
    ],
    content: {
      en: [
        "The proposed subscription plan is ",
        ref("input.subscriptionPlan"),
        " for ",
        ref("input.authorizedUsers"),
        " authorized users, subject to the proposed acceptable-use policy ",
        ref("input.acceptableUsePolicy"),
        ".",
      ],
      ar: [
        "خطة الاشتراك المقترحة هي ",
        ref("input.subscriptionPlan"),
        " لعدد ",
        ref("input.authorizedUsers"),
        " من المستخدمين المصرح لهم، وفق سياسة الاستخدام المقبول المقترحة ",
        ref("input.acceptableUsePolicy"),
        ".",
      ],
    },
  }),
  "clause.support-suspension": createClause({
    id: "clause.support-suspension",
    category: "SAAS",
    title: localized("Support and suspension", "الدعم والتعليق"),
    applicability: "COUNSEL_DECISION",
    applicabilityNotes: localized(
      "Support evidence and suspension triggers must be proportionate and reviewed.",
      "يجب أن تكون أدلة الدعم ومسببات التعليق متناسبة ومراجعة."
    ),
    variableKeys: ["input.supportSchedule", "input.suspensionConditions"],
    content: {
      en: [
        "The proposed support schedule is ",
        ref("input.supportSchedule"),
        " and the proposed suspension conditions are ",
        ref("input.suspensionConditions"),
        ". No unilateral right is approved by this draft.",
      ],
      ar: [
        "جدول الدعم المقترح هو ",
        ref("input.supportSchedule"),
        " وشروط التعليق المقترحة هي ",
        ref("input.suspensionConditions"),
        ". ولا تعتمد هذه المسودة أي حق أحادي.",
      ],
    },
  }),
  "clause.exit-continuity": createClause({
    id: "clause.exit-continuity",
    category: "EXIT",
    title: localized("Exit, export, and continuity", "الخروج والتصدير والاستمرارية"),
    applicability: "TENDER_SPECIFIC",
    applicabilityNotes: localized(
      "Verify export formats, continuity evidence, retention, and subprocessors.",
      "يجب التحقق من صيغ التصدير وأدلة الاستمرارية والاحتفاظ والمعالجين الفرعيين."
    ),
    variableKeys: [
      "input.exitExportFormat",
      "input.businessContinuityPlan",
      "input.subprocessorList",
    ],
    content: {
      en: [
        "The proposed exit export format is ",
        ref("input.exitExportFormat"),
        ", the business-continuity plan is ",
        ref("input.businessContinuityPlan"),
        ", and the optional verified subprocessor list is ",
        ref("input.subprocessorList"),
        ".",
      ],
      ar: [
        "صيغة تصدير البيانات عند الخروج هي ",
        ref("input.exitExportFormat"),
        " وخطة استمرارية الأعمال هي ",
        ref("input.businessContinuityPlan"),
        " وقائمة المعالجين الفرعيين الاختيارية المتحقق منها هي ",
        ref("input.subprocessorList"),
        ".",
      ],
    },
  }),
} satisfies Record<ContractClauseId, ContractClauseDefinition>);

function section(
  key: string,
  en: string,
  ar: string,
  clauseIds: readonly ContractClauseId[]
): ContractTemplateSection {
  return { key, title: localized(en, ar), clauseIds };
}

function createTemplate(seed: TemplateSeed): ContractTemplateDefinition {
  const variables = collectVariables(seed.sections);
  const version = 1 as const;
  const base = {
    key: seed.key,
    version,
    versionId: `${seed.key}@${version}`,
    schemaVersion: 1 as const,
    lifecycle: "DRAFT" as const,
    name: seed.name,
    summary: seed.summary,
    intendedUse: seed.intendedUse,
    jurisdiction: "Kingdom of Saudi Arabia" as const,
    languagePolicy: {
      mode: "BILINGUAL" as const,
      layout: "PARALLEL" as const,
      precedence: "UNSPECIFIED" as const,
    },
    counselReviewRequired: true as const,
    legalReview: {
      status: "UNREVIEWED" as const,
      reviewedAt: null,
      reviewerId: null,
      reviewBy: null,
    },
    disclaimer: DRAFT_DISCLAIMER,
    reviewFocus: seed.reviewFocus,
    variables,
    sections: seed.sections,
  };

  return deepFreeze({
    ...base,
    canonicalHash: computeCanonicalHash(base),
  });
}

function collectVariables(
  sections: readonly ContractTemplateSection[]
): readonly TemplateVariableDefinition[] {
  const variables = new Map<string, TemplateVariableDefinition>();
  for (const templateSection of sections) {
    for (const clauseId of templateSection.clauseIds) {
      const clause = CONTRACT_CLAUSE_CATALOG[clauseId];
      for (const variable of clause.variables) {
        variables.set(variable.key, variable);
      }
    }
  }
  return [...variables.values()].sort((left, right) =>
    left.key.localeCompare(right.key, "en")
  );
}

export const CONTRACT_TEMPLATE_CATALOG = deepFreeze({
  "it-services-v1": createTemplate({
    key: "it-services-v1",
    name: localized(
      "IT Services Agreement",
      "اتفاقية خدمات تقنية المعلومات"
    ),
    summary: localized(
      "Draft framework for implementation, integration, and managed services.",
      "إطار أولي لخدمات التنفيذ والتكامل والخدمات المدارة."
    ),
    intendedUse: localized(
      "Saudi procurement technology engagements with verified tender inputs.",
      "ارتباطات تقنية ضمن المشتريات السعودية وبمدخلات منافسة متحقق منها."
    ),
    reviewFocus: localized(
      "Verify tender service levels, intellectual property, hosting, security, and data roles.",
      "التحقق من مستويات الخدمة والملكية الفكرية والاستضافة والأمن وأدوار البيانات."
    ),
    sections: [
      section("parties", "Parties", "الأطراف", [
        "clause.parties",
        "clause.definitions",
      ]),
      section("scope", "Scope and delivery", "النطاق والتسليم", [
        "clause.scope",
        "clause.deliverables",
        "clause.governance",
        "clause.acceptance",
      ]),
      section("service", "Service management", "إدارة الخدمة", [
        "clause.service-levels",
        "clause.change-control",
      ]),
      section("risk", "Risk and compliance", "المخاطر والامتثال", [
        "clause.intellectual-property",
        "clause.confidentiality",
        "clause.data-security",
        "clause.compliance",
        "clause.liability",
      ]),
      section("commercial", "Commercial terms", "الشروط التجارية", [
        "clause.payment-schedule",
        "clause.term",
        "clause.termination",
      ]),
      section("execution", "Disputes and execution", "النزاعات والإبرام", [
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
  "goods-supply-v1": createTemplate({
    key: "goods-supply-v1",
    name: localized("Goods Supply Agreement", "عقد توريد"),
    summary: localized(
      "Draft framework for equipment and product supply.",
      "إطار أولي لتوريد المعدات والمنتجات."
    ),
    intendedUse: localized(
      "Saudi procurement goods contracts with verified specifications and quantities.",
      "عقود توريد ضمن المشتريات السعودية بمواصفات وكميات متحقق منها."
    ),
    reviewFocus: localized(
      "Verify delivery, inspection, title, risk, warranty, customs, and penalty language.",
      "التحقق من التسليم والفحص والملكية والمخاطر والضمان والجمارك ولغة الغرامات."
    ),
    sections: [
      section("parties", "Parties", "الأطراف", [
        "clause.parties",
        "clause.definitions",
      ]),
      section("goods", "Goods and quantities", "الأصناف والكميات", [
        "clause.scope",
        "clause.goods-specifications",
      ]),
      section("delivery", "Delivery and acceptance", "التسليم والقبول", [
        "clause.delivery-inspection",
        "clause.acceptance",
        "clause.title-risk-warranty",
      ]),
      section("commercial", "Commercial terms", "الشروط التجارية", [
        "clause.payment-schedule",
        "clause.liability",
        "clause.term",
        "clause.termination",
      ]),
      section("execution", "Compliance and execution", "الامتثال والإبرام", [
        "clause.compliance",
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
  "professional-services-v1": createTemplate({
    key: "professional-services-v1",
    name: localized(
      "Professional Services Agreement",
      "اتفاقية خدمات استشارية"
    ),
    summary: localized(
      "Draft framework for consulting and advisory engagements.",
      "إطار أولي لأعمال الاستشارات والخدمات المهنية."
    ),
    intendedUse: localized(
      "Saudi professional-services procurements with verified team and deliverables.",
      "مشتريات الخدمات المهنية في المملكة بفريق ومخرجات متحقق منها."
    ),
    reviewFocus: localized(
      "Verify professional licensing, conflicts, dependencies, and work-product ownership.",
      "التحقق من التراخيص المهنية والتعارض والاعتماديات وملكية ناتج العمل."
    ),
    sections: [
      section("parties", "Parties", "الأطراف", [
        "clause.parties",
        "clause.definitions",
      ]),
      section("services", "Services and team", "الخدمات والفريق", [
        "clause.scope",
        "clause.professional-team",
        "clause.deliverables",
        "clause.client-dependencies",
        "clause.acceptance",
      ]),
      section("risk", "Professional safeguards", "الضوابط المهنية", [
        "clause.conflicts",
        "clause.confidentiality",
        "clause.intellectual-property",
        "clause.compliance",
      ]),
      section("commercial", "Commercial terms", "الشروط التجارية", [
        "clause.payment-schedule",
        "clause.liability",
        "clause.term",
        "clause.termination",
      ]),
      section("execution", "Disputes and execution", "النزاعات والإبرام", [
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
  "nda-v1": createTemplate({
    key: "nda-v1",
    name: localized(
      "Mutual or Unilateral NDA",
      "اتفاقية عدم الإفصاح"
    ),
    summary: localized(
      "Draft framework for pre-tender, partner, and vendor disclosures.",
      "إطار أولي للإفصاحات السابقة للمنافسة أو بين الشركاء والموردين."
    ),
    intendedUse: localized(
      "Controlled information sharing after selecting mutual or unilateral treatment.",
      "مشاركة معلومات مضبوطة بعد تحديد ما إذا كان الالتزام متبادلاً أو أحادياً."
    ),
    reviewFocus: localized(
      "Verify purpose, protected information, recipients, personal data, disclosure, and survival.",
      "التحقق من الغرض والمعلومات المحمية والمستلمين والبيانات الشخصية والإفصاح والاستمرار."
    ),
    sections: [
      section("parties", "Parties and purpose", "الأطراف والغرض", [
        "clause.parties",
        "clause.definitions",
        "clause.nda-purpose",
      ]),
      section("confidentiality", "Confidentiality controls", "ضوابط السرية", [
        "clause.confidentiality",
        "clause.disclosures",
        "clause.data-security",
        "clause.return-destruction",
      ]),
      section("term", "Term and remedies", "المدة والمعالجات", [
        "clause.term",
        "clause.liability",
        "clause.disputes",
      ]),
      section("execution", "Execution", "الإبرام", ["clause.signatures"]),
    ],
  }),
  "subcontract-v1": createTemplate({
    key: "subcontract-v1",
    name: localized("Subcontractor Agreement", "اتفاقية مقاول من الباطن"),
    summary: localized(
      "Draft framework for prime and subcontractor delivery.",
      "إطار أولي للتنفيذ بين المتعاقد الرئيسي ومقاول الباطن."
    ),
    intendedUse: localized(
      "Subcontract delivery only when prime obligations are available for verification.",
      "تنفيذ التعاقد من الباطن فقط عند توفر التزامات العقد الرئيسي للتحقق."
    ),
    reviewFocus: localized(
      "Verify every flow-down obligation, payment dependency, indemnity, insurance, and handover.",
      "التحقق من كل التزام منقول واعتمادية الدفع والتعويض والتأمين والتسليم الانتقالي."
    ),
    sections: [
      section("parties", "Parties and prime contract", "الأطراف والعقد الرئيسي", [
        "clause.parties",
        "clause.definitions",
        "clause.subcontract-flow-down",
      ]),
      section("delivery", "Subcontract delivery", "تنفيذ عقد الباطن", [
        "clause.scope",
        "clause.deliverables",
        "clause.professional-team",
        "clause.governance",
        "clause.acceptance",
      ]),
      section("compliance", "Compliance and risk", "الامتثال والمخاطر", [
        "clause.compliance",
        "clause.confidentiality",
        "clause.data-security",
        "clause.indemnity-handover",
        "clause.liability",
      ]),
      section("commercial", "Payment and term", "الدفع والمدة", [
        "clause.payment-schedule",
        "clause.term",
        "clause.termination",
      ]),
      section("execution", "Disputes and execution", "النزاعات والإبرام", [
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
  "framework-calloff-v1": createTemplate({
    key: "framework-calloff-v1",
    name: localized(
      "Framework and Call-Off Agreement",
      "اتفاقية إطارية وأوامر شراء"
    ),
    summary: localized(
      "Draft framework for recurring services or supplies.",
      "إطار أولي للخدمات أو التوريدات المتكررة."
    ),
    intendedUse: localized(
      "Framework arrangements with separately authorized call-off orders.",
      "ترتيبات إطارية بأوامر شراء منفصلة ومصرح بها."
    ),
    reviewFocus: localized(
      "Verify order authority, commitment, exclusivity, precedence, indexation, caps, and exit.",
      "التحقق من صلاحية الأوامر والالتزام والحصرية والأولوية والمؤشرات والحدود والخروج."
    ),
    sections: [
      section("parties", "Parties", "الأطراف", [
        "clause.parties",
        "clause.definitions",
      ]),
      section("framework", "Framework and ordering", "الإطار وإصدار الأوامر", [
        "clause.scope",
        "clause.framework-orders",
        "clause.governance",
      ]),
      section("performance", "Performance", "الأداء", [
        "clause.deliverables",
        "clause.acceptance",
        "clause.service-levels",
        "clause.change-control",
      ]),
      section("commercial", "Commercial terms", "الشروط التجارية", [
        "clause.payment-schedule",
        "clause.liability",
        "clause.term",
        "clause.termination",
      ]),
      section("exit", "Exit and execution", "الخروج والإبرام", [
        "clause.exit-continuity",
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
  "saas-data-v1": createTemplate({
    key: "saas-data-v1",
    name: localized(
      "SaaS Subscription and Data Schedule",
      "اشتراك برمجيات وملحق بيانات"
    ),
    summary: localized(
      "Draft framework for cloud software subscriptions and data schedules.",
      "إطار أولي لاشتراكات البرمجيات السحابية وملاحق البيانات."
    ),
    intendedUse: localized(
      "SaaS procurements with verified hosting, security, data roles, and service evidence.",
      "مشتريات البرمجيات السحابية باستضافة وأمن وأدوار بيانات وأدلة خدمة متحقق منها."
    ),
    reviewFocus: localized(
      "Verify hosting, data roles, transfers, subprocessors, continuity, service levels, and export.",
      "التحقق من الاستضافة وأدوار البيانات والنقل والمعالجين الفرعيين والاستمرارية ومستويات الخدمة والتصدير."
    ),
    sections: [
      section("parties", "Parties", "الأطراف", [
        "clause.parties",
        "clause.definitions",
      ]),
      section("subscription", "Subscription and use", "الاشتراك والاستخدام", [
        "clause.saas-subscription",
        "clause.service-levels",
        "clause.support-suspension",
      ]),
      section("data", "Data and security", "البيانات والأمن", [
        "clause.data-security",
        "clause.confidentiality",
        "clause.compliance",
      ]),
      section("commercial", "Commercial and risk", "الشروط التجارية والمخاطر", [
        "clause.payment-schedule",
        "clause.intellectual-property",
        "clause.liability",
        "clause.term",
        "clause.termination",
      ]),
      section("exit", "Exit and execution", "الخروج والإبرام", [
        "clause.exit-continuity",
        "clause.disputes",
        "clause.signatures",
      ]),
    ],
  }),
} satisfies Record<ContractTemplateKey, ContractTemplateDefinition>);

/** Return a frozen catalog definition, or undefined for an unknown key. */
export function getContractTemplate(
  key: string
): ContractTemplateDefinition | undefined {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT_TEMPLATE_CATALOG, key)) {
    return undefined;
  }
  return CONTRACT_TEMPLATE_CATALOG[key as ContractTemplateKey];
}

/** Return a frozen reusable clause definition, or undefined if it is unknown. */
export function getContractClause(
  id: string
): ContractClauseDefinition | undefined {
  if (!Object.prototype.hasOwnProperty.call(CONTRACT_CLAUSE_CATALOG, id)) {
    return undefined;
  }
  return CONTRACT_CLAUSE_CATALOG[id as ContractClauseId];
}

/**
 * Produce a deterministic SHA-256 hash of JSON-compatible canonical content.
 * Object keys are sorted; array order remains semantically significant.
 */
export function computeCanonicalHash(value: unknown): string {
  const canonical = canonicalize(value, new Set<object>());
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/** Recompute a template hash without recursively including its stored hash. */
export function computeContractTemplateHash(
  template: ContractTemplateDefinition
): string {
  const canonicalEntries = Object.entries(template).filter(
    ([key]) => key !== "canonicalHash"
  );
  return computeCanonicalHash(Object.fromEntries(canonicalEntries));
}

/**
 * Bind explicit values into structured nodes.
 *
 * Preview mode may return visible structured placeholders plus diagnostics.
 * Final mode returns no document whenever an error exists, ensuring unresolved
 * variables, token syntax, unsafe markup, and invalid values cannot leak into a
 * final renderer.
 */
export function bindContractTemplate(
  templateKey: string,
  bindings: Readonly<Record<string, unknown>>,
  options: { readonly mode: "PREVIEW" | "FINAL" } = { mode: "PREVIEW" }
): ContractBindingResult {
  const template = getContractTemplate(templateKey);
  if (!template) {
    return deepFreeze({
      status: "BLOCKED" as const,
      mode: options.mode,
      document: null,
      diagnostics: [
        {
          code: "UNKNOWN_TEMPLATE" as const,
          severity: "ERROR" as const,
          path: "templateKey",
          variableKey: null,
          message: `Unknown contract template "${templateKey}".`,
        },
      ],
    });
  }

  const diagnostics: BindingDiagnostic[] = [];
  const definitions = new Map(
    template.variables.map((variable) => [variable.key, variable])
  );
  const validValues = new Map<string, TemplateBindingValue>();

  for (const key of Object.keys(bindings).sort()) {
    if (!definitions.has(key)) {
      diagnostics.push({
        code: "UNKNOWN_VARIABLE",
        severity: "ERROR",
        path: `bindings.${key}`,
        variableKey: key,
        message: `Variable "${key}" is not declared by template "${template.key}".`,
      });
    }
  }

  for (const variable of template.variables) {
    const hasValue =
      Object.prototype.hasOwnProperty.call(bindings, variable.key) &&
      bindings[variable.key] !== null &&
      bindings[variable.key] !== undefined;
    if (!hasValue) {
      diagnostics.push({
        code: variable.required
          ? "MISSING_REQUIRED_VARIABLE"
          : "OPTIONAL_VARIABLE_OMITTED",
        severity: variable.required ? "ERROR" : "INFO",
        path: `bindings.${variable.key}`,
        variableKey: variable.key,
        message: variable.required
          ? `Required variable "${variable.key}" is missing.`
          : `Optional variable "${variable.key}" was omitted.`,
      });
      continue;
    }

    const candidate = bindings[variable.key];
    const missingLocales = missingLocalizedBindingLocales(variable, candidate);
    if (missingLocales.length > 0) {
      for (const language of missingLocales) {
        diagnostics.push({
          code: "MISSING_BINDING_LOCALE",
          severity: "ERROR",
          path: `bindings.${variable.key}.${language}`,
          variableKey: variable.key,
          message: `Variable "${variable.key}" requires a non-empty ${language.toUpperCase()} value.`,
        });
      }
      continue;
    }
    if (!isValidBindingValue(variable, candidate)) {
      diagnostics.push({
        code: "INVALID_VARIABLE_TYPE",
        severity: "ERROR",
        path: `bindings.${variable.key}`,
        variableKey: variable.key,
        message: `Variable "${variable.key}" does not satisfy its ${variable.type} schema.`,
      });
      continue;
    }
    if (containsUnsafeBindingContent(candidate)) {
      diagnostics.push({
        code: "UNSAFE_BINDING_VALUE",
        severity: "ERROR",
        path: `bindings.${variable.key}`,
        variableKey: variable.key,
        message: `Variable "${variable.key}" contains raw markup, unresolved token syntax, or direction-control characters.`,
      });
      continue;
    }
    validValues.set(variable.key, cloneBindingValue(candidate));
  }

  const hasErrors = diagnostics.some(
    (diagnostic) => diagnostic.severity === "ERROR"
  );
  if (options.mode === "FINAL" && hasErrors) {
    return deepFreeze({
      status: "BLOCKED" as const,
      mode: "FINAL" as const,
      document: null,
      diagnostics,
    });
  }

  const document = buildBoundDocument(
    template,
    validValues,
    definitions,
    options.mode
  );
  if (options.mode === "PREVIEW" && diagnostics.length > 0) {
    return deepFreeze({
      status: "READY_WITH_DIAGNOSTICS" as const,
      mode: "PREVIEW" as const,
      document,
      diagnostics,
    });
  }
  return deepFreeze({
    status: "READY" as const,
    mode: options.mode,
    document,
    diagnostics,
  });
}

function buildBoundDocument(
  template: ContractTemplateDefinition,
  values: ReadonlyMap<string, TemplateBindingValue>,
  definitions: ReadonlyMap<string, TemplateVariableDefinition>,
  mode: "PREVIEW" | "FINAL"
): BoundContractDocument {
  return deepFreeze({
    schemaVersion: 1 as const,
    documentKind: "CONTRACT" as const,
    template: {
      key: template.key,
      version: template.version,
      versionId: template.versionId,
      canonicalHash: template.canonicalHash,
    },
    lifecycle: "DRAFT" as const,
    languageMode: "BILINGUAL" as const,
    bilingualLayout: "PARALLEL" as const,
    legalReviewStatus: "UNREVIEWED" as const,
    counselReviewRequired: true as const,
    disclaimer: template.disclaimer,
    sections: template.sections.map((templateSection) => ({
      key: templateSection.key,
      title: templateSection.title,
      clauses: templateSection.clauseIds.map((clauseId) => {
        const clause = CONTRACT_CLAUSE_CATALOG[clauseId];
        return {
          id: clause.id,
          versionId: clause.versionId,
          title: clause.title,
          provenance: clause.provenance,
          blocks: clause.blocks.map((block) => ({
            ...block,
            content: {
              ...block.content,
              en: bindInlineNodes(
                block.content.en,
                "en",
                values,
                definitions,
                mode
              ),
              ar: bindInlineNodes(
                block.content.ar,
                "ar",
                values,
                definitions,
                mode
              ),
            },
          })),
        };
      }),
    })),
  });
}

function bindInlineNodes(
  nodes: readonly TemplateInlineNode[],
  language: "en" | "ar",
  values: ReadonlyMap<string, TemplateBindingValue>,
  definitions: ReadonlyMap<string, TemplateVariableDefinition>,
  mode: "PREVIEW" | "FINAL"
): readonly BoundInlineNode[] {
  const bound: BoundInlineNode[] = [];
  for (const node of nodes) {
    if (node.type === "TEXT") {
      bound.push(node);
      continue;
    }
    if (values.has(node.variableKey)) {
      const value = values.get(node.variableKey);
      const definition = definitions.get(node.variableKey);
      if (value !== undefined && definition) {
        bound.push({
          type: "VALUE",
          variableKey: node.variableKey,
          language,
          valueDirection: definition.valueDirection,
          value: resolveBoundValue(value, definition.valueDirection, language),
        });
      }
      continue;
    }
    if (mode === "PREVIEW") {
      const definition = definitions.get(node.variableKey);
      if (definition) {
        bound.push({
          type: "PLACEHOLDER",
          variableKey: node.variableKey,
          label: definition.label[language],
          required: definition.required,
        });
      }
    }
  }
  return bound;
}

function isValidBindingValue(
  variable: TemplateVariableDefinition,
  value: unknown
): value is TemplateBindingValue {
  if (variable.valueDirection === "LOCALIZED") {
    if (variable.type === "LIST") {
      return (
        isLocalizedListBinding(value) &&
        passesListValidation(value.en, variable.validation) &&
        passesListValidation(value.ar, variable.validation)
      );
    }
    if (variable.type === "STRING" || variable.type === "RICH_TEXT") {
      return (
        isLocalizedStringBinding(value) &&
        passesStringValidation(value.en, variable.validation) &&
        passesStringValidation(value.ar, variable.validation)
      );
    }
    return false;
  }

  switch (variable.type) {
    case "STRING":
    case "RICH_TEXT":
    case "ENTITY":
      return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        passesStringValidation(value, variable.validation)
      );
    case "NUMBER":
      return (
        isFiniteNumber(value) &&
        passesNumberValidation(value, variable.validation)
      );
    case "MONEY":
      return isMoneyValue(value);
    case "PERCENT":
      return (
        isFiniteNumber(value) &&
        value >= 0 &&
        value <= 100 &&
        passesNumberValidation(value, variable.validation)
      );
    case "DATE":
      return typeof value === "string" && isIsoCalendarDate(value);
    case "BOOLEAN":
      return typeof value === "boolean";
    case "LIST":
      return false;
  }
}

function missingLocalizedBindingLocales(
  variable: TemplateVariableDefinition,
  value: unknown
): readonly ("en" | "ar")[] {
  if (
    variable.valueDirection !== "LOCALIZED" ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return [];
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  return (["en", "ar"] as const).filter((language) => {
    const localizedValue = candidate[language];
    if (variable.type === "LIST") {
      return !Array.isArray(localizedValue) || localizedValue.length === 0;
    }
    return (
      typeof localizedValue !== "string" ||
      localizedValue.trim().length === 0
    );
  });
}

function passesStringValidation(
  value: string,
  validation: VariableValidation | undefined
): boolean {
  return (
    (validation?.minLength === undefined ||
      value.length >= validation.minLength) &&
    (validation?.maxLength === undefined ||
      value.length <= validation.maxLength)
  );
}

function passesNumberValidation(
  value: number,
  validation: VariableValidation | undefined
): boolean {
  return (
    (validation?.min === undefined || value >= validation.min) &&
    (validation?.max === undefined || value <= validation.max)
  );
}

function passesListValidation(
  value: readonly string[],
  validation: VariableValidation | undefined
): boolean {
  return (
    value.every((item) => item.trim().length > 0) &&
    (validation?.minItems === undefined ||
      value.length >= validation.minItems)
  );
}

function isMoneyValue(value: unknown): value is MoneyBindingValue {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== 2 ||
    !ownKeys.includes("amount") ||
    !ownKeys.includes("currency")
  ) {
    return false;
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  return (
    isFiniteNumber(candidate.amount) &&
    candidate.amount >= 0 &&
    typeof candidate.currency === "string" &&
    /^[A-Z]{3}$/.test(candidate.currency)
  );
}

function cloneBindingValue(
  value: TemplateBindingValue
): TemplateBindingValue {
  if (isLocalizedListBinding(value)) {
    return { en: [...value.en], ar: [...value.ar] };
  }
  if (isLocalizedStringBinding(value)) {
    return { en: value.en, ar: value.ar };
  }
  if (isMoneyValue(value)) {
    return {
      amount: value.amount,
      currency: value.currency,
    };
  }
  return value;
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function containsUnsafeBindingContent(value: TemplateBindingValue): boolean {
  if (typeof value === "string") return isUnsafeString(value);
  if (isLocalizedStringBinding(value)) {
    return isUnsafeString(value.en) || isUnsafeString(value.ar);
  }
  if (isLocalizedListBinding(value)) {
    return (
      value.en.some(isUnsafeString) || value.ar.some(isUnsafeString)
    );
  }
  if (isMoneyValue(value)) {
    return isUnsafeString(value.currency);
  }
  return false;
}

function isLocalizedStringBinding(
  value: unknown
): value is LocalizedStringBindingValue {
  if (!isExactPlainObject(value, ["en", "ar"])) return false;
  return (
    typeof value.en === "string" &&
    value.en.trim().length > 0 &&
    typeof value.ar === "string" &&
    value.ar.trim().length > 0
  );
}

function isLocalizedListBinding(
  value: unknown
): value is LocalizedListBindingValue {
  if (!isExactPlainObject(value, ["en", "ar"])) return false;
  return (
    Array.isArray(value.en) &&
    value.en.every((item) => typeof item === "string") &&
    Array.isArray(value.ar) &&
    value.ar.every((item) => typeof item === "string")
  );
}

function isExactPlainObject(
  value: unknown,
  expectedKeys: readonly string[]
): value is Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => ownKeys.includes(key))
  );
}

function resolveBoundValue(
  value: TemplateBindingValue,
  valueDirection: TemplateValueDirection,
  language: "en" | "ar"
): BoundRenderableValue {
  if (valueDirection === "DIRECTION_NEUTRAL") {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      isMoneyValue(value)
    ) {
      return value;
    }
    throw new TypeError("Invalid direction-neutral binding value.");
  }
  if (isLocalizedStringBinding(value) || isLocalizedListBinding(value)) {
    return value[language];
  }
  throw new TypeError("Invalid localized binding value.");
}

function isUnsafeString(value: string): boolean {
  return (
    /<\/?[A-Za-z][^>]*>/u.test(value) ||
    /\{\{[^{}]+\}\}/u.test(value) ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
      value
    )
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical content cannot contain non-finite numbers.");
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("Canonical content cannot contain circular references.");
    }
    ancestors.add(value);
    const result = `[${value
      .map((item) => canonicalize(item, ancestors))
      .join(",")}]`;
    ancestors.delete(value);
    return result;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      `Canonical content cannot contain values of type ${typeof value}.`
    );
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical content must contain plain objects only.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical content cannot contain circular references.");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Canonical content cannot contain symbol keys.");
  }

  ancestors.add(value);
  const entries: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || descriptor.get || descriptor.set) {
      throw new TypeError("Canonical content cannot contain accessors.");
    }
    entries.push(
      `${JSON.stringify(key)}:${canonicalize(descriptor.value, ancestors)}`
    );
  }
  ancestors.delete(value);
  return `{${entries.join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
