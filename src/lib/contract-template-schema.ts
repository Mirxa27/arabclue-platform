/**
 * Canonical workspace contract-template content model and pure validation
 * (requirements 6.1, 6.5, 6.6, 6.7, 6.9, 6.12, 6.13, 19.4, 19.7).
 *
 * The module is side-effect free: no persistence, no provider, no clock, no
 * randomness. `contract-template-authoring.ts` supplies the transactional
 * commands and maps a rejection onto the shared bilingual failure contract,
 * while unit and property tests drive the same validation directly
 * (design section 4.4).
 *
 * Guarantees implemented here:
 * 1. exact field bounds for keys, bilingual titles, ordered sections, ordered
 *    inline nodes, variable declarations, and clause bindings (criteria 6.1,
 *    6.12);
 * 2. canonical serialization that sorts every object key and preserves
 *    section/array order, so an equal submission produces an equal hash and a
 *    reordered section produces a different hash (criteria 6.1, 6.2);
 * 3. rejection of a reserved catalog key (criterion 6.9), a missing Arabic or
 *    English translation (criterion 6.12), an undeclared reference (criterion
 *    6.6), and an unreferenced declaration (criterion 6.5), plus the one stable
 *    contract the transactional command reuses for a workspace key already in
 *    use (criterion 6.13);
 * 4. legal-review status, counsel-review requirement, and the non-executable
 *    flag derived internally and never from caller input (criterion 6.7);
 * 5. a variable vocabulary of text, number, date, and single-choice only, so no
 *    money variable type and no monetary computation is reachable from template
 *    authoring (criteria 6.10, 19.7).
 */

import { z } from "zod";
import { canonicalJson, canonicalJsonHash } from "./canonical-json";
import {
  CONTRACT_CLAUSE_IDS,
  CONTRACT_TEMPLATE_KEYS,
} from "./document-templates/contract-templates";
import type { TranslationKey } from "./i18n";

/* -------------------------------------------------------------------------- */
/* Contract bounds                                                            */
/* -------------------------------------------------------------------------- */

/** Stored canonical shape revision; bumped only by a content model change. */
export const TEMPLATE_CONTENT_SCHEMA_VERSION = 1 as const;

/** Exact bounds stated by criterion 6.1 and enforced by criterion 6.12. */
export const TEMPLATE_FIELD_BOUNDS = Object.freeze({
  key: Object.freeze({ min: 3, max: 64 }),
  title: Object.freeze({ min: 1, max: 200 }),
  sections: Object.freeze({ min: 1, max: 100 }),
  sectionText: Object.freeze({ min: 1, max: 20_000 }),
  variables: Object.freeze({ min: 0, max: 100 }),
});

export const TEMPLATE_KEY_MIN_LENGTH = TEMPLATE_FIELD_BOUNDS.key.min;
export const TEMPLATE_KEY_MAX_LENGTH = TEMPLATE_FIELD_BOUNDS.key.max;
export const TEMPLATE_TITLE_MAX_LENGTH = TEMPLATE_FIELD_BOUNDS.title.max;
export const TEMPLATE_SECTION_MIN_COUNT = TEMPLATE_FIELD_BOUNDS.sections.min;
export const TEMPLATE_SECTION_MAX_COUNT = TEMPLATE_FIELD_BOUNDS.sections.max;
export const TEMPLATE_SECTION_TEXT_MAX_LENGTH =
  TEMPLATE_FIELD_BOUNDS.sectionText.max;
export const TEMPLATE_VARIABLE_MAX_COUNT = TEMPLATE_FIELD_BOUNDS.variables.max;

/** Structural bounds derived from the stated section/variable/clause limits. */
export const TEMPLATE_SECTION_KEY_MAX_LENGTH = 64;
export const TEMPLATE_SECTION_NODE_MAX_COUNT = 500;
export const TEMPLATE_VARIABLE_NAME_MAX_LENGTH = 64;
export const TEMPLATE_VARIABLE_LABEL_MAX_LENGTH = 200;
export const TEMPLATE_VARIABLE_CHOICE_MIN_COUNT = 2;
export const TEMPLATE_VARIABLE_CHOICE_MAX_COUNT = 50;
export const TEMPLATE_VARIABLE_CHOICE_VALUE_MAX_LENGTH = 120;
/** Matches the clause-selection ceiling of criteria 5.4 and 5.13. */
export const TEMPLATE_CLAUSE_BINDING_MAX_COUNT = 100;
export const TEMPLATE_CLAUSE_KEY_MAX_LENGTH = 100;
export const TEMPLATE_CLAUSE_BINDING_MAX_ORDER = 999;
export const TEMPLATE_CHANGE_NOTE_MAX_LENGTH = 1_000;

/** Lowercase slug grammar shared with the frozen catalog keys. */
export const TEMPLATE_KEY_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
/** Section keys stay slug-like so a canonical binding target is stable. */
export const TEMPLATE_SECTION_KEY_REGEX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/iu;
/** Variable names are referencable identifiers, never free text. */
export const TEMPLATE_VARIABLE_NAME_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** Catalog clause identifiers plus workspace custom clause identifiers. */
export const TEMPLATE_CLAUSE_KEY_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
/** Single-choice option values are direction-neutral identifiers. */
export const TEMPLATE_CHOICE_VALUE_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const CATALOG_CLAUSE_PREFIX = "clause.";
const CATALOG_TEMPLATE_KEYS: ReadonlySet<string> = new Set(
  CONTRACT_TEMPLATE_KEYS
);
const CATALOG_CLAUSE_IDS: ReadonlySet<string> = new Set(CONTRACT_CLAUSE_IDS);

/* -------------------------------------------------------------------------- */
/* Forced legal-safety values (criterion 6.7)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Values a workspace template and every one of its versions always carries.
 * They are derived here, never read from caller input, so no authoring payload
 * can publish an approved or executable template.
 */
export const WORKSPACE_TEMPLATE_SAFETY = Object.freeze({
  legalReviewStatus: "UNREVIEWED",
  counselReviewRequired: true,
  isExecutable: false,
} as const);

export type WorkspaceTemplateSafety = typeof WORKSPACE_TEMPLATE_SAFETY;

/**
 * Input keys removed before validation so an attempted safety override is
 * neutralized rather than persisted or echoed back as a field error.
 */
export const FORCED_TEMPLATE_SAFETY_INPUT_KEYS: readonly string[] = Object.freeze(
  [
    "legalReviewStatus",
    "legalReview",
    "counselReviewRequired",
    "isExecutable",
    "executable",
    "nonExecutable",
    "lifecycle",
    "sourceStatus",
    "isApproved",
    "approvedAt",
    "approvedBy",
    "isSystem",
  ]
);

/** The forced legal-safety values; caller input is ignored by construction. */
export function resolveWorkspaceTemplateSafety(): WorkspaceTemplateSafety {
  return WORKSPACE_TEMPLATE_SAFETY;
}

/* -------------------------------------------------------------------------- */
/* Variable vocabulary (criteria 6.10, 19.7)                                  */
/* -------------------------------------------------------------------------- */

/** Closed workspace variable vocabulary. No money type exists by design. */
export const WORKSPACE_TEMPLATE_VARIABLE_TYPES = Object.freeze([
  "TEXT",
  "NUMBER",
  "DATE",
  "SINGLE_CHOICE",
] as const);

export type WorkspaceTemplateVariableType =
  (typeof WORKSPACE_TEMPLATE_VARIABLE_TYPES)[number];

/** Registered bilingual label key for each declared variable type. */
export const WORKSPACE_TEMPLATE_VARIABLE_TYPE_LABEL_KEYS = Object.freeze({
  TEXT: "template_variable_type_text",
  NUMBER: "template_variable_type_number",
  DATE: "template_variable_type_date",
  SINGLE_CHOICE: "template_variable_type_single_choice",
} as const satisfies Readonly<
  Record<WorkspaceTemplateVariableType, TranslationKey>
>);

export function isWorkspaceTemplateVariableType(
  value: string
): value is WorkspaceTemplateVariableType {
  return (WORKSPACE_TEMPLATE_VARIABLE_TYPES as readonly string[]).includes(
    value
  );
}

/* -------------------------------------------------------------------------- */
/* Content model                                                              */
/* -------------------------------------------------------------------------- */

export type WorkspaceTemplateTextNode = Readonly<{
  type: "TEXT";
  value: string;
}>;

export type WorkspaceTemplateVariableNode = Readonly<{
  type: "VARIABLE";
  variableKey: string;
}>;

/** One ordered inline node of a section body in one language. */
export type WorkspaceTemplateNode =
  | WorkspaceTemplateTextNode
  | WorkspaceTemplateVariableNode;

export type WorkspaceTemplateVariableChoice = Readonly<{
  value: string;
  labelAr: string;
  labelEn: string;
}>;

export type WorkspaceTemplateVariable = Readonly<{
  key: string;
  type: WorkspaceTemplateVariableType;
  labelAr: string;
  labelEn: string;
  required: boolean;
  /** Non-empty only for `SINGLE_CHOICE`; always present after canonicalization. */
  choices: readonly WorkspaceTemplateVariableChoice[];
}>;

export type WorkspaceTemplateSection = Readonly<{
  key: string;
  titleAr: string;
  titleEn: string;
  contentAr: readonly WorkspaceTemplateNode[];
  contentEn: readonly WorkspaceTemplateNode[];
}>;

export type WorkspaceTemplateClauseBinding = Readonly<{
  clauseKey: string;
  sectionKey: string;
  order: number;
}>;

/**
 * Canonical content hashed by criterion 6.1. Titles are deliberately excluded:
 * the criterion names the sections, variable definitions, and clause bindings.
 */
export type WorkspaceTemplateContent = Readonly<{
  schemaVersion: typeof TEMPLATE_CONTENT_SCHEMA_VERSION;
  sections: readonly WorkspaceTemplateSection[];
  variables: readonly WorkspaceTemplateVariable[];
  clauseBindings: readonly WorkspaceTemplateClauseBinding[];
}>;

export type AcceptedWorkspaceTemplateContent = Readonly<{
  content: WorkspaceTemplateContent;
  /** Canonical JSON with sorted object keys and preserved array order. */
  canonicalJson: string;
  canonicalHash: `sha256:${string}`;
  /** Variable names referenced by at least one section, in first-use order. */
  referencedVariableKeys: readonly string[];
  safety: WorkspaceTemplateSafety;
}>;

export type AcceptedWorkspaceTemplateSubmission =
  AcceptedWorkspaceTemplateContent &
    Readonly<{
      key: string;
      titleAr: string;
      titleEn: string;
    }>;

/* -------------------------------------------------------------------------- */
/* Zod schemas (requirement 19.4)                                             */
/* -------------------------------------------------------------------------- */

/** Removes forced-safety keys so an override attempt cannot reach validation. */
function stripForcedSafetyFields(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const source = raw as Record<string, unknown>;
  const stripped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (FORCED_TEMPLATE_SAFETY_INPUT_KEYS.includes(key)) continue;
    stripped[key] = value;
  }
  return stripped;
}

const nodeSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("TEXT"),
      value: z.string().max(TEMPLATE_SECTION_TEXT_MAX_LENGTH),
    })
    .strict(),
  z
    .object({
      type: z.literal("VARIABLE"),
      variableKey: z
        .string()
        .trim()
        .min(1)
        .max(TEMPLATE_VARIABLE_NAME_MAX_LENGTH)
        .regex(TEMPLATE_VARIABLE_NAME_REGEX),
    })
    .strict(),
]);

const sectionSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(TEMPLATE_SECTION_KEY_MAX_LENGTH)
      .regex(TEMPLATE_SECTION_KEY_REGEX),
    titleAr: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH),
    titleEn: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH),
    contentAr: z.array(nodeSchema).min(1).max(TEMPLATE_SECTION_NODE_MAX_COUNT),
    contentEn: z.array(nodeSchema).min(1).max(TEMPLATE_SECTION_NODE_MAX_COUNT),
  })
  .strict();

const choiceSchema = z
  .object({
    value: z
      .string()
      .trim()
      .min(1)
      .max(TEMPLATE_VARIABLE_CHOICE_VALUE_MAX_LENGTH)
      .regex(TEMPLATE_CHOICE_VALUE_REGEX),
    labelAr: z.string().trim().min(1).max(TEMPLATE_VARIABLE_LABEL_MAX_LENGTH),
    labelEn: z.string().trim().min(1).max(TEMPLATE_VARIABLE_LABEL_MAX_LENGTH),
  })
  .strict();

const variableSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(TEMPLATE_VARIABLE_NAME_MAX_LENGTH)
      .regex(TEMPLATE_VARIABLE_NAME_REGEX),
    type: z.enum(WORKSPACE_TEMPLATE_VARIABLE_TYPES),
    labelAr: z.string().trim().min(1).max(TEMPLATE_VARIABLE_LABEL_MAX_LENGTH),
    labelEn: z.string().trim().min(1).max(TEMPLATE_VARIABLE_LABEL_MAX_LENGTH),
    required: z.boolean(),
    choices: z
      .array(choiceSchema)
      .max(TEMPLATE_VARIABLE_CHOICE_MAX_COUNT)
      .optional(),
  })
  .strict();

const clauseBindingSchema = z
  .object({
    clauseKey: z
      .string()
      .trim()
      .min(1)
      .max(TEMPLATE_CLAUSE_KEY_MAX_LENGTH)
      .regex(TEMPLATE_CLAUSE_KEY_REGEX),
    sectionKey: z
      .string()
      .trim()
      .min(1)
      .max(TEMPLATE_SECTION_KEY_MAX_LENGTH)
      .regex(TEMPLATE_SECTION_KEY_REGEX),
    order: z
      .number()
      .int()
      .min(0)
      .max(TEMPLATE_CLAUSE_BINDING_MAX_ORDER),
  })
  .strict();

const contentFieldsShape = {
  sections: z
    .array(sectionSchema)
    .min(TEMPLATE_SECTION_MIN_COUNT)
    .max(TEMPLATE_SECTION_MAX_COUNT),
  variables: z.array(variableSchema).max(TEMPLATE_VARIABLE_MAX_COUNT),
  clauseBindings: z
    .array(clauseBindingSchema)
    .max(TEMPLATE_CLAUSE_BINDING_MAX_COUNT),
} as const;

const templateKeySchema = z
  .string()
  .trim()
  .min(TEMPLATE_KEY_MIN_LENGTH)
  .max(TEMPLATE_KEY_MAX_LENGTH)
  .regex(TEMPLATE_KEY_REGEX);

/** Create payload accepted by the authoring command (criteria 6.1, 6.12). */
export const workspaceTemplateSubmissionSchema = z.preprocess(
  stripForcedSafetyFields,
  z
    .object({
      key: templateKeySchema,
      titleAr: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH),
      titleEn: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH),
      ...contentFieldsShape,
    })
    .strict()
);

/** Update payload; every content field is optional and merged by the command. */
export const workspaceTemplateUpdateSchema = z.preprocess(
  stripForcedSafetyFields,
  z
    .object({
      titleAr: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH).optional(),
      titleEn: z.string().trim().min(1).max(TEMPLATE_TITLE_MAX_LENGTH).optional(),
      sections: contentFieldsShape.sections.optional(),
      variables: contentFieldsShape.variables.optional(),
      clauseBindings: contentFieldsShape.clauseBindings.optional(),
      changeNote: z
        .string()
        .trim()
        .max(TEMPLATE_CHANGE_NOTE_MAX_LENGTH)
        .optional(),
    })
    .strict()
);

/** Stored content re-read before hashing or rendering a persisted version. */
export const workspaceTemplateContentSchema = z
  .object({
    schemaVersion: z.literal(TEMPLATE_CONTENT_SCHEMA_VERSION),
    ...contentFieldsShape,
  })
  .strict();

export type WorkspaceTemplateSubmissionInput = z.infer<
  typeof workspaceTemplateSubmissionSchema
>;
export type WorkspaceTemplateUpdateInput = z.infer<
  typeof workspaceTemplateUpdateSchema
>;

/* -------------------------------------------------------------------------- */
/* Validation results                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every stable code a template submission can be rejected with.
 *
 * `TEMPLATE_KEY_IN_USE` is listed here even though the collision it names is
 * only observable inside a workspace-scoped transaction: the code, status, and
 * offending field path form one contract, so the authoring command reuses this
 * definition instead of restating it (criterion 6.13).
 */
export const TEMPLATE_VALIDATION_CODES = Object.freeze([
  "TEMPLATE_SUBMISSION_INVALID",
  "RESERVED_TEMPLATE_KEY",
  "TEMPLATE_KEY_IN_USE",
  "UNDECLARED_TEMPLATE_VARIABLE",
  "UNREFERENCED_TEMPLATE_VARIABLE",
] as const);

export type TemplateValidationCode =
  (typeof TEMPLATE_VALIDATION_CODES)[number];

export type WorkspaceTemplateValidationFailure = Readonly<{
  code: TemplateValidationCode;
  /** HTTP status of the stable code; 409 only for a rejected template key. */
  status: 400 | 409;
  /** Offending field paths, in submission order (requirement 19.9). */
  fieldPaths: readonly string[];
  /** Named values interpolated into the registered bilingual message. */
  values: Readonly<Record<string, string>>;
}>;

export type WorkspaceTemplateValidation<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; failure: WorkspaceTemplateValidationFailure }>;

function invalid(
  fieldPaths: readonly string[],
  extraValues: Readonly<Record<string, string>> = {}
): WorkspaceTemplateValidationFailure {
  const paths = fieldPaths.length > 0 ? fieldPaths : ["request"];
  return {
    code: "TEMPLATE_SUBMISSION_INVALID",
    status: 400,
    fieldPaths: paths,
    values: { fieldPath: paths.join(", "), ...extraValues },
  };
}

function failed<Value>(
  failure: WorkspaceTemplateValidationFailure
): WorkspaceTemplateValidation<Value> {
  return { ok: false, failure };
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "request";
  return path
    .map((segment) =>
      typeof segment === "number" ? `[${segment}]` : String(segment)
    )
    .join(".")
    .replace(/\.\[/gu, "[");
}

function issueFieldPaths(error: z.ZodError): readonly string[] {
  const paths = new Set<string>();
  for (const issue of error.issues) {
    const base = formatIssuePath(issue.path);
    // An unrecognized key carries no path of its own, so name each rejected key
    // rather than reporting the whole request (requirements 6.12, 19.9).
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        paths.add(base === "request" ? key : `${base}.${key}`);
      }
      continue;
    }
    paths.add(base);
  }
  return [...paths];
}

/* -------------------------------------------------------------------------- */
/* Reserved catalog keys (criterion 6.9)                                      */
/* -------------------------------------------------------------------------- */

/** True when the key collides with the frozen contract template catalog. */
export function isReservedTemplateKey(key: string): boolean {
  return CATALOG_TEMPLATE_KEYS.has(key.trim());
}

/** True when a catalog-prefixed clause key exists in the frozen catalog. */
export function isKnownCatalogClauseKey(clauseKey: string): boolean {
  return CATALOG_CLAUSE_IDS.has(clauseKey.trim());
}

/**
 * Stable failure for a key already stored by a template in the caller's
 * workspace (criterion 6.13).
 *
 * The uniqueness read itself belongs to the transactional command; only the
 * response contract is defined here so the reserved-key and key-in-use
 * rejections stay shaped identically.
 */
export function templateKeyInUseFailure(
  key: string
): WorkspaceTemplateValidationFailure {
  const templateKey = key.trim();
  return {
    code: "TEMPLATE_KEY_IN_USE",
    status: 409,
    fieldPaths: ["key"],
    values: { key: templateKey, templateKey },
  };
}

/* -------------------------------------------------------------------------- */
/* Canonicalization                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Placeholder grammar accepted inside a TEXT node. A matching token is
 * canonicalized into a VARIABLE node so a typed token and an editor-inserted
 * node produce one canonical form and one hash.
 */
const TEMPLATE_TOKEN_PATTERN = /\{\{([^{}]*)\}\}/gu;

type NodeCanonicalization =
  | Readonly<{ ok: true; nodes: readonly WorkspaceTemplateNode[] }>
  | Readonly<{ ok: false; token: string; nodeIndex: number }>;

function canonicalizeNodes(
  nodes: readonly WorkspaceTemplateNode[]
): NodeCanonicalization {
  const canonical: WorkspaceTemplateNode[] = [];

  const pushText = (value: string): void => {
    if (value.length === 0) return;
    const previous = canonical.at(-1);
    if (previous && previous.type === "TEXT") {
      canonical[canonical.length - 1] = {
        type: "TEXT",
        value: `${previous.value}${value}`,
      };
      return;
    }
    canonical.push({ type: "TEXT", value });
  };

  for (const [nodeIndex, node] of nodes.entries()) {
    if (node.type === "VARIABLE") {
      canonical.push({ type: "VARIABLE", variableKey: node.variableKey.trim() });
      continue;
    }

    let cursor = 0;
    for (const match of node.value.matchAll(TEMPLATE_TOKEN_PATTERN)) {
      const token = match[0];
      const name = (match[1] ?? "").trim();
      if (!TEMPLATE_VARIABLE_NAME_REGEX.test(name)) {
        return { ok: false, token, nodeIndex };
      }
      const start = match.index ?? 0;
      pushText(node.value.slice(cursor, start));
      canonical.push({ type: "VARIABLE", variableKey: name });
      cursor = start + token.length;
    }
    pushText(node.value.slice(cursor));
  }

  return { ok: true, nodes: canonical };
}

/** Section text used for the length bound of criterion 6.1. */
export function renderTemplateSectionText(
  nodes: readonly WorkspaceTemplateNode[]
): string {
  return nodes
    .map((node) =>
      node.type === "TEXT" ? node.value : `{{${node.variableKey}}}`
    )
    .join("");
}

/** Variable names referenced by every section body, in first-use order. */
export function collectTemplateVariableReferences(
  sections: readonly WorkspaceTemplateSection[]
): readonly string[] {
  const referenced = new Set<string>();
  for (const section of sections) {
    for (const nodes of [section.contentAr, section.contentEn]) {
      for (const node of nodes) {
        if (node.type === "VARIABLE") referenced.add(node.variableKey);
      }
    }
  }
  return [...referenced];
}

/** Canonical JSON of validated content: sorted keys, preserved array order. */
export function serializeWorkspaceTemplateContent(
  content: WorkspaceTemplateContent
): string {
  return canonicalJson(content);
}

/** Canonical hash persisted on a template and each of its versions. */
export function workspaceTemplateCanonicalHash(
  content: WorkspaceTemplateContent
): `sha256:${string}` {
  return canonicalJsonHash(content);
}

/* -------------------------------------------------------------------------- */
/* Content validation                                                         */
/* -------------------------------------------------------------------------- */

function canonicalizeVariables(
  variables: readonly z.infer<typeof variableSchema>[]
): WorkspaceTemplateValidation<readonly WorkspaceTemplateVariable[]> {
  const seen = new Set<string>();
  const canonical: WorkspaceTemplateVariable[] = [];

  for (const [index, variable] of variables.entries()) {
    const path = `variables[${index}]`;
    if (seen.has(variable.key)) {
      return failed(invalid([`${path}.key`], { variableName: variable.key }));
    }
    seen.add(variable.key);

    const choices = variable.choices ?? [];
    if (variable.type === "SINGLE_CHOICE") {
      if (choices.length < TEMPLATE_VARIABLE_CHOICE_MIN_COUNT) {
        return failed(invalid([`${path}.choices`], { variableName: variable.key }));
      }
      const choiceValues = new Set<string>();
      for (const [choiceIndex, choice] of choices.entries()) {
        if (choiceValues.has(choice.value)) {
          return failed(
            invalid([`${path}.choices[${choiceIndex}].value`], {
              variableName: variable.key,
            })
          );
        }
        choiceValues.add(choice.value);
      }
    } else if (choices.length > 0) {
      // Only a single-choice list may declare options; a typed text, number, or
      // date variable carrying options is a malformed declaration.
      return failed(invalid([`${path}.choices`], { variableName: variable.key }));
    }

    canonical.push({
      key: variable.key,
      type: variable.type,
      labelAr: variable.labelAr,
      labelEn: variable.labelEn,
      required: variable.required,
      choices: choices.map((choice) => ({
        value: choice.value,
        labelAr: choice.labelAr,
        labelEn: choice.labelEn,
      })),
    });
  }

  return { ok: true, value: canonical };
}

function canonicalizeSections(
  sections: readonly z.infer<typeof sectionSchema>[]
): WorkspaceTemplateValidation<readonly WorkspaceTemplateSection[]> {
  const seen = new Set<string>();
  const canonical: WorkspaceTemplateSection[] = [];

  for (const [index, section] of sections.entries()) {
    const path = `sections[${index}]`;
    if (seen.has(section.key)) {
      return failed(invalid([`${path}.key`], { sectionKey: section.key }));
    }
    seen.add(section.key);

    const languages = [
      { field: "contentAr", nodes: section.contentAr },
      { field: "contentEn", nodes: section.contentEn },
    ] as const;
    const canonicalNodes: Record<"contentAr" | "contentEn", readonly WorkspaceTemplateNode[]> =
      { contentAr: [], contentEn: [] };

    for (const language of languages) {
      const canonicalized = canonicalizeNodes(language.nodes);
      if (!canonicalized.ok) {
        return failed(
          invalid([`${path}.${language.field}[${canonicalized.nodeIndex}].value`], {
            token: canonicalized.token,
          })
        );
      }

      const text = renderTemplateSectionText(canonicalized.nodes);
      if (text.trim().length < TEMPLATE_FIELD_BOUNDS.sectionText.min) {
        // Criterion 6.12: a section missing its Arabic or English text.
        return failed(invalid([`${path}.${language.field}`]));
      }
      if (text.length > TEMPLATE_SECTION_TEXT_MAX_LENGTH) {
        return failed(invalid([`${path}.${language.field}`]));
      }
      canonicalNodes[language.field] = canonicalized.nodes;
    }

    canonical.push({
      key: section.key,
      titleAr: section.titleAr,
      titleEn: section.titleEn,
      contentAr: canonicalNodes.contentAr,
      contentEn: canonicalNodes.contentEn,
    });
  }

  return { ok: true, value: canonical };
}

function validateClauseBindings(
  bindings: readonly z.infer<typeof clauseBindingSchema>[],
  sectionKeys: ReadonlySet<string>
): WorkspaceTemplateValidation<readonly WorkspaceTemplateClauseBinding[]> {
  const seen = new Set<string>();
  const canonical: WorkspaceTemplateClauseBinding[] = [];

  for (const [index, binding] of bindings.entries()) {
    const path = `clauseBindings[${index}]`;
    if (!sectionKeys.has(binding.sectionKey)) {
      return failed(
        invalid([`${path}.sectionKey`], { sectionKey: binding.sectionKey })
      );
    }
    if (
      binding.clauseKey.startsWith(CATALOG_CLAUSE_PREFIX) &&
      !isKnownCatalogClauseKey(binding.clauseKey)
    ) {
      return failed(
        invalid([`${path}.clauseKey`], { clauseKey: binding.clauseKey })
      );
    }
    const pair = `${binding.sectionKey}\u0000${binding.clauseKey}`;
    if (seen.has(pair)) {
      return failed(
        invalid([`${path}.clauseKey`], { clauseKey: binding.clauseKey })
      );
    }
    seen.add(pair);

    canonical.push({
      clauseKey: binding.clauseKey,
      sectionKey: binding.sectionKey,
      order: binding.order,
    });
  }

  return { ok: true, value: canonical };
}

function validateVariableClosure(
  sections: readonly WorkspaceTemplateSection[],
  variables: readonly WorkspaceTemplateVariable[]
): WorkspaceTemplateValidation<readonly string[]> {
  const declared = new Set(variables.map((variable) => variable.key));
  const referenced = collectTemplateVariableReferences(sections);

  // Criterion 6.6 — a section reference with no declaration, reported with the
  // offending token. Checked before criterion 6.5 so the failure order is
  // deterministic for a submission that violates both.
  for (const [sectionIndex, section] of sections.entries()) {
    for (const field of ["contentAr", "contentEn"] as const) {
      for (const [nodeIndex, node] of section[field].entries()) {
        if (node.type !== "VARIABLE") continue;
        if (declared.has(node.variableKey)) continue;
        return failed({
          code: "UNDECLARED_TEMPLATE_VARIABLE",
          status: 400,
          fieldPaths: [`sections[${sectionIndex}].${field}[${nodeIndex}]`],
          values: {
            token: `{{${node.variableKey}}}`,
            variableName: node.variableKey,
          },
        });
      }
    }
  }

  // Criterion 6.5 — a declaration no section references.
  const referencedSet = new Set(referenced);
  for (const [index, variable] of variables.entries()) {
    if (referencedSet.has(variable.key)) continue;
    return failed({
      code: "UNREFERENCED_TEMPLATE_VARIABLE",
      status: 400,
      fieldPaths: [`variables[${index}].key`],
      values: { variableName: variable.key },
    });
  }

  return { ok: true, value: referenced };
}

function acceptContent(
  parsed: Readonly<{
    sections: readonly z.infer<typeof sectionSchema>[];
    variables: readonly z.infer<typeof variableSchema>[];
    clauseBindings: readonly z.infer<typeof clauseBindingSchema>[];
  }>
): WorkspaceTemplateValidation<AcceptedWorkspaceTemplateContent> {
  const sections = canonicalizeSections(parsed.sections);
  if (!sections.ok) return failed(sections.failure);

  const variables = canonicalizeVariables(parsed.variables);
  if (!variables.ok) return failed(variables.failure);

  const bindings = validateClauseBindings(
    parsed.clauseBindings,
    new Set(sections.value.map((section) => section.key))
  );
  if (!bindings.ok) return failed(bindings.failure);

  const closure = validateVariableClosure(sections.value, variables.value);
  if (!closure.ok) return failed(closure.failure);

  const content: WorkspaceTemplateContent = {
    schemaVersion: TEMPLATE_CONTENT_SCHEMA_VERSION,
    sections: sections.value,
    variables: variables.value,
    clauseBindings: bindings.value,
  };

  return {
    ok: true,
    value: {
      content,
      canonicalJson: serializeWorkspaceTemplateContent(content),
      canonicalHash: workspaceTemplateCanonicalHash(content),
      referencedVariableKeys: closure.value,
      safety: resolveWorkspaceTemplateSafety(),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public validation entry points                                             */
/* -------------------------------------------------------------------------- */

/**
 * Validates an unknown create payload and returns the canonical submission or
 * one stable failure. Pure: no persistence, provider, clock, or randomness.
 */
export function parseWorkspaceTemplateSubmission(
  input: unknown
): WorkspaceTemplateValidation<AcceptedWorkspaceTemplateSubmission> {
  const parsed = workspaceTemplateSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return failed(invalid(issueFieldPaths(parsed.error)));
  }

  if (isReservedTemplateKey(parsed.data.key)) {
    return failed({
      code: "RESERVED_TEMPLATE_KEY",
      status: 409,
      fieldPaths: ["key"],
      values: { key: parsed.data.key, templateKey: parsed.data.key },
    });
  }

  const accepted = acceptContent(parsed.data);
  if (!accepted.ok) return failed(accepted.failure);

  return {
    ok: true,
    value: {
      ...accepted.value,
      key: parsed.data.key,
      titleAr: parsed.data.titleAr,
      titleEn: parsed.data.titleEn,
    },
  };
}

/**
 * Validates content already merged by an update command, or content re-read
 * from a stored version, and returns its canonical form and hash.
 */
export function parseWorkspaceTemplateContent(
  input: unknown
): WorkspaceTemplateValidation<AcceptedWorkspaceTemplateContent> {
  const candidate =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? { schemaVersion: TEMPLATE_CONTENT_SCHEMA_VERSION, ...(input as object) }
      : input;
  const parsed = workspaceTemplateContentSchema.safeParse(candidate);
  if (!parsed.success) {
    return failed(invalid(issueFieldPaths(parsed.error)));
  }
  return acceptContent(parsed.data);
}
