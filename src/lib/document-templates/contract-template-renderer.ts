/**
 * Contract-template -> bilingual document adapter.
 *
 * The contract catalog deliberately remains a drafting system until its legal
 * content is reviewed. This adapter never removes that status: every artifact
 * carries a visible draft title, disclaimer, review warning, and pinned
 * template identity.
 */

import {
  parseBilingualDocument,
  renderBilingualHTML,
  type BilingualDocumentSpec,
  type BilingualInlineNode,
  type BilingualLayoutOverrides,
  type BilingualValueKind,
  type PairedBlock,
  type PairedSection,
  type RenderBilingualDocumentOptions,
} from "../bilingual-layout";
import {
  generateBilingualPdf,
  type BilingualPdfArtifact,
  type GenerateBilingualPdfOptions,
} from "../bilingual-pdf";
import { createBidiValue, sanitizeBidiText } from "../bilingual-typography";
import {
  bindContractTemplate,
  getContractTemplate,
  type BindingDiagnostic,
  type BoundContractDocument,
  type BoundInlineNode,
  type BoundRenderableValue,
  type ContractBindingResult,
  type MoneyBindingValue,
  type TemplateVariableDefinition,
  type TemplateVariableType,
} from "./contract-templates";

export interface CompileContractTemplateDocumentOptions {
  /**
   * FINAL means variable-complete, not legally approved. The rendered
   * lifecycle remains DRAFT and counsel review remains mandatory.
   */
  readonly mode?: "PREVIEW" | "FINAL";
  readonly layout?: BilingualLayoutOverrides;
}

export type ContractTemplateDocumentCompilation =
  | Readonly<{
      status: "READY" | "READY_WITH_DIAGNOSTICS";
      document: BilingualDocumentSpec;
      binding: Exclude<ContractBindingResult, { status: "BLOCKED" }>;
      diagnostics: readonly BindingDiagnostic[];
    }>
  | Readonly<{
      status: "BLOCKED";
      document: null;
      binding: Extract<ContractBindingResult, { status: "BLOCKED" }>;
      diagnostics: readonly BindingDiagnostic[];
    }>;

export class ContractTemplateRenderError extends Error {
  readonly diagnostics: readonly BindingDiagnostic[];

  constructor(diagnostics: readonly BindingDiagnostic[]) {
    super(
      `Contract template rendering is blocked by ${diagnostics.length} binding diagnostic${
        diagnostics.length === 1 ? "" : "s"
      }.`
    );
    this.name = "ContractTemplateRenderError";
    this.diagnostics = diagnostics;
  }
}

function text(value: string): readonly BilingualInlineNode[] {
  const lines = value.split(/\r?\n/u);
  const nodes: BilingualInlineNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "line-break" });
    if (line.length > 0) nodes.push({ type: "text", text: line });
  });
  return nodes.length > 0 ? nodes : [{ type: "text", text: " " }];
}

function stableIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return normalized || "item";
}

function isMoneyValue(value: BoundRenderableValue): value is MoneyBindingValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "amount" in value &&
    "currency" in value
  );
}

function formatNumber(value: number, language: "en" | "ar"): string {
  const formatted = new Intl.NumberFormat(
    language === "ar" ? "ar-SA" : "en-US",
    {
      useGrouping: true,
      maximumFractionDigits: 20,
    }
  ).format(value);
  return sanitizeBidiText(formatted).text;
}

function valueKindFor(
  definition: TemplateVariableDefinition
): BilingualValueKind | undefined {
  switch (definition.type) {
    case "MONEY":
      return "currency";
    case "NUMBER":
    case "PERCENT":
      return "number";
    case "DATE":
      return "date";
    case "BOOLEAN":
      return "technical-term";
    case "STRING":
      return definition.valueDirection === "DIRECTION_NEUTRAL"
        ? "identifier"
        : undefined;
    case "ENTITY":
    case "RICH_TEXT":
    case "LIST":
      return undefined;
  }
}

function formatScalarValue(
  value: Exclude<BoundRenderableValue, readonly string[]>,
  definition: TemplateVariableDefinition,
  language: "en" | "ar"
): string {
  if (isMoneyValue(value)) {
    return `${formatNumber(value.amount, language)} ${value.currency}`;
  }
  if (typeof value === "number") {
    const formatted = formatNumber(value, language);
    if (definition.type === "PERCENT") {
      return language === "ar" ? `${formatted}٪` : `${formatted}%`;
    }
    return formatted;
  }
  if (typeof value === "boolean") {
    return value
      ? language === "ar"
        ? "نعم"
        : "Yes"
      : language === "ar"
        ? "لا"
        : "No";
  }
  return value;
}

function valueNodes(
  value: BoundRenderableValue,
  definition: TemplateVariableDefinition,
  language: "en" | "ar"
): readonly BilingualInlineNode[] {
  const values = Array.isArray(value) ? value : [value];
  const nodes: BilingualInlineNode[] = [];
  const separator = language === "ar" ? "؛ " : "; ";

  values.forEach((entry, index) => {
    if (index > 0) nodes.push({ type: "text", text: separator });
    const formatted = formatScalarValue(
      entry as Exclude<BoundRenderableValue, readonly string[]>,
      definition,
      language
    );
    const lines = formatted.split(/\r?\n/u);
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) nodes.push({ type: "line-break" });
      if (line.length === 0) return;
      const kind = valueKindFor(definition);
      nodes.push({
        type: "value",
        value: createBidiValue(line, {
          baseLocale: language,
          digitPolicy: "preserve",
        }),
        ...(kind ? { valueKind: kind } : {}),
      });
    });
  });

  return nodes;
}

function placeholderNodes(
  node: Extract<BoundInlineNode, { type: "PLACEHOLDER" }>,
  language: "en" | "ar"
): readonly BilingualInlineNode[] {
  const prefix = node.required
    ? language === "ar"
      ? "مطلوب"
      : "Required"
    : language === "ar"
      ? "اختياري"
      : "Optional";
  return [
    {
      type: "strong",
      children: [
        {
          type: "text",
          text: `[${prefix}: ${node.label}]`,
        },
      ],
    },
  ];
}

function boundInlineNodes(
  nodes: readonly BoundInlineNode[],
  definitions: ReadonlyMap<string, TemplateVariableDefinition>,
  language: "en" | "ar"
): readonly BilingualInlineNode[] {
  return nodes.flatMap((node): readonly BilingualInlineNode[] => {
    switch (node.type) {
      case "TEXT":
        return text(node.value);
      case "PLACEHOLDER":
        return placeholderNodes(node, language);
      case "VALUE": {
        if (node.language !== language) {
          throw new TypeError(
            `Bound value "${node.variableKey}" reached the wrong language column.`
          );
        }
        const definition = definitions.get(node.variableKey);
        if (!definition) {
          throw new TypeError(
            `Bound value "${node.variableKey}" has no template definition.`
          );
        }
        return valueNodes(node.value, definition, language);
      }
    }
  });
}

function compileBoundDocument(
  bound: BoundContractDocument,
  layout: BilingualLayoutOverrides | undefined
): BilingualDocumentSpec {
  const template = getContractTemplate(bound.template.key);
  if (!template || template.canonicalHash !== bound.template.canonicalHash) {
    throw new TypeError(
      "Bound contract template identity does not match the catalog."
    );
  }
  const definitions = new Map(
    template.variables.map((definition) => [definition.key, definition])
  );
  const notice: PairedSection = {
    id: "contract-template-notice",
    alignmentKey: "contract-template.notice",
    title: {
      en: text("Draft and legal review status"),
      ar: text("حالة المسودة والمراجعة القانونية"),
    },
    blocks: [
      {
        type: "paragraph",
        id: "contract-template-disclaimer",
        content: {
          en: text(bound.disclaimer.en),
          ar: text(bound.disclaimer.ar),
        },
      },
      {
        type: "paragraph",
        id: "contract-template-review-warning",
        content: {
          en: [
            {
              type: "strong",
              children: text(
                "UNREVIEWED — qualified Saudi counsel review is required before execution."
              ),
            },
          ],
          ar: [
            {
              type: "strong",
              children: text(
                "غير مراجع — تلزم مراجعة محامٍ مؤهل في المملكة قبل التوقيع."
              ),
            },
          ],
        },
      },
      {
        type: "paragraph",
        id: "contract-template-version",
        content: {
          en: [
            { type: "text", text: "Pinned template: " },
            {
              type: "value",
              valueKind: "identifier",
              value: createBidiValue(bound.template.versionId, "en"),
            },
          ],
          ar: [
            { type: "text", text: "إصدار القالب المثبت: " },
            {
              type: "value",
              valueKind: "identifier",
              value: createBidiValue(bound.template.versionId, "ar"),
            },
          ],
        },
      },
    ],
  };

  const sections = bound.sections.map(
    (section, sectionIndex): PairedSection => {
      const blocks: PairedBlock[] = [];
      section.clauses.forEach((clause, clauseIndex) => {
        const clauseBase = `s${sectionIndex + 1}.c${clauseIndex + 1}.${stableIdPart(
          clause.id
        )}`;
        blocks.push({
          type: "heading",
          id: `${clauseBase}.heading`,
          level: 3,
          keepWithNext: true,
          content: {
            en: text(clause.title.en),
            ar: text(clause.title.ar),
          },
        });
        clause.blocks.forEach((block, blockIndex) => {
          blocks.push({
            type: "paragraph",
            id: `${clauseBase}.p${blockIndex + 1}.${stableIdPart(block.key)}`,
            content: {
              en: boundInlineNodes(block.content.en, definitions, "en"),
              ar: boundInlineNodes(block.content.ar, definitions, "ar"),
            },
          });
        });
      });

      return {
        id: `contract-section-${sectionIndex + 1}-${stableIdPart(section.key)}`,
        alignmentKey: `contract-template.section.${sectionIndex + 1}.${stableIdPart(
          section.key
        )}`,
        title: {
          en: text(section.title.en),
          ar: text(section.title.ar),
        },
        blocks,
      };
    }
  );

  return parseBilingualDocument({
    id: `contract-template.${stableIdPart(bound.template.key)}`,
    version: bound.template.versionId,
    title: {
      en: text(`DRAFT — ${template.name.en}`),
      ar: text(`مسودة — ${template.name.ar}`),
    },
    sections: [notice, ...sections],
    ...(layout ? { layout } : {}),
  } satisfies BilingualDocumentSpec);
}

/**
 * Bind a catalog template and compile it into the validated bilingual AST.
 */
export function compileContractTemplateDocument(
  templateKey: string,
  bindings: Readonly<Record<string, unknown>>,
  options: CompileContractTemplateDocumentOptions = {}
): ContractTemplateDocumentCompilation {
  const binding = bindContractTemplate(templateKey, bindings, {
    mode: options.mode ?? "PREVIEW",
  });
  if (binding.status === "BLOCKED" || binding.document === null) {
    return Object.freeze({
      status: "BLOCKED" as const,
      document: null,
      binding,
      diagnostics: binding.diagnostics,
    });
  }

  return Object.freeze({
    status: binding.status,
    document: compileBoundDocument(binding.document, options.layout),
    binding,
    diagnostics: binding.diagnostics,
  });
}

function requireCompiledDocument(
  compilation: ContractTemplateDocumentCompilation
): BilingualDocumentSpec {
  if (compilation.status === "BLOCKED" || compilation.document === null) {
    throw new ContractTemplateRenderError(compilation.diagnostics);
  }
  return compilation.document;
}

/** Render a draft HTML preview from the same AST used by PDF generation. */
export function renderContractTemplateDocumentHTML(
  compilation: ContractTemplateDocumentCompilation,
  options: RenderBilingualDocumentOptions = {
    target: "screen",
    includeDocumentShell: true,
  }
): string {
  return renderBilingualHTML(requireCompiledDocument(compilation), options);
}

/**
 * Generate a draft PDF. Variable-complete output still remains visibly
 * UNREVIEWED and is not an executable or legally approved contract.
 */
export async function generateContractTemplateDocumentPdf(
  compilation: ContractTemplateDocumentCompilation,
  options: GenerateBilingualPdfOptions = {}
): Promise<BilingualPdfArtifact> {
  return generateBilingualPdf(requireCompiledDocument(compilation), options);
}

