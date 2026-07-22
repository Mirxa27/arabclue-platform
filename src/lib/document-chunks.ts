/**
 * Chunk + embed uploaded tender documents for project-scoped RAG.
 */

import { db } from "./db";
import { embedText } from "./llm";
import type { RagDocument } from "./rag";

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;
const MAX_CHUNKS_PER_DOC = 40;

/** Split text into overlapping windows for embedding / retrieval. */
export function chunkText(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length && chunks.length < MAX_CHUNKS_PER_DOC) {
    const end = Math.min(start + size, cleaned.length);
    const slice = cleaned.slice(start, end).trim();
    if (slice.length > 40) chunks.push(slice);
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

/** Replace all chunks for a document and embed each window. */
export async function indexDocumentChunks(opts: {
  documentId: string;
  workspaceId: string;
  projectId: string | null;
  text: string;
  title: string;
}): Promise<number> {
  const parts = chunkText(opts.text);
  await db.documentChunk.deleteMany({ where: { documentId: opts.documentId } });
  if (parts.length === 0) return 0;

  for (let i = 0; i < parts.length; i++) {
    const content = parts[i];
    const embedding = await embedText(`${opts.title}\n${content}`);
    await db.documentChunk.create({
      data: {
        documentId: opts.documentId,
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        chunkIndex: i,
        content,
        embeddingJson: JSON.stringify(embedding),
      },
    });
  }
  return parts.length;
}

/** Load project tender chunks as RAG documents. */
export async function loadProjectTenderCorpus(
  projectId: string
): Promise<RagDocument[]> {
  const chunks = await db.documentChunk.findMany({
    where: { projectId },
    include: { document: { select: { originalName: true, docCategory: true } } },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: 200,
  });

  return chunks.map((c) => {
    let embedding: number[] | null = null;
    if (c.embeddingJson) {
      try {
        embedding = JSON.parse(c.embeddingJson) as number[];
      } catch {
        embedding = null;
      }
    }
    return {
      id: c.id,
      title: `${c.document.docCategory}: ${c.document.originalName}#${c.chunkIndex}`,
      summary: c.content,
      sector: c.document.docCategory,
      tags: c.document.docCategory,
      embedding,
    };
  });
}
