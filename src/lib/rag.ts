/**
 * Retrieval for Brand Setup past projects.
 * Prefer embedding cosine similarity when embeddings exist;
 * otherwise lexical TF-IDF cosine over title + summary.
 */

export interface RagDocument {
  id: string;
  title: string;
  summary: string;
  sector?: string | null;
  clientName?: string | null;
  contractValue?: number | null;
  tags?: string | null;
  embedding?: number[] | null;
}

/** Which similarity produced a hit's score; the two live on different scales. */
export type RagScoreMode = "embedding" | "lexical";

export interface RagHit extends RagDocument {
  score: number;
  mode?: RagScoreMode;
}

/**
 * Relevance floors per score mode. Sparse TF cosine over short summaries
 * rarely exceeds 0.3 even for a real match, so 0.18 is a meaningful floor
 * there; dense cosine (text-embedding-3-small and peers) sits around 0.2–0.3
 * for unrelated texts, so the same number admitted everything. Heuristic
 * cut-offs, tuned on the tender corpus rather than derived.
 */
export const RAG_RELEVANCE_FLOOR: Readonly<Record<RagScoreMode, number>> = {
  embedding: 0.3,
  lexical: 0.18,
};

/** Score bands for the technical agent's experience class, per mode. */
export const RAG_EXPERIENCE_BANDS: Readonly<
  Record<RagScoreMode, { exact: number; analogous: number }>
> = {
  embedding: { exact: 0.6, analogous: 0.42 },
  lexical: { exact: 0.45, analogous: 0.22 },
};

/** A hit produced without a tagged mode was scored lexically (legacy callers). */
export function hitMode(hit: Pick<RagHit, "mode">): RagScoreMode {
  return hit.mode ?? "lexical";
}

export function isRelevantHit(hit: RagHit): boolean {
  return hit.score >= RAG_RELEVANCE_FLOOR[hitMode(hit)];
}

export function experienceClassFor(
  hit: RagHit
): "exact" | "analogous" | "proposed" {
  const bands = RAG_EXPERIENCE_BANDS[hitMode(hit)];
  if (hit.score >= bands.exact) return "exact";
  if (hit.score >= bands.analogous) return "analogous";
  return "proposed";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function tf(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  const n = tokens.length || 1;
  for (const [k, v] of m) m.set(k, v / n);
  return m;
}

function cosineSparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [k, v] of b) {
    nb += v * v;
    if (a.has(k)) dot += (a.get(k) ?? 0) * v;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function cosineDense(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Lexical retrieval over past project corpus */
export function retrieveLexical(
  query: string,
  docs: RagDocument[],
  topK = 5
): RagHit[] {
  const qTf = tf(tokenize(query));
  return docs
    .map((d) => {
      const text = `${d.title} ${d.summary} ${d.sector ?? ""} ${d.tags ?? ""} ${d.clientName ?? ""}`;
      const score = cosineSparse(qTf, tf(tokenize(text)));
      return { ...d, score, mode: "lexical" as const };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((h) => h.score > 0);
}

/**
 * Embedding retrieval when query + doc embeddings are available. A zero (or
 * negative) cosine is "no relation", not a weak hit, and used to be returned
 * as one — padding the top-K with unrelated chunks whenever the corpus was
 * small.
 */
export function retrieveByEmbedding(
  queryEmbedding: number[],
  docs: RagDocument[],
  topK = 5
): RagHit[] {
  return docs
    .filter((d) => d.embedding && d.embedding.length > 0)
    .map((d) => ({
      ...d,
      score: cosineDense(queryEmbedding, d.embedding!),
      mode: "embedding" as const,
    }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Hybrid: dense hits over embedded documents, merged with lexical hits over
 * the documents that have no embedding yet (an indexing pass that ran while
 * no embedding provider answered leaves those behind, and they were invisible
 * to a dense query). Without a query vector, lexical over everything.
 */
export function retrieveRelevant(
  query: string,
  docs: RagDocument[],
  opts?: { topK?: number; queryEmbedding?: number[] | null }
): RagHit[] {
  const topK = opts?.topK ?? 5;
  if (opts?.queryEmbedding && opts.queryEmbedding.length > 0) {
    const dense = retrieveByEmbedding(opts.queryEmbedding, docs, topK);
    const unembedded = docs.filter((d) => !d.embedding || d.embedding.length === 0);
    const sparse = unembedded.length ? retrieveLexical(query, unembedded, topK) : [];
    const merged = [...dense, ...sparse].slice(0, topK);
    if (merged.length > 0) return merged;
  }
  return retrieveLexical(query, docs, topK);
}

export function formatRagContext(hits: RagHit[]): string {
  if (hits.length === 0) {
    return "No matching past projects found in Brand Setup corpus.";
  }
  return hits
    .map(
      (h, i) =>
        `${i + 1}. [${h.title}] (score=${h.score.toFixed(3)}, sector=${h.sector ?? "N/A"}, client=${h.clientName ?? "N/A"}, value=${h.contractValue ?? "N/A"})\n${h.summary}`
    )
    .join("\n\n");
}
