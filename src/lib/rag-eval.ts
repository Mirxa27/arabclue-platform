/**
 * Offline retrieval evaluation for the tender corpus.
 *
 * The production ranking runs in SQL (pgvector + tsvector, see rag-search.ts);
 * this harness measures the parts that decide most of retrieval quality and
 * can run without a database or an embedding key: the chunker and the
 * lexical normalization. It scores each labelled query with a BM25 over the
 * same tokens the tsv column indexes (article-stripped and as-written) and
 * reports precision@1, precision@3 and MRR against the expected document.
 *
 * Run: `bun run eval:rag` (scripts/eval-rag.ts). The test suite pins a floor.
 */

import { chunkDocument } from "./document-chunks";
import { normalizeForSearch, searchTerms } from "./rag-search";

export type EvalDocument = Readonly<{ id: string; text: string }>;
export type EvalQuery = Readonly<{ query: string; expectDoc: string; note?: string }>;

export type EvalReport = Readonly<{
  queries: number;
  precisionAt1: number;
  precisionAt3: number;
  mrr: number;
  misses: Array<{ query: string; expectDoc: string; got: string[] }>;
  chunks: number;
}>;

/** Index-side tokens: the migration indexes each word as written and with "ال" removed. */
export function indexTokens(text: string): string[] {
  const words = normalizeForSearch(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  const out: string[] = [];
  for (const w of words) {
    out.push(w);
    const stripped = w.replace(/^ال(?=[؀-ۿ])/u, "");
    if (stripped !== w && stripped.length >= 2) out.push(stripped);
  }
  return out;
}

type IndexedChunk = { doc: string; tokens: Map<string, number>; length: number };

function buildIndex(docs: readonly EvalDocument[]): { chunks: IndexedChunk[]; avgLen: number } {
  const chunks: IndexedChunk[] = [];
  for (const doc of docs) {
    for (const part of chunkDocument(doc.text)) {
      const tokens = new Map<string, number>();
      const all = indexTokens(`${part.sectionHeading ?? ""} ${part.content}`);
      for (const t of all) tokens.set(t, (tokens.get(t) ?? 0) + 1);
      chunks.push({ doc: doc.id, tokens, length: all.length });
    }
  }
  const avgLen = chunks.reduce((s, c) => s + c.length, 0) / Math.max(1, chunks.length);
  return { chunks, avgLen };
}

/**
 * BM25 with prefix matching, the closest offline analogue of `to_tsquery(':*')` +
 * ts_rank_cd. b = 0 because ts_rank_cd applies no length normalization either
 * (and chunks are already bounded to ~1000-1400 chars).
 */
function scoreChunk(
  chunk: IndexedChunk,
  terms: ReadonlyArray<{ term: string; idf: number }>,
  avgLen: number
): number {
  const k1 = 1.2;
  const b = 0;
  let score = 0;
  for (const { term, idf } of terms) {
    let tf = 0;
    for (const [token, count] of chunk.tokens) {
      if (token === term || token.startsWith(term)) tf += count;
    }
    if (tf === 0) continue;
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * chunk.length) / avgLen)));
  }
  return score;
}

/**
 * A prefix term's document frequency is the number of chunks holding any
 * token with that prefix — a property of the term, computed once, not of
 * the chunk being scored.
 */
function weightTerms(index: ReturnType<typeof buildIndex>, terms: readonly string[]) {
  const n = index.chunks.length;
  return terms.map((term) => {
    const docFreq = index.chunks.filter((c) => [...c.tokens.keys()].some((t) => t === term || t.startsWith(term))).length;
    return { term, idf: Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5)) };
  });
}

/** Ranks documents for a query by their best chunk. */
export function rankDocuments(
  index: ReturnType<typeof buildIndex>,
  query: string
): Array<{ doc: string; score: number }> {
  const terms = weightTerms(index, searchTerms(query));
  const best = new Map<string, number>();
  for (const chunk of index.chunks) {
    const s = scoreChunk(chunk, terms, index.avgLen);
    if (s > (best.get(chunk.doc) ?? 0)) best.set(chunk.doc, s);
  }
  return [...best.entries()]
    .map(([doc, score]) => ({ doc, score }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.doc.localeCompare(b.doc));
}

export function evaluateRetrieval(docs: readonly EvalDocument[], queries: readonly EvalQuery[]): EvalReport {
  const index = buildIndex(docs);
  let hitAt1 = 0;
  let hitAt3 = 0;
  let rr = 0;
  const misses: EvalReport["misses"] = [];
  for (const q of queries) {
    const ranked = rankDocuments(index, q.query).map((r) => r.doc);
    const pos = ranked.indexOf(q.expectDoc);
    if (pos === 0) hitAt1 += 1;
    if (pos >= 0 && pos < 3) hitAt3 += 1;
    if (pos >= 0) rr += 1 / (pos + 1);
    if (pos !== 0) misses.push({ query: q.query, expectDoc: q.expectDoc, got: ranked.slice(0, 3) });
  }
  const n = Math.max(1, queries.length);
  return {
    queries: queries.length,
    precisionAt1: hitAt1 / n,
    precisionAt3: hitAt3 / n,
    mrr: rr / n,
    misses,
    chunks: index.chunks.length,
  };
}

/**
 * Labelled queries for public/samples (the ten demo documents). Each names
 * the document a bidder would expect back; bilingual on purpose, because the
 * corpus and the users are.
 */
export const SAMPLE_EVAL_QUERIES: readonly EvalQuery[] = Object.freeze([
  { query: "government cloud hosting services RFP", expectDoc: "01-etimad-rfp-cloud-services" },
  { query: "كراسة شروط خدمات الحوسبة السحابية الحكومية", expectDoc: "01-etimad-rfp-cloud-services" },
  { query: "IT services agreement termination liability", expectDoc: "02-it-services-agreement" },
  { query: "technical specifications architecture requirements", expectDoc: "03-technical-specifications" },
  { query: "المواصفات الفنية منصة سحابية مؤمنة", expectDoc: "03-technical-specifications" },
  { query: "financial statements current liabilities cash equivalents", expectDoc: "04-financial-statements-excerpt" },
  { query: "local content saudization targets", expectDoc: "05-local-content-saudization" },
  { query: "المحتوى المحلي والسعودة", expectDoc: "05-local-content-saudization" },
  { query: "NCA PDPL compliance checklist controls", expectDoc: "06-nca-pdpl-compliance-checklist" },
  { query: "قائمة التحقق من الامتثال حماية البيانات الشخصية", expectDoc: "06-nca-pdpl-compliance-checklist" },
  { query: "non-disclosure confidentiality agreement", expectDoc: "07-nda-confidentiality-agreement" },
  { query: "commercial registration qualification certificate", expectDoc: "08-qualification-commercial-registration" },
  { query: "VAT certificate ZATCA registration", expectDoc: "09-zatca-vat-certificate" },
  { query: "statement of work digital transformation deliverables milestones", expectDoc: "10-sow-digital-transformation" },
  { query: "نطاق العمل التحول الرقمي المخرجات", expectDoc: "10-sow-digital-transformation" },
  // Harder: morphology and synonyms rather than the document's own title words.
  { query: "تقارير اعتمادات مستوى الخدمة الشهرية", expectDoc: "01-etimad-rfp-cloud-services", note: "SLA credits line inside the RFP body" },
  { query: "اتفاقية عدم الإفصاح والسرية", expectDoc: "07-nda-confidentiality-agreement" },
  { query: "ضريبة القيمة المضافة شهادة التسجيل", expectDoc: "09-zatca-vat-certificate" },
  { query: "السجل التجاري ومعايير التأهيل", expectDoc: "08-qualification-commercial-registration" },
  { query: "quick liquidity ratio receivables", expectDoc: "04-financial-statements-excerpt", note: "QLR is computed from these lines" },
]);
