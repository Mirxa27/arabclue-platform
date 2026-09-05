import { z } from "zod";
import { generateCompletion } from "../llm";
import { guardOrThrow } from "../ai/provider-unavailable";
import { parseJsonWithSchema, schemaRejection } from "../ai/json-output";
import {
  appendGlossaryWithinBudget,
  detectDominantLocale,
  styleGuideFor,
} from "../ai/style-guide";
import {
  SYSTEM_INGESTION,
  SYSTEM_COMPLIANCE,
  SYSTEM_TECHNICAL,
  SYSTEM_FINANCIAL,
  enrichUserPrompt,
} from "./prompts";

// ---------------------------------------------------------------------------
// Answer shapes — what the orchestrator reads, validated before it reads it
// ---------------------------------------------------------------------------

/**
 * Free-text lists (notes, findings, evidence). A stray null or number in one
 * is dropped rather than failing the whole answer: nothing downstream treats
 * these entries as facts, they are prose the run appends to its findings.
 */
const stringList = z
  .array(z.unknown())
  .transform((items) =>
    items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
  );

/**
 * Enums are strict on meaning and tolerant on formatting: "Legal Review
 * Required" normalizes to LEGAL_REVIEW_REQUIRED, anything outside the
 * vocabulary fails the schema. A status the matrix does not know must never
 * be written into it — today's caller cast it straight through.
 */
function normalizedEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_")
        : value,
    z.enum(values)
  );
}

const COMPLIANCE_STATUSES = [
  "COMPLIANT",
  "NON_COMPLIANT",
  "PARTIAL",
  "NOT_APPLICABLE",
  "EVIDENCE_MISSING",
  "CLARIFICATION_REQUIRED",
  "LEGAL_REVIEW_REQUIRED",
] as const;

const SOURCE_CATEGORIES = [
  "EXPLICIT_TENDER",
  "REGULATORY_CANDIDATE",
  "INFERRED_APPLICABILITY",
  "INTERNAL_RECOMMENDATION",
] as const;

/** Numbers stay from the deterministic parse; only the narrative fields are read. */
export const ingestionEnrichmentSchema = z.looseObject({
  scope: z.string().nullable().optional(),
  evidence: stringList.optional(),
  refinementNotes: stringList.optional(),
});

export const complianceEnrichmentSchema = z.looseObject({
  findings: stringList.optional(),
  rowUpdates: z
    .array(
      z.looseObject({
        controlId: z.string().min(1),
        evidence: z.string().nullable().optional(),
        status: normalizedEnum(COMPLIANCE_STATUSES).nullable().optional(),
        remediation: z.string().nullable().optional(),
        sourceCategory: normalizedEnum(SOURCE_CATEGORIES).nullable().optional(),
      })
    )
    .optional(),
});

const narrativeField = z.string().nullable().optional();

export const technicalEnrichmentSchema = z.looseObject({
  solutionApproach: narrativeField,
  vision2030Notes: narrativeField,
  deliveryModel: narrativeField,
  governance: narrativeField,
  qualityPlan: narrativeField,
  riskPlan: narrativeField,
  securityPrivacy: narrativeField,
  serviceManagement: narrativeField,
  trainingTransition: narrativeField,
  continuity: narrativeField,
  evaluationAlignment: narrativeField,
  findings: stringList.optional(),
});

export const financialEnrichmentSchema = z.looseObject({
  notes: stringList.optional(),
  findings: stringList.optional(),
  narrative: narrativeField,
});

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

/** Glossary budget inside an enrichment prompt; the SYSTEM_* rules come first. */
const ENRICH_GLOSSARY_CHARS = 1_200;

/**
 * The shared system turn plus the house style for the language the payload is
 * written in. The pipeline passes no locale here — the same leg polishes an
 * Arabic technical narrative and an English compliance matrix — so the guide
 * follows the text it is about to polish, and the glossary is filtered to the
 * terms that text uses and sized to the room the SYSTEM_* rules leave.
 */
export function enrichSystemPrompt(system: string, payloadText: string): string {
  const locale = detectDominantLocale(payloadText);
  const head = `${system}\n\n${styleGuideFor(locale)}`;
  return appendGlossaryWithinBudget(head, locale, payloadText, {
    maxChars: ENRICH_GLOSSARY_CHARS,
  });
}

async function enrichJson(
  system: string,
  kind: string,
  payload: unknown,
  engine: "INGESTION" | "COMPLIANCE" | "TECHNICAL" | "FINANCIAL",
  schema: z.ZodType<Record<string, unknown>>
): Promise<{ data: Record<string, unknown> | null; provider: string; tokensUsed: number; fallback: boolean }> {
  const payloadText = JSON.stringify(payload ?? null);
  const result = await generateCompletion(
    [
      { role: "system", content: enrichSystemPrompt(system, payloadText) },
      { role: "user", content: enrichUserPrompt(kind, payload) },
    ],
    { maxTokens: 2048, temperature: 0.2, engine, promptOrigin: "system" }
  );
  if (result.fallback || !result.content) {
    guardOrThrow(result, `enrich:${kind}`);
    return { data: null, provider: result.provider, tokensUsed: result.tokensUsed, fallback: true };
  }
  const parsed = parseJsonWithSchema(result.content, schema);
  // A malformed or mis-shaped answer is a guardrail rejection, not a quiet
  // downgrade: a strict deploy refuses, a permissive one keeps the
  // deterministic leg and reports the fallback.
  if (!parsed.ok) guardOrThrow(schemaRejection(result, parsed.issues), `enrich:${kind}`);
  const data = parsed.ok ? parsed.data : null;
  return {
    data,
    provider: result.provider,
    tokensUsed: result.tokensUsed,
    fallback: !data,
  };
}

/** LLM polish for ingestion entities (optional; deterministic parse remains source of truth for numbers) */
export async function enrichIngestionWithAi(payload: unknown) {
  return enrichJson(SYSTEM_INGESTION, "ingestion", payload, "INGESTION", ingestionEnrichmentSchema);
}

export async function enrichComplianceWithAi(payload: unknown) {
  return enrichJson(SYSTEM_COMPLIANCE, "compliance", payload, "COMPLIANCE", complianceEnrichmentSchema);
}

export async function enrichTechnicalWithAi(payload: unknown) {
  return enrichJson(SYSTEM_TECHNICAL, "technical", payload, "TECHNICAL", technicalEnrichmentSchema);
}

export async function enrichFinancialWithAi(payload: unknown) {
  return enrichJson(SYSTEM_FINANCIAL, "financial", payload, "FINANCIAL", financialEnrichmentSchema);
}
