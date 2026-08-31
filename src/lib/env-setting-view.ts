import { canOpenSealed, decryptValue, maskSecret } from "./crypto";

/** How one stored env value is presented to an administrator. */
export type EnvSettingValueView = Readonly<{
  /** Plaintext when revealed, a fixed-width mask when withheld, "" when there is nothing to show. */
  value: string;
  /** A stored value exists and was deliberately withheld from this response. */
  isMasked: boolean;
  /**
   * The current master key opens this row.
   *
   * False means the row holds a ciphertext sealed by some other key. Every
   * caller of `decryptValue` reads that as "" and silently degrades, so the
   * integration behind the key is dead until someone writes the value again.
   */
  isReadable: boolean;
}>;

/**
 * Separate the three states an administrator has to tell apart: a value that
 * is stored, a key that was never set, and a row that cannot be opened.
 *
 * Masking used to flatten the last two into the first — a failed decrypt
 * returns "", and masking "" produced a dotted placeholder that reads as
 * "configured". A dead credential was indistinguishable from a live one.
 */
export function viewEnvSettingValue(args: {
  readonly valueEncrypted: string;
  readonly secret: boolean;
  readonly reveal: boolean;
}): EnvSettingValueView {
  const { valueEncrypted, secret, reveal } = args;

  // An empty column was never sealed, which is "not set" — a different fact
  // from a ciphertext the current key cannot open.
  if (valueEncrypted !== "" && !canOpenSealed(valueEncrypted)) {
    return { value: "", isMasked: false, isReadable: false };
  }

  const plain = decryptValue(valueEncrypted);
  if (plain === "") return { value: "", isMasked: false, isReadable: true };

  const withhold = secret && !reveal;
  return {
    value: withhold ? maskSecret(plain) : plain,
    isMasked: withhold,
    isReadable: true,
  };
}
