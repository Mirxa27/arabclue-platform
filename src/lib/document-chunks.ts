/**
 * Chunk + embed uploaded tender documents for project-scoped RAG.
 */

import { db } from "./db";
import { embedText, embedTextsWithModel } from "./llm";
import { hybridSearchChunks, storeChunkEmbedding, type ChunkHit } from "./rag-search";
import type { RagDocument } from "./rag";

/**
 * Chunk sizing, in characters. Arabic carries more tokens per character than
 * English, so 1,000 characters is roughly 300–500 tokens for either script —
 * a paragraph or two, small enough to score precisely and large enough to
 * keep a requirement with its context. Evaluated on the sample tender pack
 * (scripts/eval-rag.ts), not a library default.
 */
const CHUNK_TARGET = 1_000;
const CHUNK_HARD_MAX = 1_400;
const CHUNK_OVERLAP = 120;
/**
 * Safety cap. The previous value (40) silently truncated any RFP past ~36k
 * characters, so the agents never saw the annexes where the mandatory
 * requirements usually live. 400 chunks is ~150 A4 pages of prose.
 */
const MAX_CHUNKS_PER_DOC = 400;

export type DocumentChunkPart = Readonly<{
  content: string;
  /** Nearest heading above the chunk, when the text has recognisable headings. */
  sectionHeading: string | null;
  /** 1-based page when the extractor marked pages with form feeds. */
  pageRef: string | null;
  language: "ar" | "en" | "mixed";
}>;

const HEADING_PATTERNS = [
  /^#{1,4}\s+\S/, // markdown
  /^(?:\d{1,2}(?:[.\-]\d{1,2}){0,3})[.)]?\s+\S{2,}/, // 1.2.3 Title
  /^(?:المادة|البند|الفصل|القسم|الباب|الملحق|الجزء)\s+\S/, // Arabic article/clause/annex
  /^(?:Article|Section|Clause|Annex|Appendix|Chapter|Part|Schedule)\s+[\dA-Z]/i,
];

/** A short standalone line that reads as a heading. */
export function looksLikeHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 120) return false;
  if (/[.؟?!،,;:]$/.test(t) && !/^\d/.test(t)) return false;
  if (HEADING_PATTERNS.some((re) => re.test(t))) return true;
  // ALL CAPS Latin line of a few words
  const latin = t.replace(/[^A-Za-z\s]/g, "").trim();
  if (latin.length >= 6 && latin === latin.toUpperCase() && latin.split(/\s+/).length <= 8) return true;
  return false;
}

/** Script of a text: Arabic, Latin, or a real mix. */
export function detectLanguage(text: string): "ar" | "en" | "mixed" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const total = arabic + latin;
  if (total === 0) return "en";
  const share = arabic / total;
  if (share >= 0.8) return "ar";
  if (share <= 0.2) return "en";
  return "mixed";
}

/**
 * Structure-aware chunking: split on page breaks, headings and blank lines,
 * pack paragraphs up to CHUNK_TARGET characters, carry the nearest heading and
 * page as metadata, and overlap one paragraph tail so a sentence cut at a
 * boundary is still findable. Falls back to window splitting for a paragraph
 * longer than CHUNK_HARD_MAX (scanned text without line structure).
 */
export function chunkDocument(text: string): DocumentChunkPart[] {
  const pages = text.split(/\f/);
  const parts: DocumentChunkPart[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];
  let bufferHeading: string | null = null;
  let bufferPage: string | null = null;
  let tail = "";

  const flush = () => {
    const content = buffer.join("\n").trim();
    buffer = [];
    if (content.length < 40) return;
    parts.push({
      content,
      sectionHeading: bufferHeading,
      pageRef: bufferPage,
      language: detectLanguage(content),
    });
    tail = content.slice(-CHUNK_OVERLAP);
  };

  pages.forEach((pageText, pageIdx) => {
    const pageRef = pages.length > 1 ? String(pageIdx + 1) : null;
    const paragraphs = pageText
      .replace(/\r/g, "")
      .split(/\n\s*\n|\n(?=\s*(?:#|\d{1,2}[.\-]|المادة|البند|Article|Section|Annex))/)
      .map((p) => p.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim())
      .filter(Boolean);

    for (const paragraph of paragraphs) {
      if (parts.length >= MAX_CHUNKS_PER_DOC) return;
      const firstLine = paragraph.split("\n")[0] ?? paragraph;
      if (looksLikeHeading(firstLine)) {
        flush();
        heading = firstLine.replace(/^#+\s*/, "").slice(0, 120);
        const rest = paragraph.slice(firstLine.length).trim();
        buffer = [firstLine, ...(rest ? [rest] : [])];
        bufferHeading = heading;
        bufferPage = pageRef;
        continue;
      }
      const pieces =
        paragraph.length > CHUNK_HARD_MAX ? windowSplit(paragraph, CHUNK_TARGET, CHUNK_OVERLAP) : [paragraph];
      for (const piece of pieces) {
        const current = buffer.join("\n").length;
        if (current > 0 && current + piece.length + 1 > CHUNK_TARGET) {
          flush();
          if (tail) buffer = [tail];
        }
        if (buffer.length === 0 || (buffer.length === 1 && buffer[0] === tail)) {
          bufferHeading = heading;
          bufferPage = pageRef;
        }
        buffer.push(piece);
      }
    }
  });
  flush();
  return parts.slice(0, MAX_CHUNKS_PER_DOC);
}

function windowSplit(text: string, size: number, overlap: number): string[] {
  const out: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    // Prefer to end at a sentence boundary inside the last 15% of the window.
    let cut = end;
    if (end < text.length) {
      const window = text.slice(start + Math.floor(size * 0.85), end);
      const m = window.search(/[.؟?!]\s/);
      if (m >= 0) cut = start + Math.floor(size * 0.85) + m + 1;
    }
    out.push(text.slice(start, cut).trim());
    if (cut >= text.length) break;
    start = Math.max(cut - overlap, start + 1);
  }
  return out.filter((p) => p.length > 0);
}

/** Legacy flat splitter, kept for callers and tests that want plain windows. */
export function chunkText(text: string, size = CHUNK_TARGET, overlap = CHUNK_OVERLAP): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];
  return windowSplit(cleaned, size, overlap).filter((p) => p.length > 40).slice(0, MAX_CHUNKS_PER_DOC);
}

/**
 * Replace all chunks for a document, embed each (heading-prefixed) chunk with
 * the configured embedding model, and store vectors in pgvector tagged with
 * the model so a later model change cannot mix dimensions.
 */
export async function indexDocumentChunks(opts: {
  documentId: string;
  workspaceId: string;
  projectId: string | null;
  text: string;
  title: string;
}): Promise<number> {
  const parts = chunkDocument(opts.text);
  await db.documentChunk.deleteMany({ where: { documentId: opts.documentId } });
  if (parts.length === 0) return 0;

  // One provider lookup and one request per batch; vectors align with `parts`.
  // The heading rides along so a chunk's vector knows which section it is from.
  const { vectors, model } = await embedTextsWithModel(
    parts.map((p) => `${opts.title}${p.sectionHeading ? ` — ${p.sectionHeading}` : ""}\n${p.content}`)
  );
  const created = await db.documentChunk.createManyAndReturn({
    data: parts.map((p, i) => ({
      documentId: opts.documentId,
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      chunkIndex: i,
      content: p.content,
      sectionHeading: p.sectionHeading,
      pageRef: p.pageRef,
      language: p.language,
      // Legacy mirror for readers that predate the vector column.
      embeddingJson: vectors[i] ? JSON.stringify(vectors[i]) : null,
    })),
    select: { id: true, chunkIndex: true },
  });
  for (const row of created) {
    const vector = vectors[row.chunkIndex];
    if (vector && model) {
      await storeChunkEmbedding({ chunkId: row.id, embedding: vector, model });
    }
  }
  return parts.length;
}

/** A hybrid hit as the RAG document shape the agents consume. */
export function chunkHitToRagDocument(hit: ChunkHit): RagDocument & { embedding: null } {
  const where = [hit.sectionHeading, hit.pageRef ? `p.${hit.pageRef}` : null].filter(Boolean).join(" · ");
  return {
    id: hit.id,
    title: `${hit.docCategory}: ${hit.documentName}#${hit.chunkIndex}${where ? ` (${where})` : ""}`,
    summary: hit.content,
    sector: hit.docCategory,
    tags: hit.docCategory,
    embedding: null,
  };
}

/**
 * The tender passages most relevant to a scope query, retrieved in SQL
 * (dense + lexical, fused) and returned as RAG documents for the technical
 * agent. Replaces loading the first 200 chunks of a project into memory.
 */
export async function retrieveTenderChunks(opts: {
  workspaceId: string;
  projectId: string;
  query: string;
  queryEmbedding?: number[] | null;
  limit?: number;
}): Promise<RagDocument[]> {
  const result = await hybridSearchChunks({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId,
    query: opts.query,
    queryEmbedding: opts.queryEmbedding ?? null,
    limit: opts.limit ?? 24,
    perDocumentCap: 8,
  });
  return result.hits.map(chunkHitToRagDocument);
}

/**
 * @deprecated Use retrieveTenderChunks: this loads the project's first 200
 * chunks regardless of the query. Kept for callers not yet migrated.
 */
export async function loadProjectTenderCorpus(projectId: string): Promise<RagDocument[]> {
  const chunks = await db.documentChunk.findMany({
    where: { projectId },
    include: { document: { select: { originalName: true, docCategory: true } } },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: 200,
  });
  return chunks.map((c) => ({
    id: c.id,
    title: `${c.document.docCategory}: ${c.document.originalName}#${c.chunkIndex}`,
    summary: c.content,
    sector: c.document.docCategory,
    tags: c.document.docCategory,
    embedding: null,
  }));
}

/**
 * Hybrid search over workspace (or project) document chunks, in SQL: pgvector
 * cosine over vectors of the query's dimension plus normalized full-text,
 * fused by reciprocal rank, at most three chunks per document.
 */
export async function searchWorkspaceChunks(opts: {
  workspaceId: string;
  query: string;
  projectId?: string;
  limit?: number;
}): Promise<{
  hits: Array<{
    id: string;
    documentId: string;
    projectId: string | null;
    chunkIndex: number;
    content: string;
    excerpt: string;
    score: number;
    title: string;
    sectionHeading: string | null;
    pageRef: string | null;
  }>;
  totalIndexed: number;
  /** Which signals produced the ranking; "lexical" when no embedding provider answered. */
  mode: "hybrid" | "dense" | "lexical" | "none";
  /** Embedded chunks a different model produced — invisible to the dense leg until re-indexed. */
  staleEmbeddings: number;
}> {
  const queryEmbedding = await embedText(opts.query);
  const result = await hybridSearchChunks({
    workspaceId: opts.workspaceId,
    projectId: opts.projectId ?? null,
    query: opts.query,
    queryEmbedding,
    limit: opts.limit ?? 8,
  });
  return {
    totalIndexed: result.totalIndexed,
    staleEmbeddings: result.staleEmbeddings,
    mode: result.mode,
    hits: result.hits.map((h) => ({
      id: h.id,
      documentId: h.documentId,
      projectId: h.projectId,
      chunkIndex: h.chunkIndex,
      content: h.content,
      excerpt: h.content.slice(0, 400),
      score: h.score,
      title: chunkHitToRagDocument(h).title,
      sectionHeading: h.sectionHeading,
      pageRef: h.pageRef,
    })),
  };
}
