/**
 * Rebuild document chunks (structure-aware) and their vectors.
 *
 *   bun run rag:reindex                       # every document, all workspaces
 *   bun run rag:reindex -- --workspace <id>   # one workspace
 *   bun run rag:reindex -- --stale-only       # only documents whose chunks lack
 *                                             # a vector from the current model
 *
 * When to run: after this migration (chunks predate section metadata), after
 * changing the EMBEDDING provider or model (old vectors are a different
 * dimension and invisible to dense search — /api/platform-agent search
 * reports them as staleEmbeddings), or after a batch of failed embeddings.
 * Re-extracts text from storage, so it also picks up parser fixes.
 */

import { db } from "../src/lib/db";
import { indexDocumentChunks } from "../src/lib/document-chunks";
import { extractTextFromStorage } from "../src/lib/agents/ingestion";
import { embedTextsWithModel } from "../src/lib/llm";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? "") : null;
}

const workspaceId = arg("--workspace");
const staleOnly = process.argv.includes("--stale-only");

const probe = await embedTextsWithModel(["probe"]);
const currentModel = probe.model;
const currentDim = probe.vectors[0]?.length ?? null;
console.log(`embedding model: ${currentModel ?? "none (lexical only)"}${currentDim ? ` · ${currentDim} dims` : ""}`);

const documents = await db.uploadedDocument.findMany({
  where: workspaceId ? { workspaceId } : {},
  select: { id: true, workspaceId: true, projectId: true, storagePath: true, mimeType: true, originalName: true },
  orderBy: { createdAt: "asc" },
});

let reindexed = 0;
let skipped = 0;
let failed = 0;
for (const doc of documents) {
  if (staleOnly && currentModel) {
    const fresh = await db.documentChunk.count({
      where: { documentId: doc.id, embeddingModel: currentModel },
    });
    const total = await db.documentChunk.count({ where: { documentId: doc.id } });
    if (total > 0 && fresh === total) {
      skipped += 1;
      continue;
    }
  }
  try {
    const text = await extractTextFromStorage(doc.storagePath, doc.mimeType, doc.originalName);
    if (!text.trim()) {
      console.log(`  skip ${doc.originalName}: no extractable text`);
      skipped += 1;
      continue;
    }
    const chunks = await indexDocumentChunks({
      documentId: doc.id,
      workspaceId: doc.workspaceId,
      projectId: doc.projectId,
      text,
      title: doc.originalName,
    });
    reindexed += 1;
    console.log(`  ok   ${doc.originalName}: ${chunks} chunks`);
  } catch (err) {
    failed += 1;
    console.log(`  fail ${doc.originalName}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
  }
}
console.log(`documents=${documents.length} reindexed=${reindexed} skipped=${skipped} failed=${failed}`);
await db.$disconnect();
process.exit(failed > 0 ? 1 : 0);
