/**
 * The agents page told a bidder, in English, inside an Arabic UI:
 * "Provider unavailable in real-AI-only mode (enrich:ingestion,
 * guardrail_rejected: empty_output)". That is the operator's breadcrumb —
 * and it must stay on the record — but it is not a sentence for the person
 * who pressed Run. `AgentRun.failureKind` existed for exactly this and the
 * orchestrator never wrote it.
 *
 * Now: the orchestrator classifies the thrown error into a stable kind and
 * persists it beside the raw message; the status and history payloads carry
 * it; the page renders bilingual copy keyed on the kind, with the raw message
 * behind a "Technical details" disclosure.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyRunFailure,
  runFailureCopyKey,
  RUN_FAILURE_COPY_KEYS,
} from "../agents/run-failure";
import { ProviderUnavailableError } from "../ai/provider-unavailable";
import { tr } from "../i18n";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("classifyRunFailure", () => {
  test("a provider refusal is PROVIDER_UNAVAILABLE, a rate limit RATE_LIMIT", () => {
    expect(
      classifyRunFailure(
        new ProviderUnavailableError({ context: "enrich:ingestion", llmFailureKind: "guardrail_rejected" }),
      ),
    ).toBe("PROVIDER_UNAVAILABLE");
    expect(
      classifyRunFailure(
        new ProviderUnavailableError({ context: "drafting", llmFailureKind: "rate_limited" }),
      ),
    ).toBe("RATE_LIMIT");
  });

  test("a cancellation, a missing document and a timeout are their own kinds", () => {
    const cancelled = new Error("cancelled");
    cancelled.name = "PipelineCancelledError";
    expect(classifyRunFailure(cancelled)).toBe("USER_CANCELLED");
    expect(classifyRunFailure(new Error("No documents uploaded for ingestion"))).toBe("INVALID_INPUT");
    expect(
      classifyRunFailure(
        new ProviderUnavailableError({ context: "drafting", llmFailureKind: "timeout" }),
      ),
    ).toBe("TIMEOUT");
  });

  test("anything else is INTERNAL, without throwing on junk", () => {
    for (const junk of [new Error("boom"), "string", null, undefined, 42, {}]) {
      expect(classifyRunFailure(junk)).toBe("INTERNAL");
    }
  });
});

describe("every kind has a sentence in both languages", () => {
  test("the copy keys resolve to real translations, not their own names", () => {
    for (const kind of Object.keys(RUN_FAILURE_COPY_KEYS)) {
      const key = runFailureCopyKey(kind);
      for (const locale of ["ar", "en"] as const) {
        const text = tr(key, locale);
        expect(text, `${kind}/${locale}`).not.toBe(key);
        expect(text.length, `${kind}/${locale}`).toBeGreaterThan(20);
      }
    }
    // Arabic copy is Arabic.
    expect(/[؀-ۿ]/.test(tr(runFailureCopyKey("PROVIDER_UNAVAILABLE"), "ar"))).toBe(true);
  });

  test("an unknown or missing kind falls back to the internal sentence", () => {
    expect(runFailureCopyKey(null)).toBe(RUN_FAILURE_COPY_KEYS.INTERNAL);
    expect(runFailureCopyKey("SOMETHING_NEW")).toBe(RUN_FAILURE_COPY_KEYS.INTERNAL);
  });
});

describe("the kind travels from the orchestrator to the page", () => {
  test("the orchestrator classifies and persists it", () => {
    const src = read("src/lib/agents/orchestrator.ts");
    expect(/classifyRunFailure\(err\)/.test(src)).toBe(true);
    expect(/failureKind/.test(src)).toBe(true);
  });

  test("the status and history payloads carry it", () => {
    expect(/failureKind:\s*run\.failureKind/.test(read("src/app/api/agents/status/route.ts"))).toBe(true);
    expect(/failureKind:\s*run\.failureKind/.test(read("src/lib/agent-runs.ts"))).toBe(true);
  });

  test("the page renders the copy and keeps the raw message behind a disclosure", () => {
    const src = read("src/components/dashboard/agent-workflow.tsx");
    expect(/runFailureCopyKey\(/.test(src)).toBe(true);
    expect(/<details/.test(src)).toBe(true);
    expect(/agent_run_failure_details/.test(src)).toBe(true);
  });
});
