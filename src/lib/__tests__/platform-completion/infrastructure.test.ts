import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { readFileSync } from "node:fs";
import {
  COMPLETION_PROPERTY_MIN_RUNS,
  COMPLETION_PROPERTY_PARAMETERS,
  COMPLETION_PROPERTY_SEED,
  DeterministicClock,
  DeterministicRandomSource,
  TestDatabaseGuardError,
  assertTestNetworkTargetAllowed,
  completionArbitraries,
  completionPropertyOptions,
  createBillingProviderMock,
  createEmailProviderMock,
  databaseIdentity,
  requireIsolatedTestDatabase,
} from "../support";

const packageJson = JSON.parse(
  readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const bunLock = readFileSync(
  new URL("../../../../bun.lock", import.meta.url),
  "utf8",
);

function expectGuardCode(
  environment: Record<string, string | undefined>,
  expectedCode: TestDatabaseGuardError["code"],
): void {
  try {
    requireIsolatedTestDatabase(environment);
    throw new Error("Expected the test database guard to reject the environment");
  } catch (error) {
    expect(error).toBeInstanceOf(TestDatabaseGuardError);
    expect((error as TestDatabaseGuardError).code).toBe(expectedCode);
  }
}

describe("platform-completion test dependency and property defaults", () => {
  test("pins fast-check exactly in package.json and bun.lock", () => {
    const version = packageJson.devDependencies?.["fast-check"];
    expect(version).toBe("4.9.0");
    expect(version).not.toMatch(/^[~^]/u);
    expect(bunLock).toContain('"fast-check": "4.9.0"');
    expect(bunLock).toContain('fast-check@4.9.0');
  });

  test("keeps every randomized property at or above 100 cases", () => {
    expect(COMPLETION_PROPERTY_MIN_RUNS).toBeGreaterThanOrEqual(100);
    expect(COMPLETION_PROPERTY_PARAMETERS.numRuns).toBeGreaterThanOrEqual(100);
    expect(completionPropertyOptions({ numRuns: 1 }).numRuns).toBe(100);
    expect(completionPropertyOptions({ numRuns: 250 }).numRuns).toBe(250);
  });

  test("provides deterministic shared generators", () => {
    const first = fc.sample(completionArbitraries.distinctWorkspacePair, {
      seed: COMPLETION_PROPERTY_SEED,
      numRuns: 8,
    });
    const second = fc.sample(completionArbitraries.distinctWorkspacePair, {
      seed: COMPLETION_PROPERTY_SEED,
      numRuns: 8,
    });

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    for (const pair of first) {
      expect(pair.callerWorkspaceId).not.toBe(pair.targetWorkspaceId);
    }
  });
});

describe("isolated test database guard", () => {
  const isolatedUrl =
    "postgresql://test_user:secret@ep-isolated-branch.us-east-2.aws.neon.tech:5432/arabclue_completion_test?schema=completion_test&sslmode=require";
  const isolatedIdentity = databaseIdentity(isolatedUrl);
  const baseEnvironment = {
    NODE_ENV: "test",
    TEST_DATABASE_URL: isolatedUrl,
    TEST_DATABASE_IDENTITY: isolatedIdentity,
    TEST_DATABASE_ISOLATED: "true",
    DATABASE_URL:
      "postgresql://shared:secret@ep-shared-main-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require",
  };

  test("accepts an explicitly named identity distinct from the shared database", () => {
    expect(requireIsolatedTestDatabase(baseEnvironment)).toEqual({
      url: isolatedUrl,
      identity: isolatedIdentity,
    });
  });

  test("fails closed when URL, confirmation, or explicit identity is absent", () => {
    expectGuardCode(
      { ...baseEnvironment, TEST_DATABASE_URL: undefined },
      "TEST_DATABASE_URL_REQUIRED",
    );
    expectGuardCode(
      { ...baseEnvironment, TEST_DATABASE_ISOLATED: undefined },
      "TEST_DATABASE_ISOLATION_UNCONFIRMED",
    );
    expectGuardCode(
      { ...baseEnvironment, TEST_DATABASE_IDENTITY: undefined },
      "TEST_DATABASE_IDENTITY_REQUIRED",
    );
  });

  test("rejects identity mismatches and production runtime execution", () => {
    expectGuardCode(
      { ...baseEnvironment, TEST_DATABASE_IDENTITY: "different:5432/db?schema=public" },
      "TEST_DATABASE_IDENTITY_MISMATCH",
    );
    expectGuardCode(
      { ...baseEnvironment, NODE_ENV: "production" },
      "TEST_DATABASE_PRODUCTION_RUNTIME",
    );
  });

  test("rejects the shared Neon endpoint across pooled/direct URLs and users", () => {
    const sharedDirectUrl =
      "postgresql://different_user:other@ep-shared-main.us-east-2.aws.neon.tech:5432/neondb?schema=public";
    expectGuardCode(
      {
        ...baseEnvironment,
        TEST_DATABASE_URL: sharedDirectUrl,
        TEST_DATABASE_IDENTITY: databaseIdentity(sharedDirectUrl),
      },
      "TEST_DATABASE_SHARED_IDENTITY",
    );
  });

  test("rejects malformed URLs and administrative databases", () => {
    expectGuardCode(
      { ...baseEnvironment, TEST_DATABASE_URL: "not-a-url" },
      "TEST_DATABASE_URL_INVALID",
    );
    const adminUrl = "postgresql://test:secret@localhost:5432/postgres";
    expectGuardCode(
      {
        ...baseEnvironment,
        TEST_DATABASE_URL: adminUrl,
        TEST_DATABASE_IDENTITY: databaseIdentity(adminUrl),
      },
      "TEST_DATABASE_ADMIN_DATABASE",
    );
  });
});

describe("deterministic provider boundaries", () => {
  test("provides stable clocks and cryptographic-shape test randomness", () => {
    const clock = new DeterministicClock("2026-07-26T10:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-07-26T10:00:00.000Z");
    expect(clock.advanceBy(5_000).toISOString()).toBe(
      "2026-07-26T10:00:05.000Z",
    );

    const first = new DeterministicRandomSource(12345);
    const second = new DeterministicRandomSource(12345);
    expect(first.randomBytes(24)).toEqual(second.randomBytes(24));
    expect(first.randomUUID()).toBe(second.randomUUID());
    expect(first.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  test("records email and billing calls in memory without network access", async () => {
    const email = createEmailProviderMock();
    const billing = createBillingProviderMock();

    await expect(
      email.sendEmail({
        to: "recipient@example.invalid",
        subject: "Test notification",
        html: "<p>Test</p>",
      }),
    ).resolves.toMatchObject({ ok: true, id: "test-email-message-1" });

    await expect(
      billing.createRecurringPayment({
        paymentMethodId: 1,
        invoiceValue: 1,
        customerName: "Test User",
        customerEmail: "customer@example.invalid",
        customerReference: "reference-1",
        callBackUrl: "https://example.invalid/callback",
        errorUrl: "https://example.invalid/error",
        recurring: { recurringType: "Monthly", retryCount: 3 },
      }),
    ).resolves.toMatchObject({
      recurringId: "test-recurring-1",
      customerReference: "reference-1",
    });

    expect(email.calls).toHaveLength(1);
    expect(billing.calls.createRecurringPayment).toHaveLength(1);
  });

  test("blocks external HTTP targets while allowing loopback test servers", () => {
    expect(() =>
      assertTestNetworkTargetAllowed("https://api-sa.myfatoorah.com/v2/ExecutePayment"),
    ).toThrow("EXTERNAL_NETWORK_BLOCKED");
    expect(() =>
      assertTestNetworkTargetAllowed("https://api.resend.com/emails"),
    ).toThrow("EXTERNAL_NETWORK_BLOCKED");
    expect(() =>
      assertTestNetworkTargetAllowed("http://127.0.0.1:3000/api/health"),
    ).not.toThrow();
  });
});

describe("one-shot safe test scripts", () => {
  for (const name of ["test", "test:completion", "test:completion:db"] as const) {
    test(`${name} is one-shot and contains no provider or schema mutation command`, () => {
      const command = packageJson.scripts?.[name] ?? "";
      expect(command).toContain("bun test");
      expect(command).toContain("completion-test-preload.ts");
      expect(command).not.toMatch(/--watch|\bwatch\b/iu);
      expect(command).not.toMatch(
        /prisma\s+(?:migrate|db\s+push)|db:(?:push|migrate|reset)|migrate\s+reset/iu,
      );
      expect(command).not.toMatch(/resend|myfatoorah|sendpayment|executePayment/iu);
    });
  }
});
