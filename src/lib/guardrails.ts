/**
 * Runtime safety guardrails for LLM completions.
 * Mirrors AIProviderConfig flags: toxicityFilter, hallucinationGuard, confidenceThreshold, piiFilter.
 */

import type { AIProviderConfig } from "@prisma/client";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const TOXIC_PATTERNS: RegExp[] = [
  /\b(kill yourself|kys)\b/i,
  /\b(bomb making|build a bomb)\b/i,
  /\b(credit card number|ssn:\s*\d)/i,
];

/** Phrases that typically signal ungrounded / fabricated claims */
const HALLUCINATION_CUES: RegExp[] = [
  /\bas an ai (language )?model\b/i,
  /\bi (don't|do not) have (access|real[- ]time)\b/i,
  /\bmy (training|knowledge) (data|cutoff)\b/i,
  /\baccording to (my|the) (knowledge|training)\b/i,
  /\b(?:etimad|اعتماد)\s*(?:ref|reference|#)?\s*[:#]?\s*[A-Z0-9-]{12,}\b/i,
];

export function applyInputPiiFilter(
  messages: LLMMessage[],
  enabled: boolean
): LLMMessage[] {
  if (!enabled) return messages;
  return messages.map((m) => ({ ...m, content: redactPii(m.content) }));
}

export function redactPii(text: string): string {
  return text
    .replace(/\b1\d{9}\b/g, "[REDACTED_NATIONAL_ID]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[REDACTED_EMAIL]")
    .replace(/\b0?5\d{8}\b/g, "[REDACTED_PHONE]")
    .replace(/\b9665\d{8}\b/g, "[REDACTED_PHONE]");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/**
 * Estimate how grounded the output is in the input context (0–1).
 * High novelty vs input reduces confidence — used with hallucinationGuard.
 */
export function estimateGroundingConfidence(
  output: string,
  messages: LLMMessage[]
): number {
  const context = messages.map((m) => m.content).join("\n");
  const outTokens = tokenize(output);
  const ctxTokens = tokenize(context);
  if (outTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of outTokens) {
    if (ctxTokens.has(t)) overlap++;
  }
  const lexical = overlap / outTokens.size;
  // Reward structured procurement language even when paraphrased
  const hasVision = /vision\s*2030|رؤية\s*2030/i.test(output);
  const hasProcurement =
    /etimad|اعتماد|nca|pdpl|local content|محتوى محلي|qlr|saudization|سعودة/i.test(
      output
    );
  let score = lexical * 0.7 + (hasVision ? 0.1 : 0) + (hasProcurement ? 0.15 : 0);
  if (HALLUCINATION_CUES.some((r) => r.test(output))) score -= 0.25;
  return Math.max(0, Math.min(0.99, score));
}

export function failsToxicityFilter(text: string): boolean {
  return TOXIC_PATTERNS.some((r) => r.test(text));
}

export type GuardrailResult = {
  content: string;
  confidence: number;
  rejected: boolean;
  reasons: string[];
};

/**
 * Apply provider guardrails to model output.
 * Rejected outputs must fall back to deterministic pipeline content.
 */
export function applyOutputGuardrails(
  content: string,
  provider: AIProviderConfig,
  messages: LLMMessage[],
  baseConfidence: number
): GuardrailResult {
  const reasons: string[] = [];
  let confidence = baseConfidence;
  let out = content.trim();

  if (!out) {
    return { content: "", confidence: 0, rejected: true, reasons: ["empty_output"] };
  }

  if (provider.toxicityFilter && failsToxicityFilter(out)) {
    return {
      content: "",
      confidence: 0,
      rejected: true,
      reasons: ["toxicity_filter"],
    };
  }

  if (provider.hallucinationGuard) {
    const grounding = estimateGroundingConfidence(out, messages);
    confidence = Math.min(confidence, grounding + 0.35);
    // Drop fabricated long Etimad-style refs not present in input
    const ctx = messages.map((m) => m.content).join("\n");
    out = out.replace(
      /\b(?:ETM|ETIMAD|اعتماد)[-_\s]?[A-Z0-9]{8,}\b/gi,
      (match) => (ctx.toLowerCase().includes(match.toLowerCase()) ? match : "[REF_OMITTED]")
    );
    if (HALLUCINATION_CUES.some((r) => r.test(out))) {
      reasons.push("hallucination_cues");
      confidence *= 0.7;
    }
  }

  if (provider.piiFilter) {
    out = redactPii(out);
  }

  if (confidence < provider.confidenceThreshold) {
    reasons.push(
      `confidence_${confidence.toFixed(2)}_below_${provider.confidenceThreshold}`
    );
    return { content: "", confidence, rejected: true, reasons };
  }

  return { content: out, confidence, rejected: false, reasons };
}
