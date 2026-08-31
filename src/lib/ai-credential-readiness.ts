export type AiCredentialReadiness = Readonly<{ ok: boolean; detail: string }>;

/** Only a locally hosted provider can complete without a credential. */
export function providerNeedsApiKey(providerId: string): boolean {
  return providerId.trim().toLowerCase() !== "ollama";
}

/**
 * Judge whether this deployment can actually reach a model.
 *
 * Counting active provider rows proves nothing: a row whose credential no
 * longer resolves — an `apiKeyEnvKey` outside the allowlist, a settings row
 * sealed under a retired master key, a key never provisioned in this
 * environment — still counts as active while every completion quietly
 * degrades to a fallback. This is the one deployment fact an AI-first product
 * cannot afford to learn from a user's empty proposal.
 *
 * Reports the shape of the failure, never the provider or the credential.
 */
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
