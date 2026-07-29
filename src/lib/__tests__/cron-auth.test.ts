import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { authorizeCron } from "../cron-auth";

const VALID_SECRET = "super-secret-cron-value-0123";

function makeRequest(
  opts: {
    auth?: string;
    cronHeader?: string;
    querySecret?: string;
  } = {}
): NextRequest {
  const url = new URL("http://localhost:3000/api/cron/test");
  if (opts.querySecret) url.searchParams.set("secret", opts.querySecret);
  const headers = new Headers();
  if (opts.auth) headers.set("authorization", opts.auth);
  if (opts.cronHeader) headers.set("x-cron-secret", opts.cronHeader);
  return new NextRequest(url, { headers });
}

describe("authorizeCron", () => {
  test("returns 503 when CRON_SECRET is not set", () => {
    const prev = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    try {
      const res = authorizeCron(makeRequest({ auth: `Bearer ${VALID_SECRET}` }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(503);
    } finally {
      if (prev !== undefined) process.env.CRON_SECRET = prev;
    }
  });

  test("returns 503 when CRON_SECRET is shorter than 16 chars", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "short";
    try {
      const res = authorizeCron(makeRequest({ auth: `Bearer short` }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(503);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("returns null when Bearer token matches secret", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest({ auth: `Bearer ${VALID_SECRET}` }));
      expect(res).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("returns null when x-cron-secret header matches", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest({ cronHeader: VALID_SECRET }));
      expect(res).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("returns null when query param secret matches", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest({ querySecret: VALID_SECRET }));
      expect(res).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("returns 401 when no secret matches", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest({ auth: "Bearer wrong-secret" }));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("returns 401 when no headers or query provided", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest());
      expect(res).not.toBeNull();
      expect(res!.status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("handles Bearer with different casing", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = VALID_SECRET;
    try {
      const res = authorizeCron(makeRequest({ auth: `bearer ${VALID_SECRET}` }));
      expect(res).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  test("trims whitespace in secret comparison", () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = `  ${VALID_SECRET}  `;
    try {
      const res = authorizeCron(makeRequest({ cronHeader: VALID_SECRET }));
      expect(res).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
