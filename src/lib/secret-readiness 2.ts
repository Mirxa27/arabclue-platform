import { canOpenSealed } from "./crypto";

export type SecretReadiness = Readonly<{ ok: boolean; detail: string }>;

/**
 * Judge whether the running master key still opens the secrets it sealed.
 *
 * `ARABCLUE_ENC_KEY` being set proves nothing: a key that no longer matches
 * the stored rows decrypts every one of them to an empty string, which reads
 * downstream as an unconfigured platform — no provider credentials, no payment
 * keys, no MFA secrets — and raises nothing.
 *
 * Not-ready is reserved for "opens nothing", the one reading that can only mean
 * a wrong key. A single stale row left behind by an old key is reported in the
 * detail but does not park the deployment at 503, where it would mask the next
 * real regression.
 */
export function summarizeSealedSecrets(
  ciphertexts: readonly string[]
): SecretReadiness {
  if (ciphertexts.length === 0) {
    return { ok: true, detail: "no_sealed_secrets" };
  }
  const readable = ciphertexts.filter((value) => canOpenSealed(value)).length;
  return {
    ok: readable > 0,
    detail: `sealed:${ciphertexts.length} readable:${readable}`,
  };
}
