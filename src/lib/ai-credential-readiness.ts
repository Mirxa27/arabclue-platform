export type AiCredentialReadiness = Readonly<{ ok: boolean; detail: string }>;

/** Only a locally hosted provider can complete without a credential. */
export function providerNeedsApiKey(providerId: string): boolean {
  return providerId.trim().toLowerCase() !== "ollama";
}

/**
 * Judge whether every engine holds a credential that still resolves.
 *
 * Counting active provider rows proves nothing: a row whose credential no
 * longer resolves — an `apiKeyEnvKey` outside the allowlist, a settings row
 * sealed under a retired master key, a key never provisioned in this
 * environment — still counts as active while every completion quietly
 * degrades to a fallback. This is the one deployment fact an AI-first product
 * cannot afford to learn from a user's empty proposal.
 *
 * What this does NOT establish: that a model answers. Resolution is a local
 * decrypt-and-allowlist check — no request leaves the process. A revoked key,
 * an exhausted quota, or a provider outage all pass it. `/api/ready` is
 * unauthenticated, so it must not spend a paid completion per probe; proving a
 * live completion belongs to an authenticated path, not here. Read
 * `engines_ok:N` as "N engines hold a usable credential", never as "AI works".
 *
 * Reports the shape of the failure, never the provider or the credential.
 */
/**
 * Credential coverage across every agent engine, not just DEFAULT.
 *
 * Checking DEFAULT alone hid two real production defects: a COMPLIANCE
 * connection naming a credential outside the provider allowlist, and a
 * DRAFTING connection whose credential was sealed empty. Each engine
 * fabricated every answer it produced while DEFAULT stayed healthy, so the
 * probe reported ready. Engine names are safe to publish; the credential and
 * provider behind a failure are not, and are never included.
 */
export function summarizeEngineCredentials(
  entries: readonly { readonly engine: string; readonly resolved: boolean }[]
): AiCredentialReadiness {
  // `every` is true for an empty array, which would report a deployment with
  // no active provider at all as healthy.
  if (entries.length === 0) {
    return { ok: false, detail: "no_engines_checked" };
  }
  const degraded = entries
    .filter((entry) => !entry.resolved)
    .map((entry) => entry.engine)
    .sort();
  return degraded.length === 0
    ? { ok: true, detail: `engines_ok:${entries.length}` }
    : { ok: false, detail: `degraded:${degraded.join(",")}` };
}

export function summarizeAiCredential(input: {
  readonly hasActiveProvider: boolean;
  readonly needsApiKey: boolean;
  readonly apiKeyResolved: boolean;
}): AiCredentialReadiness {
  if (!input.hasActiveProvider) {
    return { ok: false, detail: "no_active_provider" };
  }
  if (!input.needsApiKey) {
    return { ok: true, detail: "local_provider" };
  }
  return input.apiKeyResolved
    ? { ok: true, detail: "credential_resolved" }
    : { ok: false, detail: "credential_unresolved" };
}
