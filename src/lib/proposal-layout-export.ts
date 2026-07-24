/**
 * Safe multi-format adapter for the structured Phase 4 proposal model.
 *
 * This module intentionally does not accept Markdown, HTML, React nodes, or
 * remote assets. A ProposalSnapshot is first compiled by proposal-layouts.ts;
 * only a valid, natively supported plan can cross into the Phase 2 bilingual
 * document AST. The same AST is then used for canonical HTML and PDF output.
 */

import {
  parseBilingualDocument,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type BilingualTableColumn,
  type BilingualTableRow,
  type BilingualValueKind,
  type PairedBlock,
  type PairedSection,
  type RenderBilingualDocumentOptions,
} from "./bilingual-layout";
import {
  generateBilingualPdf,
  type BilingualPdfArtifact,
  type GenerateBilingualPdfOptions,
} from "./bilingual-pdf";
import { createBidiValue } from "./bilingual-typography";
import {
  compileProposalLayout,
  generateProposalPptx,
  type CompiledProposalLayout,
  type LocalizedProposalText,
  type ProposalBlock,
  type ProposalBrandInput,
  type ProposalChannel,
  type ProposalDiagnosticCode,
  type ProposalLayoutKey,
  type ProposalLayoutValidationError,
  type ProposalModuleKey,
  type ProposalModuleSnapshot,
  type ProposalSnapshot,
  type ProposalSourceReference,
} from "./proposal-layouts";

export const PROPOSAL_STRUCTURED_EXPORT_CHANNELS = Object.freeze([
  "HTML",
  "PDF",
  "PPTX",
] as const);

export type ProposalStructuredExportChannel =
  (typeof PROPOSAL_STRUCTURED_EXPORT_CHANNELS)[number];

export type ProposalLayoutExportDiagnosticCode =
  | ProposalDiagnosticCode
  | "BILINGUAL_CONTENT_REQUIRED"
  | "COMPILED_CONTENT_MISMATCH"
  | "UNSAFE_ASSET_REFERENCE"
  | "UNSUPPORTED_BLOCK_CAPABILITY"
  | "UNSUPPORTED_EXPORT_CHANNEL";

export interface ProposalLayoutExportDiagnostic {
  readonly severity: "ERROR";
  readonly code: ProposalLayoutExportDiagnosticCode;
  readonly channel: ProposalChannel;
  readonly path: string;
  readonly message: LocalizedProposalText;
}

export interface ProposalLayoutExportMetadata {
  readonly schemaVersion: 1;
  /**
   * ProposalSnapshot has no approval field. Structured exports therefore stay
   * visibly DRAFT; callers must not infer approval from successful rendering.
   */
  readonly lifecycle: "DRAFT";
  readonly channel: ProposalChannel;
  readonly presetKey: ProposalLayoutKey;
  readonly snapshotId: string;
  readonly snapshotVersion: number;
  readonly snapshotHash: string;
  readonly planHash: string;
  readonly sourceRefs: readonly string[];
}

export interface CompileProposalLayoutDocumentOptions {
  readonly channel?: ProposalChannel;
  readonly presetKey?: ProposalLayoutKey;
}

export type ProposalLayoutDocumentCompilation =
  | Readonly<{
      status: "READY";
      channel: "HTML" | "PDF";
      document: BilingualDocumentSpec;
      plan: CompiledProposalLayout;
      metadata: ProposalLayoutExportMetadata;
      diagnostics: readonly ProposalLayoutExportDiagnostic[];
    }>
  | Readonly<{
      status: "BLOCKED";
      channel: ProposalChannel;
      document: null;
      plan: CompiledProposalLayout;
      metadata: ProposalLayoutExportMetadata;
      diagnostics: readonly ProposalLayoutExportDiagnostic[];
    }>;

export class ProposalLayoutExportError extends Error {
  readonly channel: ProposalChannel;
  readonly diagnostics: readonly ProposalLayoutExportDiagnostic[];

  constructor(
    channel: ProposalChannel,
    diagnostics: readonly ProposalLayoutExportDiagnostic[]
  ) {
    super(
      `Proposal ${channel} export is blocked by ${diagnostics.length} diagnostic${
        diagnostics.length === 1 ? "" : "s"
      }.`
    );
    this.name = "ProposalLayoutExportError";
    this.channel = channel;
    this.diagnostics = diagnostics;
  }
}

function exportDiagnostic(
  channel: ProposalChannel,
  code: ProposalLayoutExportDiagnosticCode,
  path: string,
  en: string,
  ar: string
): ProposalLayoutExportDiagnostic {
  return Object.freeze({
    severity: "ERROR" as const,
    code,
    channel,
    path,
    message: Object.freeze({ en, ar }),
  });
}

function fromLayoutDiagnostic(
  channel: ProposalChannel,
  diagnostic: CompiledProposalLayout["diagnostics"][number]
): ProposalLayoutExportDiagnostic {
  return Object.freeze({
    ...diagnostic,
    channel,
  });
}

function sortDiagnostics(
  diagnostics: readonly ProposalLayoutExportDiagnostic[]
): readonly ProposalLayoutExportDiagnostic[] {
  return Object.freeze(
    [...diagnostics].sort(
      (left, right) =>
        left.path.localeCompare(right.path) ||
        left.code.localeCompare(right.code) ||
        left.message.en.localeCompare(right.message.en)
    )
  );
}

function buildMetadata(
  snapshot: ProposalSnapshot,
  plan: CompiledProposalLayout
): ProposalLayoutExportMetadata {
  return Object.freeze({
    schemaVersion: 1 as const,
    lifecycle: "DRAFT" as const,
    channel: plan.channel,
    presetKey: plan.presetKey,
    snapshotId: plan.snapshotId,
    snapshotVersion: plan.snapshotVersion,
    snapshotHash: plan.snapshotHash,
    planHash: plan.planHash,
    sourceRefs: Object.freeze(
      [...new Set(snapshot.sources.map((source) => source.id))].sort()
    ),
  });
}

function text(value: string): readonly BilingualInlineNode[] {
  const nodes: BilingualInlineNode[] = [];
  value.split(/\r?\n/u).forEach((line, index) => {
    if (index > 0) nodes.push({ type: "line-break" });
    if (line.length > 0) nodes.push({ type: "text", text: line });
  });
  return nodes;
}

function localizedText(
  value: LocalizedProposalText
): Readonly<{
  en: readonly BilingualInlineNode[];
  ar: readonly BilingualInlineNode[];
}> {
  return {
    en: text(value.en),
    ar: text(value.ar),
  };
}

function value(
  content: string,
  language: "en" | "ar",
  valueKind: BilingualValueKind = "identifier"
): BilingualInlineNode {
  return {
    type: "value",
    valueKind,
    value: createBidiValue(content, {
      baseLocale: language,
      digitPolicy: "preserve",
    }),
  };
}

function localizedValueLine(
  prefix: LocalizedProposalText,
  content: string,
  valueKind: BilingualValueKind = "identifier"
): Readonly<{
  en: readonly BilingualInlineNode[];
  ar: readonly BilingualInlineNode[];
}> {
  return {
    en: [
      { type: "text", text: prefix.en },
      value(content, "en", valueKind),
    ],
    ar: [
      { type: "text", text: prefix.ar },
      value(content, "ar", valueKind),
    ],
  };
}

function localizedValuesLine(
  prefix: LocalizedProposalText,
  values: readonly string[]
): Readonly<{
  en: readonly BilingualInlineNode[];
  ar: readonly BilingualInlineNode[];
}> {
  const build = (
    language: "en" | "ar"
  ): readonly BilingualInlineNode[] => {
    const nodes: BilingualInlineNode[] =
      prefix[language].length > 0
        ? [{ type: "text", text: prefix[language] }]
        : [];
    if (values.length === 0) {
      nodes.push({
        type: "text",
        text: language === "ar" ? "لا توجد مراجع معلنة" : "None declared",
      });
      return nodes;
    }
    values.forEach((entry, index) => {
      if (index > 0) nodes.push({ type: "text", text: ", " });
      nodes.push(value(entry, language));
    });
    return nodes;
  };
  return { en: build("en"), ar: build("ar") };
}

function localizedNeutralValue(
  content: string,
  valueKind: BilingualValueKind = "identifier"
): Readonly<{
  en: readonly BilingualInlineNode[];
  ar: readonly BilingualInlineNode[];
}> {
  return {
    en: [value(content, "en", valueKind)],
    ar: [value(content, "ar", valueKind)],
  };
}

function sourceIdsForBlock(block: ProposalBlock): readonly string[] {
  const ids = new Set<string>(block.sourceRefs);
  if (block.type === "EVIDENCE_REGISTER") {
    for (const entry of block.entries) {
      for (const sourceRef of entry.sourceRefs) ids.add(sourceRef);
    }
  }
  if (block.type === "COMMERCIAL_HANDOFF") {
    for (const entry of block.entries) {
      for (const sourceRef of entry.sourceRefs) ids.add(sourceRef);
    }
  }
  return [...ids].sort();
}

function isSafePublicAssetRef(assetRef: string): boolean {
  return (
    assetRef.startsWith("/") &&
    !assetRef.startsWith("//") &&
    !assetRef.includes("\\") &&
    !assetRef.split(/[?#]/u, 1)[0].split("/").includes("..")
  );
}

function findModule(
  snapshot: ProposalSnapshot,
  key: ProposalModuleKey
): ProposalModuleSnapshot | undefined {
  return snapshot.modules.find((module) => module.key === key);
}

function findBlock(
  snapshot: ProposalSnapshot,
  moduleKey: ProposalModuleKey,
  blockKey: string
): ProposalBlock | undefined {
  return findModule(snapshot, moduleKey)?.blocks.find(
    (block) => block.key === blockKey
  );
}

function adapterDiagnostics(
  snapshot: ProposalSnapshot,
  plan: CompiledProposalLayout
): readonly ProposalLayoutExportDiagnostic[] {
  const diagnostics: ProposalLayoutExportDiagnostic[] = plan.diagnostics.map(
    (diagnostic) => fromLayoutDiagnostic(plan.channel, diagnostic)
  );

  if (snapshot.languageMode !== "BILINGUAL") {
    diagnostics.push(
      exportDiagnostic(
        plan.channel,
        "BILINGUAL_CONTENT_REQUIRED",
        "languageMode",
        "Canonical Phase 2 HTML and PDF require explicit English and Arabic content; translations are never synthesized.",
        "يتطلب إخراج HTML وPDF المعياري للمرحلة الثانية محتوى عربياً وإنجليزياً صريحاً؛ ولا تُنشأ الترجمات تلقائياً."
      )
    );
  }

  if (plan.channel !== "HTML" && plan.channel !== "PDF") {
    diagnostics.push(
      exportDiagnostic(
        plan.channel,
        "UNSUPPORTED_EXPORT_CHANNEL",
        "channel",
        `${plan.channel} does not compile to a BilingualDocumentSpec. Use exportProposalLayout for native PPTX; XLSX is not implemented.`,
        `لا تُجمّع قناة ${plan.channel} إلى BilingualDocumentSpec. استخدم exportProposalLayout لإخراج PPTX الأصلي؛ وإخراج XLSX غير منفذ.`
      )
    );
  }

  for (const compiledModule of plan.modules) {
    for (const compiledBlock of compiledModule.blocks) {
      const blockPath = `modules.${compiledModule.key}.blocks.${compiledBlock.key}`;
      const block = findBlock(snapshot, compiledModule.key, compiledBlock.key);
      if (!block) {
        diagnostics.push(
          exportDiagnostic(
            plan.channel,
            "COMPILED_CONTENT_MISMATCH",
            blockPath,
            "A compiled proposal block is missing from the immutable snapshot.",
            "كتلة عرض مجمعة مفقودة من اللقطة الثابتة."
          )
        );
        continue;
      }
      if (compiledBlock.capability !== "NATIVE") {
        diagnostics.push(
          exportDiagnostic(
            plan.channel,
            "UNSUPPORTED_BLOCK_CAPABILITY",
            blockPath,
            `Block ${compiledBlock.key} requires ${compiledBlock.capability} handling for ${plan.channel}.`,
            `تتطلب الكتلة ${compiledBlock.key} معالجة ${compiledBlock.capability} لقناة ${plan.channel}.`
          )
        );
      }
      if (
        block.type === "DIAGRAM" &&
        !isSafePublicAssetRef(block.assetRef)
      ) {
        diagnostics.push(
          exportDiagnostic(
            plan.channel,
            "UNSAFE_ASSET_REFERENCE",
            `${blockPath}.assetRef`,
            "Diagram assets must be trusted application-relative public paths. Remote, data, workspace, and traversal references are not fetched.",
            "يجب أن تكون أصول المخطط مسارات عامة موثوقة داخل التطبيق. لا تُجلب المراجع البعيدة أو المضمنة أو مراجع مساحة العمل أو مسارات الاجتياز."
          )
        );
      }
      if (
        block.type === "DIAGRAM" &&
        isSafePublicAssetRef(block.assetRef) &&
        plan.channel === "PDF"
      ) {
        diagnostics.push(
          exportDiagnostic(
            plan.channel,
            "UNSUPPORTED_BLOCK_CAPABILITY",
            `${blockPath}.assetRef`,
            "Standalone PDF export cannot resolve application-relative diagram assets without an explicit trusted asset resolver or base URL.",
            "لا يمكن لإخراج PDF المستقل حل أصول المخطط النسبية داخل التطبيق دون محلل أصول موثوق وصريح أو عنوان أساس."
          )
        );
      }
    }
  }

  return sortDiagnostics(diagnostics);
}

const EVIDENCE_STATUS: Readonly<
  Record<
    Extract<ProposalBlock, { type: "EVIDENCE_REGISTER" }>["entries"][number]["status"],
    LocalizedProposalText
  >
> = Object.freeze({
  VERIFIED: Object.freeze({ en: "Verified", ar: "موثق" }),
  PENDING: Object.freeze({ en: "Pending", ar: "قيد الانتظار" }),
  NOT_AVAILABLE: Object.freeze({ en: "Not available", ar: "غير متاح" }),
});

const PRICING_STATUS: Readonly<
  Record<
    Extract<ProposalBlock, { type: "COMMERCIAL_HANDOFF" }>["pricingStatus"],
    LocalizedProposalText
  >
> = Object.freeze({
  USER_ENTRY_REQUIRED: Object.freeze({
    en: "User entry required",
    ar: "يلزم إدخال المستخدم",
  }),
  VERIFIED_SOURCE_VALUES: Object.freeze({
    en: "Verified source values",
    ar: "قيم مصادر موثقة",
  }),
});

const NOT_AVAILABLE = Object.freeze({
  en: "Not available",
  ar: "غير متاح",
});

function tableColumns(
  baseId: string,
  columns: readonly {
    readonly header: LocalizedProposalText;
    readonly align?: BilingualTableColumn["align"];
  }[]
): readonly BilingualTableColumn[] {
  return columns.map((column, index) => ({
    id: `${baseId}.c${index + 1}`,
    header: localizedText(column.header),
    ...(column.align ? { align: column.align } : {}),
  }));
}

function traceabilityParagraph(
  baseId: string,
  block: ProposalBlock
): PairedBlock {
  const sources = sourceIdsForBlock(block);
  const contentFor = (
    language: "en" | "ar"
  ): readonly BilingualInlineNode[] => {
    const nodes: BilingualInlineNode[] = [
      { type: "text", text: language === "ar" ? "الكتلة " : "Block " },
      value(block.key, language),
      {
        type: "text",
        text: language === "ar" ? " · المصادر: " : " · Sources: ",
      },
    ];
    if (sources.length === 0) {
      nodes.push({
        type: "text",
        text: language === "ar" ? "لا توجد مراجع معلنة" : "None declared",
      });
    } else {
      sources.forEach((sourceId, index) => {
        if (index > 0) nodes.push({ type: "text", text: ", " });
        nodes.push(value(sourceId, language));
      });
    }
    return nodes;
  };
  return {
    type: "paragraph",
    id: `${baseId}.sources`,
    content: { en: contentFor("en"), ar: contentFor("ar") },
  };
}

function narrativeBlocks(
  block: Extract<ProposalBlock, { type: "NARRATIVE" }>,
  baseId: string
): readonly PairedBlock[] {
  return [
    {
      type: "paragraph",
      id: `${baseId}.body`,
      content: localizedText(block.body),
    },
  ];
}

function listBlocks(
  block: Extract<ProposalBlock, { type: "BULLET_LIST" }>,
  baseId: string
): readonly PairedBlock[] {
  return [
    {
      type: "list",
      id: `${baseId}.list`,
      ordered: false,
      items: block.items.map((item, index) => ({
        id: `${baseId}.item${index + 1}`,
        content: localizedText(item),
      })),
    },
  ];
}

function proposalTableBlocks(
  block: Extract<ProposalBlock, { type: "TABLE" }>,
  baseId: string
): readonly PairedBlock[] {
  const columns = tableColumns(
    baseId,
    block.columns.map((column) => ({ header: column.label }))
  );
  const rows: readonly BilingualTableRow[] = block.rows.map(
    (row, rowIndex) => ({
      id: `${baseId}.r${rowIndex + 1}`,
      cells: Object.fromEntries(
        block.columns.map((column, columnIndex) => [
          columns[columnIndex].id,
          {
            content: localizedText(row.cells[column.key]),
          },
        ])
      ),
    })
  );
  return [
    {
      type: "table",
      id: `${baseId}.table`,
      columns,
      rows,
      repeatHeader: true,
    },
  ];
}

function kpiBlocks(
  block: Extract<ProposalBlock, { type: "KPI" }>,
  baseId: string
): readonly PairedBlock[] {
  const inlineFor = (
    language: "en" | "ar"
  ): readonly BilingualInlineNode[] => {
    const nodes: BilingualInlineNode[] = [
      { type: "text", text: `${block.label[language]}: ` },
    ];
    if (block.value === null) {
      nodes.push({ type: "text", text: NOT_AVAILABLE[language] });
    } else {
      nodes.push(value(block.value, language, "technical-term"));
    }
    if (block.unit) {
      nodes.push({ type: "text", text: ` ${block.unit[language]}` });
    }
    if (block.asOf) {
      nodes.push({
        type: "text",
        text: language === "ar" ? " · كما في: " : " · As of: ",
      });
      nodes.push(value(block.asOf, language, "date"));
    }
    return nodes;
  };
  return [
    {
      type: "paragraph",
      id: `${baseId}.kpi`,
      content: { en: inlineFor("en"), ar: inlineFor("ar") },
    },
  ];
}

function evidenceBlocks(
  block: Extract<ProposalBlock, { type: "EVIDENCE_REGISTER" }>,
  baseId: string
): readonly PairedBlock[] {
  const columns = tableColumns(baseId, [
    { header: { en: "Evidence", ar: "الدليل" } },
    { header: { en: "Status", ar: "الحالة" } },
    { header: { en: "Source references", ar: "مراجع المصادر" } },
  ]);
  const rows: readonly BilingualTableRow[] = block.entries.map(
    (entry, index) => ({
      id: `${baseId}.r${index + 1}`,
      cells: {
        [columns[0].id]: { content: localizedText(entry.label) },
        [columns[1].id]: {
          content: localizedText(EVIDENCE_STATUS[entry.status]),
        },
        [columns[2].id]: {
          content: localizedValuesLine(
            { en: "", ar: "" },
            [...entry.sourceRefs].sort()
          ),
        },
      },
    })
  );
  return [
    {
      type: "table",
      id: `${baseId}.evidence`,
      columns,
      rows,
      repeatHeader: true,
    },
  ];
}

function commercialBlocks(
  block: Extract<ProposalBlock, { type: "COMMERCIAL_HANDOFF" }>,
  baseId: string
): readonly PairedBlock[] {
  const blocks: PairedBlock[] = [
    {
      type: "paragraph",
      id: `${baseId}.instruction`,
      content: localizedText(block.instruction),
    },
    {
      type: "paragraph",
      id: `${baseId}.pricing-status`,
      content: {
        en: [
          { type: "text", text: "Pricing status: " },
          ...text(PRICING_STATUS[block.pricingStatus].en),
        ],
        ar: [
          { type: "text", text: "حالة التسعير: " },
          ...text(PRICING_STATUS[block.pricingStatus].ar),
        ],
      },
    },
  ];
  if (block.entries.length === 0) return blocks;

  const columns = tableColumns(baseId, [
    { header: { en: "Description", ar: "الوصف" } },
    { header: { en: "Amount", ar: "المبلغ" }, align: "numeric" },
    { header: { en: "Currency", ar: "العملة" } },
    { header: { en: "Source references", ar: "مراجع المصادر" } },
  ]);
  const rows: readonly BilingualTableRow[] = block.entries.map(
    (entry, index) => ({
      id: `${baseId}.r${index + 1}`,
      cells: {
        [columns[0].id]: { content: localizedText(entry.description) },
        [columns[1].id]: {
          content:
            entry.amount === null
              ? localizedText(NOT_AVAILABLE)
              : localizedNeutralValue(entry.amount, "currency"),
        },
        [columns[2].id]: {
          content:
            entry.currency === null
              ? localizedText(NOT_AVAILABLE)
              : localizedNeutralValue(entry.currency, "technical-term"),
        },
        [columns[3].id]: {
          content: localizedValuesLine(
            { en: "", ar: "" },
            [...entry.sourceRefs].sort()
          ),
        },
      },
    })
  );
  blocks.push({
    type: "table",
    id: `${baseId}.commercial`,
    columns,
    rows,
    repeatHeader: true,
  });
  return blocks;
}

function diagramBlocks(
  block: Extract<ProposalBlock, { type: "DIAGRAM" }>,
  baseId: string
): readonly PairedBlock[] {
  return [
    {
      type: "image",
      id: `${baseId}.diagram`,
      source: { kind: "public", path: block.assetRef },
      alt: block.altText,
      caption: localizedText(block.description),
      decorative: false,
      visualBehavior: "never",
      widthPercent: 100,
    },
  ];
}

function contentBlocks(
  block: ProposalBlock,
  baseId: string
): readonly PairedBlock[] {
  switch (block.type) {
    case "NARRATIVE":
      return narrativeBlocks(block, baseId);
    case "BULLET_LIST":
      return listBlocks(block, baseId);
    case "TABLE":
      return proposalTableBlocks(block, baseId);
    case "KPI":
      return kpiBlocks(block, baseId);
    case "EVIDENCE_REGISTER":
      return evidenceBlocks(block, baseId);
    case "COMMERCIAL_HANDOFF":
      return commercialBlocks(block, baseId);
    case "DIAGRAM":
      return diagramBlocks(block, baseId);
  }
}

function sourceManifestSection(
  sources: readonly ProposalSourceReference[]
): PairedSection {
  if (sources.length === 0) {
    return {
      id: "proposal-source-manifest",
      alignmentKey: "proposal.sources",
      title: localizedText({
        en: "Source manifest",
        ar: "بيان المصادر",
      }),
      blocks: [
        {
          type: "paragraph",
          id: "proposal-source-manifest-empty",
          content: localizedText({
            en: "No source records were declared in this snapshot.",
            ar: "لم تُعلن سجلات مصادر في هذه اللقطة.",
          }),
        },
      ],
      startOnNewPage: true,
    };
  }

  const columns = tableColumns("proposal.sources", [
    { header: { en: "Source ID", ar: "معرف المصدر" } },
    { header: { en: "Kind", ar: "النوع" } },
    { header: { en: "Title", ar: "العنوان" } },
    { header: { en: "Locator", ar: "المحدد" } },
    { header: { en: "As of", ar: "كما في" } },
  ]);
  const rows: readonly BilingualTableRow[] = sources.map((source, index) => ({
    id: `proposal.sources.r${index + 1}`,
    cells: {
      [columns[0].id]: { content: localizedNeutralValue(source.id) },
      [columns[1].id]: {
        content: localizedNeutralValue(source.kind, "technical-term"),
      },
      [columns[2].id]: { content: localizedText(source.title) },
      [columns[3].id]: {
        content: source.locator
          ? localizedNeutralValue(source.locator)
          : localizedText(NOT_AVAILABLE),
      },
      [columns[4].id]: {
        content: source.asOf
          ? localizedNeutralValue(source.asOf, "date")
          : localizedText(NOT_AVAILABLE),
      },
    },
  }));

  return {
    id: "proposal-source-manifest",
    alignmentKey: "proposal.sources",
    title: localizedText({ en: "Source manifest", ar: "بيان المصادر" }),
    blocks: [
      {
        type: "table",
        id: "proposal-source-manifest-table",
        columns,
        rows,
        repeatHeader: true,
      },
    ],
    startOnNewPage: true,
  };
}

function controlSection(
  snapshot: ProposalSnapshot,
  metadata: ProposalLayoutExportMetadata
): PairedSection {
  const blocks: PairedBlock[] = [
    {
      type: "paragraph",
      id: "proposal-draft-warning",
      content: {
        en: [
          {
            type: "strong",
            children: text(
              "DRAFT — validation confirms structure, not approval for submission."
            ),
          },
        ],
        ar: [
          {
            type: "strong",
            children: text(
              "مسودة — يؤكد التحقق سلامة البنية، ولا يعني اعتمادها للتقديم."
            ),
          },
        ],
      },
    },
    {
      type: "paragraph",
      id: "proposal-bidder",
      content: {
        en: [
          { type: "text", text: "Bidder: " },
          ...text(snapshot.bidderName.en),
        ],
        ar: [
          { type: "text", text: "مقدم العرض: " },
          ...text(snapshot.bidderName.ar),
        ],
      },
    },
    {
      type: "paragraph",
      id: "proposal-snapshot-id",
      content: localizedValueLine(
        { en: "Snapshot: ", ar: "اللقطة: " },
        metadata.snapshotId
      ),
    },
    {
      type: "paragraph",
      id: "proposal-snapshot-version",
      content: localizedValueLine(
        { en: "Snapshot version: ", ar: "إصدار اللقطة: " },
        String(metadata.snapshotVersion),
        "number"
      ),
    },
    {
      type: "paragraph",
      id: "proposal-preset",
      content: localizedValueLine(
        { en: "Layout preset: ", ar: "إعداد التخطيط: " },
        metadata.presetKey,
        "technical-term"
      ),
    },
    {
      type: "paragraph",
      id: "proposal-snapshot-hash",
      content: localizedValueLine(
        { en: "Snapshot hash: ", ar: "بصمة اللقطة: " },
        metadata.snapshotHash
      ),
    },
    {
      type: "paragraph",
      id: "proposal-plan-hash",
      content: localizedValueLine(
        { en: "Plan hash: ", ar: "بصمة الخطة: " },
        metadata.planHash
      ),
    },
  ];
  if (snapshot.tenderReference) {
    blocks.splice(2, 0, {
      type: "paragraph",
      id: "proposal-tender-reference",
      content: localizedValueLine(
        { en: "Tender reference: ", ar: "مرجع المنافسة: " },
        snapshot.tenderReference
      ),
    });
  }
  return {
    id: "proposal-document-control",
    alignmentKey: "proposal.control",
    title: localizedText({
      en: "Draft and provenance control",
      ar: "ضبط المسودة والمصادر",
    }),
    blocks,
  };
}

function moduleSections(
  snapshot: ProposalSnapshot,
  plan: CompiledProposalLayout
): readonly PairedSection[] {
  return plan.modules.map((compiledModule, moduleIndex) => {
    const snapshotModule = findModule(snapshot, compiledModule.key);
    if (!snapshotModule) {
      throw new ProposalLayoutExportError(plan.channel, [
        exportDiagnostic(
          plan.channel,
          "COMPILED_CONTENT_MISMATCH",
          `modules.${compiledModule.key}`,
          "A compiled module disappeared before AST construction.",
          "اختفت وحدة مجمعة قبل إنشاء بنية المستند."
        ),
      ]);
    }
    const blocks: PairedBlock[] = [];
    compiledModule.blocks.forEach((compiledBlock, blockIndex) => {
      const block = snapshotModule.blocks.find(
        (candidate) => candidate.key === compiledBlock.key
      );
      if (!block) {
        throw new ProposalLayoutExportError(plan.channel, [
          exportDiagnostic(
            plan.channel,
            "COMPILED_CONTENT_MISMATCH",
            `modules.${compiledModule.key}.blocks.${compiledBlock.key}`,
            "A compiled block disappeared before AST construction.",
            "اختفت كتلة مجمعة قبل إنشاء بنية المستند."
          ),
        ]);
      }
      const baseId = `proposal.m${moduleIndex + 1}.b${blockIndex + 1}`;
      blocks.push({
        type: "heading",
        id: `${baseId}.heading`,
        level: 3,
        keepWithNext: true,
        content: localizedText(block.title),
      });
      blocks.push(...contentBlocks(block, baseId));
      blocks.push(traceabilityParagraph(baseId, block));
    });
    if (blocks.length === 0) {
      blocks.push({
        type: "paragraph",
        id: `proposal.m${moduleIndex + 1}.empty`,
        content: localizedText({
          en: "No content blocks were declared for this optional module.",
          ar: "لم تُعلن كتل محتوى لهذه الوحدة الاختيارية.",
        }),
      });
    }
    return {
      id: `proposal-module-${moduleIndex + 1}`,
      alignmentKey: `proposal.module.${moduleIndex + 1}`,
      title: localizedText(snapshotModule.title),
      blocks,
      startOnNewPage: moduleIndex > 0,
    };
  });
}

function buildDocument(
  snapshot: ProposalSnapshot,
  plan: CompiledProposalLayout,
  metadata: ProposalLayoutExportMetadata
): BilingualDocumentSpec {
  return parseBilingualDocument({
    id: "proposal-structured-export",
    version: `${metadata.snapshotVersion}:${metadata.planHash}`,
    title: {
      en: text(`DRAFT — ${snapshot.projectTitle.en}`),
      ar: text(`مسودة — ${snapshot.projectTitle.ar}`),
    },
    layout: {
      mode: "parallel",
      columnRatio: [50, 50],
      mobileBreakpointPx: 768,
      mobileOrder: "ar-first",
      viewer: {
        mode: "both",
        defaultLanguage: "ar",
      },
    },
    sections: [
      controlSection(snapshot, metadata),
      ...moduleSections(snapshot, plan),
      sourceManifestSection(snapshot.sources),
    ],
  } satisfies BilingualDocumentSpec);
}

/**
 * Compile a proposal snapshot into the Phase 2 bilingual document AST.
 *
 * Invalid content returns BLOCKED with deterministic diagnostics. PPTX is
 * intentionally handled by exportProposalLayout so the real native generator
 * remains the single PPTX implementation.
 */
export function compileProposalLayoutDocument(
  snapshot: ProposalSnapshot,
  options: CompileProposalLayoutDocumentOptions = {}
): ProposalLayoutDocumentCompilation {
  const channel = options.channel ?? "HTML";
  const plan = compileProposalLayout(snapshot, {
    channel,
    presetKey: options.presetKey,
  });
  const metadata = buildMetadata(snapshot, plan);
  const diagnostics = adapterDiagnostics(snapshot, plan);
  if (
    diagnostics.length > 0 ||
    (channel !== "HTML" && channel !== "PDF")
  ) {
    return Object.freeze({
      status: "BLOCKED" as const,
      channel,
      document: null,
      plan,
      metadata,
      diagnostics,
    });
  }

  return Object.freeze({
    status: "READY" as const,
    channel,
    document: buildDocument(snapshot, plan, metadata),
    plan,
    metadata,
    diagnostics,
  });
}

function requireDocument(
  compilation: ProposalLayoutDocumentCompilation
): BilingualDocumentSpec {
  if (compilation.status === "BLOCKED" || compilation.document === null) {
    throw new ProposalLayoutExportError(
      compilation.channel,
      compilation.diagnostics
    );
  }
  return compilation.document;
}

/** Render safe HTML from a previously validated canonical AST compilation. */
export function renderProposalLayoutHTML(
  compilation: ProposalLayoutDocumentCompilation,
  options: RenderBilingualDocumentOptions = {
    target: "screen",
    includeDocumentShell: true,
  }
): string {
  return renderBilingualHTML(requireDocument(compilation), options);
}

/** Generate a font-embedded PDF from the same canonical AST as HTML. */
export async function generateProposalLayoutPdf(
  compilation: ProposalLayoutDocumentCompilation,
  options: GenerateBilingualPdfOptions = {}
): Promise<BilingualPdfArtifact> {
  return generateBilingualPdf(requireDocument(compilation), options);
}

export interface ExportProposalLayoutBaseOptions {
  readonly presetKey?: ProposalLayoutKey;
}

export interface ExportProposalLayoutHtmlOptions
  extends ExportProposalLayoutBaseOptions {
  readonly channel: "HTML";
  readonly render?: RenderBilingualDocumentOptions;
}

export interface ExportProposalLayoutPdfOptions
  extends ExportProposalLayoutBaseOptions {
  readonly channel: "PDF";
  readonly pdf?: GenerateBilingualPdfOptions;
}

export interface ExportProposalLayoutPptxOptions
  extends ExportProposalLayoutBaseOptions {
  readonly channel: "PPTX";
  readonly brand?: ProposalBrandInput;
}

export interface ExportProposalLayoutUnsupportedOptions
  extends ExportProposalLayoutBaseOptions {
  readonly channel: "XLSX";
}

export type ExportProposalLayoutOptions =
  | ExportProposalLayoutHtmlOptions
  | ExportProposalLayoutPdfOptions
  | ExportProposalLayoutPptxOptions
  | ExportProposalLayoutUnsupportedOptions;

interface ProposalLayoutArtifactBase {
  readonly metadata: ProposalLayoutExportMetadata;
  readonly plan: CompiledProposalLayout;
  readonly buffer: Buffer;
}

export interface ProposalLayoutHtmlArtifact
  extends ProposalLayoutArtifactBase {
  readonly channel: "HTML";
  readonly mediaType: "text/html; charset=utf-8";
  readonly html: string;
  readonly document: BilingualDocumentSpec;
}

export interface ProposalLayoutPdfArtifact
  extends ProposalLayoutArtifactBase {
  readonly channel: "PDF";
  readonly mediaType: "application/pdf";
  readonly html: string;
  readonly document: BilingualDocumentSpec;
  readonly sha256: string;
}

export interface ProposalLayoutPptxArtifact
  extends ProposalLayoutArtifactBase {
  readonly channel: "PPTX";
  readonly mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation";
}

export type ProposalLayoutExportArtifact =
  | ProposalLayoutHtmlArtifact
  | ProposalLayoutPdfArtifact
  | ProposalLayoutPptxArtifact;

function requireValidNativePlan(
  snapshot: ProposalSnapshot,
  channel: "PPTX",
  presetKey: ProposalLayoutKey | undefined
): Readonly<{
  plan: CompiledProposalLayout;
  metadata: ProposalLayoutExportMetadata;
}> {
  const plan = compileProposalLayout(snapshot, { channel, presetKey });
  const diagnostics: ProposalLayoutExportDiagnostic[] = plan.diagnostics.map(
    (diagnostic) => fromLayoutDiagnostic(channel, diagnostic)
  );
  if (snapshot.languageMode !== "BILINGUAL") {
    diagnostics.push(
      exportDiagnostic(
        channel,
        "BILINGUAL_CONTENT_REQUIRED",
        "languageMode",
        "The native proposal deck requires explicit English and Arabic content; translations are never synthesized.",
        "يتطلب عرض المقترح الأصلي محتوى عربياً وإنجليزياً صريحاً؛ ولا تُنشأ الترجمات تلقائياً."
      )
    );
  }
  if (diagnostics.length > 0) {
    throw new ProposalLayoutExportError(
      channel,
      sortDiagnostics(diagnostics)
    );
  }
  return {
    plan,
    metadata: buildMetadata(snapshot, plan),
  };
}

/**
 * Export one structured proposal without routing through the legacy Markdown
 * generators. HTML/PDF share the Phase 2 AST; PPTX delegates to the existing
 * native PptxGenJS generator. XLSX fails with an explicit capability error.
 */
export async function exportProposalLayout(
  snapshot: ProposalSnapshot,
  options: ExportProposalLayoutOptions
): Promise<ProposalLayoutExportArtifact> {
  if (options.channel === "XLSX") {
    const plan = compileProposalLayout(snapshot, {
      channel: "XLSX",
      presetKey: options.presetKey,
    });
    const diagnostics = [
      ...plan.diagnostics.map((diagnostic) =>
        fromLayoutDiagnostic("XLSX", diagnostic)
      ),
      exportDiagnostic(
        "XLSX",
        "UNSUPPORTED_EXPORT_CHANNEL",
        "channel",
        "Structured XLSX proposal export is not implemented; no fallback artifact was created.",
        "لم يُنفذ إخراج العرض المنظم بصيغة XLSX؛ ولم يُنشأ ملف بديل."
      ),
    ];
    throw new ProposalLayoutExportError(
      "XLSX",
      sortDiagnostics(diagnostics)
    );
  }

  if (options.channel === "PPTX") {
    const renderSnapshot =
      options.brand === undefined
        ? snapshot
        : {
            ...snapshot,
            brand: { ...snapshot.brand, ...options.brand },
          };
    const { plan, metadata } = requireValidNativePlan(
      renderSnapshot,
      "PPTX",
      options.presetKey
    );
    let buffer: Buffer;
    try {
      buffer = await generateProposalPptx(renderSnapshot, {
        presetKey: options.presetKey,
      });
    } catch (error) {
      const layoutError = error as Partial<ProposalLayoutValidationError>;
      if (Array.isArray(layoutError.diagnostics)) {
        throw new ProposalLayoutExportError(
          "PPTX",
          sortDiagnostics(
            layoutError.diagnostics.map((diagnostic) =>
              fromLayoutDiagnostic("PPTX", diagnostic)
            )
          )
        );
      }
      throw error;
    }
    return Object.freeze({
      channel: "PPTX" as const,
      mediaType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" as const,
      metadata,
      plan,
      buffer,
    });
  }

  const compilation = compileProposalLayoutDocument(snapshot, {
    channel: options.channel,
    presetKey: options.presetKey,
  });
  const document = requireDocument(compilation);
  if (options.channel === "HTML") {
    const html = renderProposalLayoutHTML(compilation, options.render);
    return Object.freeze({
      channel: "HTML" as const,
      mediaType: "text/html; charset=utf-8" as const,
      metadata: compilation.metadata,
      plan: compilation.plan,
      buffer: Buffer.from(html, "utf8"),
      html,
      document,
    });
  }

  const pdf = await generateProposalLayoutPdf(compilation, options.pdf);
  return Object.freeze({
    channel: "PDF" as const,
    mediaType: "application/pdf" as const,
    metadata: compilation.metadata,
    plan: compilation.plan,
    buffer: pdf.pdf,
    html: pdf.html,
    document,
    sha256: pdf.sha256,
  });
}
