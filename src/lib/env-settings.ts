import { db } from "./db";
import { decryptValue } from "./crypto";
import {
  defaultApiKeyEnvKey,
  isAllowedProviderApiKeyEnv,
} from "./llm/model-catalog";

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
  const primary = await getDecryptedEnv(envKey);
  if (primary) return primary;

  // Common alternate env names for Google / Gemini
  if (provider.toLowerCase() === "google") {
    for (const alt of ["GOOGLE_API_KEY", "GEMINI_API_KEY"]) {
      const v = await getDecryptedEnv(alt);
      if (v) return v;
    }
  }
  return "";
}

/**
 * Resolve an API key using the connection's optional custom env key, then the
 * provider default.
 *
 * The custom name is administrator-supplied and `getDecryptedEnv` falls back to
 * `process.env`, so it is checked against the provider-credential allowlist
 * first. A name outside that allowlist is ignored — and the provider default is
 * used instead — rather than being read and forwarded to the connection's
 * `apiBase`. Ignoring rather than throwing keeps an existing misconfigured row
 * working on its default credential instead of taking the AI surface down.
 */
export async function resolveProviderApiKey(
  provider: string,
  apiKeyEnvKey?: string | null
): Promise<string> {
  const requested = apiKeyEnvKey?.trim();
  if (requested) {
    if (isAllowedProviderApiKeyEnv(requested)) {
      const custom = await getDecryptedEnv(requested);
      if (custom) return custom;
    } else {
      console.warn(
        "[env-settings] ignoring provider apiKeyEnvKey outside the provider-credential allowlist",
        { provider, apiKeyEnvKey: requested }
      );
    }
  }
  return getProviderApiKey(provider);
}
