/**
 * `embedText` used to be unable to say "no embedding available". Every failure
 * path — no EMBEDDING provider row, unsupported provider type, missing key,
 * HTTP error, thrown exception — ended at `localEmbedText`, a hashed
 * bag-of-ngrams vector. That vector was then written into `embeddingJson` and
 * read back as if a model had produced it, which is why
 * `searchWorkspaceChunks` reported `mode: "embedding"` for hash similarity.
 *
 * The corpus already has an honest degraded mode: `retrieveRelevant` falls back
 * to lexical TF cosine when `queryEmbedding` is null. So the fix is not a new
 * fallback, it is letting `embedText` return null and deleting the synthetic
 * generator from shipped code.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { retrieveRelevant, type RagDocument } from "../rag";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), "utf8");

describe("embedText reports absence instead of synthesising a vector", () => {
  test("returns null when no provider and no gateway credential answer", async () => {
    // The preload points DATABASE_URL at an unreachable host and clears every
    // provider credential, so this is the real production "nothing configured"
    // path executed against the real module — no mocks.
    const { embedText } = await import("../llm");
    expect(await embedText("hospital information system tender")).toBeNull();
  });
});

describe("no synthetic embedding generator ships", () => {
  test("the llm module no longer defines one", () => {
    const source = read("src/lib/llm/index.ts");
    expect(source).not.toMatch(/function localEmbedText/);
    expect(source).not.toMatch(/LOCAL_EMBED_DIM/);
  });

  test("deterministic dense vectors survive only as a test fixture", () => {
    // Anti-vacuous: the assertion above must fail because the generator moved,
    // not because the scan lost its target.
    const fixture = read("src/lib/__tests__/support/dense-vector-fixture.ts");
    expect(fixture).toMatch(/export function localEmbedText/);
  });
});

describe("the gateway can serve embeddings", () => {
  test("gateway.ts exports a provider-qualified embedding model id", () => {
    expect(read("src/lib/llm/gateway.ts")).toMatch(
      /export const GATEWAY_EMBEDDING_MODEL_ID\s*=\s*"[a-z0-9-]+\/[a-z0-9.-]+"/
    );
  });

  test("embedText consults the gateway before giving up", () => {
    const source = read("src/lib/llm/index.ts");
    const gatewayAt = source.indexOf("embedViaGateway(");
    const giveUpAt = source.lastIndexOf("return null;");
    expect(gatewayAt).toBeGreaterThan(-1);
    expect(giveUpAt).toBeGreaterThan(-1);
    expect(gatewayAt).toBeLessThan(giveUpAt);
  });
});

describe("a null query embedding degrades to lexical retrieval", () => {
  const docs: RagDocument[] = [
    {
      id: "ehr",
      title: "National EHR rollout",
      summary: "electronic health records for hospitals under PDPL",
      sector: "Health",
    },
    {
      id: "road",
      title: "Asphalt highway resurfacing",
      summary: "roadworks and bitumen supply for the northern corridor",
      sector: "Infrastructure",
    },
  ];

  test("it still ranks the relevant document first", () => {
    const hits = retrieveRelevant("electronic health records hospitals", docs, {
      queryEmbedding: null,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe("ehr");
  });
});
