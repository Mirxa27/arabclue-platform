import { NextResponse } from "next/server";
import { apiFailure } from "@/lib/api-failure";
import {
  assertProviderCredentialOrigin,
  defaultApiBase,
  defaultApiKeyEnvKey,
  isAllowedProviderApiKeyEnv,
} from "./model-catalog";

/**
 * Validate the two administrator-supplied fields on a provider connection
 * before they are persisted or used.
 *
 * Both fields feed the same outbound request: `apiKeyEnvKey` is resolved
 * against `process.env` at call time and attached as a credential to every
 * request made against `apiBase`. Unchecked, that pair reads an arbitrary
 * platform secret and forwards it to an arbitrary host.
 *
 * Rejecting at the write path gives the administrator an immediate, explicit
 * error rather than a silent fallback at first use; `fetchLiveProviderModels`
 * enforces the same rules again at dispatch time for rows already in the
 * database.
 *
 * @returns a 400 response to return as-is, or `null` when the connection is
 *   acceptable.
 */
export function providerConnectionGuardError(input: {
  provider: string;
  apiBase: string | null | undefined;
  apiKeyEnvKey: string | null | undefined;
}): NextResponse | null {
  const provider = (input.provider || "openai").toLowerCase();
  const envKey = (input.apiKeyEnvKey ?? "").trim();

  if (envKey !== "" && !isAllowedProviderApiKeyEnv(envKey)) {
    return NextResponse.json(apiFailure("api_key_env_not_allowed"), {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    assertProviderCredentialOrigin({
      // An omitted base falls back to the provider default, which is what the
      // write paths persist.
      apiBase: (input.apiBase ?? "").trim() || defaultApiBase(provider),
      apiKeyEnvKey: envKey || defaultApiKeyEnvKey(provider),
      provider,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ...apiFailure("api_base_not_allowed"),
        // The origin check's own words name the credential and the host it is
        // pinned to — what the admin needs, kept beside the bilingual message.
        detail: err instanceof Error ? err.message : "API Base URL is not allowed.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}
