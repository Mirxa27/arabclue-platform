import { expect, test } from "@playwright/test";
import { BASE_URL } from "./support/config";

test.describe("health vs ready probes", () => {
  test("GET /api/health returns liveness without schema detail", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      service: "arabclue",
    });
    expect(body.time).toBeTruthy();
    expect(body.schema).toBeUndefined();
    expect(body.checks).toBeUndefined();
  });

  test("GET /api/ready answers strangers with the boolean only", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/ready`);
    const body = await response.json();
    expect(body.service).toBe("arabclue");
    expect(typeof body.ready).toBe("boolean");
    expect(body.time).toBeTruthy();
    // Migration names, credential map and backends are for operators only.
    expect(body.checks).toBeUndefined();
    expect(body.schema).toBeUndefined();
    if (!body.ready) {
      expect(response.status()).toBe(503);
    }
  });

  test("GET /api/ready reports readiness separately from liveness for an operator", async ({
    request,
  }) => {
    const token = process.env.CRON_SECRET?.trim();
    test.skip(!token, "CRON_SECRET is not set for this run");
    const response = await request.get(`${BASE_URL}/api/ready`, {
      headers: { "x-readiness-token": token ?? "" },
    });
    const body = await response.json();
    expect(body.service).toBe("arabclue");
    expect(body.checks).toBeTruthy();
    expect(body.schema).toMatchObject({
      declaredMigrations: expect.any(Number),
      appliedMigrations: expect.any(Number),
      unappliedMigrations: expect.any(Array),
    });
    expect(typeof body.ready).toBe("boolean");
    if (!body.ready) {
      expect(response.status()).toBe(503);
    }
  });
});
