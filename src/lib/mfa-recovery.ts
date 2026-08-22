import { createHmac, randomBytes } from "node:crypto";

export const RECOVERY_CODE_COUNT = 8;
export const RECOVERY_CODE_BYTES = 5;

function recoveryPepper(): string {
  return (
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.ARABCLUE_ENC_KEY?.trim() ||
    "arabclue-dev-recovery-pepper"
  );
}

export function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toLowerCase();
}

export function formatRecoveryCode(hex: string): string {
  const compact = normalizeRecoveryCode(hex);
  if (compact.length !== RECOVERY_CODE_BYTES * 2) {
    throw new Error("recovery code entropy is the wrong length");
  }
  return `${compact.slice(0, 5)}-${compact.slice(5)}`;
}

export function isTotpToken(token: string): boolean {
  return /^\d{6}$/.test(token.replace(/\s/g, ""));
}

export function isRecoveryCodeToken(token: string): boolean {
  const compact = normalizeRecoveryCode(token);
  return /^[0-9a-f]{10}$/.test(compact) && !isTotpToken(token);
}

export function classifyMfaToken(token: string): "totp" | "recovery" | "unknown" {
  const trimmed = token.trim();
  if (!trimmed) return "unknown";
  if (isTotpToken(trimmed)) return "totp";
  if (isRecoveryCodeToken(trimmed)) return "recovery";
  return "unknown";
}

export function hashRecoveryCode(userId: string, raw: string): string {
  return createHmac("sha256", recoveryPepper())
    .update(`mfa-recovery:${userId}:${normalizeRecoveryCode(raw)}`)
    .digest("hex");
}

export function generateRecoveryCodes(
  count: number = RECOVERY_CODE_COUNT
): string[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > 32) {
    throw new RangeError("recovery code count is out of range");
  }
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(formatRecoveryCode(randomBytes(RECOVERY_CODE_BYTES).toString("hex")));
  }
  return [...codes];
}
