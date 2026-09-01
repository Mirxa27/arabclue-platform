"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tr } from "@/lib/i18n";
import { apiErrorText } from "@/lib/api-failure-message";
import { cn } from "@/lib/utils";

type Locale = "ar" | "en";

/**
 * Throws a message that is already fit to show a reader.
 *
 * These four routes answer through the bilingual contract, where `error` is an
 * `{ ar, en }` object. The guard this replaced tested that field for a string
 * and fell through to `HTTP ${res.status}` when it was not one — so a workspace
 * over its LLM budget was told "HTTP 429" while the server had sent it a
 * translated sentence naming the retry window.
 */
async function postAiJson<T>(
  path: string,
  body: unknown,
  locale: Locale,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // A dropped connection never reaches the contract, and `Failed to fetch`
    // is untranslated and meaningless to a reader.
    throw new Error(tr("ai_assist_failed", locale));
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiErrorText(payload, locale, tr("ai_assist_failed", locale)));
  }
  return payload as T;
}

function AiResultShell({
  locale,
  error,
  children,
  className,
}: {
  locale: Locale;
  error: string | null;
  children: ReactNode;
  className?: string;
}) {
  if (!error && !children) return null;
  return (
    <div
      className={cn(
        "mt-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-sm",
        className,
      )}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      {error ? (
        <p className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : (
        children
      )}
    </div>
  );
}

/** Proposal editor → POST /api/ai/proposal-optimize */
export function ProposalOptimizeAction({
  locale,
  contentMd,
  complianceRows,
}: {
  locale: Locale;
  contentMd: string;
  complianceRows?: Record<string, unknown>[];
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      postAiJson<{
        score?: { overall?: number };
        suggestions?: Array<{ suggestionEn?: string; suggestionAr?: string }>;
        winProbability?: { probability?: number };
      }>(
        "/api/ai/proposal-optimize",
        { contentMd, complianceRows: complianceRows ?? [], locale },
        locale,
      ),
    onSuccess: (data) => {
      const overall = data.score?.overall;
      const win = data.winProbability?.probability;
      const top =
        locale === "ar"
          ? data.suggestions?.[0]?.suggestionAr
          : data.suggestions?.[0]?.suggestionEn;
      const parts = [
        overall != null
          ? tr("ai_assist_score", locale, { score: String(overall) })
          : null,
        win != null
          ? tr("ai_assist_win_prob", locale, { pct: String(win) })
          : null,
        top ? top : null,
      ].filter(Boolean);
      setSummary(parts.join(" · ") || tr("ai_assist_done", locale));
    },
    onError: () => setSummary(null),
  });

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!contentMd.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="gap-1.5"
        data-testid="ai-proposal-optimize"
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {tr("ai_assist_optimize_proposal", locale)}
      </Button>
      <AiResultShell
        locale={locale}
        error={mutation.error ? mutation.error.message : null}
      >
        {summary ? <p className="text-foreground/90">{summary}</p> : null}
      </AiResultShell>
    </div>
  );
}

/** Compliance monitor → POST /api/ai/compliance-analyze */
export function ComplianceAnalyzeAction({
  locale,
  documentText,
  documentType = "PROPOSAL",
}: {
  locale: Locale;
  documentText: string;
  documentType?: "PROPOSAL" | "CONTRACT" | "TENDER";
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      postAiJson<{
        overallScore?: number;
        findings?: unknown[];
        gaps?: unknown[];
      }>(
        "/api/ai/compliance-analyze",
        { documentText, documentType, locale },
        locale,
      ),
    onSuccess: (data) => {
      const score = data.overallScore;
      const findings = Array.isArray(data.findings) ? data.findings.length : 0;
      const gaps = Array.isArray(data.gaps) ? data.gaps.length : 0;
      setSummary(
        tr("ai_assist_compliance_summary", locale, {
          score: score != null ? String(score) : "—",
          findings: String(findings),
          gaps: String(gaps),
        }),
      );
    },
    onError: () => setSummary(null),
  });

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={documentText.trim().length < 20 || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="gap-1.5"
        data-testid="ai-compliance-analyze"
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {tr("ai_assist_analyze_compliance", locale)}
      </Button>
      <AiResultShell
        locale={locale}
        error={mutation.error ? mutation.error.message : null}
      >
        {summary ? <p className="text-foreground/90">{summary}</p> : null}
      </AiResultShell>
    </div>
  );
}

/** Contract studio / catalog → POST /api/ai/contract-draft */
export function ContractAiDraftAction({
  locale,
  templateKey,
  projectTitle,
}: {
  locale: Locale;
  templateKey: string;
  projectTitle: string;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      postAiJson<{
        clauses?: unknown[];
        validation?: { ok?: boolean; issues?: unknown[] };
      }>(
        "/api/ai/contract-draft",
        { templateKey, projectTitle, locale },
        locale,
      ),
    onSuccess: (data) => {
      const clauses = Array.isArray(data.clauses) ? data.clauses.length : 0;
      const issues = Array.isArray(data.validation?.issues)
        ? data.validation!.issues!.length
        : 0;
      setSummary(
        tr("ai_assist_contract_summary", locale, {
          clauses: String(clauses),
          issues: String(issues),
        }),
      );
    },
    onError: () => setSummary(null),
  });

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!templateKey || !projectTitle.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="gap-1.5"
        data-testid="ai-contract-draft"
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {tr("ai_assist_draft_contract", locale)}
      </Button>
      <AiResultShell
        locale={locale}
        error={mutation.error ? mutation.error.message : null}
      >
        {summary ? <p className="text-foreground/90">{summary}</p> : null}
      </AiResultShell>
    </div>
  );
}

/** Projects / agents → POST /api/ai/vendor-match */
export function VendorMatchAction({
  locale,
  tenderRequirements,
  vendors,
}: {
  locale: Locale;
  tenderRequirements: string[];
  vendors: Array<{
    vendorId: string;
    vendorName: string;
    vendorNameAr: string;
  }>;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      postAiJson<{
        matchScores?: Array<{ vendorName?: string; matchScore?: number }>;
      }>(
        "/api/ai/vendor-match",
        { tenderRequirements, vendors, locale },
        locale,
      ),
    onSuccess: (data) => {
      const top = data.matchScores?.[0];
      setSummary(
        top
          ? tr("ai_assist_vendor_top", locale, {
              name: String(top.vendorName ?? "—"),
              score: String(top.matchScore ?? "—"),
            })
          : tr("ai_assist_done", locale),
      );
    },
    onError: () => setSummary(null),
  });

  const ready =
    tenderRequirements.length > 0 &&
    vendors.length > 0 &&
    !mutation.isPending;

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!ready}
        onClick={() => mutation.mutate()}
        className="gap-1.5"
        data-testid="ai-vendor-match"
      >
        {mutation.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-3.5" aria-hidden />
        )}
        {tr("ai_assist_match_vendors", locale)}
      </Button>
      <AiResultShell
        locale={locale}
        error={mutation.error ? mutation.error.message : null}
      >
        {summary ? <p className="text-foreground/90">{summary}</p> : null}
      </AiResultShell>
      {!ready && !mutation.isPending ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {tr("ai_assist_vendor_need_context", locale)}
        </p>
      ) : null}
    </div>
  );
}
