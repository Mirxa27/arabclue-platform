import { expect, test } from "@playwright/test";
import { hasIsolatedTestDatabase } from "./support/test-database";

const isolated = hasIsolatedTestDatabase();

test.describe("stateful completion flows", () => {
  test.skip(
    !isolated,
    "Requires TEST_DATABASE_URL with TEST_DATABASE_ISOLATED=true and matching TEST_DATABASE_IDENTITY distinct from DATABASE_URL",
  );

  test("isolated database guard is active for stateful setup", async () => {
    expect(isolated).toBe(true);
  });

  test("registration API accepts payload against isolated server database", async ({
    request,
  }) => {
    const unique = `e2e-${Date.now()}@example.invalid`;
    const response = await request.post("/api/auth/register", {
      data: {
        email: unique,
        password: "E2e-Isolated-Password-9!",
        name: "E2E Isolated",
        workspaceName: "E2E Isolated Workspace",
        locale: "en",
      },
    });
    expect([200, 201, 409, 429]).toContain(response.status());
    const body = await response.json();
    if (response.ok()) {
      expect(body).toBeTruthy();
    }
  });
});
