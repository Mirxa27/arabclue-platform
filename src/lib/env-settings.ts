import { db } from "./db";
import { decryptValue } from "./crypto";
import { defaultApiKeyEnvKey } from "./llm/model-catalog";

/** Read a decrypted EnvSetting value; falls back to process.env */
export async function getDecryptedEnv(key: string): Promise<string> {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.length > 0) return fromProcess;

  const row = await db.envSetting.findUnique({ where: { key } });
  if (!row?.valueEncrypted) return "";
  return decryptValue(row.valueEncrypted);
}

export async function getProviderApiKey(provider: string): Promise<string> {
  const envKey = defaultApiKeyEnvKey(provider);
  if (!envKey) return "";
  return getDecryptedEnv(envKey);
}

/** Resolve API key using optional custom env key, then provider default. */
export async function resolveProviderApiKey(
  provider: string,
  apiKeyEnvKey?: string | null
): Promise<string> {
  if (apiKeyEnvKey?.trim()) {
    const custom = await getDecryptedEnv(apiKeyEnvKey.trim());
    if (custom) return custom;
  }
  return getProviderApiKey(provider);
}
