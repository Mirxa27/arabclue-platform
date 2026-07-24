import { describe, expect, test } from "bun:test";
import {
  CONTRACT_TEMPLATE_CATALOG,
  type ContractTemplateDefinition,
  type TemplateBindingValue,
  type TemplateVariableDefinition,
} from "../document-templates/contract-templates";
import {
  ContractTemplateRenderError,
  compileContractTemplateDocument,
  generateContractTemplateDocumentPdf,
  renderContractTemplateDocumentHTML,
} from "../document-templates/contract-template-renderer";

function valueForVariable(
  variable: TemplateVariableDefinition
): TemplateBindingValue {
  if (variable.valueDirection === "LOCALIZED") {
    if (variable.type === "LIST") {
      return {
        en: ["English list item one", "English list item two"],
        ar: ["البند العربي الأول", "البند العربي الثاني"],
      };
    }
    return {
      en: `English value for ${variable.key}`,
      ar: `قيمة عربية للمتغير ${variable.key}`,
    };
  }

  switch (variable.type) {
    case "STRING":
    case "RICH_TEXT":
    case "ENTITY":
      return `Neutral-${variable.key}`;
    case "NUMBER":
      return 15;
    case "MONEY":
      return { amount: 1_234.5, currency: "SAR" };
    case "PERCENT":
      return 7.25;
    case "DATE":
      return "2026-12-31";
    case "BOOLEAN":
      return true;
    case "LIST":
      throw new Error("A LIST variable must be localized.");
  }
}

function completeBindings(
  template: ContractTemplateDefinition
): Record<string, TemplateBindingValue> {
  return Object.fromEntries(
    template.variables.map((variable) => [
      variable.key,
      valueForVariable(variable),
    ])
  );
}

function occurrenceCount(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("contract template bilingual renderer", () => {
  test("renders visible preview placeholders and immutable draft safeguards", () => {
    const compilation = compileContractTemplateDocument(
      "it-services-v1",
      {},
      { mode: "PREVIEW" }
    );

    expect(compilation.status).toBe("READY_WITH_DIAGNOSTICS");
    expect(compilation.document).not.toBeNull();
    expect(Object.isFrozen(compilation.document)).toBe(true);

    const html = renderContractTemplateDocumentHTML(compilation);
    expect(html).toContain("DRAFT — IT Services Agreement");
    expect(html).toContain("مسودة — اتفاقية خدمات تقنية المعلومات");
    expect(html).toContain("UNREVIEWED");
    expect(html).toContain("غير مراجع");
    expect(html).toContain("[Required:");
    expect(html).toContain("[مطلوب:");
    expect(html).toContain("it-services-v1@1");
    expect(html.match(/<h1\b/gu)).toHaveLength(1);
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  test("keeps independently supplied narratives and lists in their language columns", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings = completeBindings(template);
    bindings["input.scopeDescription"] = {
      en: "R&D > verified English scope\nSecond English line",
      ar: "نطاق عربي موثق ومستقل\nالسطر العربي الثاني",
    };
    bindings["input.governanceContacts"] = {
      en: ["English owner", "English approver"],
      ar: ["المالك العربي", "المعتمد العربي"],
    };

    const compilation = compileContractTemplateDocument(
      template.key,
      bindings,
      { mode: "FINAL" }
    );
    expect(compilation.status).toBe("READY");
    expect(compilation.diagnostics).toEqual([]);

    const html = renderContractTemplateDocumentHTML(compilation);
    expect(html).toContain("R&amp;D &gt; verified English scope");
    expect(html).toContain("Second English line");
    expect(html).toContain("نطاق عربي موثق ومستقل");
    expect(html).toContain("السطر العربي الثاني");
    expect(html).toContain("English owner");
    expect(html).toContain("المالك العربي");
    expect(occurrenceCount(html, "R&amp;D &gt; verified English scope")).toBe(1);
    expect(occurrenceCount(html, "نطاق عربي موثق ومستقل")).toBe(1);
    expect(html).not.toContain("[Required:");
    expect(html).not.toMatch(/\{\{[^{}]+\}\}/u);
    expect(html).not.toMatch(
      /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
    );
  });

  test("formats neutral dates, money, percentages, and identifiers without raw markup", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings = completeBindings(template);
    bindings["input.tenderReference"] = "RFP-2026-0042";
    bindings["input.liabilityCap"] = {
      amount: 1_234.5,
      currency: "SAR",
    };
    bindings["input.serviceCreditPercent"] = 7.25;

    const compilation = compileContractTemplateDocument(
      template.key,
      bindings,
      { mode: "FINAL" }
    );
    const html = renderContractTemplateDocumentHTML(compilation);

    expect(occurrenceCount(html, "RFP-2026-0042")).toBe(2);
    expect(occurrenceCount(html, "SAR")).toBeGreaterThanOrEqual(2);
    expect(html).toContain("7.25%");
    expect(html).toContain("bilingual-value--currency");
    expect(html).toContain("bilingual-value--identifier");
    expect(html).toContain("bilingual-value--number");
  });

  test("blocks final rendering when either localized value is absent", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings: Record<string, unknown> = completeBindings(template);
    bindings["input.scopeDescription"] = {
      en: "English only",
    };

    const compilation = compileContractTemplateDocument(
      template.key,
      bindings,
      { mode: "FINAL" }
    );

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.document).toBeNull();
    expect(
      compilation.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "MISSING_BINDING_LOCALE" &&
          diagnostic.path.endsWith(".ar")
      )
    ).toBe(true);
    expect(() => renderContractTemplateDocumentHTML(compilation)).toThrow(
      ContractTemplateRenderError
    );
  });

  test("reports unknown templates without manufacturing a document", () => {
    const compilation = compileContractTemplateDocument(
      "unknown-template",
      {},
      { mode: "PREVIEW" }
    );

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.diagnostics).toEqual([
      {
        code: "UNKNOWN_TEMPLATE",
        severity: "ERROR",
        path: "templateKey",
        variableKey: null,
        message: 'Unknown contract template "unknown-template".',
      },
    ]);
  });
});

test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
  "variable-complete template produces a real font-embedded draft PDF",
  async () => {
    const template = CONTRACT_TEMPLATE_CATALOG["nda-v1"];
    const compilation = compileContractTemplateDocument(
      template.key,
      completeBindings(template),
      { mode: "FINAL" }
    );
    const artifact = await generateContractTemplateDocumentPdf(compilation);

    expect(artifact.pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(artifact.pdf.byteLength).toBeGreaterThan(20_000);
    expect(artifact.quality.valid).toBe(true);
  },
  120_000
);
