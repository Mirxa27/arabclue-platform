import { describe, expect, test } from "bun:test";
import {
  FORCED_TEMPLATE_SAFETY_INPUT_KEYS,
  TEMPLATE_CONTENT_SCHEMA_VERSION,
  TEMPLATE_FIELD_BOUNDS,
  TEMPLATE_SECTION_TEXT_MAX_LENGTH,
  TEMPLATE_VALIDATION_CODES,
  WORKSPACE_TEMPLATE_SAFETY,
  WORKSPACE_TEMPLATE_VARIABLE_TYPES,
  WORKSPACE_TEMPLATE_VARIABLE_TYPE_LABEL_KEYS,
  collectTemplateVariableReferences,
  isReservedTemplateKey,
  parseWorkspaceTemplateContent,
  parseWorkspaceTemplateSubmission,
  renderTemplateSectionText,
  serializeWorkspaceTemplateContent,
  templateKeyInUseFailure,
  workspaceTemplateCanonicalHash,
  type WorkspaceTemplateNode,
  type WorkspaceTemplateValidationFailure,
} from "../../contract-template-schema";
import { getCompletionErrorContract, localizationRegistry } from "../../i18n";
import { CONTRACT_TEMPLATE_KEYS } from "../../document-templates/contract-templates";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

type SubmissionOverrides = Record<string, unknown>;

function section(overrides: SubmissionOverrides = {}) {
  return {
    key: "preamble",
    titleAr: "التمهيد",
    titleEn: "Preamble",
    contentAr: [
      { type: "TEXT", value: "أبرم هذا العقد بين " },
      { type: "VARIABLE", variableKey: "clientName" },
    ] satisfies WorkspaceTemplateNode[],
    contentEn: [
      { type: "TEXT", value: "This contract is entered into by " },
      { type: "VARIABLE", variableKey: "clientName" },
    ] satisfies WorkspaceTemplateNode[],
    ...overrides,
  };
}

function variable(overrides: SubmissionOverrides = {}) {
  return {
    key: "clientName",
    type: "TEXT",
    labelAr: "اسم العميل",
    labelEn: "Client name",
    required: true,
    ...overrides,
  };
}

function submission(overrides: SubmissionOverrides = {}) {
  return {
    key: "workspace-services-agreement",
    titleAr: "اتفاقية خدمات",
    titleEn: "Services agreement",
    sections: [section()],
    variables: [variable()],
    clauseBindings: [
      { clauseKey: "clause.parties", sectionKey: "preamble", order: 0 },
    ],
    ...overrides,
  };
}

function accept(overrides: SubmissionOverrides = {}) {
  const result = parseWorkspaceTemplateSubmission(submission(overrides));
  if (!result.ok) {
    throw new Error(
      `Expected an accepted submission, received ${result.failure.code} at ${result.failure.fieldPaths.join(", ")}`
    );
  }
  return result.value;
}

function reject(overrides: SubmissionOverrides = {}) {
  const result = parseWorkspaceTemplateSubmission(submission(overrides));
  if (result.ok) {
    throw new Error("Expected the submission to be rejected");
  }
  return result.failure;
}

/* -------------------------------------------------------------------------- */
/* Accepted submissions                                                       */
/* -------------------------------------------------------------------------- */

describe("workspace template submission acceptance (criteria 6.1, 6.4)", () => {
  test("returns canonical content, hash, and referenced variables", () => {
    const accepted = accept();

    expect(accepted.key).toBe("workspace-services-agreement");
    expect(accepted.content.schemaVersion).toBe(TEMPLATE_CONTENT_SCHEMA_VERSION);
    expect(accepted.content.sections).toHaveLength(1);
    expect(accepted.content.variables[0]?.choices).toEqual([]);
    expect(accepted.referencedVariableKeys).toEqual(["clientName"]);
    expect(accepted.canonicalHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(accepted.canonicalJson).toBe(
      serializeWorkspaceTemplateContent(accepted.content)
    );
    expect(workspaceTemplateCanonicalHash(accepted.content)).toBe(
      accepted.canonicalHash
    );
  });

  test("canonicalizes a typed token into a variable node", () => {
    const accepted = accept({
      sections: [
        section({
          contentEn: [
            { type: "TEXT", value: "Signed by {{ clientName }} today." },
          ],
        }),
      ],
    });

    expect(accepted.content.sections[0]?.contentEn).toEqual([
      { type: "TEXT", value: "Signed by " },
      { type: "VARIABLE", variableKey: "clientName" },
      { type: "TEXT", value: " today." },
    ]);
    expect(accepted.referencedVariableKeys).toEqual(["clientName"]);
  });

  test("accepts a single-choice declaration with options", () => {
    const accepted = accept({
      variables: [
        variable({
          type: "SINGLE_CHOICE",
          choices: [
            { value: "monthly", labelAr: "شهري", labelEn: "Monthly" },
            { value: "yearly", labelAr: "سنوي", labelEn: "Yearly" },
          ],
        }),
      ],
    });

    expect(accepted.content.variables[0]?.type).toBe("SINGLE_CHOICE");
    expect(accepted.content.variables[0]?.choices).toHaveLength(2);
  });

  test("accepts the maximum section and variable counts", () => {
    const sections = Array.from(
      { length: TEMPLATE_FIELD_BOUNDS.sections.max },
      (_unused, index) =>
        section({
          key: `section-${index}`,
          contentAr: [
            { type: "TEXT", value: "نص " },
            { type: "VARIABLE", variableKey: `variable_${index}` },
          ],
          contentEn: [
            { type: "TEXT", value: "Body " },
            { type: "VARIABLE", variableKey: `variable_${index}` },
          ],
        })
    );
    const variables = Array.from(
      { length: TEMPLATE_FIELD_BOUNDS.sections.max },
      (_unused, index) => variable({ key: `variable_${index}` })
    );

    const accepted = accept({ sections, variables, clauseBindings: [] });
    expect(accepted.content.sections).toHaveLength(
      TEMPLATE_FIELD_BOUNDS.sections.max
    );
    expect(accepted.content.variables).toHaveLength(
      TEMPLATE_FIELD_BOUNDS.sections.max
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Canonical serialization                                                    */
/* -------------------------------------------------------------------------- */

describe("canonical serialization (criteria 6.1, 6.2)", () => {
  test("sorts object keys so property order cannot change the hash", () => {
    const ordered = accept();
    const reordered = parseWorkspaceTemplateSubmission({
      clauseBindings: [
        { order: 0, sectionKey: "preamble", clauseKey: "clause.parties" },
      ],
      variables: [
        {
          required: true,
          labelEn: "Client name",
          labelAr: "اسم العميل",
          type: "TEXT",
          key: "clientName",
        },
      ],
      sections: [
        {
          contentEn: [
            { value: "This contract is entered into by ", type: "TEXT" },
            { variableKey: "clientName", type: "VARIABLE" },
          ],
          contentAr: [
            { value: "أبرم هذا العقد بين ", type: "TEXT" },
            { variableKey: "clientName", type: "VARIABLE" },
          ],
          titleEn: "Preamble",
          titleAr: "التمهيد",
          key: "preamble",
        },
      ],
      titleEn: "Services agreement",
      titleAr: "اتفاقية خدمات",
      key: "workspace-services-agreement",
    });

    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.value.canonicalHash).toBe(ordered.canonicalHash);
    expect(reordered.value.canonicalJson).toBe(ordered.canonicalJson);
  });

  test("preserves section order so a reordered template hashes differently", () => {
    const first = section({
      key: "first",
      contentAr: [{ type: "TEXT", value: "الأول" }],
      contentEn: [{ type: "TEXT", value: "First" }],
    });
    const second = section({
      key: "second",
      contentAr: [{ type: "TEXT", value: "الثاني" }],
      contentEn: [{ type: "TEXT", value: "Second" }],
    });

    const ascending = accept({
      sections: [first, second],
      variables: [],
      clauseBindings: [],
    });
    const descending = accept({
      sections: [second, first],
      variables: [],
      clauseBindings: [],
    });

    expect(descending.canonicalHash).not.toBe(ascending.canonicalHash);
    expect(descending.content.sections.map((entry) => entry.key)).toEqual([
      "second",
      "first",
    ]);
  });

  test("excludes titles from the hash and equal content hashes equally", () => {
    const original = accept();
    const retitled = accept({ titleEn: "Renamed services agreement" });

    expect(retitled.canonicalHash).toBe(original.canonicalHash);
    expect(accept().canonicalHash).toBe(original.canonicalHash);
  });

  test("renders section text and collects references from canonical nodes", () => {
    const accepted = accept();
    const nodes = accepted.content.sections[0]?.contentEn ?? [];

    expect(renderTemplateSectionText(nodes)).toBe(
      "This contract is entered into by {{clientName}}"
    );
    expect(collectTemplateVariableReferences(accepted.content.sections)).toEqual([
      "clientName",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Rejections                                                                 */
/* -------------------------------------------------------------------------- */

describe("reserved catalog keys (criterion 6.9)", () => {
  test("rejects every frozen catalog key with a 409 reserved failure", () => {
    for (const catalogKey of CONTRACT_TEMPLATE_KEYS) {
      expect(isReservedTemplateKey(catalogKey)).toBe(true);
      const failure = reject({ key: catalogKey });
      expect(failure.code).toBe("RESERVED_TEMPLATE_KEY");
      expect(failure.status).toBe(409);
      expect(failure.fieldPaths).toEqual(["key"]);
      expect(failure.values.key).toBe(catalogKey);
    }
  });

  test("accepts a workspace key that is not in the catalog", () => {
    expect(isReservedTemplateKey("workspace-services-agreement")).toBe(false);
  });
});

describe("field bounds (criteria 6.1, 6.12)", () => {
  const cases: readonly {
    readonly name: string;
    readonly overrides: SubmissionOverrides;
    readonly fieldPath: string;
  }[] = [
    { name: "key below the minimum", overrides: { key: "ab" }, fieldPath: "key" },
    {
      name: "key above the maximum",
      overrides: { key: `a${"b".repeat(TEMPLATE_FIELD_BOUNDS.key.max)}` },
      fieldPath: "key",
    },
    { name: "key with invalid grammar", overrides: { key: "Bad Key" }, fieldPath: "key" },
    { name: "missing Arabic title", overrides: { titleAr: "   " }, fieldPath: "titleAr" },
    { name: "missing English title", overrides: { titleEn: "" }, fieldPath: "titleEn" },
    {
      name: "title above the maximum",
      overrides: { titleEn: "e".repeat(TEMPLATE_FIELD_BOUNDS.title.max + 1) },
      fieldPath: "titleEn",
    },
    { name: "no sections", overrides: { sections: [] }, fieldPath: "sections" },
    {
      name: "more sections than allowed",
      overrides: {
        sections: Array.from(
          { length: TEMPLATE_FIELD_BOUNDS.sections.max + 1 },
          (_unused, index) => section({ key: `section-${index}` })
        ),
      },
      fieldPath: "sections",
    },
    {
      name: "more variables than allowed",
      overrides: {
        variables: Array.from(
          { length: TEMPLATE_FIELD_BOUNDS.variables.max + 1 },
          (_unused, index) => variable({ key: `variable_${index}` })
        ),
      },
      fieldPath: "variables",
    },
    {
      name: "one node above the maximum section text length",
      overrides: {
        sections: [
          section({
            contentEn: [
              {
                type: "TEXT",
                value: "e".repeat(TEMPLATE_SECTION_TEXT_MAX_LENGTH + 1),
              },
            ],
          }),
        ],
      },
      fieldPath: "sections[0].contentEn[0].value",
    },
    {
      name: "combined nodes above the maximum section text length",
      overrides: {
        sections: [
          section({
            contentEn: [
              { type: "TEXT", value: "e".repeat(12_000) },
              { type: "TEXT", value: "f".repeat(9_000) },
            ],
          }),
        ],
      },
      fieldPath: "sections[0].contentEn",
    },
    {
      name: "unknown field",
      overrides: { unexpectedField: "value" },
      fieldPath: "unexpectedField",
    },
  ];

  for (const testCase of cases) {
    test(`rejects ${testCase.name} with the offending field path`, () => {
      const failure = reject(testCase.overrides);
      expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
      expect(failure.status).toBe(400);
      expect(failure.fieldPaths).toContain(testCase.fieldPath);
      expect(failure.values.fieldPath).toBe(failure.fieldPaths.join(", "));
    });
  }
});

describe("missing translations (criterion 6.12)", () => {
  test("rejects a section whose Arabic body is empty", () => {
    const failure = reject({
      sections: [section({ contentAr: [{ type: "TEXT", value: "   " }] })],
    });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["sections[0].contentAr"]);
  });

  test("rejects a section whose English body has no nodes", () => {
    const failure = reject({ sections: [section({ contentEn: [] })] });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["sections[0].contentEn"]);
  });

  test("rejects a variable declaration missing one label language", () => {
    const failure = reject({ variables: [variable({ labelAr: "" })] });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["variables[0].labelAr"]);
  });
});

describe("variable closure (criteria 6.5, 6.6)", () => {
  test("rejects an undeclared reference with the offending token", () => {
    const failure = reject({ variables: [variable({ key: "supplierName" })] });

    expect(failure.code).toBe("UNDECLARED_TEMPLATE_VARIABLE");
    expect(failure.status).toBe(400);
    expect(failure.values.token).toBe("{{clientName}}");
    expect(failure.fieldPaths).toEqual(["sections[0].contentAr[1]"]);
  });

  test("rejects an unreferenced declaration with the variable name", () => {
    const failure = reject({
      variables: [variable(), variable({ key: "unusedTotal" })],
    });

    expect(failure.code).toBe("UNREFERENCED_TEMPLATE_VARIABLE");
    expect(failure.values.variableName).toBe("unusedTotal");
    expect(failure.fieldPaths).toEqual(["variables[1].key"]);
  });

  test("rejects a malformed placeholder token inside section text", () => {
    const failure = reject({
      sections: [
        section({ contentEn: [{ type: "TEXT", value: "Signed by {{ }}" }] }),
      ],
    });

    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["sections[0].contentEn[0].value"]);
    expect(failure.values.token).toBe("{{ }}");
  });
});

describe("clause bindings", () => {
  test("rejects a binding that targets an undeclared section", () => {
    const failure = reject({
      clauseBindings: [
        { clauseKey: "clause.parties", sectionKey: "appendix", order: 0 },
      ],
    });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["clauseBindings[0].sectionKey"]);
  });

  test("rejects an unknown catalog clause identifier", () => {
    const failure = reject({
      clauseBindings: [
        { clauseKey: "clause.unknown-article", sectionKey: "preamble", order: 0 },
      ],
    });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["clauseBindings[0].clauseKey"]);
  });

  test("rejects a duplicate clause binding for one section", () => {
    const failure = reject({
      clauseBindings: [
        { clauseKey: "clause.parties", sectionKey: "preamble", order: 0 },
        { clauseKey: "clause.parties", sectionKey: "preamble", order: 1 },
      ],
    });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["clauseBindings[1].clauseKey"]);
  });

  test("accepts a workspace custom clause identifier", () => {
    const accepted = accept({
      clauseBindings: [
        { clauseKey: "wsclause_01HZY", sectionKey: "preamble", order: 3 },
      ],
    });
    expect(accepted.content.clauseBindings[0]?.clauseKey).toBe("wsclause_01HZY");
  });
});

/* -------------------------------------------------------------------------- */
/* Forced legal safety and variable vocabulary                                */
/* -------------------------------------------------------------------------- */

describe("forced legal-safety values (criterion 6.7)", () => {
  test("derives unreviewed, counsel-required, non-executable values", () => {
    expect(WORKSPACE_TEMPLATE_SAFETY).toEqual({
      legalReviewStatus: "UNREVIEWED",
      counselReviewRequired: true,
      isExecutable: false,
    });
    expect(accept().safety).toEqual(WORKSPACE_TEMPLATE_SAFETY);
  });

  test("ignores every attempted safety override in the payload", () => {
    const overrides: SubmissionOverrides = {};
    for (const key of FORCED_TEMPLATE_SAFETY_INPUT_KEYS) {
      overrides[key] = key === "counselReviewRequired" ? false : "APPROVED";
    }
    overrides.isExecutable = true;
    overrides.counselReviewRequired = false;

    const accepted = accept(overrides);
    expect(accepted.safety).toEqual(WORKSPACE_TEMPLATE_SAFETY);
    expect(Object.keys(accepted.content)).toEqual([
      "schemaVersion",
      "sections",
      "variables",
      "clauseBindings",
    ]);
  });
});

describe("variable vocabulary (criteria 6.10, 19.7)", () => {
  test("exposes text, number, date, and single-choice only", () => {
    expect([...WORKSPACE_TEMPLATE_VARIABLE_TYPES]).toEqual([
      "TEXT",
      "NUMBER",
      "DATE",
      "SINGLE_CHOICE",
    ]);
  });

  test("rejects a money variable type", () => {
    const failure = reject({ variables: [variable({ type: "MONEY" })] });
    expect(failure.code).toBe("TEMPLATE_SUBMISSION_INVALID");
    expect(failure.fieldPaths).toEqual(["variables[0].type"]);
  });

  test("requires options for a single-choice list and forbids them elsewhere", () => {
    const missingChoices = reject({
      variables: [variable({ type: "SINGLE_CHOICE" })],
    });
    expect(missingChoices.fieldPaths).toEqual(["variables[0].choices"]);

    const unexpectedChoices = reject({
      variables: [
        variable({
          type: "NUMBER",
          choices: [{ value: "one", labelAr: "واحد", labelEn: "One" }],
        }),
      ],
    });
    expect(unexpectedChoices.fieldPaths).toEqual(["variables[0].choices"]);
  });

  test("maps each variable type to a registered bilingual label key", () => {
    for (const type of WORKSPACE_TEMPLATE_VARIABLE_TYPES) {
      const key = WORKSPACE_TEMPLATE_VARIABLE_TYPE_LABEL_KEYS[type];
      const pair = localizationRegistry[key];
      expect(pair.ar.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Stored content re-reads                                                    */
/* -------------------------------------------------------------------------- */

describe("stored content validation", () => {
  test("recomputes the stored hash from canonical content", () => {
    const accepted = accept();
    const reread = parseWorkspaceTemplateContent(accepted.content);

    expect(reread.ok).toBe(true);
    if (!reread.ok) return;
    expect(reread.value.canonicalHash).toBe(accepted.canonicalHash);
    expect(reread.value.content).toEqual(accepted.content);
  });

  test("rejects stored content that violates a content rule", () => {
    const result = parseWorkspaceTemplateContent({
      sections: [section()],
      variables: [],
      clauseBindings: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe("UNDECLARED_TEMPLATE_VARIABLE");
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace key already in use (criterion 6.13)                              */
/* -------------------------------------------------------------------------- */

describe("workspace key already in use (criterion 6.13)", () => {
  test("names the colliding key with a 409 and the key field path", () => {
    const failure = templateKeyInUseFailure("workspace-services-agreement");

    expect(failure.code).toBe("TEMPLATE_KEY_IN_USE");
    expect(failure.status).toBe(409);
    expect(failure.fieldPaths).toEqual(["key"]);
    expect(failure.values.key).toBe("workspace-services-agreement");
    expect(failure.values.templateKey).toBe("workspace-services-agreement");
  });

  test("trims the submitted key so the reported value matches the stored key", () => {
    expect(templateKeyInUseFailure("  workspace-nda  ").values.key).toBe(
      "workspace-nda"
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Stable bilingual failure contract (requirements 19.4, 19.9)                */
/* -------------------------------------------------------------------------- */

describe("stable failure contract (requirements 19.4, 19.9)", () => {
  const failures: Readonly<Record<string, WorkspaceTemplateValidationFailure>> = {
    TEMPLATE_SUBMISSION_INVALID: reject({ key: "ab" }),
    RESERVED_TEMPLATE_KEY: reject({ key: CONTRACT_TEMPLATE_KEYS[0] }),
    TEMPLATE_KEY_IN_USE: templateKeyInUseFailure(
      "workspace-services-agreement"
    ),
    UNDECLARED_TEMPLATE_VARIABLE: reject({
      variables: [variable({ key: "supplierName" })],
    }),
    UNREFERENCED_TEMPLATE_VARIABLE: reject({
      variables: [variable(), variable({ key: "unusedWitness" })],
    }),
  };

  test("declares exactly the codes the module can emit", () => {
    expect([...TEMPLATE_VALIDATION_CODES].sort()).toEqual(
      Object.keys(failures).sort()
    );
  });

  for (const code of TEMPLATE_VALIDATION_CODES) {
    test(`resolves ${code} to non-empty Arabic and English text`, () => {
      const failure = failures[code];
      expect(failure).toBeDefined();
      if (!failure) return;
      expect(failure.code).toBe(code);
      expect(failure.fieldPaths.length).toBeGreaterThan(0);

      const contract = getCompletionErrorContract(code, failure.values as never);
      expect(contract.code).toBe(code);
      for (const locale of ["ar", "en"] as const) {
        const text = contract.message[locale];
        expect(text.trim().length).toBeGreaterThan(0);
        // Every declared placeholder is satisfied by the failure's own values,
        // so no locale renders a raw token to the caller.
        expect(text).not.toContain("{{");
      }
    });
  }

  test("carries only the four documented string-valued fields", () => {
    for (const failure of Object.values(failures)) {
      expect(Object.keys(failure).sort()).toEqual([
        "code",
        "fieldPaths",
        "status",
        "values",
      ]);
      // Interpolation values stay strings copied from the submission, so no
      // failure can carry a derived numeric or commercial value (req 19.7).
      for (const value of Object.values(failure.values)) {
        expect(typeof value).toBe("string");
      }
    }
  });
});
