import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TRUSTED_PROXY_HOPS,
  clientIpFromForwardedFor,
  emailLogDigest,
  extractClientIp,
  extractClientIpOrNull,
  trustedProxyHops,
} from "../login-rate-limit";

describe("trustedProxyHops", () => {
  test("defaults to one hop and ignores invalid values", () => {
    expect(trustedProxyHops({})).toBe(DEFAULT_TRUSTED_PROXY_HOPS);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "nope" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "-1" })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "99" })).toBe(1);
  });

  test("reads an explicit hop count", () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: "0" })).toBe(0);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: " 2 " })).toBe(2);
  });
});

describe("clientIpFromForwardedFor", () => {
  const chain = "1.1.1.1, 203.0.113.10, 10.0.0.1";

  test("one trusted hop takes the rightmost entry (the proxy's peer)", () => {
    expect(clientIpFromForwardedFor(chain, 1)).toBe("10.0.0.1");
  });

  test("two trusted hops step one entry left", () => {
    expect(clientIpFromForwardedFor(chain, 2)).toBe("203.0.113.10");
  });

  test("more trusted hops than entries falls back to the leftmost entry", () => {
    expect(clientIpFromForwardedFor(chain, 9)).toBe("1.1.1.1");
  });

  test("zero trusted hops ignores the header entirely", () => {
    expect(clientIpFromForwardedFor(chain, 0)).toBeUndefined();
  });

  test("an absent or blank header yields nothing", () => {
    expect(clientIpFromForwardedFor(null, 1)).toBeUndefined();
    expect(clientIpFromForwardedFor(" , ", 1)).toBeUndefined();
  });
});

describe("extractClientIp", () => {
  const headers = (values: Record<string, string>) => ({
    get: (name: string) => values[name.toLowerCase()] ?? null,
  });

  test("uses X-Real-IP only when exactly one proxy is trusted", () => {
    const bag = headers({ "x-real-ip": "203.0.113.5" });
    expect(extractClientIp(bag, 1)).toBe("203.0.113.5");
    expect(extractClientIp(bag, 2)).toBe("unknown");
    expect(extractClientIp(bag, 0)).toBe("unknown");
  });

  test("Vercel's single-entry header resolves under the default", () => {
    expect(
      extractClientIp(headers({ "x-forwarded-for": "203.0.113.10" }))
    ).toBe("203.0.113.10");
  });

  test("the nullable variant hands audit rows null instead of the token", () => {
    expect(extractClientIpOrNull(undefined)).toBeNull();
    expect(
      extractClientIpOrNull(headers({ "x-forwarded-for": "203.0.113.10" }))
    ).toBe("203.0.113.10");
  });
});

describe("emailLogDigest", () => {
  test("is stable, case-insensitive, and never the address itself", () => {
    const a = emailLogDigest("Ada@Example.com");
    expect(a).toBe(emailLogDigest("ada@example.com"));
    expect(a).toMatch(/^email:[0-9a-f]{12}$/);
    expect(a).not.toContain("ada");
    expect(emailLogDigest("")).toBe("email:none");
  });
});
