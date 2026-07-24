import { describe, expect, test } from "bun:test";
import {
  ContractDraftPersistenceError,
  assertContractDraftSerializedOutputBudget,
  contractDraftWriteSchema,
  prepareContractDraft,
  validatePersistedContractDraft,
  type ContractDraftSafetyRecord,
  type PreparedContractDraft,
} from "../contract-template-persistence";
import {
  getContractTemplate,
  type ContractTemplateDefinition,
  type TemplateBindingValue,
  type TemplateVariableDefinition,
} from "../document-templates/contract-templates";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

function input(
  overrides: Partial<ReturnType<typeof contractDraftWriteSchema.parse>> = {}
) {
  const template = getContractTemplate("nda-v1");
  if (!template) throw new Error("NDA test template is missing.");
  return contractDraftWriteSchema.parse({
    templateKey: template.key,
    expectedVersionId: template.versionId,
    expectedCanonicalHash: template.canonicalHash,
    clientRequestId: REQUEST_ID,
    mode: "PREVIEW",
    bindings: {},
    projectId: null,
    ...overrides,
  });
}

function persistedRecord(
  prepared: PreparedContractDraft
): ContractDraftSafetyRecord {
  const now = new Date("2026-07-24T12:00:00.000Z");
  return {
    id: "draft-1",
    workspaceId: "workspace-1",
    templateId: "template-db-1",
    templateVersionId: "template-version-db-1",
    projectId: prepared.projectId,
    title: prepared.title,
    titleAr: prepared.titleAr,
    dataJson: prepared.serialized.dataJson,
    clausesJson: prepared.serialized.clausesJson,
    contentHtml: prepared.contentHtml,
    documentSpecJson: prepared.serialized.documentSpecJson,
    canonicalHash: prepared.canonicalHash,
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    isExecutable: false,
    contentPdfPath: null,
    status: "draft",
    createdBy: "user-1",
    clientRequestId: prepared.clientRequestId,
    generationSchemaVersion: 1,
    generationMode: prepared.mode,
    diagnosticCount: prepared.diagnostics.length,
    storageBytes: prepared.storageBytes,
    createdAt: now,
    updatedAt: now,
    template: {
      id: "template-db-1",
      workspaceId: "workspace-1",
      catalogKey: prepared.template.key,
      canonicalHash: prepared.template.canonicalHash,
      lifecycle: "DRAFT",
      legalReviewStatus: "UNREVIEWED",
      counselReviewRequired: true,
      isApproved: false,
    },
    templateVersion: {
      id: "template-version-db-1",
      templateId: "template-db-1",
      version: prepared.template.versionId,
      canonicalHash: prepared.template.canonicalHash,
      lifecycle: "DRAFT",
      legalReviewStatus: "UNREVIEWED",
      counselReviewRequired: true,
    },
  };
}

function valueForVariable(
  variable: TemplateVariableDefinition
): TemplateBindingValue {
  if (variable.valueDirection === "LOCALIZED") {
    if (variable.type === "LIST") {
      return {
        en: ["Verified English item"],
        ar: ["بند عربي موثق"],
      };
    }
    return {
      en: `Verified English ${variable.key}`,
      ar: `قيمة عربية موثقة ${variable.key}`,
    };
  }
  switch (variable.type) {
    case "STRING":
    case "RICH_TEXT":
    case "ENTITY":
      return `Neutral-${variable.key}`;
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
      throw new Error("Localized list expected.");
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

describe("contract-template draft persistence preparation", () => {
  test("prepares a canonical, visibly unreviewed, non-executable preview draft", () => {
    const prepared = prepareContractDraft(input());
    const record = persistedRecord(prepared);

    expect(prepared.mode).toBe("PREVIEW");
    expect(prepared.diagnostics.length).toBeGreaterThan(0);
    expect(prepared.canonicalHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(prepared.contentHtml).toContain("UNREVIEWED");
    expect(prepared.contentHtml).toContain("غير مراجع");
    expect(prepared.data.template).toMatchObject({
      key: prepared.template.key,
      versionId: prepared.template.versionId,
      canonicalHash: prepared.template.canonicalHash,
    });
    expect(prepared.data.template.catalogFingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/u
    );
    expect(prepared.boundClauses.sections.length).toBeGreaterThan(0);
    expect(prepared.storageBytes).toBeGreaterThan(0);
    expect(validatePersistedContractDraft(record)).toBe(true);
    expect(record.legalReviewStatus).toBe("UNREVIEWED");
    expect(record.counselReviewRequired).toBe(true);
    expect(record.isExecutable).toBe(false);
  });

  test("rejects compiled serialized output that exceeds its post-render byte budget", () => {
    expect(() =>
      assertContractDraftSerializedOutputBudget(
        {
          dataJson: "1234",
          clausesJson: "1234",
          documentSpecJson: "1234",
          contentHtml: "1234",
        },
        15
      )
    ).toThrow(
      expect.objectContaining({
        code: "CONTRACT_DRAFT_OUTPUT_TOO_LARGE",
        status: 413,
      }) as ContractDraftPersistenceError
    );
  });

  test("is deterministic when binding object insertion order changes", () => {
    const a = prepareContractDraft(
      input({
        bindings: {
          "input.disclosurePeriod": 10,
          "input.confidentialityPeriod": 20,
        },
      })
    );
    const b = prepareContractDraft(
      input({
        bindings: {
          "input.confidentialityPeriod": 20,
          "input.disclosurePeriod": 10,
        },
      })
    );

    expect(a.canonicalHash).toBe(b.canonicalHash);
    expect(a.contentHtml).toBe(b.contentHtml);
  });

  test("rejects stale client catalog identities before compilation is stored", () => {
    expect(() =>
      prepareContractDraft(
        input({
          expectedCanonicalHash: `sha256:${"0".repeat(64)}`,
        })
      )
    ).toThrow(
      expect.objectContaining({
        code: "CONTRACT_TEMPLATE_STALE",
        status: 409,
      }) as ContractDraftPersistenceError
    );
  });

  test("blocks FINAL persistence when required variables are unresolved", () => {
    try {
      prepareContractDraft(input({ mode: "FINAL", bindings: {} }));
      throw new Error("Expected FINAL preparation to be blocked.");
    } catch (error) {
      expect(error).toBeInstanceOf(ContractDraftPersistenceError);
      const persistenceError = error as ContractDraftPersistenceError;
      expect(persistenceError.code).toBe("CONTRACT_TEMPLATE_BLOCKED");
      expect(persistenceError.status).toBe(422);
      expect(
        persistenceError.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "MISSING_REQUIRED_VARIABLE" &&
            diagnostic.severity === "ERROR"
        )
      ).toBe(true);
    }
  });

  test("persists variable-complete FINAL as unreviewed and non-executable", () => {
    const template = getContractTemplate("nda-v1");
    if (!template) throw new Error("NDA test template is missing.");
    const prepared = prepareContractDraft(
      input({ mode: "FINAL", bindings: completeBindings(template) })
    );
    const record = persistedRecord(prepared);

    expect(prepared.mode).toBe("FINAL");
    expect(
      prepared.diagnostics.some(
        (diagnostic) => diagnostic.severity === "ERROR"
      )
    ).toBe(false);
    expect(record.legalReviewStatus).toBe("UNREVIEWED");
    expect(record.counselReviewRequired).toBe(true);
    expect(record.isExecutable).toBe(false);
    expect(validatePersistedContractDraft(record)).toBe(true);
  });

  test("fails closed when stored content, canonical state, or executable state is changed", () => {
    const prepared = prepareContractDraft(input());
    const valid = persistedRecord(prepared);

    expect(
      validatePersistedContractDraft({
        ...valid,
        contentHtml: `${valid.contentHtml}\n<!-- changed -->`,
      })
    ).toBe(false);
    expect(
      validatePersistedContractDraft({
        ...valid,
        canonicalHash: `sha256:${"f".repeat(64)}`,
      })
    ).toBe(false);
    expect(
      validatePersistedContractDraft({
        ...valid,
        isExecutable: true,
      })
    ).toBe(false);
    expect(
      validatePersistedContractDraft({
        ...valid,
        contentPdfPath: "unsafe/final.pdf",
      })
    ).toBe(false);
    expect(
      validatePersistedContractDraft({
        ...valid,
        title: "APPROVED CONTRACT",
      })
    ).toBe(false);
    expect(
      validatePersistedContractDraft({
        ...valid,
        template: { ...valid.template, legalReviewStatus: "APPROVED" },
      })
    ).toBe(false);
  });
});
