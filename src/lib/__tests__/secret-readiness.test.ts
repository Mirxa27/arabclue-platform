import { afterEach, describe, expect, test } from "bun:test";
import { encryptValue } from "@/lib/crypto";
import { summarizeSealedSecrets } from "@/lib/secret-readiness";

const ORIGINAL_KEY = process.env.ARABCLUE_ENC_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ARABCLUE_ENC_KEY;
  else process.env.ARABCLUE_ENC_KEY = ORIGINAL_KEY;
});

function sealedUnderKey(plaintext: string, masterKey: string): string {
  process.env.ARABCLUE_ENC_KEY = masterKey;
  return encryptValue(plaintext);
}

/**
 * A master key that no longer matches the stored rows reads as an empty
 * settings table — every provider credential, payment key, and MFA secret at
 * once, with no error anywhere. Readiness can only see that the variable is
 * set, so it has to try opening something.
 */
describe("sealed-secret readiness", () => {
  test("reports ready when the current key opens every row", () => {
    const rows = [
      sealedUnderKey("sk-one", "live-key"),
      sealedUnderKey("sk-two", "live-key"),
    ];

    const result = summarizeSealedSecrets(rows);

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("sealed:2 readable:2");
  });

  test("reports not ready when the key opens nothing", () => {
    const rows = [
      sealedUnderKey("sk-one", "the-old-key"),
      sealedUnderKey("sk-two", "the-old-key"),
    ];
    process.env.ARABCLUE_ENC_KEY = "the-new-key";

    const result = summarizeSealedSecrets(rows);

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("sealed:2 readable:0");
  });

  test("stays ready but names the count when only some rows are stale", () => {
    // A single abandoned row is not a wrong master key, and must not park the
    // whole deployment at 503 where it would mask the next real regression.
    const stale = sealedUnderKey("sk-stale", "retired-key");
    const live = sealedUnderKey("sk-live", "current-key");

    const result = summarizeSealedSecrets([stale, live]);

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("sealed:2 readable:1");
  });

  test("reports ready on an installation with nothing sealed yet", () => {
    process.env.ARABCLUE_ENC_KEY = "any-key";

    const result = summarizeSealedSecrets([]);

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("no_sealed_secrets");
  });

  test("never echoes the value or the ciphertext it inspected", () => {
    const sealed = sealedUnderKey("sk-live-must-not-appear", "current-key");

    const result = summarizeSealedSecrets([sealed]);

    expect(result.detail).not.toContain("sk-live");
    expect(result.detail).not.toContain(sealed.slice(0, 12));
  });
});
