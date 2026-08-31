import { afterEach, describe, expect, test } from "bun:test";
import {
  SecretDecryptionError,
  decryptValue,
  encryptValue,
  rotateEncryption,
} from "@/lib/crypto";
import { mapErrorToApiFailure } from "@/lib/api-failure";
import { apiErrorText } from "@/lib/api-failure-message";

const ORIGINAL_KEY = process.env.ARABCLUE_ENC_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ARABCLUE_ENC_KEY;
  else process.env.ARABCLUE_ENC_KEY = ORIGINAL_KEY;
});

function sealedUnderKey(plaintext: string, masterKey: string): string {
  process.env.ARABCLUE_ENC_KEY = masterKey;
  return encryptValue(plaintext);
}

describe("rotating a secret never destroys it", () => {
  /**
   * Rotation re-encrypts the stored value, so it must first be able to read it.
   * Under a master key that cannot open the row, a rotation that "succeeds"
   * writes back the encryption of an empty string and the credential is gone
   * for good — and this is exactly the operation an operator runs right after
   * changing the master key.
   */
  test("refuses to rotate a row the current master key cannot open", () => {
    const sealed = sealedUnderKey(
      "postgres://user:pass@host/db",
      "the-key-that-sealed-it"
    );
    process.env.ARABCLUE_ENC_KEY = "a-different-key";

    expect(() => rotateEncryption(sealed)).toThrow(SecretDecryptionError);
  });

  test("still rotates normally under the key that sealed the row", () => {
    const secret = "sk-live-abcdefghijklmnop";
    const sealed = sealedUnderKey(secret, "stable-key");
    const rotated = rotateEncryption(sealed);

    expect(rotated).not.toBe(sealed);
    expect(decryptValue(rotated)).toBe(secret);
  });

  test("an undecryptable row reads as empty rather than throwing", () => {
    // Callers treat "" as "not configured" and degrade; only rotation, which
    // writes back, is allowed to fail hard.
    const sealed = sealedUnderKey("value", "key-one");
    process.env.ARABCLUE_ENC_KEY = "key-two";

    expect(decryptValue(sealed)).toBe("");
  });

  test("keeps the empty answer for values that were never set", () => {
    process.env.ARABCLUE_ENC_KEY = "any-key";

    expect(decryptValue("")).toBe("");
    expect(decryptValue("not-a-sealed-value")).toBe("");
  });
});

describe("a failed rotation answers the operator", () => {
  test("maps to a retryable 503 in both languages", () => {
    const mapped = mapErrorToApiFailure(new SecretDecryptionError());

    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("SECRET_DECRYPTION_FAILED");
    expect(apiErrorText(mapped.body, "en", "fallback")).not.toBe("fallback");
    expect(apiErrorText(mapped.body, "ar", "fallback")).not.toBe(
      apiErrorText(mapped.body, "en", "fallback")
    );
  });

  test("carries no secret material", () => {
    const sealed = sealedUnderKey("sk-live-should-never-appear", "key-a");
    process.env.ARABCLUE_ENC_KEY = "key-b";

    let mapped: ReturnType<typeof mapErrorToApiFailure> | null = null;
    try {
      rotateEncryption(sealed);
    } catch (error) {
      mapped = mapErrorToApiFailure(error);
    }

    expect(mapped).not.toBeNull();
    const serialized = JSON.stringify(mapped?.body);
    expect(serialized).not.toContain("sk-live");
    expect(serialized).not.toContain(sealed);
  });
});
