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
  type LocalizedText,
} from "../document-templates/contract-templates";
import { validateContractDraft } from "../agents/law-contract";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "./provider-unavailable";
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

export type ClauseSuggestion = {
  clauseId: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  riskNotesEn: string;
  riskNotesAr: string;
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
// System prompt builder — no hardcoded prompts; assembled from registry
// ---------------------------------------------------------------------------

function buildClauseGenerationSystemPrompt(): string {
  return `You are ArabClue AI Contract Drafting Assistant — bilingual EN/AR clause generation engine.
${NO_PRICING_RULE}
${REGULATORY_PRECISION_RULE}

You generate bilingual contract clause suggestions for Saudi procurement engagements.
Rules:
- Generate clauses in paired EN/AR format using :::en and :::ar blocks.
- Every clause must reference applicable Saudi frameworks: ${PROCUREMENT_LAW.nameEn} / ${PROCUREMENT_LAW.nameAr}.
- Flag high-risk clauses (liability, termination, IP, data protection) with risk notes.
- Never claim 100% legal certainty.
- Include: "${LEGAL_DISCLAIMER}"
- Output JSON only: { "clauses": [{ "clauseId": string, "titleEn": string, "titleAr": string, "bodyEn": string, "bodyAr": string, "riskLevel": "LOW"|"MEDIUM"|"HIGH", "riskNotesEn": string, "riskNotesAr": string }] }`;
}

function buildVariableInferenceSystemPrompt(): string {
  return `You are ArabClue AI Variable Inference Engine for contract templates.
${NO_PRICING_RULE}
Analyze project/tender data and suggest template variable values.
Rules:
- Only infer values supported by tender evidence or project data.
- Never fabricate legal names, dates, or commercial terms.
- Output JSON only: { "inferences": [{ "variableKey": string, "inferredValue": string, "confidence": number, "source": string }] }`;
}

function buildConsistencyCheckSystemPrompt(): string {
  return `You are ArabClue AI Bilingual Consistency Validator.
Compare paired EN/AR contract clauses for semantic equivalence.
Rules:
- Flag material discrepancies (not stylistic differences).
- Never claim legal certainty.
- Output JSON only: { "checks": [{ "clauseId": string, "isConsistent": boolean, "discrepancyEn": string, "discrepancyAr": string }] }`;
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

  return clauses.map((c) => ({
    clauseId: c.clauseId,
    isConsistent: c.bodyEn.trim().length > 0 && c.bodyAr.trim().length > 0,
    discrepancyEn: c.bodyEn.trim() ? "" : "English body is empty",
    discrepancyAr: c.bodyAr.trim() ? "" : "نص البند بالإنجليزية فارغ",
    provenance,
  }));
}

// ---------------------------------------------------------------------------
// AI-powered clause generation
// ---------------------------------------------------------------------------

export async function generateClauseSuggestions(
  input: ContractDraftingInput
): Promise<ClauseSuggestion[]> {
  const deterministic = deterministicClauseSuggestions(input);

  try {
    const contextJson = JSON.stringify({
      templateKey: input.templateKey,
      projectTitle: input.projectTitle,
      etimadRef: input.etimadRef,
      scope: input.entities?.scope?.slice(0, 2000) ?? null,
      milestones: input.entities?.milestones?.slice(0, 10) ?? [],
      sla: input.entities?.sla ?? null,
      complianceHighlights: input.complianceRows
        .filter((r) => r.status === "LEGAL_REVIEW_REQUIRED" || r.status === "PARTIAL")
        .slice(0, 15)
        .map((r) => ({ controlId: r.controlId, status: r.status })),
      frameworks: {
        procurementLaw: PROCUREMENT_LAW.citation,
        pdpl: PDPL_RULES.residencyEvaluationNote,
        ncaEcc: NCA_FRAMEWORKS.ecc,
        ncaCcc: NCA_FRAMEWORKS.ccc,
      },
    }).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildClauseGenerationSystemPrompt() },
      {
        role: "user",
        content: `Generate bilingual clause suggestions for this Saudi procurement contract:\n${contextJson}\n\nGenerate clauses for each section of the ${input.templateKey} template. Return JSON only.`,
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

    const parsed = safeParseClauseSuggestions(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((c) => ({
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

function safeParseClauseSuggestions(
  content: string
): ClauseSuggestion[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.clauses || !Array.isArray(parsed.clauses)) return null;

    return parsed.clauses
      .filter(
        (c: unknown): c is Record<string, unknown> =>
          typeof c === "object" && c !== null
      )
      .map((c) => ({
        clauseId: String(c.clauseId ?? ""),
        titleEn: String(c.titleEn ?? ""),
        titleAr: String(c.titleAr ?? ""),
        bodyEn: String(c.bodyEn ?? ""),
        bodyAr: String(c.bodyAr ?? ""),
        riskLevel: (["LOW", "MEDIUM", "HIGH"].includes(String(c.riskLevel))
          ? String(c.riskLevel)
          : "MEDIUM") as ClauseSuggestion["riskLevel"],
        riskNotesEn: String(c.riskNotesEn ?? ""),
        riskNotesAr: String(c.riskNotesAr ?? ""),
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "LAW",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((c) => c.clauseId && c.bodyEn && c.bodyAr);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered variable inference
// ---------------------------------------------------------------------------

export async function inferTemplateVariables(
  input: ContractDraftingInput
): Promise<VariableInference[]> {
  const deterministic = deterministicVariableInferences(input);

  try {
    const template = CONTRACT_TEMPLATE_CATALOG[input.templateKey];
    if (!template) return deterministic;

    const variableKeys = template.variables.map((v) => v.key);

    const contextJson = JSON.stringify({
      variableKeys,
      projectTitle: input.projectTitle,
      etimadRef: input.etimadRef,
      scope: input.entities?.scope?.slice(0, 2000) ?? null,
      milestones: input.entities?.milestones?.slice(0, 10) ?? [],
      sla: input.entities?.sla ?? null,
      evaluation: input.entities?.evaluation ?? null,
      localContentPreferencePercent: input.entities?.localContentPreferencePercent ?? null,
    }).slice(0, 10000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildVariableInferenceSystemPrompt() },
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

    const parsed = safeParseVariableInferences(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((v) => ({
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

function safeParseVariableInferences(
  content: string
): VariableInference[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.inferences || !Array.isArray(parsed.inferences)) return null;

    return parsed.inferences
      .filter(
        (v: unknown): v is Record<string, unknown> =>
          typeof v === "object" && v !== null
      )
      .map((v) => ({
        variableKey: String(v.variableKey ?? ""),
        inferredValue: String(v.inferredValue ?? ""),
        confidence: typeof v.confidence === "number" ? v.confidence : 0.5,
        source: String(v.source ?? "ai_inference"),
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "LAW",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((v) => v.variableKey && v.inferredValue);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// AI-powered bilingual consistency validation
// ---------------------------------------------------------------------------

export async function validateBilingualConsistency(
  clauses: ClauseSuggestion[]
): Promise<BilingualConsistencyCheck[]> {
  const deterministic = deterministicConsistencyChecks(clauses);

  try {
    const clausesJson = JSON.stringify(
      clauses.slice(0, 20).map((c) => ({
        clauseId: c.clauseId,
        bodyEn: c.bodyEn.slice(0, 500),
        bodyAr: c.bodyAr.slice(0, 500),
      }))
    ).slice(0, 12000);

    const messages: LLMMessage[] = [
      { role: "system", content: buildConsistencyCheckSystemPrompt() },
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

    const parsed = safeParseConsistencyChecks(result.content);
    if (!parsed || parsed.length === 0) return deterministic;

    const provenance: AiProvenance = {
      source: "AI_GENERATED",
      provider: result.provider,
      model: result.model,
      engine: result.engine ?? "LAW",
      generatedAt: new Date().toISOString(),
      confidence: result.confidence,
      fallback: false,
    };

    return parsed.map((c) => ({
      ...c,
      provenance,
    }));
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[contract-drafting-assistant] LLM consistency check failed, using deterministic", err);
    guardCaughtOrThrow(err, "contract-drafting-assistant:validateBilingualConsistency");
    return deterministic;
  }
}

function safeParseConsistencyChecks(
  content: string
): BilingualConsistencyCheck[] | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.checks || !Array.isArray(parsed.checks)) return null;

    return parsed.checks
      .filter(
        (c: unknown): c is Record<string, unknown> =>
          typeof c === "object" && c !== null
      )
      .map((c) => ({
        clauseId: String(c.clauseId ?? ""),
        isConsistent: Boolean(c.isConsistent),
        discrepancyEn: String(c.discrepancyEn ?? ""),
        discrepancyAr: String(c.discrepancyAr ?? ""),
        provenance: {
          source: "AI_GENERATED" as const,
          provider: "pending",
          model: "pending",
          engine: "LAW",
          generatedAt: new Date().toISOString(),
          confidence: 0.8,
          fallback: false,
        },
      }))
      .filter((c) => c.clauseId);
  } catch {
    return null;
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
