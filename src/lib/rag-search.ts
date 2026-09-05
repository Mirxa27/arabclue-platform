/**
 * Hybrid retrieval over document chunks: pgvector cosine + Postgres full-text,
 * fused by reciprocal rank. Replaces the in-app cosine over the 400 most
 * recent chunks (see migration 20260905200000_rag_pgvector).
 *
 * Everything here that is not a database call is pure and tested: the Arabic
 * normalization mirrors the generated `tsv` column exactly, the query builder
 * turns free text into a prefix-matching tsquery, and RRF is a plain
 * function over two ranked id lists.
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";

/** RRF constant; 60 is the value from the original paper and works unchanged here. */
export const RRF_K = 60;
/** Candidates fetched from each signal before fusion. */
const CANDIDATES_PER_SIGNAL = 40;
/** At most this many chunks of one document in a fused result — diversity over depth. */
const DEFAULT_PER_DOCUMENT_CAP = 3;

const ARABIC_DIACRITICS = /[ً-ٰـ]/g;
const ARABIC_RANGE = "؀-ۿ";

/**
 * Mirrors the migration's normalization: strip harakat and tatweel, fold
 * alef variants, taa marbuta and alef maqsura. Applied to queries so they
 * meet the indexed tokens; the definite-article variant is handled by
 * indexing both forms, so the query keeps its words as typed.
 */
export function normalizeForSearch(text: string): string {
  return text
    .replace(ARABIC_DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/**
 * Arabic suffixes whose removal yields a usable prefix: plural/feminine and
 * attached pronouns. "غرامات" → "غرام" so it meets "غرامة"; "الأسبوعية" →
 * "اسبوع" so it meets "أسبوع". Query-side only — the index keeps whole words
 * — so this widens recall without touching stored rows.
 */
const ARABIC_STEM_SUFFIXES = ["يات", "ات", "ية", "يه", "ين", "ون", "ان", "ها", "هم", "كم", "نا", "ه", "ي"];

export function arabicStemVariant(word: string): string | null {
  if (!new RegExp(`^[${ARABIC_RANGE}]+$`, "u").test(word)) return null;
  for (const suffix of ARABIC_STEM_SUFFIXES) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, -suffix.length);
    }
  }
  return null;
}

/**
 * Query words, normalized, article-stripped, deduplicated, longest first,
 * plus a stem variant for inflected Arabic words.
 */
export function searchTerms(query: string, max = 16): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (w: string) => {
    if (w.length < 2 || seen.has(w)) return;
    seen.add(w);
    out.push(w);
  };
  for (const raw of normalizeForSearch(query).toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2) continue;
    // A query "الأمن" should find chunks indexed as "امن" too (the tsv column
    // carries the article-stripped form of every word). A leading "و" (and)
    // glued to the next word is dropped the same way.
    const word = raw
      .replace(new RegExp(`^و(?=[${ARABIC_RANGE}]{3,})`, "u"), "")
      .replace(new RegExp(`^ال(?=[${ARABIC_RANGE}])`, "u"), "");
    add(word);
    const stem = arabicStemVariant(word);
    if (stem) add(stem);
  }
  return out.sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * A tsquery string for `to_tsquery('simple', …)`: prefix matches OR-ed, so
 * Arabic morphology ("أمن" → "أمنية", "الأمنية") and English plurals rank
 * rather than filter. Empty when the query has no usable term.
 */
export function lexicalTsQuery(query: string): string {
  const terms = searchTerms(query);
  // Quote each lexeme so tsquery syntax characters inside a word are literal.
  return terms.map((t) => `'${t.replace(/'/g, "''")}':*`).join(" | ");
}

export type RankedId = Readonly<{ id: string; rank: number; score: number }>;

/**
 * Reciprocal rank fusion of any number of rankings. Ids missing from a
 * ranking contribute nothing for it. Returns fused ids best first with the
 * per-signal scores kept for display.
 */
export function rrfFuse(
  rankings: ReadonlyArray<readonly RankedId[]>,
  k = RRF_K
): Array<{ id: string; fused: number; signals: Record<number, number> }> {
  const acc = new Map<string, { fused: number; signals: Record<number, number> }>();
  rankings.forEach((ranking, signal) => {
    for (const { id, rank, score } of ranking) {
      const entry = acc.get(id) ?? { fused: 0, signals: {} };
      entry.fused += 1 / (k + rank);
      entry.signals[signal] = score;
      acc.set(id, entry);
    }
  });
  return [...acc.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.fused - a.fused || a.id.localeCompare(b.id));
}

/** Keeps at most `cap` items per group while preserving order. */
export function capPerGroup<T>(items: readonly T[], groupOf: (t: T) => string, cap: number): T[] {
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    const g = groupOf(item);
    const n = counts.get(g) ?? 0;
    if (n >= cap) continue;
    counts.set(g, n + 1);
    out.push(item);
  }
  return out;
}

export type ChunkHit = Readonly<{
  id: string;
  documentId: string;
  projectId: string | null;
  chunkIndex: number;
  content: string;
  sectionHeading: string | null;
  pageRef: string | null;
  language: string | null;
  documentName: string;
  docCategory: string;
  /** Fused RRF score; comparable within one query only. */
  score: number;
  /** Which signals ranked this chunk. */
  dense: number | null;
  lexical: number | null;
}>;

export type HybridSearchResult = Readonly<{
  hits: ChunkHit[];
  mode: "hybrid" | "dense" | "lexical" | "none";
  /** Chunks visible to this query in the workspace/project scope. */
  totalIndexed: number;
  /** Embedded chunks whose dimension differs from the query vector — invisible to dense search. */
  staleEmbeddings: number;
}>;

type RawRow = {
  id: string;
  documentId: string;
  projectId: string | null;
  chunkIndex: number;
  content: string;
  sectionHeading: string | null;
  pageRef: string | null;
  language: string | null;
  documentName: string;
  docCategory: string;
  score: number;
};

/**
 * Hybrid search inside one workspace (optionally one project). The dense leg
 * only compares vectors of the query's dimension; the lexical leg uses the
 * generated tsv column. Either leg may be empty; the result says which ran.
 */
export async function hybridSearchChunks(opts: {
  workspaceId: string;
  projectId?: string | null;
  query: string;
  queryEmbedding?: number[] | null;
  limit?: number;
  perDocumentCap?: number;
}): Promise<HybridSearchResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 8, 50));
  const scope = Prisma.sql`c."workspaceId" = ${opts.workspaceId}${
    opts.projectId ? Prisma.sql` AND c."projectId" = ${opts.projectId}` : Prisma.empty
  }`;
  const join = Prisma.sql`JOIN "UploadedDocument" d ON d.id = c."documentId"`;
  const columns = Prisma.sql`c.id, c."documentId", c."projectId", c."chunkIndex", c.content,
    c."sectionHeading", c."pageRef", c.language, d."originalName" AS "documentName", d."docCategory"`;

  const tsquery = lexicalTsQuery(opts.query);
  const dim = opts.queryEmbedding?.length ?? 0;
  const vectorLiteral = dim ? `[${opts.queryEmbedding!.join(",")}]` : null;

  const [dense, lexical, totals] = await Promise.all([
    vectorLiteral
      ? db.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT ${columns}, 1 - (c.embedding <=> ${vectorLiteral}::vector) AS score
          FROM "DocumentChunk" c ${join}
          WHERE ${scope} AND c.embedding IS NOT NULL AND c."embeddingDim" = ${dim}
          ORDER BY c.embedding <=> ${vectorLiteral}::vector
          LIMIT ${CANDIDATES_PER_SIGNAL}`)
      : Promise.resolve([] as RawRow[]),
    tsquery
      ? db.$queryRaw<RawRow[]>(Prisma.sql`
          SELECT ${columns}, ts_rank_cd(c.tsv, q) AS score
          FROM "DocumentChunk" c ${join}, to_tsquery('simple', ${tsquery}) q
          WHERE ${scope} AND c.tsv @@ q
          ORDER BY score DESC
          LIMIT ${CANDIDATES_PER_SIGNAL}`)
      : Promise.resolve([] as RawRow[]),
    db.$queryRaw<{ total: bigint; stale: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total,
             ${
               dim > 0
                 ? Prisma.sql`COUNT(*) FILTER (WHERE c."embeddingDim" IS NOT NULL AND c."embeddingDim" <> ${dim})`
                 : Prisma.sql`0::bigint`
             } AS stale
      FROM "DocumentChunk" c WHERE ${scope}`),
  ]);

  // Dense cosine is "no relation" at or below zero; a zero-scored candidate
  // must not pad the ranking.
  const denseRanked: RankedId[] = dense
    .filter((r) => Number(r.score) > 0)
    .map((r, i) => ({ id: r.id, rank: i + 1, score: Number(r.score) }));
  const lexicalRanked: RankedId[] = lexical.map((r, i) => ({ id: r.id, rank: i + 1, score: Number(r.score) }));
  const rows = new Map<string, RawRow>();
  for (const r of [...dense, ...lexical]) rows.set(r.id, r);

  const fused = rrfFuse([denseRanked, lexicalRanked]);
  const hits = capPerGroup(
    fused.map((f) => {
      const r = rows.get(f.id)!;
      return {
        id: r.id,
        documentId: r.documentId,
        projectId: r.projectId,
        chunkIndex: r.chunkIndex,
        content: r.content,
        sectionHeading: r.sectionHeading,
        pageRef: r.pageRef,
        language: r.language,
        documentName: r.documentName,
        docCategory: r.docCategory,
        score: f.fused,
        dense: f.signals[0] ?? null,
        lexical: f.signals[1] ?? null,
      } satisfies ChunkHit;
    }),
    (h) => h.documentId,
    opts.perDocumentCap ?? DEFAULT_PER_DOCUMENT_CAP
  ).slice(0, limit);

  const mode: HybridSearchResult["mode"] =
    denseRanked.length && lexicalRanked.length
      ? "hybrid"
      : denseRanked.length
        ? "dense"
        : lexicalRanked.length
          ? "lexical"
          : "none";
  return {
    hits,
    mode,
    totalIndexed: Number(totals[0]?.total ?? 0),
    staleEmbeddings: Number(totals[0]?.stale ?? 0),
  };
}

/** Writes a chunk's vector; raw SQL because Prisma has no vector type. */
export async function storeChunkEmbedding(input: {
  chunkId: string;
  embedding: number[];
  model: string;
}): Promise<void> {
  const literal = `[${input.embedding.join(",")}]`;
  await db.$executeRaw(Prisma.sql`
    UPDATE "DocumentChunk"
    SET embedding = ${literal}::vector, "embeddingDim" = ${input.embedding.length}, "embeddingModel" = ${input.model}
    WHERE id = ${input.chunkId}`);
}
