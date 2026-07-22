import { generateSecret as otplibGenerateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

export function generateMfaSecret(): string {
  return otplibGenerateSecret();
}

export function verifyMfaToken(secret: string, token: string): boolean {
  if (!secret || !token) return false;
  try {
    const result = verifySync({
      secret,
      token: token.replace(/\s/g, ""),
    });
    if (typeof result === "boolean") return result;
    return Boolean((result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
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
