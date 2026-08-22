import { decryptValue, encryptValue } from "./crypto";

/**
 * AES-GCM ciphertext from `encryptValue` is `iv:authTag:data` (three base64
 * segments). otplib secrets are base32 and never contain a colon, so a
 * three-segment value is treated as sealed and everything else as legacy
 * plaintext that must be re-encrypted on the next write.
 */
export function isSealedMfaSecret(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(":");
  return parts.length === 3 && parts.every((part) => part.length > 0);
}

export function sealMfaSecret(plain: string): string {
  if (!plain) {
    throw new Error("MFA secret to seal must be non-empty");
  }
  return encryptValue(plain);
}

export function unsealMfaSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (isSealedMfaSecret(stored)) {
    const plain = decryptValue(stored);
    return plain || null;
  }
  return stored;
}

export function mfaSecretNeedsReseal(stored: string | null | undefined): boolean {
  return !!stored && !isSealedMfaSecret(stored);
}
