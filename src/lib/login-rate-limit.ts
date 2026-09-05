import { createHash } from "node:crypto";
import { rateLimitAsync as rateLimit } from "./rate-limit";

export const LOGIN_EMAIL_LIMIT = 10;
export const LOGIN_IP_LIMIT = 40;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginRateLimitKeys = Readonly<{
  emailKey: string;
  ipKey: string;
}>;

type HeaderBag =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>
  | undefined
  | null;

function readHeader(headers: HeaderBag, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get: (n: string) => string | null }).get(name) ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const direct = record[name] ?? record[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

/** Keep only a single IPv4 / IPv6 token. Anything else becomes `unknown`. */
export function sanitizeClientIp(raw: string | null | undefined): string {
  const first = (raw ?? "").trim().split(/[\s,/]+/)[0] ?? "";
  if (IPV4.test(first)) return first;
  if (first.includes(":") && IPV6.test(first) && first.length <= 64) return first;
  return "unknown";
}

/**
 * Number of reverse proxies between the client and this process that append
 * to `X-Forwarded-For`. Vercel replaces the header with the single true
 * client address, so 1 is right there; a standalone deployment behind nginx
 * is also 1, behind Cloudflare and nginx it is 2, and 0 means no proxy is
 * trusted and the forwarded headers are ignored entirely (they would be
 * client-controlled). Invalid values fall back to the default.
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

export function trustedProxyHops(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.TRUSTED_PROXY_HOPS?.trim();
  if (!raw) return DEFAULT_TRUSTED_PROXY_HOPS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 16) {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  return parsed;
}

/**
 * The client address from a forwarded chain. Each trusted proxy appended the
 * address of the peer it received from, so the rightmost `trustedHops` entries
 * are proxy-written and the client is the entry just before them. Taking the
 * leftmost entry trusts whatever the client sent.
 */
export function clientIpFromForwardedFor(
  forwarded: string | null | undefined,
  trustedHops: number
): string | undefined {
  if (trustedHops <= 0) return undefined;
  const hops = (forwarded ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (hops.length === 0) return undefined;
  return hops[Math.max(0, hops.length - trustedHops)];
}

/**
 * Single source of the caller's address for rate-limit keys and audit rows.
 * `X-Real-IP` is only meaningful when exactly one trusted proxy set it.
 */
export function extractClientIp(
  headers: HeaderBag,
  trustedHops: number = trustedProxyHops()
): string {
  const forwarded = clientIpFromForwardedFor(
    readHeader(headers, "x-forwarded-for"),
    trustedHops
  );
  const real =
    trustedHops === 1 ? readHeader(headers, "x-real-ip")?.trim() : undefined;
  return sanitizeClientIp(forwarded || real || "unknown");
}

/** `extractClientIp`, with `null` instead of the "unknown" token for audit rows. */
export function extractClientIpOrNull(headers: HeaderBag): string | null {
  const ip = extractClientIp(headers);
  return ip === "unknown" ? null : ip;
}

/**
 * Short, stable digest of an address for server logs. Log lines are shipped
 * to third parties and kept longer than the account; the digest still lets an
 * operator correlate repeated failures for one account without writing the
 * address itself.
 */
export function emailLogDigest(email: string | null | undefined): string {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return "email:none";
  return `email:${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`;
}

export function loginRateLimitKeys(email: string, ip: string): LoginRateLimitKeys {
  const normalizedEmail = email.trim().toLowerCase() || "unknown";
  return {
    emailKey: `login:email:${normalizedEmail}`,
    ipKey: `login:ip:${sanitizeClientIp(ip)}`,
  };
}

export async function consumeLoginRateLimits(email: string, ip: string) {
  const keys = loginRateLimitKeys(email, ip);
  const [emailLimit, ipLimit] = await Promise.all([
    rateLimit({
      key: keys.emailKey,
      limit: LOGIN_EMAIL_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    }),
    rateLimit({
      key: keys.ipKey,
      limit: LOGIN_IP_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    }),
  ]);
  if (!ipLimit.ok) return { ...ipLimit, dimension: "ip" as const };
  if (!emailLimit.ok) return { ...emailLimit, dimension: "email" as const };
  return { ...emailLimit, dimension: "email" as const };
}
