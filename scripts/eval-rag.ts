/**
 * Offline retrieval evaluation over public/samples.
 *
 *   bun run eval:rag
 *
 * Extracts the ten sample PDFs (same parser and Arabic repair as ingestion),
 * chunks them with the production chunker, and scores the labelled queries in
 * src/lib/rag-eval.ts with a BM25 over the tokens the database indexes.
 * Prints precision@1, precision@3, MRR and the misses. Exit code 1 when MRR
 * falls under the floor the test suite pins, so CI can run it too.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractTextFromBuffer } from "../src/lib/agents/ingestion";
import { evaluateRetrieval, SAMPLE_EVAL_QUERIES, type EvalDocument } from "../src/lib/rag-eval";

export const RAG_EVAL_MRR_FLOOR = 0.9;

export async function loadSampleCorpus(dir = join(process.cwd(), "public", "samples")): Promise<EvalDocument[]> {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  const docs: EvalDocument[] = [];
  for (const file of files) {
    const text = await extractTextFromBuffer(readFileSync(join(dir, file)), "application/pdf", file);
    docs.push({ id: file.replace(/\.pdf$/i, ""), text });
  }
  return docs;
}

if (import.meta.main) {
  const docs = await loadSampleCorpus();
  const report = evaluateRetrieval(docs, SAMPLE_EVAL_QUERIES);
  console.log(`documents=${docs.length} chunks=${report.chunks} queries=${report.queries}`);
  console.log(
    `precision@1=${report.precisionAt1.toFixed(2)} precision@3=${report.precisionAt3.toFixed(2)} MRR=${report.mrr.toFixed(3)} (floor ${RAG_EVAL_MRR_FLOOR})`
  );
  for (const miss of report.misses) {
    console.log(`  miss: "${miss.query}" expected ${miss.expectDoc}, got ${miss.got.join(", ") || "nothing"}`);
  }
  process.exit(report.mrr >= RAG_EVAL_MRR_FLOOR ? 0 : 1);
}
