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

export function extractClientIp(headers: HeaderBag): string {
  const forwarded = readHeader(headers, "x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  const real = readHeader(headers, "x-real-ip")?.trim();
  return sanitizeClientIp(firstHop || real || "unknown");
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
