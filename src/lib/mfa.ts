import {
  generateSecret as otplibGenerateSecret,
  generateURI,
  verifySync,
} from "otplib";
import QRCode from "qrcode";

export const MFA_PERIOD_SECONDS = 30;
export const MFA_WINDOW_SECONDS = 30;

export type MfaVerifySuccess = Readonly<{ ok: true; step: number }>;
export type MfaVerifyFailure = Readonly<{ ok: false; reason: "invalid" | "replay" }>;
export type MfaVerifyResult = MfaVerifySuccess | MfaVerifyFailure;

export function generateMfaSecret(): string {
  return otplibGenerateSecret();
}

export function currentMfaStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / MFA_PERIOD_SECONDS);
}

function asVerifyResult(result: unknown): { valid: boolean; timeStep?: number } {
  if (typeof result === "boolean") return { valid: result };
  if (result && typeof result === "object" && "valid" in result) {
    const record = result as { valid?: boolean; timeStep?: number };
    return { valid: Boolean(record.valid), timeStep: record.timeStep };
  }
  return { valid: false };
}

export function verifyMfaTokenDetailed(
  secret: string,
  token: string,
  opts?: { lastUsedStep?: bigint | number | null; nowMs?: number }
): MfaVerifyResult {
  if (!secret || !token) return { ok: false, reason: "invalid" };
  const normalized = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return { ok: false, reason: "invalid" };

  const lastUsed =
    opts?.lastUsedStep === undefined || opts.lastUsedStep === null
      ? undefined
      : Number(opts.lastUsedStep);
  const nowMs = opts?.nowMs ?? Date.now();

  try {
    const result = asVerifyResult(
      verifySync({
        secret,
        token: normalized,
        period: MFA_PERIOD_SECONDS,
        epoch: Math.floor(nowMs / 1000),
        epochTolerance: MFA_WINDOW_SECONDS,
      })
    );
    if (!result.valid) return { ok: false, reason: "invalid" };
    const step = result.timeStep ?? currentMfaStep(nowMs);
    if (lastUsed !== undefined && step <= lastUsed) {
      return { ok: false, reason: "replay" };
    }
    return { ok: true, step };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function verifyMfaToken(secret: string, token: string): boolean {
  return verifyMfaTokenDetailed(secret, token).ok;
}

export async function buildMfaQrDataUrl(opts: {
  email: string;
  secret: string;
  issuer?: string;
}): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const issuer = opts.issuer ?? "Arabclue";
  const otpauthUrl = generateURI({
    issuer,
    label: opts.email,
    secret: opts.secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
  return { otpauthUrl, qrDataUrl };
}
