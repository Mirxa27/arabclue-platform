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
 * Resolve the API key for a provider connection.
 *
 * When the connection names a credential, that credential is the answer — it
 * resolves to its value or to nothing. The provider default is used only when
 * no name was given.
 *
 * No substitution, because the name is what binds a connection to a host. An
 * operator pointing an `openai_compatible` connection at their own gateway
 * names `OPENROUTER_API_KEY_TEAM_B`; falling back to the provider default when
 * that variable is unset would send the platform's canonical `OPENAI_API_KEY`
 * to that gateway. An empty result surfaces as "API key missing — configure it
 * in Env Settings first", which is the accurate failure.
 *
 * The name is administrator-supplied and `getDecryptedEnv` falls back to
 * `process.env`, so it is checked against the provider-credential allowlist
 * before being read — otherwise it would address any variable in the process,
 * including `NEXTAUTH_SECRET` and `DATABASE_URL`.
 */
export async function resolveProviderApiKey(
  provider: string,
  apiKeyEnvKey?: string | null
): Promise<string> {
  const requested = apiKeyEnvKey?.trim();
  if (!requested) return getProviderApiKey(provider);

  if (!isAllowedProviderApiKeyEnv(requested)) {
    console.warn(
      "[env-settings] provider apiKeyEnvKey is outside the provider-credential allowlist",
      { provider, apiKeyEnvKey: requested }
    );
    return "";
  }
  return getDecryptedEnv(requested);
}
