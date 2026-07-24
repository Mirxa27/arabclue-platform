import { describe, expect, test } from "bun:test";
import {
  CONTRACT_CLAUSE_CATALOG,
  CONTRACT_TEMPLATE_CATALOG,
  CONTRACT_TEMPLATE_KEYS,
  bindContractTemplate,
  computeCanonicalHash,
  computeContractTemplateHash,
  getContractClause,
  getContractTemplate,
  type ContractTemplateDefinition,
  type TemplateBindingValue,
  type TemplateVariableDefinition,
} from "../document-templates/contract-templates";

const EXPECTED_TEMPLATE_KEYS = [
  "it-services-v1",
  "goods-supply-v1",
  "professional-services-v1",
  "nda-v1",
  "subcontract-v1",
  "framework-calloff-v1",
  "saas-data-v1",
] as const;

function valueForVariable(
  variable: TemplateVariableDefinition
): TemplateBindingValue {
  if (variable.valueDirection === "LOCALIZED") {
    if (variable.type === "LIST") {
      return {
        en: ["Verified English item one", "Verified English item two"],
        ar: ["بند عربي موثق واحد", "بند عربي موثق اثنان"],
      };
    }
    return {
      en: `Verified English value for ${variable.key}`,
      ar: `قيمة عربية موثقة للمتغير ${variable.key}`,
    };
  }

  switch (variable.type) {
    case "STRING":
    case "RICH_TEXT":
    case "ENTITY":
      return `Verified value for ${variable.key}`;
    case "NUMBER":
      return 10;
    case "MONEY":
      return { amount: 1_000, currency: "SAR" };
    case "PERCENT":
      return 5;
    case "DATE":
      return "2026-12-31";
    case "BOOLEAN":
      return true;
    case "LIST":
      throw new Error("LIST variables must declare LOCALIZED value direction.");
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

function allClauseText(): string[] {
  return Object.values(CONTRACT_CLAUSE_CATALOG).flatMap((clause) =>
    clause.blocks.flatMap((block) => [
      ...block.content.en
        .filter((node) => node.type === "TEXT")
        .map((node) => node.value),
      ...block.content.ar
        .filter((node) => node.type === "TEXT")
        .map((node) => node.value),
    ])
  );
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child);
  }
}

describe("contract template catalog", () => {
  test("contains exactly the seven approved architecture families", () => {
    expect(CONTRACT_TEMPLATE_KEYS).toEqual(EXPECTED_TEMPLATE_KEYS);
    expect(Object.keys(CONTRACT_TEMPLATE_CATALOG)).toEqual(
      EXPECTED_TEMPLATE_KEYS
    );
  });

  test("provides at least twenty versioned reusable bilingual clauses", () => {
    const clauses = Object.values(CONTRACT_CLAUSE_CATALOG);

    expect(clauses.length).toBeGreaterThanOrEqual(20);
    expect(new Set(clauses.map((clause) => clause.id)).size).toBe(
      clauses.length
    );
    for (const clause of clauses) {
      expect(clause.version).toBe(1);
      expect(clause.versionId).toBe(`${clause.id}@1`);
      expect(clause.title.en.length).toBeGreaterThan(0);
      expect(clause.title.ar.length).toBeGreaterThan(0);
      expect(clause.blocks.length).toBeGreaterThan(0);
      expect(clause.canonicalHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  test("keeps every seeded template and clause visibly unreviewed", () => {
    for (const template of Object.values(CONTRACT_TEMPLATE_CATALOG)) {
      expect(template.lifecycle).toBe("DRAFT");
      expect(template.legalReview.status).toBe("UNREVIEWED");
      expect(template.counselReviewRequired).toBe(true);
      expect(template.disclaimer.en.toLowerCase()).toContain(
        "not legal advice"
      );
      expect(template.disclaimer.en.toLowerCase()).toContain("not approved");
      expect(template.disclaimer.ar).toContain("ليست استشارة قانونية");
    }

    for (const clause of Object.values(CONTRACT_CLAUSE_CATALOG)) {
      expect(clause.lifecycle).toBe("DRAFT");
      expect(clause.provenance.legalReview.status).toBe("UNREVIEWED");
      expect(clause.counselReviewRequired).toBe(true);
      expect(clause.provenance.sources).toEqual([]);
      expect(clause.provenance.sourceStatus).toBe(
        "PENDING_OFFICIAL_SOURCE_REVIEW"
      );
      expect(clause.applicabilityNotes.en.length).toBeGreaterThan(0);
      expect(clause.applicabilityNotes.ar.length).toBeGreaterThan(0);
    }
  });

  test("uses structured bilingual nodes without raw markup or executable data", () => {
    const serialized = JSON.stringify(CONTRACT_CLAUSE_CATALOG);
    expect(serialized).not.toContain("{{");
    expect(serialized).not.toContain("rawHtml");
    expect(serialized).not.toContain("dangerouslySetInnerHTML");

    for (const clause of Object.values(CONTRACT_CLAUSE_CATALOG)) {
      for (const block of clause.blocks) {
        expect(block.type).toBe("PARAGRAPH");
        expect(block.content.translationStatus).toBe("DRAFT");
        expect(block.content.precedence).toBe("UNSPECIFIED");
        expect(block.content.en.length).toBeGreaterThan(0);
        expect(block.content.ar.length).toBeGreaterThan(0);
        for (const node of [...block.content.en, ...block.content.ar]) {
          expect(["TEXT", "VARIABLE"]).toContain(node.type);
          expect(typeof node).toBe("object");
          expect(
            Object.values(node).some((value) => typeof value === "function")
          ).toBe(false);
        }
      }
    }
  });

  test("declares safe schemas for every referenced variable", () => {
    const variableKeyPattern =
      /^(?:project|workspace|brand|input|derived|approvedKnowledge)\.[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/;

    for (const clause of Object.values(CONTRACT_CLAUSE_CATALOG)) {
      const definitions = new Map(
        clause.variables.map((variable) => [variable.key, variable])
      );
      expect(definitions.size).toBe(clause.variables.length);

      for (const variable of clause.variables) {
        expect(variable.key).toMatch(variableKeyPattern);
        expect(variable.label.en.length).toBeGreaterThan(0);
        expect(variable.label.ar.length).toBeGreaterThan(0);
        expect(["LOCALIZED", "DIRECTION_NEUTRAL"]).toContain(
          variable.valueDirection
        );
        if (["RICH_TEXT", "LIST"].includes(variable.type)) {
          expect(variable.valueDirection).toBe("LOCALIZED");
        }
        expect("default" in variable).toBe(false);
      }
      for (const block of clause.blocks) {
        for (const node of [...block.content.en, ...block.content.ar]) {
          if (node.type === "VARIABLE") {
            expect(definitions.has(node.variableKey)).toBe(true);
          }
        }
      }
    }
  });

  test("binds only existing clauses and has unique section keys", () => {
    for (const template of Object.values(CONTRACT_TEMPLATE_CATALOG)) {
      expect(new Set(template.sections.map((section) => section.key)).size).toBe(
        template.sections.length
      );
      expect(template.variables.length).toBeGreaterThan(0);

      for (const section of template.sections) {
        expect(section.title.en.length).toBeGreaterThan(0);
        expect(section.title.ar.length).toBeGreaterThan(0);
        expect(section.clauseIds.length).toBeGreaterThan(0);
        for (const clauseId of section.clauseIds) {
          expect(getContractClause(clauseId)).toBeDefined();
        }
      }
    }
  });

  test("deep-freezes public catalog definitions", () => {
    expectDeeplyFrozen(CONTRACT_TEMPLATE_KEYS);
    expectDeeplyFrozen(CONTRACT_CLAUSE_CATALOG);
    expectDeeplyFrozen(CONTRACT_TEMPLATE_CATALOG);

    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const originalName = template.name.en;
    expect(Reflect.set(template.name, "en", "Mutated")).toBe(false);
    expect(template.name.en).toBe(originalName);
  });

  test("does not seed tender-specific prices, penalties, or percentages", () => {
    for (const text of allClauseText()) {
      expect(text).not.toMatch(
        /(?:SAR|ريال)\s*[\d,]+|\b\d+(?:\.\d+)?\s*%/iu
      );
    }
    for (const clause of Object.values(CONTRACT_CLAUSE_CATALOG)) {
      for (const variable of clause.variables) {
        expect("default" in variable).toBe(false);
      }
    }
  });
});

describe("canonical template identity", () => {
  test("canonicalizes object keys independently of insertion order", () => {
    expect(computeCanonicalHash({ b: 2, a: 1 })).toBe(
      computeCanonicalHash({ a: 1, b: 2 })
    );
    expect(computeCanonicalHash({ a: [1, 2] })).not.toBe(
      computeCanonicalHash({ a: [2, 1] })
    );
  });

  test("recomputes every stored template hash deterministically", () => {
    for (const template of Object.values(CONTRACT_TEMPLATE_CATALOG)) {
      expect(template.version).toBe(1);
      expect(template.versionId).toBe(`${template.key}@1`);
      expect(computeContractTemplateHash(template)).toBe(
        template.canonicalHash
      );
    }
  });

  test("changes the hash when canonical content or version changes", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["nda-v1"];
    const baseHash = computeContractTemplateHash(template);

    expect(
      computeCanonicalHash({
        key: template.key,
        version: template.version,
        title: template.name,
      })
    ).not.toBe(
      computeCanonicalHash({
        key: template.key,
        version: 2,
        title: template.name,
      })
    );
    expect(
      computeCanonicalHash({
        key: template.key,
        version: template.version,
        title: { ...template.name, en: "Changed title" },
      })
    ).not.toBe(baseHash);
  });

  test("returns catalog entries without manufacturing unknown definitions", () => {
    expect(getContractTemplate("nda-v1")?.key).toBe("nda-v1");
    expect(getContractTemplate("not-a-template")).toBeUndefined();
    expect(getContractClause("not-a-clause")).toBeUndefined();
  });

  test("rejects unsupported canonical values", () => {
    expect(() => computeCanonicalHash({ value: Number.NaN })).toThrow();
    expect(() => computeCanonicalHash({ value: undefined })).toThrow();
    expect(() => computeCanonicalHash(new Date())).toThrow();

    const circularArray: unknown[] = [];
    circularArray.push(circularArray);
    expect(() => computeCanonicalHash(circularArray)).toThrow();

    const circularObject: { self?: unknown } = {};
    circularObject.self = circularObject;
    expect(() => computeCanonicalHash(circularObject)).toThrow();

    const symbolObject: Record<PropertyKey, unknown> = { value: 1 };
    symbolObject[Symbol("unsupported")] = 2;
    expect(() => computeCanonicalHash(symbolObject)).toThrow();

    const accessorObject = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => 1,
    });
    expect(() => computeCanonicalHash(accessorObject)).toThrow();
  });
});

describe("safe contract variable binding", () => {
  test("renders explicit preview placeholders with missing-value diagnostics", () => {
    const result = bindContractTemplate("it-services-v1", {}, {
      mode: "PREVIEW",
    });

    expect(result.status).toBe("READY_WITH_DIAGNOSTICS");
    expect(result.document).not.toBeNull();
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "MISSING_REQUIRED_VARIABLE" &&
          diagnostic.severity === "ERROR"
      )
    ).toBe(true);
    const serialized = JSON.stringify(result.document);
    expect(serialized).toContain('"type":"PLACEHOLDER"');
    expect(serialized).not.toContain("{{");
  });

  test("blocks final output when required variables are missing", () => {
    const result = bindContractTemplate("goods-supply-v1", {}, {
      mode: "FINAL",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.document).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test("produces token-free structured final output for valid bindings", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings = completeBindings(template);
    const snapshot = structuredClone(bindings);
    const listBinding = Object.values(bindings).find(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "en" in value &&
        Array.isArray(value.en)
    );
    const moneyBinding = Object.values(bindings).find(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "currency" in value
    );
    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });

    expect(result.status).toBe("READY");
    expect(result.document).not.toBeNull();
    expect(result.diagnostics).toEqual([]);
    const serialized = JSON.stringify(result.document);
    expect(serialized).not.toContain('"type":"VARIABLE"');
    expect(serialized).not.toContain('"type":"PLACEHOLDER"');
    expect(serialized).not.toMatch(/\{\{[^{}]+\}\}/);
    expect(bindings).toEqual(snapshot);
    expect(Object.isFrozen(listBinding)).toBe(false);
    expect(Object.isFrozen(moneyBinding)).toBe(false);
  });

  test("binds localized narratives and lists to their matching language only", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings = completeBindings(template);
    bindings["input.scopeDescription"] = {
      en: "English-only verified scope statement.",
      ar: "بيان نطاق عربي موثق فقط.",
    };
    bindings["input.governanceContacts"] = {
      en: ["English governance contact"],
      ar: ["جهة اتصال الحوكمة العربية"],
    };

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });
    expect(result.status).toBe("READY");
    if (!result.document) throw new Error("Expected a bound document.");

    const values = result.document.sections.flatMap((section) =>
      section.clauses.flatMap((clause) =>
        clause.blocks.flatMap((block) => [
          ...block.content.en,
          ...block.content.ar,
        ])
      )
    );
    const englishScope = values.find(
      (node) =>
        node.type === "VALUE" &&
        node.variableKey === "input.scopeDescription" &&
        node.language === "en"
    );
    const arabicScope = values.find(
      (node) =>
        node.type === "VALUE" &&
        node.variableKey === "input.scopeDescription" &&
        node.language === "ar"
    );
    const englishContacts = values.find(
      (node) =>
        node.type === "VALUE" &&
        node.variableKey === "input.governanceContacts" &&
        node.language === "en"
    );
    const arabicContacts = values.find(
      (node) =>
        node.type === "VALUE" &&
        node.variableKey === "input.governanceContacts" &&
        node.language === "ar"
    );

    expect(englishScope).toEqual(
      expect.objectContaining({
        value: "English-only verified scope statement.",
        valueDirection: "LOCALIZED",
      })
    );
    expect(arabicScope).toEqual(
      expect.objectContaining({
        value: "بيان نطاق عربي موثق فقط.",
        valueDirection: "LOCALIZED",
      })
    );
    expect(englishContacts).toEqual(
      expect.objectContaining({ value: ["English governance contact"] })
    );
    expect(arabicContacts).toEqual(
      expect.objectContaining({ value: ["جهة اتصال الحوكمة العربية"] })
    );
  });

  test("blocks final output when either required localized value is missing", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings = completeBindings(template);
    bindings["input.scopeDescription"] = {
      en: "Verified English scope.",
      ar: "",
    };

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.document).toBeNull();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_BINDING_LOCALE",
          path: "bindings.input.scopeDescription.ar",
          variableKey: "input.scopeDescription",
        }),
      ])
    );
  });

  test("allows an explicitly direction-neutral technical identifier in both columns", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const tenderReference = template.variables.find(
      (variable) => variable.key === "input.tenderReference"
    );
    expect(tenderReference?.valueDirection).toBe("DIRECTION_NEUTRAL");
    const bindings = completeBindings(template);
    bindings["input.tenderReference"] = "RFP-2026-0042";

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });
    expect(result.status).toBe("READY");
    if (!result.document) throw new Error("Expected a bound document.");
    const tenderValues = result.document.sections.flatMap((section) =>
      section.clauses.flatMap((clause) =>
        clause.blocks.flatMap((block) =>
          [...block.content.en, ...block.content.ar].filter(
            (node) =>
              node.type === "VALUE" &&
              node.variableKey === "input.tenderReference"
          )
        )
      )
    );
    expect(tenderValues.length).toBeGreaterThan(0);
    expect(
      tenderValues.every(
        (node) =>
          node.type === "VALUE" &&
          node.value === "RFP-2026-0042" &&
          node.valueDirection === "DIRECTION_NEUTRAL"
      )
    ).toBe(true);
  });

  test("omits an absent optional variable without leaving a final token", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["nda-v1"];
    const bindings = completeBindings(template);
    const optional = template.variables.find(
      (variable) => variable.required === false
    );
    expect(optional).toBeDefined();
    if (optional) {
      delete bindings[optional.key];
    }

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });

    expect(result.status).toBe("READY");
    expect(result.document).not.toBeNull();
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "OPTIONAL_VARIABLE_OMITTED" &&
          diagnostic.variableKey === optional?.key
      )
    ).toBe(true);
    expect(JSON.stringify(result.document)).not.toContain("{{");
  });

  test("diagnoses unknown and mistyped values instead of coercing them", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["professional-services-v1"];
    const bindings = completeBindings(template);
    bindings["input.clientLegalName"] = 42;
    bindings["input.unregisteredValue"] = "unsafe";

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.document).toBeNull();
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain("INVALID_VARIABLE_TYPE");
    expect(
      result.diagnostics.map((diagnostic) => diagnostic.code)
    ).toContain("UNKNOWN_VARIABLE");
  });

  test("blocks raw markup, direction controls, and unresolved token syntax", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];

    for (const unsafeValue of [
      "<script>alert(1)</script>",
      "Value {{input.missing}}",
      "safe\u202eunsafe",
    ]) {
      const bindings = completeBindings(template);
      bindings["input.scopeDescription"] = {
        en: unsafeValue,
        ar: "قيمة عربية آمنة",
      };
      const result = bindContractTemplate(template.key, bindings, {
        mode: "FINAL",
      });

      expect(result.status).toBe("BLOCKED");
      expect(result.document).toBeNull();
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.code === "UNSAFE_BINDING_VALUE"
        )
      ).toBe(true);
    }
  });

  test("validates money, percent, date, number, and list shapes", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["framework-calloff-v1"];
    const bindings = completeBindings(template);
    const typedVariables = template.variables.filter((variable) =>
      ["MONEY", "PERCENT", "DATE", "NUMBER", "LIST"].includes(variable.type)
    );
    expect(typedVariables.length).toBeGreaterThan(0);

    for (const variable of typedVariables) {
      const invalidBindings = { ...bindings, [variable.key]: "not-valid" };
      const result = bindContractTemplate(template.key, invalidBindings, {
        mode: "FINAL",
      });
      expect(result.status).toBe("BLOCKED");
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "INVALID_VARIABLE_TYPE" &&
            diagnostic.variableKey === variable.key
        )
      ).toBe(true);
    }
  });

  test("rejects money objects with undeclared fields", () => {
    const template = CONTRACT_TEMPLATE_CATALOG["it-services-v1"];
    const bindings: Record<string, unknown> = completeBindings(template);
    bindings["input.liabilityCap"] = {
      amount: 1_000,
      currency: "SAR",
      rawHtml: "<script>alert(1)</script>",
    };

    const result = bindContractTemplate(template.key, bindings, {
      mode: "FINAL",
    });

    expect(result.status).toBe("BLOCKED");
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "INVALID_VARIABLE_TYPE" &&
          diagnostic.variableKey === "input.liabilityCap"
      )
    ).toBe(true);
  });

  test("returns a blocked diagnostic for an unknown template key", () => {
    const result = bindContractTemplate("missing-template", {}, {
      mode: "FINAL",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.document).toBeNull();
    expect(result.diagnostics).toEqual([
      {
        code: "UNKNOWN_TEMPLATE",
        severity: "ERROR",
        path: "templateKey",
        variableKey: null,
        message: 'Unknown contract template "missing-template".',
      },
    ]);
  });
});
