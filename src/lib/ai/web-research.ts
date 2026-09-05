/**
 * Live web research for the drafting pipeline and the platform agent.
 *
 * The regulatory registry in procurement-rules.ts is reviewed by hand and
 * dated; it cannot know about a circular published last month. When a search
 * key is configured, the agents add live, dated, source-linked passages on
 * top of the registry — and say so. When it is not, nothing here pretends:
 * `searchWeb` answers `null` with a reason and the prompts carry no "live"
 * block at all.
 *
 * One provider (Tavily) behind one function, so a second provider is a
 * second `case`, not a second code path. The endpoint is a fixed constant, so
 * the outbound call is never shaped by user input beyond the query text.
 *
 * ponytail: in-memory cache per instance keyed by the request; a shared cache
 * (Redis) is the upgrade if research cost ever matters.
 */

import { getDecryptedEnv } from "@/lib/env-settings";

export const WEB_RESEARCH_ENV_KEY = "TAVILY_API_KEY";
const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SNIPPET_CHARS = 700;

/**
 * Official Saudi sources preferred for regulatory questions. Tavily boosts
 * rather than restricts to these (`include_domains_mode: "boost"`), so a
 * framework published elsewhere still surfaces.
 */
export const AUTHORITATIVE_SA_DOMAINS = Object.freeze([
  "etimad.sa",
  "nca.gov.sa",
  "sdaia.gov.sa",
  "dga.gov.sa",
  "mof.gov.sa",
  "laws.boe.gov.sa",
  "boe.gov.sa",
  "ncar.gov.sa",
  "zatca.gov.sa",
  "lcgpa.gov.sa",
  "my.gov.sa",
  "mc.gov.sa",
  "hrsd.gov.sa",
  "monshaat.gov.sa",
  "citc.gov.sa",
  "cst.gov.sa",
  "sama.gov.sa",
  "vision2030.gov.sa",
]);

export type WebResult = Readonly<{
  title: string;
  url: string;
  snippet: string;
  score: number;
}>;

export type WebSearchOutcome =
  | Readonly<{
      ok: true;
      provider: "tavily";
      query: string;
      retrievedAt: string;
      results: readonly WebResult[];
      answer: string | null;
      cached: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: "not_configured" | "timeout" | "http_error" | "invalid_response";
      query: string;
      detail?: string;
    }>;

export type WebSearchInput = Readonly<{
  query: string;
  maxResults?: number;
  /** Boosted, not exclusive. */
  preferDomains?: readonly string[];
  timeRange?: "day" | "week" | "month" | "year";
  country?: string;
  includeAnswer?: boolean;
}>;

type CacheEntry = { at: number; outcome: WebSearchOutcome };
const cache = new Map<string, CacheEntry>();

function cacheKey(input: WebSearchInput): string {
  return JSON.stringify({
    q: input.query.trim().toLowerCase(),
    n: input.maxResults ?? 5,
    d: [...(input.preferDomains ?? [])].sort(),
    t: input.timeRange ?? null,
    c: input.country ?? null,
    a: input.includeAnswer ?? false,
  });
}

/** True when a search key is configured (env or sealed admin setting). */
export async function webResearchAvailable(): Promise<boolean> {
  try {
    return Boolean((await getDecryptedEnv(WEB_RESEARCH_ENV_KEY)).trim());
  } catch {
    return false;
  }
}

/**
 * Parses Tavily's response into our result shape. Exported for tests; refuses
 * anything that is not the documented `{ results: [{ title, url, content,
 * score }] }` object so a provider change cannot leak junk into a prompt.
 */
export function parseTavilyResponse(
  body: unknown
): { results: WebResult[]; answer: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { results?: unknown; answer?: unknown }).results;
  if (!Array.isArray(raw)) return null;
  const results: WebResult[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as { title?: unknown; url?: unknown; content?: unknown; score?: unknown };
    if (typeof r.url !== "string" || !/^https?:\/\//i.test(r.url)) continue;
    results.push({
      title: typeof r.title === "string" ? r.title.trim().slice(0, 200) : r.url,
      url: r.url,
      snippet:
        typeof r.content === "string"
          ? r.content.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET_CHARS)
          : "",
      score: typeof r.score === "number" && Number.isFinite(r.score) ? r.score : 0,
    });
  }
  const answer = (body as { answer?: unknown }).answer;
  return { results, answer: typeof answer === "string" && answer.trim() ? answer.trim() : null };
}

/** One bounded search; never throws. */
export async function searchWeb(
  input: WebSearchInput,
  deps: { fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<WebSearchOutcome> {
  const query = input.query.trim();
  const key = cacheKey(input);
  const hit = cache.get(key);
  const now = deps.now?.() ?? new Date();
  if (hit && now.getTime() - hit.at < CACHE_TTL_MS && hit.outcome.ok) {
    return { ...hit.outcome, cached: true };
  }

  const apiKey = (await getDecryptedEnv(WEB_RESEARCH_ENV_KEY).catch(() => "")).trim();
  if (!apiKey) return { ok: false, reason: "not_configured", query };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await (deps.fetchImpl ?? fetch)(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        max_results: Math.min(Math.max(input.maxResults ?? 5, 1), 10),
        ...(input.preferDomains?.length
          ? { include_domains: [...input.preferDomains], include_domains_mode: "boost" }
          : {}),
        ...(input.timeRange ? { time_range: input.timeRange } : {}),
        ...(input.country ? { country: input.country } : {}),
        include_answer: input.includeAnswer ? "basic" : false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: "http_error", query, detail: `HTTP ${res.status}` };
    }
    const parsed = parseTavilyResponse(await res.json().catch(() => null));
    if (!parsed) return { ok: false, reason: "invalid_response", query };
    const outcome: WebSearchOutcome = {
      ok: true,
      provider: "tavily",
      query,
      retrievedAt: now.toISOString(),
      results: parsed.results,
      answer: parsed.answer,
      cached: false,
    };
    cache.set(key, { at: now.getTime(), outcome });
    return outcome;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "timeout" : "http_error",
      query,
      detail: err instanceof Error ? err.message.slice(0, 120) : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* Research briefs for the pipeline                                           */
/* -------------------------------------------------------------------------- */

export type ResearchSource = Readonly<{
  n: number;
  title: string;
  url: string;
  snippet: string;
  query: string;
  retrievedAt: string;
}>;

export type LiveResearchBrief = Readonly<{
  /** Prompt-ready block; empty string when nothing was retrieved. */
  block: string;
  sources: readonly ResearchSource[];
  queries: readonly string[];
  /** Why the block is empty, when it is. */
  unavailableReason: string | null;
}>;

/** The frameworks a Saudi tender response most often has to cite. */
export const REGULATORY_QUERY_TOPICS = Object.freeze([
  "Government Tenders and Procurement Law Saudi Arabia latest amendments implementing regulations",
  "NCA Essential Cybersecurity Controls ECC latest version requirements",
  "PDPL Personal Data Protection Law Saudi Arabia implementing regulations data transfer",
  "Etimad tender submission requirements local content preference LCGPA",
]);

/** Framework names a tender text mentions, for one extra targeted query. */
export function frameworksMentionedIn(text: string): string[] {
  const found = new Set<string>();
  const patterns: Array<[RegExp, string]> = [
    [/\bNORA\b/i, "NORA national overall reference architecture DGA"],
    [/\bISO\s?27001\b/i, "ISO 27001"],
    [/\bSAMA\b/, "SAMA cybersecurity framework"],
    [/\bCST\b|\bCITC\b/, "CST cloud computing regulatory framework"],
    [/\bDGA\b|هيئة الحكومة الرقمية/, "Digital Government Authority DGA standards"],
    [/\bCCC\b/, "NCA Cloud Cybersecurity Controls CCC"],
  ];
  for (const [re, label] of patterns) {
    if (re.test(text)) found.add(label);
  }
  return [...found];
}

/**
 * Builds the research queries for one tender: the standing regulatory topics
 * plus, when the tender names a scope, one query on the buyer's domain. Pure,
 * so the set is testable and bounded (never more than five calls).
 */
export function buildResearchQueries(input: {
  tenderTitle: string | null | undefined;
  tenderType: string | null | undefined;
  frameworksMentioned?: readonly string[];
}): string[] {
  const queries = [...REGULATORY_QUERY_TOPICS];
  const title = input.tenderTitle?.trim();
  if (title && title.length >= 8) {
    queries.push(`${title} Saudi Arabia government ${input.tenderType ?? ""} tender context`.replace(/\s+/g, " ").trim());
  }
  const extra = (input.frameworksMentioned ?? [])
    .map((f) => f.trim())
    .filter((f) => f.length >= 3 && !queries.some((q) => q.toLowerCase().includes(f.toLowerCase())))
    .slice(0, 1)
    .map((f) => `${f} Saudi Arabia requirements official guidance`);
  return [...queries, ...extra].slice(0, 5);
}

/**
 * Turns search outcomes into one numbered, dated source list the prompts can
 * cite as [S1], [S2]… Deduplicates by URL, keeps the best-scored copy, caps
 * total size so the block never crowds the tender out of the context window.
 */
export function formatResearchBlock(
  outcomes: readonly WebSearchOutcome[],
  opts: { maxSources?: number; maxChars?: number } = {}
): LiveResearchBrief {
  const maxSources = opts.maxSources ?? 12;
  const maxChars = opts.maxChars ?? 9_000;
  const byUrl = new Map<string, ResearchSource & { score: number }>();
  const queries: string[] = [];
  let failure: string | null = null;
  for (const o of outcomes) {
    queries.push(o.query);
    if (!o.ok) {
      failure = failure ?? o.reason;
      continue;
    }
    for (const r of o.results) {
      const prev = byUrl.get(r.url);
      if (prev && prev.score >= r.score) continue;
      byUrl.set(r.url, {
        n: 0,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        query: o.query,
        retrievedAt: o.retrievedAt,
        score: r.score,
      });
    }
  }
  const ranked = [...byUrl.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSources)
    .map((s, i) => ({ ...s, n: i + 1 }));

  if (ranked.length === 0) {
    return {
      block: "",
      sources: [],
      queries,
      unavailableReason: failure ?? (outcomes.length === 0 ? "no_queries" : "no_results"),
    };
  }

  const lines: string[] = [];
  for (const s of ranked) {
    const line = `[S${s.n}] ${s.title} — ${s.url} (retrieved ${s.retrievedAt.slice(0, 10)})\n${s.snippet}`;
    if (lines.join("\n\n").length + line.length > maxChars) break;
    lines.push(line);
  }
  const sources = ranked.slice(0, lines.length).map(({ score: _score, ...rest }) => rest);
  return { block: lines.join("\n\n"), sources, queries, unavailableReason: null };
}

/**
 * The pipeline's one research pass per run: bounded queries, official
 * domains preferred, everything dated. Returns an empty brief (with the
 * reason) when no key is configured, so callers add nothing to their prompts.
 */
export async function researchTenderContext(input: {
  tenderTitle: string | null | undefined;
  tenderType: string | null | undefined;
  frameworksMentioned?: readonly string[];
  /** Total wall-clock budget across all queries. */
  budgetMs?: number;
}): Promise<LiveResearchBrief> {
  if (!(await webResearchAvailable())) {
    return { block: "", sources: [], queries: [], unavailableReason: "not_configured" };
  }
  const queries = buildResearchQueries(input);
  const budget = input.budgetMs ?? 15_000;
  const deadline = new Promise<WebSearchOutcome[]>((resolve) =>
    setTimeout(() => resolve([]), budget)
  );
  const searches = Promise.all(
    queries.map((query) =>
      searchWeb({
        query,
        maxResults: 4,
        preferDomains: AUTHORITATIVE_SA_DOMAINS,
        country: "saudi arabia",
      })
    )
  );
  // Whatever finished inside the budget is used; the rest is simply absent.
  const outcomes = await Promise.race([searches, deadline]);
  if (outcomes.length === 0) {
    return { block: "", sources: [], queries, unavailableReason: "timeout" };
  }
  return formatResearchBlock(outcomes);
}
