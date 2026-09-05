/**
 * AI counterpart draft — the run, driven through an injected completion
 * function so no provider is contacted, and the wiring around it asserted
 * against source (the route, the GET response, the editor, the schema and the
 * migration), because the repo has no DOM renderer and no test database.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COUNTERPART_CONCURRENCY,
  COUNTERPART_ENGINE,
  COUNTERPART_MAX_TOKENS,
  COUNTERPART_MIN_TOKENS,
  COUNTERPART_TEMPERATURE,
  counterpartMaxTokens,
  counterpartSystemPrompt,
  generateCounterpartDraft,
  unwrapModelMarkdown,
} from "../ai/counterpart";
import { splitMarkdownSections } from "../ai/counterpart-fidelity";
import { ProviderUnavailableError } from "../ai/provider-unavailable";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import { HUMAN_APPROVAL_NOTICE, HUMAN_APPROVAL_NOTICE_AR } from "../agents/prompts";
import type { LLMMessage, LLMResult, generateCompletion } from "../llm";

/** Run with the given environment variables set (undefined deletes), then restore. */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = Object.keys(vars).map((key) => [key, process.env[key]] as const);
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

type CompletionOpts = NonNullable<Parameters<typeof generateCompletion>[1]>;
type Call = { messages: LLMMessage[]; opts: CompletionOpts };

const SOURCE_EN = `# Technical Proposal — Riyadh Data Platform

Prepared for the Etimad tender.

## 1. Executive Summary / الملخص التنفيذي

We deliver the platform in 3 phases over 18 months, meeting NCA-ECC-2-1-3 and ISO 27001 [S1].

## 4. Requirement Coverage Matrix / مصفوفة تغطية المتطلبات

| Req ID | Requirement | Response | Evidence | Status |
| --- | --- | --- | --- | --- |
| REQ-1 | Data residency in KSA | Riyadh region only | Approved Evidence One | COMPLIANT |
| REQ-2 | Saudization 35% | Committed | HR letter | PARTIAL |

## 13. Compliance Commitments / الالتزامات التنظيمية

${LEGAL_DISCLAIMER}

## 15. Financial Forms Structure / هيكل النماذج المالية

| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
| Platform licence | each | 1 | — | — |

## 18. Closing / الخاتمة

${HUMAN_APPROVAL_NOTICE}
`;

/* -------------------------------------------------------------------------- */
/* A scripted translator                                                      */
/* -------------------------------------------------------------------------- */

const documentOf = (messages: LLMMessage[]): string => {
  const match = /<document>\n([\s\S]*?)\n<\/document>/.exec(messages[1]?.content ?? "");
  if (!match) throw new Error("no <document> in the user turn");
  return match[1];
};
const isRetry = (messages: LLMMessage[]) =>
  /previous translation of this part was rejected/.test(messages[1]?.content ?? "");

/**
 * A structure-preserving "translation" into Arabic: every lowercase Latin word
 * becomes an Arabic word; identifiers, acronyms, numbers, pipes, markers and
 * headings that already carry both languages stay as they are.
 */
function fakeArabic(document: string): string {
  return document
    .split("\n")
    .map((line) =>
      /^#{1,6} .* \/ /.test(line)
        ? line
        : line.replace(/\b[A-Za-z][a-z]+\b/g, (word) => (word === word.toUpperCase() ? word : "كلمة"))
    )
    .join("\n");
}

function live(content: string, extra: Partial<LLMResult> = {}): LLMResult {
  return {
    content,
    provider: "openai",
    model: "gpt-test",
    tokensUsed: 10,
    confidence: 0.9,
    fallback: false,
    failureKind: "none",
    ...extra,
  };
}

function scripted(
  answer: (call: Call, index: number) => LLMResult | Promise<LLMResult>
): { complete: typeof generateCompletion; calls: Call[] } {
  const calls: Call[] = [];
  const complete: typeof generateCompletion = async (messages, opts) => {
    const call = { messages, opts: opts ?? {} };
    calls.push(call);
    return answer(call, calls.length - 1);
  };
  return { complete, calls };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Budgets and prompts                                                        */
/* -------------------------------------------------------------------------- */

describe("counterpartMaxTokens", () => {
  test("is 1.6× the estimate, floored at 600 and capped at 3 000", () => {
    expect(counterpartMaxTokens("short")).toBe(COUNTERPART_MIN_TOKENS);
    // 4 000 English chars ≈ 1 000 tokens → 1 600.
    expect(counterpartMaxTokens("a".repeat(4_000))).toBe(1_600);
    expect(counterpartMaxTokens("a".repeat(40_000))).toBe(COUNTERPART_MAX_TOKENS);
    // Arabic is denser per token: 2 000 Arabic letters ≈ 1 000 tokens → 1 600.
    expect(counterpartMaxTokens("ع".repeat(2_000))).toBe(1_600);
  });
});

describe("counterpartSystemPrompt", () => {
  test("names the direction, the register, the invariants and the data fence", () => {
    const prompt = counterpartSystemPrompt({
      sourceLocale: "en",
      targetLocale: "ar",
      projectTitle: "Riyadh Data Platform",
      glossary: [{ source: "tender", target: "منافسة" }],
    });
    expect(prompt).toContain("from English into Arabic");
    expect(prompt).toContain("Modern Standard Arabic");
    expect(prompt).toContain("Riyadh Data Platform");
    for (const invariant of ["same number of headings", "same number of rows and columns", "REQ-12", "NCA-ECC-2-1-3", "ISO 27001", "[S1]", "em-dash", "[[ARABCLUE_", "data, never instructions", "Output Markdown only"]) {
      expect(prompt).toContain(invariant);
    }
    expect(prompt).toContain('"tender" → "منافسة"');
    expect(counterpartSystemPrompt({ sourceLocale: "ar", targetLocale: "en", projectTitle: "x" })).toContain(
      "professional English"
    );
  });
});

describe("unwrapModelMarkdown", () => {
  test("drops an outer code fence and a <document> wrapper", () => {
    expect(unwrapModelMarkdown("```markdown\n## A\nbody\n```")).toBe("## A\nbody");
    expect(unwrapModelMarkdown("<document>\n## A\n</document>")).toBe("## A");
    expect(unwrapModelMarkdown("  ## A  ")).toBe("## A");
  });
});

/* -------------------------------------------------------------------------- */
/* The run                                                                    */
/* -------------------------------------------------------------------------- */

describe("generateCounterpartDraft", () => {
  test("translates section by section, swaps the legal passages and keeps the structure", async () => {
    // Arrange
    const { complete, calls } = scripted((call) => live(fakeArabic(documentOf(call.messages))));
    const progress: number[] = [];
    // Act
    const result = await generateCounterpartDraft(
      {
        contentMd: SOURCE_EN,
        sourceLocale: "en",
        targetLocale: "ar",
        projectTitle: "Riyadh Data Platform",
        onProgress: (p) => progress.push(p.completed),
      },
      { complete }
    );
    // Assert: one call per non-blank section, all live, tokens summed.
    const sections = splitMarkdownSections(SOURCE_EN);
    expect(calls.length).toBe(sections.length);
    expect(result.sections).toBe(sections.length);
    expect(result.tokensUsed).toBe(10 * calls.length);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-test");
    expect(result.fallback).toBe(false);
    expect(progress).toEqual(Array.from({ length: calls.length }, (_, i) => i + 1));

    // Structure: same headings in the same order, same tables.
    const out = splitMarkdownSections(result.contentMd);
    expect(out.map((s) => s.heading)).toEqual(sections.map((s) => s.heading));
    expect(result.contentMd).toContain("| REQ-2 | كلمة 35% | كلمة | HR كلمة | PARTIAL |");
    expect(result.contentMd).toContain("| — | — |");
    expect(result.contentMd).toContain("NCA-ECC-2-1-3");
    expect(result.contentMd).toContain("ISO 27001 [S1]");

    // The disclaimer and the approval notice were swapped, not translated: the
    // model never saw the English sentence, the writer gets the approved Arabic one.
    expect(result.contentMd).toContain(LEGAL_DISCLAIMER_AR);
    expect(result.contentMd).not.toContain(LEGAL_DISCLAIMER);
    expect(result.contentMd).toContain(HUMAN_APPROVAL_NOTICE_AR);
    expect(result.contentMd).not.toContain(HUMAN_APPROVAL_NOTICE);
    const prompts = calls.map((c) => c.messages[1].content).join("\n");
    expect(prompts).not.toContain(LEGAL_DISCLAIMER);
    expect(prompts).toContain("[[ARABCLUE_LEGAL_DISCLAIMER]]");
    expect(prompts).toContain("[[ARABCLUE_HUMAN_APPROVAL_NOTICE]]");

    // Nothing to report.
    expect(result.diagnostics).toEqual([]);
  });

  test("every call uses the rewrite engine at low temperature with the system prompt origin and two attempts", async () => {
    const { complete, calls } = scripted((call) => live(fakeArabic(documentOf(call.messages))));
    await generateCounterpartDraft(
      { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
      { complete }
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.opts.engine).toBe(COUNTERPART_ENGINE);
      expect(call.opts.temperature).toBe(COUNTERPART_TEMPERATURE);
      expect(call.opts.maxAttempts).toBe(2);
      expect(call.opts.promptOrigin).toBe("system");
      expect(call.opts.maxTokens).toBeGreaterThanOrEqual(COUNTERPART_MIN_TOKENS);
      expect(call.opts.maxTokens).toBeLessThanOrEqual(COUNTERPART_MAX_TOKENS);
      expect(call.opts.timeoutMs).toBeGreaterThan(0);
      expect(call.messages[0].role).toBe("system");
      expect(call.messages[1].content).toContain("<document>");
    }
  });

  test("runs at most three sections at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const { complete } = scripted(async (call) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight -= 1;
      return live(fakeArabic(documentOf(call.messages)));
    });
    await generateCounterpartDraft(
      { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
      { complete }
    );
    expect(peak).toBe(COUNTERPART_CONCURRENCY);
  });

  test("a section missing an identifier is regenerated once with the finding in its prompt", async () => {
    // Arrange: the first answer for the matrix section drops the REQ-2 row.
    const { complete, calls } = scripted((call) => {
      const doc = documentOf(call.messages);
      const translated = fakeArabic(doc);
      if (doc.includes("| REQ-2 |") && !isRetry(call.messages)) {
        return live(translated.replace(/\n\| REQ-2 \|.*$/m, ""));
      }
      return live(translated);
    });
    // Act
    const result = await generateCounterpartDraft(
      { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
      { complete }
    );
    // Assert: exactly one retry, naming what was wrong; the retry's answer won.
    const retries = calls.filter((c) => isRetry(c.messages));
    expect(retries.length).toBe(1);
    expect(retries[0].messages[1].content).toContain("REQ-2");
    expect(retries[0].messages[1].content).toContain("rows in the source");
    expect(retries[0].opts.maxTokens).toBe(COUNTERPART_MAX_TOKENS);
    expect(result.contentMd).toContain("| REQ-2 |");
    expect(result.diagnostics).toEqual([]);
    expect(result.tokensUsed).toBe(10 * calls.length);
  });

  test("what still differs after the one retry is returned as diagnostics, never hidden", async () => {
    // Arrange: REQ-2 is dropped every time.
    const { complete, calls } = scripted((call) =>
      live(fakeArabic(documentOf(call.messages)).replace(/\n\| REQ-2 \|.*$/m, ""))
    );
    // Act
    const result = await generateCounterpartDraft(
      { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
      { complete }
    );
    // Assert
    expect(calls.filter((c) => isRetry(c.messages)).length).toBe(1);
    const matrixSection = splitMarkdownSections(SOURCE_EN).findIndex((s) => s.heading?.includes("Matrix"));
    expect(result.diagnostics).toContainEqual({
      code: "missing_identifiers",
      section: matrixSection,
      items: ["REQ-2"],
    });
    expect(result.diagnostics).toContainEqual({
      code: "table_rows_mismatch",
      section: matrixSection,
      table: 1,
      expected: 4,
      actual: 3,
    });
    expect(result.contentMd).not.toContain("| REQ-2 |");
  });

  test("a truncated section is regenerated once with the ceiling budget", async () => {
    const { complete, calls } = scripted((call, index) =>
      live(fakeArabic(documentOf(call.messages)), { truncated: index === 0 })
    );
    await generateCounterpartDraft(
      { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
      { complete }
    );
    const retries = calls.filter((c) => isRetry(c.messages));
    expect(retries.length).toBe(1);
    expect(retries[0].messages[1].content).toContain("cut off");
    expect(retries[0].opts.maxTokens).toBe(COUNTERPART_MAX_TOKENS);
  });

  test("the whole run refuses when a provider call degrades — in strict and in permissive mode alike", async () => {
    for (const mode of ["1", "0"]) {
      const { complete } = scripted((call, index) =>
        index === 1
          ? { ...live(""), fallback: true, failureKind: "missing_key", provider: "anthropic" }
          : live(fakeArabic(documentOf(call.messages)))
      );
      await withEnv({ AUTONOMY_REAL_AI_ONLY: mode }, async () => {
        const run = generateCounterpartDraft(
          { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
          { complete }
        );
        await expect(run).rejects.toBeInstanceOf(ProviderUnavailableError);
        await run.catch((err: ProviderUnavailableError) => {
          expect(err.llmFailureKind).toBe("missing_key");
          expect(err.provider).toBe("anthropic");
        });
      });
    }
  });

  test("the pricing refusal sentence is never shipped as a section", async () => {
    const { complete } = scripted((call, index) =>
      index === 0
        ? live("Pricing guidance is not available.", { failureKind: "pricing_refusal" })
        : live(fakeArabic(documentOf(call.messages)))
    );
    await expect(
      generateCounterpartDraft(
        { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x" },
        { complete }
      )
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  test("an expired deadline refuses instead of running past the function window", async () => {
    let clock = 0;
    const { complete, calls } = scripted((call) => {
      clock += 100_000;
      return live(fakeArabic(documentOf(call.messages)));
    });
    await expect(
      generateCounterpartDraft(
        { contentMd: SOURCE_EN, sourceLocale: "en", targetLocale: "ar", projectTitle: "x", deadlineMs: 150_000 },
        { complete, now: () => clock }
      )
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(calls.length).toBeLessThan(splitMarkdownSections(SOURCE_EN).length);
  });

  test("refuses same-language and empty input before any call", async () => {
    const { complete, calls } = scripted(() => live("x"));
    await expect(
      generateCounterpartDraft({ contentMd: "x", sourceLocale: "ar", targetLocale: "ar", projectTitle: "x" }, { complete })
    ).rejects.toThrow(/differ/);
    await expect(
      generateCounterpartDraft({ contentMd: "  \n", sourceLocale: "ar", targetLocale: "en", projectTitle: "x" }, { complete })
    ).rejects.toThrow(/empty/);
    expect(calls.length).toBe(0);
  });

  test("an Arabic source is translated into English with the English passages restored", async () => {
    const sourceAr = `## 13. الالتزامات التنظيمية / Compliance Commitments\n\n${LEGAL_DISCLAIMER_AR}\n\nنلتزم بـ REQ-7 خلال 12 شهراً.\n`;
    const { complete, calls } = scripted((call) =>
      live(documentOf(call.messages).replace(/[؀-ۿ]+/g, "word"))
    );
    const result = await generateCounterpartDraft(
      { contentMd: sourceAr, sourceLocale: "ar", targetLocale: "en", projectTitle: "x" },
      { complete }
    );
    expect(calls[0].messages[1].content).not.toContain(LEGAL_DISCLAIMER_AR);
    expect(result.contentMd).toContain(LEGAL_DISCLAIMER);
    expect(result.contentMd).toContain("REQ-7");
    expect(result.contentMd).toContain("12");
    expect(result.diagnostics.filter((d) => d.code !== "heading_level_mismatch")).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Wiring, asserted against source                                            */
/* -------------------------------------------------------------------------- */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("POST /api/proposals/[id]/counterpart", () => {
  const route = read("src/app/api/proposals/[id]/counterpart/route.ts");

  test("runs inside the writer tenant boundary and scopes the proposal to the workspace", () => {
    expect(route).toContain('withTenant(\n    "writer"');
    expect(route).toContain("assertWorkspaceMatch(proposal.workspaceId, workspace.id)");
    expect(route).toContain('jsonApiFailure("PROPOSAL_NOT_FOUND")');
    // The write is scoped too, and to the draft that was translated.
    expect(route).toMatch(/updateMany\(\{\s*where:\s*\{\s*id,\s*workspaceId: workspace\.id,\s*version: proposal\.version/);
    expect(route).toContain('jsonApiFailure("PROPOSAL_VERSION_CONFLICT")');
  });

  test("rate-limits three runs a minute per user before the token quota gate", () => {
    const limiter = /checkAiRateLimit\(\{[\s\S]*?\}\)/.exec(route)?.[0] ?? "";
    expect(limiter).toContain('route: "proposals.counterpart"');
    expect(limiter).toContain("identifier: userId");
    expect(limiter).toContain('scope: "user"');
    expect(limiter).toContain("limit: 3");
    expect(limiter).toContain("windowMs: 60_000");
    expect(route).toContain('await assertWithinQuota(userId, "tokens")');
    expect(route.indexOf("checkAiRateLimit(")).toBeLessThan(route.indexOf("assertWithinQuota("));
    expect(route.indexOf("assertWithinQuota(")).toBeLessThan(route.indexOf("generateCounterpartDraft("));
  });

  test("accounts for tokens, audits, persists the four columns and answers the contract", () => {
    expect(route).toContain('bumpUsage(userId, "tokens", result.tokensUsed)');
    expect(route).toContain("AUDIT_ACTIONS.PROPOSAL_COUNTERPART");
    for (const column of ["counterpartMd", "counterpartLocale", "counterpartGeneratedAt", "counterpartDiagnosticsJson"]) {
      expect(route).toContain(`${column}:`);
    }
    for (const field of ["counterpartMd:", "counterpartLocale:", "diagnostics:", "sections:", "tokensUsed:", "provider:"]) {
      expect(route.slice(route.indexOf("NextResponse.json({"))).toContain(field);
    }
    expect(route).toContain("export const maxDuration = 300");
    expect(route).toContain('jsonApiFailure("EMPTY_PROPOSAL_CONTENT")');
    expect(route).toContain('jsonApiFailure("STATUS_LOCKED")');
    // No deterministic stand-in anywhere near this route.
    expect(route).not.toMatch(/fallback:\s*true/);
  });

  test("the audit action exists", () => {
    expect(read("src/lib/audit.ts")).toContain('PROPOSAL_COUNTERPART: "PROPOSAL_COUNTERPART"');
  });
});

describe("GET /api/proposals/[id] returns the counterpart columns", () => {
  test("the handler spreads the whole row rather than selecting fields", () => {
    const route = read("src/app/api/proposals/[id]/route.ts");
    const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function PATCH"));
    expect(getHandler).toContain("...proposal,");
    expect(getHandler).toContain("include: {");
    expect(getHandler).not.toMatch(/findUnique\(\{\s*where: \{ id \},\s*select:/);
  });

  test("the columns exist on the model and in the migration", () => {
    const schema = read("prisma/schema.prisma");
    const model = schema.slice(schema.indexOf("model GeneratedProposal {"), schema.indexOf("model ProposalVersion {"));
    const sql = read("prisma/migrations/20260905180000_proposal_counterpart/migration.sql");
    for (const column of ["counterpartMd", "counterpartLocale", "counterpartGeneratedAt", "counterpartDiagnosticsJson"]) {
      expect(model).toMatch(new RegExp(`\\n\\s+${column}\\s+(String|DateTime)\\?`));
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "${column}"`);
    }
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/DROP|ALTER COLUMN|NOT NULL/);
  });
});

describe("proposal editor counterpart panel", () => {
  const editor = read("src/components/dashboard/proposal-editor.tsx");

  test("prefills the textarea from the persisted counterpart until the writer types", () => {
    expect(editor).toContain("const counterpartMd = counterpartDraft ?? persistedCounterpart;");
    expect(editor).toContain("data.proposal.counterpartMd");
    // Only while it is still the other language.
    expect(editor).toContain("data?.proposal?.counterpartLocale === counterpartLocale");
    expect(editor).toContain("setCounterpartDraft(event.target.value)");
  });

  test("exposes the AI generate and regenerate actions against the counterpart route", () => {
    expect(editor).toContain("/counterpart`");
    expect(editor).toContain('tr("counterpart_generate", locale)');
    expect(editor).toContain('tr("counterpart_regenerate", locale)');
    expect(editor).toContain("counterpartMutation.isPending ? (");
    expect(editor).toContain("apiErrorText(json, locale)");
    expect(editor).toContain("describeCounterpartDiagnostic(diagnostic, locale)");
    expect(editor).toContain('tr("counterpart_generated_meta", locale, {');
    expect(editor).toContain("providerDisplayName(");
  });

  test("the manual paste path and the submit flow still carry the counterpart", () => {
    expect(editor).toContain("counterpartContentMd: counterpartMd,");
    expect(editor).toContain("!counterpartMd.trim()");
    // The old copy promised no synthesis; it was replaced, not left to contradict the button.
    expect(editor).not.toContain("does not synthesize a translation");
  });

  test("every new string is a registered bilingual key", () => {
    const i18n = read("src/lib/i18n.ts");
    for (const key of editor.matchAll(/tr\(\s*"(counterpart_[a-z_]+)"/g)) {
      expect(i18n, `${key[1]} missing from i18n`).toContain(`${key[1]}:`);
    }
    for (const key of ["counterpart_intro_ar_first", "counterpart_intro_en_first", "counterpart_save_first"]) {
      expect(editor).toContain(key);
      expect(i18n).toContain(`${key}:`);
    }
  });
});
