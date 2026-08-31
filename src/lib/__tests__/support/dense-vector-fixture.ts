/**
 * Deterministic dense vectors for exercising the retrieval maths
 * (`cosineDense`, `retrieveByEmbedding`, `retrieveRelevant`) without a network
 * call or a stored corpus.
 *
 * This lived in `src/lib/llm/index.ts` as the silent fallback for `embedText`.
 * It is a hashed bag-of-ngrams, not a semantic embedding, and once persisted to
 * `embeddingJson` it was indistinguishable on read from a model-produced
 * vector — so retrieval reported "embedding mode" for what was really hash
 * similarity. Shipped code now returns null instead; the generator is kept here
 * because a repeatable vector is genuinely useful in a test.
 */

const LOCAL_EMBED_DIM = 256;

export function localEmbedText(text: string, dim = LOCAL_EMBED_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dim;
    vec[idx] += 1;
    if (token.length > 3) {
      let h2 = 2166136261;
      for (let i = 0; i < Math.min(token.length, 6); i++) {
        h2 ^= token.charCodeAt(i);
        h2 = Math.imul(h2, 16777619);
      }
      vec[Math.abs(h2) % dim] += 0.5;
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}
