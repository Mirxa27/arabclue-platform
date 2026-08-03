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

  test("GET /api/ready reports readiness separately from liveness", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/ready`);
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
