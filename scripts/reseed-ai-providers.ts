/**
 * Re-create the production AI provider connections lost on 2026-09-06.
 *
 * The rows below are the connection *configuration* recorded from the live
 * database before the reset (name, vendor, model, endpoint, engines, ranking).
 * Credentials are never written here: each row points at an `EnvSetting` /
 * `process.env` key that the operator re-enters in Admin → Env Settings.
 *
 * Idempotent — matched on (provider, modelId); an existing row is updated, a
 * missing one created, and the untouched bootstrap templates stay inactive.
 *
 *   bun --env-file=.env scripts/reseed-ai-providers.ts            # dry run
 *   bun --env-file=.env scripts/reseed-ai-providers.ts --apply
 */
import { db } from "../src/lib/db";

type Seed = {
  name: string;
  provider: string;
  modelId: string;
  apiBase: string | null;
  apiKeyEnvKey: string;
  engines: string[];
  priority: number;
  isDefault: boolean;
  contextWindow: number;
  maxTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
};

const SEEDS: Seed[] = [
  {
    name: "Azure OpenAI — gpt-6-astra",
    provider: "azure_openai",
    modelId: "gpt-6-astra",
    apiBase: "https://ai-memsa824067168407.services.ai.azure.com",
    apiKeyEnvKey: "AZURE_OPENAI_API_KEY",
    engines: ["DEFAULT", "DRAFTING"],
    priority: 10,
    isDefault: true,
    contextWindow: 400_000,
    maxTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
  },
  {
    name: "OpenAI — gpt-5.6-luna",
    provider: "openai",
    modelId: "gpt-5.6-luna",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engines: ["REWRITE", "FINANCIAL", "TECHNICAL"],
    priority: 8,
    isDefault: false,
    contextWindow: 400_000,
    maxTokens: 16_384,
    supportsTools: true,
    supportsVision: true,
  },
  {
    name: "Z.AI — glm-5.2",
    provider: "zai",
    modelId: "glm-5.2",
    apiBase: "https://api.z.ai/api/paas/v4",
    apiKeyEnvKey: "ZAI_API_KEY",
    engines: ["COMPLIANCE", "LAW", "INGESTION"],
    priority: 8,
    isDefault: false,
    contextWindow: 200_000,
    maxTokens: 16_384,
    supportsTools: true,
    supportsVision: false,
  },
  {
    name: "OpenAI Embeddings — text-embedding-3-small",
    provider: "openai",
    modelId: "text-embedding-3-small",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engines: ["EMBEDDING"],
    priority: 5,
    isDefault: false,
    contextWindow: 8_191,
    maxTokens: 1,
    supportsTools: false,
    supportsVision: false,
  },
  {
    name: "OpenAI Realtime — gpt-realtime-2.1-mini",
    provider: "openai",
    modelId: "gpt-realtime-2.1-mini",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engines: ["VOICE"],
    priority: 5,
    isDefault: false,
    contextWindow: 128_000,
    maxTokens: 4_096,
    supportsTools: true,
    supportsVision: false,
  },
];

const apply = process.argv.includes("--apply");

async function main() {
  const existing = await db.aIProviderConfig.findMany({
    select: { id: true, provider: true, modelId: true, name: true, isActive: true },
  });
  const byKey = new Map(existing.map((r) => [`${r.provider}::${r.modelId}`, r]));

  for (const seed of SEEDS) {
    const key = `${seed.provider}::${seed.modelId}`;
    const found = byKey.get(key);
    const data = {
      name: seed.name,
      provider: seed.provider,
      modelId: seed.modelId,
      apiBase: seed.apiBase,
      apiKeyEnvKey: seed.apiKeyEnvKey,
      engine: seed.engines[0],
      enginesJson: JSON.stringify(seed.engines),
      isActive: true,
      isDefault: seed.isDefault,
      priority: seed.priority,
      contextWindow: seed.contextWindow,
      maxTokens: seed.maxTokens,
      supportsTools: seed.supportsTools,
      supportsVision: seed.supportsVision,
      supportsJsonMode: true,
      temperature: 0.2,
      timeoutMs: 120_000,
    };
    console.log(
      `${found ? "update" : "create"}  ${seed.name.padEnd(46)} ${seed.engines.join(",")}${apply ? "" : "  (dry run)"}`,
    );
    if (!apply) continue;
    if (found) {
      await db.aIProviderConfig.update({ where: { id: found.id }, data });
    } else {
      await db.aIProviderConfig.create({ data });
    }
  }

  if (apply) {
    // Only one row may be the default; the bootstrap template "OpenAI" held it.
    const defaultSeed = SEEDS.find((s) => s.isDefault)!;
    await db.aIProviderConfig.updateMany({
      where: { isDefault: true, NOT: { AND: [{ provider: defaultSeed.provider }, { modelId: defaultSeed.modelId }] } },
      data: { isDefault: false },
    });
  }

  const active = await db.aIProviderConfig.count({ where: { isActive: true } });
  console.log(`active providers: ${active}${apply ? "" : " (before apply)"}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
