import crypto from "crypto";

// AES-256-GCM encryption for EnvSetting values.
// Master key MUST come from ARABCLUE_ENC_KEY (provision via vault/KMS in production).

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function getMasterKey(): Buffer {
  const raw = process.env.ARABCLUE_ENC_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ARABCLUE_ENC_KEY is required in production");
    }
    // Dev-only ephemeral fallback — never use in production
    console.warn(
      "[crypto] ARABCLUE_ENC_KEY missing — using insecure dev fallback. Set ARABCLUE_ENC_KEY in .env"
    );
    return crypto.createHash("sha256").update("arabclue-insecure-dev-only").digest();
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptValue(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getMasterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptValue(ciphertext: string): string {
  try {
    const [ivB64, authTagB64, dataB64] = ciphertext.split(":");
    if (!ivB64 || !authTagB64 || !dataB64) return "";
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = crypto.createDecipheriv(ALGO, getMasterKey(), iv);
    decipher.setAuthTag(authTag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 2)}${"•".repeat(Math.max(8, value.length - 4))}${value.slice(-2)}`;
}

export function rotateEncryption(ciphertext: string): string {
  return encryptValue(decryptValue(ciphertext));
}

/** Fail fast at boot when required secrets missing in production */
export function assertProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!process.env.NEXTAUTH_SECRET?.trim()) missing.push("NEXTAUTH_SECRET");
  if (!process.env.ARABCLUE_ENC_KEY?.trim()) missing.push("ARABCLUE_ENC_KEY");
  if (missing.length) {
    throw new Error(`Missing required production secrets: ${missing.join(", ")}`);
  }
}
