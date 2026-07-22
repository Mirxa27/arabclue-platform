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

export interface RagHit extends RagDocument {
  score: number;
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
      return { ...d, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((h) => h.score > 0);
}

/** Embedding retrieval when query + doc embeddings are available */
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
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Hybrid: embeddings first; fall back to lexical */
export function retrieveRelevant(
  query: string,
  docs: RagDocument[],
  opts?: { topK?: number; queryEmbedding?: number[] | null }
): RagHit[] {
  const topK = opts?.topK ?? 5;
  if (opts?.queryEmbedding && opts.queryEmbedding.length > 0) {
    const hits = retrieveByEmbedding(opts.queryEmbedding, docs, topK);
    if (hits.length > 0) return hits;
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
