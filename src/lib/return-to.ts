/**
 * Sign-in return path retention — Requirement 14.10.
 *
 * A visitor with no session who opens a Dashboard_View URL is shown the sign-in
 * surface, and the requested view path plus any project identifier are retained
 * for at most 30 minutes. The value is carried in a signed, HttpOnly,
 * SameSite=Lax cookie so it cannot be forged or read by client script, and it is
 * validated as a same-origin application path before use.
 *
 * Uses Web Crypto so the module runs unchanged in the Edge middleware runtime
 * and in the Node.js server runtime.
 */

import { isAppPath } from "./dashboard-routes";

export const RETURN_TO_COOKIE = "arabclue-return-to";

/** Retention window, per Requirement 14.10. */
export const RETURN_TO_MAX_AGE_SECONDS = 30 * 60;

function encoder(): TextEncoder {
  return new TextEncoder();
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncode(encoder().encode(value));
}

function base64UrlDecodeText(value: string): string | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function signingSecret(): string | null {
  const secret = process.env.NEXTAUTH_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder().encode(payload)
  );
  return base64UrlEncode(new Uint8Array(signature));
}

/** Constant-time comparison so a signature check leaks no timing information. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * True when the value is a retainable same-origin application path.
 * Rejects absolute URLs, protocol-relative paths, and traversal segments.
 */
export function isRetainableAppPath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("..")) return false;
  if (value.length > 512) return false;
  const [pathname] = value.split(/[?#]/, 1);
  return isAppPath(pathname);
}

/**
 * Produces the signed cookie value for a requested path, or null when the path
 * is not retainable or no signing secret is configured.
 */
export async function signReturnTo(
  path: string,
  now: number = Date.now()
): Promise<string | null> {
  if (!isRetainableAppPath(path)) return null;
  const secret = signingSecret();
  if (!secret) return null;

  const expiresAt = now + RETURN_TO_MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}.${base64UrlEncodeText(path)}`;
  const signature = await hmac(payload, secret);
  return `${payload}.${signature}`;
}

/**
 * Recovers the retained path from a cookie value, or null when the value is
 * malformed, unsigned, tampered with, expired, or not a retainable app path.
 */
export async function verifyReturnTo(
  value: string | undefined | null,
  now: number = Date.now()
): Promise<string | null> {
  if (!value) return null;
  const secret = signingSecret();
  if (!secret) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [expiresRaw, encodedPath, signature] = parts;

  const expected = await hmac(`${expiresRaw}.${encodedPath}`, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

  const path = base64UrlDecodeText(encodedPath);
  if (!path || !isRetainableAppPath(path)) return null;
  return path;
}
