/**
 * AI-powered Contract Drafting Assistant.
 *
 * Extends the existing law-contract agent with a generative layer that:
 * 1. Generates context-aware bilingual (AR/EN) clause suggestions
 * 2. Infers template variable values from project/tender data
 * 3. Flags high-risk clauses based on Saudi procurement law references
 * 4. Validates bilingual semantic consistency
 *
 * Uses the existing LLM provider system (src/lib/llm/index.ts).
 * Falls back to deterministic logic when LLM is not configured.
 * All AI output carries provenance metadata and passes validation gates.
 */

import { z } from "zod";
import { generateCompletion, type LLMMessage } from "../llm";
import {
  LEGAL_DISCLAIMER,
  LEGAL_DISCLAIMER_AR,
  PROCUREMENT_LAW,
  PDPL_RULES,
  NCA_FRAMEWORKS,
} from "../procurement-rules";
import {
  CONTRACT_CLAUSE_CATALOG,
  CONTRACT_TEMPLATE_CATALOG,
  type ContractClauseId,
  type ContractTemplateKey,
} from "../document-templates/contract-templates";
import { validateContractDraft } from "../agents/law-contract";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "./provider-unavailable";
import { parseJsonWithSchema, schemaRejection } from "./json-output";
import { appendGlossaryWithinBudget, styleGuideFor } from "./style-guide";
import {
  NO_PRICING_RULE,
  REGULATORY_PRECISION_RULE,
} from "../agents/prompts";
import type { IngestionEntities, ComplianceMatrixRow, Locale } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AiProvenance = {
  source: "AI_GENERATED" | "DETERMINISTIC_FALLBACK";
  provider: string;
  model: string;
  engine: string;
  generatedAt: string;
  confidence: number;
  fallback: boolean;
};

export type ClauseLegalReviewStatus = "REQUIRED" | "NOT_LEGAL_ADVICE";

export type ClauseSuggestion = {
  clauseId: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskNotesEn: string;
  riskNotesAr: string;
  /**
   * What the clause rests on: `template:<clauseId>`, `tender:<field>`,
   * `compliance:<controlId>` or `registry:<policyId>`. `null` means nothing in
   * the provided context grounds it, and the clause is then HIGH risk with
   * legal review required — never presented as settled.
   */
  sourceRef: string | null;
  legalReviewStatus: ClauseLegalReviewStatus;
  provenance: AiProvenance;
};

export type VariableInference = {
  variableKey: string;
  inferredValue: string;
  confidence: number;
  source: string;
  provenance: AiProvenance;
};

export type BilingualConsistencyCheck = {
  clauseId: string;
  isConsistent: boolean;
  discrepancyEn: string;
  discrepancyAr: string;
  provenance: AiProvenance;
};

export type ContractDraftingResult = {
  clauses: ClauseSuggestion[];
  variableInferences: VariableInference[];
  consistencyChecks: BilingualConsistencyCheck[];
  validationOk: boolean;
  validationIssues: Array<{ code: string; severity: string; message: string }>;
  provenance: AiProvenance;
};

export type ContractDraftingInput = {
  templateKey: ContractTemplateKey;
  projectTitle: string;
  etimadRef: string | null;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  locale?: Locale;
  workspaceId: string;
};

// ---------------------------------------------------------------------------
// System prompt builders — assembled from the registry, the house style and
// the glossary of the terms the context uses. Exported so their size cap can
// be asserted (each stays under 6,000 characters for any context).
// ---------------------------------------------------------------------------

/** Glossary budget inside these prompts; the rules and the schema come first. */
const PROMPT_GLOSSARY_CHARS = 1_200;

/** Most clauses the model may add beyond the template's own. */
const MAX_CUSTOM_CLAUSES = 3;

const CUSTOM_CLAUSE_ID_RE = /^custom\.[a-z0-9][a-z0-9-]{1,60}$/;

export function buildClauseGenerationSystemPrompt(
  locale: Locale = "ar",
  contextText = ""
): string {
  const head = `You are ArabClue AI Contract Drafting Assistant — bilingual EN/AR clause generation engine for Saudi procurement engagements.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}
Rules:
- Draft one clause for each entry under "templateClauses" in the request, clauseId copied verbatim. You may add at most ${MAX_CUSTOM_CLAUSES} clauses the tender context requires and the template lacks, with clauseId "custom.<kebab-slug>", riskLevel HIGH and legalReviewStatus REQUIRED.
- Every clause names its basis in "sourceRef": "template:<clauseId>", "tender:scope" | "tender:sla" | "tender:milestones" | "tender:evaluation", "compliance:<controlId>" or "registry:<policyId>" — only identifiers present in the request. A clause with no basis in the request is sourceRef null, riskLevel HIGH, legalReviewStatus REQUIRED, and its riskNotes say what is assumed.
- Where the request gives no value for a term (a party name, a date, a cap, an amount, a governing forum), write a bracketed placeholder — "[TO BE COMPLETED BY COUNSEL]" / "[يُستكمل بواسطة المستشار القانوني]" — never an invented value. Penalty percentages come from the tender SLA verbatim or not at all.
- Liability, termination, intellectual property, data protection, delay penalties and governing law are HIGH risk unless the tender text fixes the term; HIGH always carries legalReviewStatus REQUIRED. Reference ${PROCUREMENT_LAW.nameEn} / ${PROCUREMENT_LAW.nameAr} only where it applies.
- bodyEn and bodyAr are plain clause text with the same meaning, formal legal register in each language; the caller assembles the bilingual article format. Never claim 100% legal certainty or that counsel review is optional.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "clauses": [{ "clauseId": string, "titleEn": string, "titleAr": string, "bodyEn": string, "bodyAr": string, "riskLevel": "LOW"|"MEDIUM"|"HIGH", "riskNotesEn": string, "riskNotesAr": string, "sourceRef": string|null, "legalReviewStatus": "REQUIRED"|"NOT_LEGAL_ADVICE" }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, contextText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildVariableInferenceSystemPrompt(
  locale: Locale = "ar",
  contextText = ""
): string {
  const head = `You are ArabClue AI Variable Inference Engine for contract templates.
${NO_PRICING_RULE}
Analyze project/tender data and suggest template variable values.
Rules:
- Infer only for keys listed under "variables" in the request, variableKey copied verbatim; respect each variable's type.
- A value must be supported by a field of the request; "source" names that field (for example "entities.sla", "entities.milestones", "projectTitle", "etimadRef"). Omit the variable when the request gives nothing for it — never fabricate legal names, dates, amounts, or commercial terms.
- "confidence" is 0 to 1 and reflects how directly the source states the value (1 = verbatim, 0.5 = derived).
- Output JSON only: { "inferences": [{ "variableKey": string, "inferredValue": string, "confidence": number, "source": string }] }
${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, contextText, {
    maxChars: PROMPT_GLOSSARY_CHARS,
  });
}

export function buildConsistencyCheckSystemPrompt(locale: Locale = "ar"): string {
  return `You are ArabClue AI Bilingual Consistency Validator.
Compare paired EN/AR contract clauses for semantic equivalence.
Rules:
- Check only the clauseIds given in the request, copied verbatim.
- Flag material discrepancies — a party, obligation, period, percentage, exception, or remedy present in one language and absent or different in the other. Ignore stylistic differences.
- Quote the differing phrase in discrepancyEn/discrepancyAr; both empty when consistent. Never claim legal certainty.
- Output JSON only: { "checks": [{ "clauseId": string, "isConsistent": boolean, "discrepancyEn": string, "discrepancyAr": string }] }
${styleGuideFor(locale)}`;
}

// ---------------------------------------------------------------------------
// Answer schemas — the model's JSON is admitted only in this shape
// ---------------------------------------------------------------------------

const legalReviewStatusSchema = z.enum(["REQUIRED", "NOT_LEGAL_ADVICE"]);

const clauseAnswerSchema = z.object({
  clauseId: z.string(),
  titleEn: z.string(),
  titleAr: z.string(),
  bodyEn: z.string(),
  bodyAr: z.string(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]),
  riskNotesEn: z.string().nullable().optional(),
  riskNotesAr: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  legalReviewStatus: legalReviewStatusSchema.nullable().optional(),
});

const clausesAnswerSchema = z.object({ clauses: z.array(clauseAnswerSchema) });

const inferenceAnswerSchema = z.object({
  variableKey: z.string(),
  inferredValue: z.string(),
  confidence: z.number().nullable().optional(),
  source: z.string().nullable().optional(),
});

const inferencesAnswerSchema = z.object({ inferences: z.array(inferenceAnswerSchema) });

const checkAnswerSchema = z.object({
  clauseId: z.string(),
  isConsistent: z.boolean(),
  discrepancyEn: z.string().nullable().optional(),
  discrepancyAr: z.string().nullable().optional(),
});

const checksAnswerSchema = z.object({ checks: z.array(checkAnswerSchema) });

type ParsedAnswer<T> = { ok: true; data: T[] } | { ok: false; issues: string[] };

/** Clause identifiers the template names, in section order. */
function templateClauseIds(templateKey: ContractTemplateKey): ContractClauseId[] {
  const template = CONTRACT_TEMPLATE_CATALOG[templateKey];
  if (!template) return [];
  return template.sections.flatMap((section) => [...section.clauseIds]);
}

/**
 * The model's clauses, admitted only for the template's clause identifiers
 * (plus a bounded number of `custom.*` additions). An ungrounded clause is
 * kept as HIGH risk with legal review required rather than dressed up as a
 * template clause; HIGH always implies review. Provenance is the caller's.
 */
export function parseAiClauses(
  content: string,
  templateKey: ContractTemplateKey
): ParsedAnswer<Omit<ClauseSuggestion, "provenance">> {
  const parsed = parseJsonWithSchema(content, clausesAnswerSchema);
  if (!parsed.ok) return parsed;
  const allowed = new Set<string>(templateClauseIds(templateKey));
  const seen = new Set<string>();
  let custom = 0;
  const clauses: Omit<ClauseSuggestion, "provenance">[] = [];
  for (const c of parsed.data.clauses) {
    const clauseId = c.clauseId.trim();
    if (!clauseId || !c.bodyEn.trim() || !c.bodyAr.trim()) continue;
    if (seen.has(clauseId)) continue;
    const isCustom = CUSTOM_CLAUSE_ID_RE.test(clauseId);
    if (!allowed.has(clauseId) && !isCustom) continue;
    if (isCustom && custom >= MAX_CUSTOM_CLAUSES) continue;
    if (isCustom) custom += 1;
    seen.add(clauseId);

    const sourceRef = c.sourceRef?.trim() || null;
    const riskLevel: ClauseSuggestion["riskLevel"] =
      isCustom || !sourceRef ? "HIGH" : c.riskLevel;
    const legalReviewStatus: ClauseLegalReviewStatus =
      riskLevel === "HIGH" ? "REQUIRED" : c.legalReviewStatus ?? "NOT_LEGAL_ADVICE";
    clauses.push({
      clauseId,
      titleEn: c.titleEn,
      titleAr: c.titleAr,
      bodyEn: c.bodyEn,
      bodyAr: c.bodyAr,
      riskLevel,
      riskNotesEn: c.riskNotesEn ?? "",
      riskNotesAr: c.riskNotesAr ?? "",
      sourceRef,
      legalReviewStatus,
    });
  }
  return { ok: true, data: clauses };
}

/**
 * The model's variable values, admitted only for keys the template defines.
 * A value for an unknown key has nowhere to bind and is dropped.
 */
export function parseAiVariableInferences(
  content: string,
  templateKey: ContractTemplateKey
): ParsedAnswer<Omit<VariableInference, "provenance">> {
  const parsed = parseJsonWithSchema(content, inferencesAnswerSchema);
  if (!parsed.ok) return parsed;
  const template = CONTRACT_TEMPLATE_CATALOG[templateKey];
  const allowed = new Set<string>(template?.variables.map((v) => v.key) ?? []);
  const seen = new Set<string>();
  const inferences: Omit<VariableInference, "provenance">[] = [];
  for (const v of parsed.data.inferences) {
    const variableKey = v.variableKey.trim();
    const inferredValue = v.inferredValue.trim();
    if (!variableKey || !inferredValue || !allowed.has(variableKey) || seen.has(variableKey)) continue;
    seen.add(variableKey);
    inferences.push({
      variableKey,
      inferredValue,
      confidence:
        typeof v.confidence === "number" && Number.isFinite(v.confidence)
          ? Math.max(0, Math.min(1, v.confidence))
          : 0.5,
      source: v.source?.trim() || "ai_inference",
    });
  }
  return { ok: true, data: inferences };
}

/** The model's checks, one per clause it was shown; checks for other ids are dropped. */
export function parseAiConsistencyChecks(
  content: string,
  clauseIds: readonly string[]
): ParsedAnswer<Omit<BilingualConsistencyCheck, "provenance">> {
  const parsed = parseJsonWithSchema(content, checksAnswerSchema);
  if (!parsed.ok) return parsed;
  const allowed = new Set(clauseIds);
  const seen = new Set<string>();
  const checks: Omit<BilingualConsistencyCheck, "provenance">[] = [];
  for (const c of parsed.data.checks) {
    const clauseId = c.clauseId.trim();
    if (!allowed.has(clauseId) || seen.has(clauseId)) continue;
    seen.add(clauseId);
    checks.push({
      clauseId,
      isConsistent: c.isConsistent,
      discrepancyEn: c.discrepancyEn ?? "",
      discrepancyAr: c.discrepancyAr ?? "",
    });
  }
  return { ok: true, data: checks };
}

// ---------------------------------------------------------------------------
// Deterministic fallbacks
// ---------------------------------------------------------------------------

function deterministicClauseSuggestions(
  input: ContractDraftingInput
): ClauseSuggestion[] {
  const template = CONTRACT_TEMPLATE_CATALOG[input.templateKey];
  if (!template) return [];

  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "contract-template-catalog",
    engine: "LAW",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  const clauses: ClauseSuggestion[] = [];
  for (const section of template.sections) {
    for (const clauseId of section.clauseIds) {
      const def = CONTRACT_CLAUSE_CATALOG[clauseId];
      if (!def) continue;

      const riskLevel: ClauseSuggestion["riskLevel"] =
        def.category === "RISK" || def.applicability === "COUNSEL_DECISION"
          ? "HIGH"
          : def.applicability === "TENDER_SPECIFIC"
            ? "MEDIUM"
            : "LOW";

      const riskNotesEn =
        riskLevel === "HIGH"
          ? "This clause requires authorized Saudi counsel review before execution."
          : riskLevel === "MEDIUM"
            ? "Tender-specific clause — verify against tender documents."
            : "Standard clause — review for completeness.";

      const riskNotesAr =
        riskLevel === "HIGH"
          ? "يتطلب هذا البند مراجعة مستشار قانوني سعودي معتمد قبل التنفيذ."
          : riskLevel === "MEDIUM"
            ? "بند خاص بالمنافسة — يلزم التحقق من مستندات المنافسة."
            : "بند قياسي — يلزم المراجعة للاكتمال.";

      const bodyEn = extractClauseText(def, "en");
      const bodyAr = extractClauseText(def, "ar");

      clauses.push({
        clauseId,
        titleEn: def.title.en,
        titleAr: def.title.ar,
        bodyEn,
        bodyAr,
        riskLevel,
        riskNotesEn,
        riskNotesAr,
        sourceRef: `template:${clauseId}`,
        legalReviewStatus: riskLevel === "HIGH" ? "REQUIRED" : "NOT_LEGAL_ADVICE",
        provenance,
      });
    }
  }
  return clauses;
}

function extractClauseText(
  def: (typeof CONTRACT_CLAUSE_CATALOG)[ContractClauseId],
  lang: "en" | "ar"
): string {
  const parts = def.blocks[0]?.content[lang] ?? [];
  return parts
    .map((node) =>
      node.type === "TEXT" ? node.value : `[${node.variableKey}]`
    )
    .join("");
}

function deterministicVariableInferences(
  input: ContractDraftingInput
): VariableInference[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "tender-entity-extractor",
    engine: "LAW",
    generatedAt: new Date().toISOString(),
    confidence: 0.7,
    fallback: true,
  };

  const inferences: VariableInference[] = [];
  const e = input.entities;

  if (e?.scope) {
    inferences.push({
      variableKey: "input.scopeDescription",
      inferredValue: e.scope.slice(0, 2000),
      confidence: 0.85,
      source: "tender_ingestion_scope",
      provenance,
    });
  }

  if (e?.milestones?.length) {
    inferences.push({
      variableKey: "input.deliverablesSchedule",
      inferredValue: e.milestones
        .map((m) => `${m.name} (${m.weeks} weeks)`)
        .join("; "),
      confidence: 0.8,
      source: "tender_ingestion_milestones",
      provenance,
    });
  }

  if (input.projectTitle) {
    inferences.push({
      variableKey: "input.tenderReference",
      inferredValue: input.etimadRef || input.projectTitle,
      confidence: 0.75,
      source: "project_metadata",
      provenance,
    });
  }

  if (e?.sla) {
    inferences.push({
      variableKey: "input.serviceLevelSchedule",
      inferredValue: `Delay penalty: ${e.sla.perWeek}% per week, max ${e.sla.maxPercent}%`,
      confidence: 0.8,
      source: "tender_ingestion_sla",
      provenance,
    });
  }

  return inferences;
}

function deterministicConsistencyChecks(
  clauses: ClauseSuggestion[]
): BilingualConsistencyCheck[] {
  const provenance: AiProvenance = {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "bilingual-presence-check",
    engine: "LAW",
    generatedAt: new Date().toISOString(),
    confidence: 0.65,
    fallback: true,
  };

  return clauses.map((c) => {
    const hasEn = c.bodyEn.trim().length > 0;
    const hasAr = c.bodyAr.trim().length > 0;
    // One discrepancy, stated in both languages — the Arabic message used to
    // report the English body empty when it was the Arabic one that was.
    const [discrepancyEn, discrepancyAr] =
      hasEn && hasAr
        ? ["", ""]
        : !hasEn && !hasAr
          ? ["Both language bodies are empty", "نص البند فارغ في اللغتين"]
          : !hasEn
            ? ["English body is empty", "نص البند بالإنجليزية فارغ"]
            : ["Arabic body is empty", "نص البند بالعربية فارغ"];
    return {
      clauseId: c.clauseId,
      isConsistent: hasEn && hasAr,
      discrepancyEn,
      discrepancyAr,
      provenance,
    };
  });
}

// ---------------------------------------------------------------------------
// AI-powered clause generation
// ---------------------------------------------------------------------------

export async function generateClauseSuggestions(
  input: ContractDraftingInput
): Promise<ClauseSuggestion[]> {
  const deterministic = deterministicClauseSuggestions(input);
  const locale = input.locale ?? "ar";

  try {
    const template = CONTRACT_TEMPLATE_CATALOG[input.templateKey];
    const contextJson = JSON.stringify({
      templateKey: input.templateKey,
      // The clauses the model drafts, by the identifiers the catalog knows;
      // anything else it returns is dropped by parseAiClauses.
      templateClauses:
        template?.sections.flatMap((section) =>
          section.clauseIds.map((clauseId) => {
            const def = CONTRACT_CLAUSE_CATALOG[clauseId];
            return {
              clauseId,
              section: section.key,
              titleEn: def?.title.en ?? clauseId,
              titleAr: def?.title.ar ?? clauseId,
              applicability: def?.applicability ?? "GENERAL",
            };
          })
        ) ?? [],
      projectTitle: input.projectTitle,
      etimadRef: input.etimadRef,
      scope: input.entities?.scope?.slice(0, 2000) ?? null,
      milestones: input.entities?.milestones?.slice(0, 10) ?? [],
      sla: input.entities?.sla ?? null,
      complianceHighlights: input.complianceRows
        .filter((r) => r.status === "LEGAL_REVIEW_REQUIRED" || r.status === "PARTIAL")
        .slice(0, 15)
        .map((r) => ({
          controlId: r.controlId,
          status: r.status,
          policyVersionId: r.policyVersionId ?? null,
        })),
      frameworks: {
        procurementLaw: PROCUREMENT_LAW.citation,
        pdpl: PDPL_RULES.residencyEvaluationNote,
        ncaEcc: NCA_FRAMEWORKS.ecc,
        ncaCcc: NCA_FRAMEWORKS.ccc,
      },
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: buildClauseGenerationSystemPrompt(locale, contextJson),
      },
      {
        role: "user",
        content: `Generate bilingual clause suggestions for this Saudi procurement contract:\n${contextJson}\n\nDraft each clause listed under templateClauses for the ${input.templateKey} template. Return JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "LAW",
      temperature: 0.15,
      maxTokens: 8192,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "contract-drafting-assistant:generateClauseSuggestions");
      return deterministic;
    }

    const parsed = parseAiClauses(result.content, input.templateKey);
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "contract-drafting-assistant:generateClauseSuggestions"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.data.map((c) => ({
      ...c,
      provenance,
    }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[contract-drafting-assistant] LLM clause generation failed, using deterministic", err);
    guardCaughtOrThrow(err, "contract-drafting-assistant:generateClauseSuggestions");
    return deterministic;
  }
}

// ---------------------------------------------------------------------------
// AI-powered variable inference
// ---------------------------------------------------------------------------

export async function inferTemplateVariables(
  input: ContractDraftingInput
): Promise<VariableInference[]> {
  const deterministic = deterministicVariableInferences(input);

  const locale = input.locale ?? "ar";

  try {
    const template = CONTRACT_TEMPLATE_CATALOG[input.templateKey];
    if (!template) return deterministic;

    const contextJson = JSON.stringify({
      variables: template.variables.map((v) => ({
        key: v.key,
        type: v.type,
        labelEn: v.label.en,
        required: v.required,
      })),
      projectTitle: input.projectTitle,
      etimadRef: input.etimadRef,
      entities: {
        scope: input.entities?.scope?.slice(0, 2000) ?? null,
        milestones: input.entities?.milestones?.slice(0, 10) ?? [],
        sla: input.entities?.sla ?? null,
        evaluation: input.entities?.evaluation ?? null,
        localContentPreferencePercent:
          input.entities?.localContentPreferencePercent ?? null,
      },
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: buildVariableInferenceSystemPrompt(locale, contextJson),
      },
      {
        role: "user",
        content: `Infer template variable values from this project/tender data:\n${contextJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "LAW",
      temperature: 0.1,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "contract-drafting-assistant:inferTemplateVariables");
      return deterministic;
    }

    const parsed = parseAiVariableInferences(result.content, input.templateKey);
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "contract-drafting-assistant:inferTemplateVariables"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.data.map((v) => ({
      ...v,
      provenance,
    }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[contract-drafting-assistant] LLM variable inference failed, using deterministic", err);
    guardCaughtOrThrow(err, "contract-drafting-assistant:inferTemplateVariables");
    return deterministic;
  }
}

// ---------------------------------------------------------------------------
// AI-powered bilingual consistency validation
// ---------------------------------------------------------------------------

export async function validateBilingualConsistency(
  clauses: ClauseSuggestion[]
): Promise<BilingualConsistencyCheck[]> {
  const deterministic = deterministicConsistencyChecks(clauses);
  const reviewed = clauses.slice(0, 20);

  try {
    const clausesJson = JSON.stringify(
      reviewed.map((c) => ({
        clauseId: c.clauseId,
        bodyEn: c.bodyEn.slice(0, 500),
        bodyAr: c.bodyAr.slice(0, 500),
      }))
    ).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildConsistencyCheckSystemPrompt("ar") },
      {
        role: "user",
        content: `Validate bilingual consistency of these clause pairs:\n${clausesJson}\n\nReturn JSON only.`,
      },
    ];

    const result = await generateCompletion(messages, {
      engine: "LAW",
      temperature: 0.1,
      maxTokens: 4096,
    });

    if (result.fallback || !result.content) {
      guardOrThrow(result, "contract-drafting-assistant:validateBilingualConsistency");
      return deterministic;
    }

    const parsed = parseAiConsistencyChecks(
      result.content,
      reviewed.map((c) => c.clauseId)
    );
    if (!parsed.ok) {
      guardOrThrow(
        schemaRejection(result, parsed.issues),
        "contract-drafting-assistant:validateBilingualConsistency"
      );
      return deterministic;
    }
    if (parsed.data.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    // Clauses the model skipped keep the deterministic presence check, with
    // its own provenance, so every clause still has exactly one verdict.
    const byClause = new Map(parsed.data.map((c) => [c.clauseId, { ...c, provenance }]));
    return deterministic.map((d) => byClause.get(d.clauseId) ?? d);
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[contract-drafting-assistant] LLM consistency check failed, using deterministic", err);
    guardCaughtOrThrow(err, "contract-drafting-assistant:validateBilingualConsistency");
    return deterministic;
  }
}

// ---------------------------------------------------------------------------
// Full contract drafting orchestration
// ---------------------------------------------------------------------------

export async function draftContractWithAi(
  input: ContractDraftingInput
): Promise<ContractDraftingResult> {
  const [clauses, variableInferences] = await Promise.all([
    generateClauseSuggestions(input),
    inferTemplateVariables(input),
  ]);

  const consistencyChecks = await validateBilingualConsistency(clauses);

  // Build a contentMd for validation gate
  const contentMd = buildContentMd(clauses, input);
  const validation = validateContractDraft(contentMd);

  const provenance: AiProvenance = clauses[0]?.provenance ?? {
    source: "DETERMINISTIC_FALLBACK",
    provider: "deterministic",
    model: "contract-template-catalog",
    engine: "LAW",
    generatedAt: new Date().toISOString(),
    confidence: 0.6,
    fallback: true,
  };

  return {
    clauses,
    variableInferences,
    consistencyChecks,
    validationOk: validation.ok,
    validationIssues: validation.issues.map((i) => ({
      code: i.code,
      severity: i.severity,
      message: i.message,
    })),
    provenance,
  };
}

function buildContentMd(
  clauses: ClauseSuggestion[],
  input: ContractDraftingInput
): string {
  const articleBlocks = clauses
    .map(
      (c, i) =>
        `### Article ${i + 1} — ${c.titleEn} | المادة ${i + 1} — ${c.titleAr}\n:::en\n${c.bodyEn}\n:::\n:::ar\n${c.bodyAr}\n:::`
    )
    .join("\n\n");

  return `# DRAFT CONTRACT | مسودة عقد
> NOT LEGAL ADVICE | ليست استشارة قانونية
> Authorized human legal review required before signature.
> يلزم مراجعة قانونية بشرية معتمدة قبل التوقيع.

**Project / المشروع:** ${input.projectTitle}
**Reference / المرجع:** ${input.etimadRef || "—"}

# OPERATIVE ARTICLES | البنود النافذة

${articleBlocks}

---
${LEGAL_DISCLAIMER}
${LEGAL_DISCLAIMER_AR}
`;
}
