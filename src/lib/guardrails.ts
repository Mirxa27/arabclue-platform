/**
 * Runtime safety guardrails for LLM completions.
 * Mirrors AIProviderConfig flags: toxicityFilter, hallucinationGuard, confidenceThreshold, piiFilter.
 * Enforces product Section 2: no pricing / commercial strategy assistance.
 */

import type { AIProviderConfig } from "@prisma/client";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const PRICING_REFUSAL_MESSAGE =
  "Enter prices in the financial forms; ArabClue does not price bids, suggest discounts, margins, or commercial strategy.";

const TOXIC_PATTERNS: RegExp[] = [
  /\b(kill yourself|kys)\b/i,
  /\b(bomb making|build a bomb)\b/i,
  /\b(credit card number|ssn:\s*\d)/i,
];

/** Phrases that typically signal ungrounded / fabricated claims */
/** The model talking about itself instead of the tender. */
const AI_SELF_REFERENCE_CUES: RegExp[] = [
  /\bas an ai (language )?model\b/i,
  /\bi (don't|do not) have (access|real[- ]time)\b/i,
  /\bmy (training|knowledge) (data|cutoff)\b/i,
  /\baccording to (my|the) (knowledge|training)\b/i,
];
/**
 * An Etimad reference in prose. A cue for the grounding *score* only — whether
 * a given reference is fabricated is decided by the redaction below, which
 * keeps the ones present in the context. Treating every reference as a
 * hallucination penalised proposals for quoting the tender's own number.
 */
const ETIMAD_REF_CUE =
  /\b(?:etimad|اعتماد)\s*(?:ref|reference|#)?\s*[:#]?\s*[A-Z0-9-]{12,}\b/i;
const HALLUCINATION_CUES: RegExp[] = [...AI_SELF_REFERENCE_CUES, ETIMAD_REF_CUE];

/** Bid pricing / commercial strategy — must refuse (Section 2) */
const PRICING_INPUT_PATTERNS: RegExp[] = [
  /\b(suggest|recommend|propose|calculate|compute|set|fill|populate)\b.{0,40}\b(price|pricing|unit\s*price|bid\s*total|discount|margin|markup)\b/i,
  /\b(price|pricing|unit\s*price|bid\s*total|discount|margin|markup)\b.{0,40}\b(suggest|recommend|propose|calculate|compute)\b/i,
  /\b(how\s+much\s+should\s+(we|i)\s+(bid|charge|price))\b/i,
  /\b(commercial\s+strategy|pricing\s+strategy|win\s+price|competitive\s+price)\b/i,
  // No `\b` around Arabic: JS word boundaries are ASCII-only, so `\b` can never
  // hold either side of an Arabic alternative and silently kills the pattern.
  /(ما\s*هو\s*السعر|اقترح\s*سعر|احسب\s*السعر|حدد\s*سعر)/,
  /هامش\s*(ال)?ربح/,
  // Bare خصم also reads as an ordinary contract term, so require the ask.
  /(نسبة|قيمة|مقدار|احسب|حدد|اقترح)\s*(ال)?خصم/,
  /\bwhat\s+(unit\s*)?price\s+should\b/i,
  /\bfill\s+(in\s+)?(the\s+)?(boq|bill\s+of\s+quantities)\s+(prices|amounts)\b/i,
];

const PRICING_OUTPUT_PATTERNS: RegExp[] = [
  /\b(recommended|suggested)\s+(unit\s*)?price\b/i,
  /\b(you\s+should\s+(bid|price|charge)\s+(at|around)?\s*[\d,]+)\b/i,
  /\b(margin|markup)\s+(of\s+)?\d+(\.\d+)?\s*%/i,
  /\b(discount\s+of\s+\d+)\b/i,
  /\bunit\s*price\s*[:=]\s*[\d,]+(\.\d+)?/i,
  /(نوصي\s*بسعر|السعر\s*المقترح|هامش\s*\d+(\.\d+)?\s*%)/,
];

export function detectPricingRequest(text: string): boolean {
  return PRICING_INPUT_PATTERNS.some((r) => r.test(text));
}

export function detectPricingSuggestion(text: string): boolean {
  return PRICING_OUTPUT_PATTERNS.some((r) => r.test(text));
}

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

/**
 * Refuse pricing-related user prompts before model call.
 */
export function applyPricingInputGuardrails(
  messages: LLMMessage[]
): { allowed: true } | { allowed: false; message: string } {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  if (detectPricingRequest(userText)) {
    return { allowed: false, message: PRICING_REFUSAL_MESSAGE };
  }
  return { allowed: true };
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

  if (detectPricingSuggestion(out)) {
    return {
      content: PRICING_REFUSAL_MESSAGE,
      confidence: 0,
      rejected: true,
      reasons: ["pricing_guardrail"],
    };
  }

  if (provider.toxicityFilter && failsToxicityFilter(out)) {
    return {
      content: "",
      confidence: 0,
      rejected: true,
      reasons: ["toxicity_filter"],
    };
  }

  // Signals that the model made something up, as opposed to merely saying it
  // in its own words. Only these make a low confidence fatal.
  let fabricationSignal = false;
  if (provider.hallucinationGuard) {
    const grounding = estimateGroundingConfidence(out, messages);
    confidence = Math.min(confidence, grounding + 0.35);
    const ctx = messages.map((m) => m.content).join("\n").toLowerCase();
    let refsOmitted = 0;
    // Hyphenated on purpose: the product's own references look like
    // `ETM-EE794200-85E3-…`, which the previous `[A-Z0-9]{8,}` never matched,
    // so a fabricated one in that shape sailed through unredacted. And a
    // reference has a digit: case-insensitive, "Etimad platform" is eight
    // letters after the word and was being redacted and counted as a
    // fabrication (production: `refs_omitted_2`).
    out = out.replace(
      /\b(?:ETM|ETIMAD|اعتماد)[-_\s]?(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,}\b/gi,
      (match) => {
        if (ctx.includes(match.toLowerCase())) return match;
        refsOmitted += 1;
        return "[REF_OMITTED]";
      }
    );
    if (refsOmitted > 0) {
      reasons.push(`refs_omitted_${refsOmitted}`);
      fabricationSignal = true;
    }
    if (AI_SELF_REFERENCE_CUES.some((r) => r.test(out))) {
      reasons.push("hallucination_cues");
      confidence *= 0.7;
      fabricationSignal = true;
    }
  }

  if (provider.piiFilter) {
    out = redactPii(out);
  }

  if (confidence < provider.confidenceThreshold) {
    reasons.push(
      `confidence_${confidence.toFixed(2)}_below_${provider.confidenceThreshold}`
    );
    // Lexical overlap is a proxy, not a detector. A structured JSON answer, a
    // paraphrase, or any Arabic sentence (clitics turn a restated word into a
    // new token) shares few tokens with its prompt without fabricating a
    // thing. Under strict real-AI mode a rejection here fails the whole run,
    // and it did, on every generative step. So low confidence is fatal only
    // beside a fabrication signal; otherwise it travels with the result for
    // the UI and the audit row.
    if (fabricationSignal) {
      return { content: "", confidence, rejected: true, reasons };
    }
  }

  return { content: out, confidence, rejected: false, reasons };
}
