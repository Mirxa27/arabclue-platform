import { describe, expect, test } from "bun:test";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  ApiError,
  AuthenticationRequiredError,
  RequestValidationError,
  ResourceNotFoundError,
  TenantAccessForbiddenError,
  WorkspaceRoleForbiddenError,
  apiFailure,
  asSchemaMigrationPendingError,
  failureLogRecord,
  internalFailure,
  legacyFailureBody,
  mapErrorToApiFailure,
  mappedApiFailure,
  redactSensitiveText,
  resolveFailureStatus,
  schemaPendingFailure,
  validationFailure,
  zodFieldPaths,
  type MappedFailure,
} from "../../api-failure";
import { SchemaMigrationPendingError } from "../../prisma-missing-table";
import {
  isApiFailure,
  selectApiFailureCode,
  selectApiFailureMessage,
  type ApiFailure,
} from "../../api-failure-message";

/*
 * Task 1.3 — the single bilingual ApiFailure mapper.
 *
 * Requirements 16.2, 16.7 (missing relation -> 503 SCHEMA_MIGRATION_PENDING
 * naming the relation), 18.4/18.9 (both locales, never empty), 19.2/19.9
 * (validation names offending fields; no not-implemented status), and 19.10 (a
 * generic 500 that leaks no SQL, provider payload, credential, token, document,
 * or commercial value).
 */

function p2021(table: string): Error {
  return new Prisma.PrismaClientKnownRequestError(
    `The table \`public.${table}\` does not exist in the current database.`,
    { code: "P2021", clientVersion: "test" }
  );
}

function p2010(relation: string): Error {
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: \`42P01\`. Message: \`relation "${relation}" does not exist\``,
    { code: "P2010", clientVersion: "test" }
  );
}

/**
 * An additive column-only migration that is still unapplied: the table exists
 * but a column the generated client selects does not.
 */
function p2022(column: string): Error {
  return new Prisma.PrismaClientKnownRequestError(
    `The column \`${column}\` does not exist in the current database.`,
    { code: "P2022", clientVersion: "test" }
  );
}

const ARABIC = /[\u0600-\u06FF]/u;

/** Every failure body carries the authoritative contract surface. */
function expectWellFormedFailure(body: ApiFailure): void {
  expect(body.ok).toBe(false);
  expect(typeof body.code).toBe("string");
  expect(body.code.length).toBeGreaterThan(0);
  expect(body.message.ar.trim().length).toBeGreaterThan(0);
  expect(body.message.en.trim().length).toBeGreaterThan(0);
  // `error` is the compatibility alias for the same bilingual pair.
  expect(body.error).toEqual(body.message);
  expect(isApiFailure(body)).toBe(true);
}

describe("apiFailure body construction", () => {
  test("builds a bilingual body for a registered completion code", () => {
    const body = apiFailure("TENANT_ACCESS_FORBIDDEN");
    expectWellFormedFailure(body);
    expect(body.code).toBe("TENANT_ACCESS_FORBIDDEN");
    expect(ARABIC.test(body.message.ar)).toBe(true);
    expect(ARABIC.test(body.message.en)).toBe(false);
  });

  test("attaches the missing table plus owning migration and capabilities", () => {
    const body = apiFailure("SCHEMA_MIGRATION_PENDING", {
      missingTable: "WorkspaceInvitation",
    });
    expectWellFormedFailure(body);
    expect(body.missingTable).toBe("WorkspaceInvitation");
    expect(body.migration).toBe("20260726000000_platform_completion");
    expect(body.capabilities).toContain("workspace invitations");
  });

  test("carries field paths and retry hint only when provided", () => {
    const withPaths = apiFailure("REQUEST_VALIDATION_FAILED", {
      fieldPaths: ["email", "password"],
      values: { fieldPath: "email, password" },
    });
    expect(withPaths.fieldPaths).toEqual(["email", "password"]);

    const withRetry = apiFailure("SEAT_LIMIT_REACHED", { retryAfterSeconds: 30 });
    expect(withRetry.retryAfterSeconds).toBe(30);
    expect(apiFailure("INTERNAL_ERROR").fieldPaths).toBeUndefined();
  });
});

describe("resolveFailureStatus", () => {
  test("maps cross-cutting codes explicitly", () => {
    expect(resolveFailureStatus("SCHEMA_MIGRATION_PENDING")).toBe(503);
    expect(resolveFailureStatus("AUTHENTICATION_REQUIRED")).toBe(401);
    expect(resolveFailureStatus("TENANT_ACCESS_FORBIDDEN")).toBe(403);
    expect(resolveFailureStatus("RESOURCE_NOT_FOUND")).toBe(404);
    expect(resolveFailureStatus("REQUEST_VALIDATION_FAILED")).toBe(400);
    // Criterion 3.8: an exhausted seat allowance is 429, not 409.
    expect(resolveFailureStatus("SEAT_LIMIT_REACHED")).toBe(429);
    expect(resolveFailureStatus("TEMPLATE_VERSION_CONFLICT")).toBe(409);
  });

  test("falls back to suffix families for domain codes", () => {
    expect(resolveFailureStatus("SOMETHING_NOT_FOUND")).toBe(404);
    expect(resolveFailureStatus("SOMETHING_FORBIDDEN")).toBe(403);
    expect(resolveFailureStatus("SOMETHING_CONFLICT")).toBe(409);
    expect(resolveFailureStatus("SOMETHING_RATE_LIMITED")).toBe(429);
    expect(resolveFailureStatus("SOMETHING_UNCONFIGURED")).toBe(503);
    expect(resolveFailureStatus("READINESS_ANYTHING")).toBe(503);
  });

  test("never resolves to a not-implemented status and defaults to 400", () => {
    expect(resolveFailureStatus("TOTALLY_UNKNOWN_CODE")).toBe(400);
    // The date-range code ends in _REQUIRED but is a 400 input error, not a 403.
    expect(resolveFailureStatus("ANALYTICS_DATE_RANGE_REQUIRED")).toBe(400);
    for (const code of [
      "SCHEMA_MIGRATION_PENDING",
      "RESOURCE_NOT_FOUND",
      "INTERNAL_ERROR",
      "SOMETHING_UNKNOWN",
    ]) {
      expect(resolveFailureStatus(code)).not.toBe(501);
    }
  });
});

describe("mapErrorToApiFailure — missing relation (requirements 16.2, 16.7)", () => {
  test("maps a P2021 missing-table error to 503 naming the relation", () => {
    const mapped = mapErrorToApiFailure(p2021("AnalyticsEvent"));
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect(mapped.body.missingTable).toBe("AnalyticsEvent");
    expectWellFormedFailure(mapped.body);
  });

  test("maps a P2010 raw-query relation error to 503 naming the relation", () => {
    const mapped = mapErrorToApiFailure(p2010("CollaborationComment"));
    expect(mapped.status).toBe(503);
    expect(mapped.body.missingTable).toBe("CollaborationComment");
  });

  test("maps a P2022 missing-column error to 503 naming the qualified column", () => {
    const mapped = mapErrorToApiFailure(p2022("User.emailVerified"));
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect(mapped.body.missingTable).toBe("User.emailVerified");
    expectWellFormedFailure(mapped.body);
  });

  test("attributes no migration to a missing column on an existing table", () => {
    // `User` is created by the applied baseline migration, so reporting the bare
    // table would name an already-applied migration and the wrong capabilities.
    const mapped = mapErrorToApiFailure(p2022("User.emailVerified"));
    expect(mapped.body.migration).toBeUndefined();
    expect(mapped.body.capabilities).toBeUndefined();
    expect(mapErrorToApiFailure(p2021("User")).body.migration).toBe(
      "20260722140000_postgres_baseline"
    );
  });

  test("drops a schema qualifier from a missing-column identifier", () => {
    expect(
      mapErrorToApiFailure(p2022("public.User.emailVerified")).body.missingTable
    ).toBe("User.emailVerified");
  });

  test("recognizes the typed SchemaMigrationPendingError", () => {
    const mapped = mapErrorToApiFailure(
      new SchemaMigrationPendingError("ProposalPresence")
    );
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("SCHEMA_MIGRATION_PENDING");
    expect(mapped.body.missingTable).toBe("ProposalPresence");
  });

  test("asSchemaMigrationPendingError normalizes driver and typed errors", () => {
    expect(asSchemaMigrationPendingError(p2021("RecoveryToken"))).toBeInstanceOf(
      SchemaMigrationPendingError
    );
    expect(
      asSchemaMigrationPendingError(new SchemaMigrationPendingError("X"))
    ).toBeInstanceOf(SchemaMigrationPendingError);
    expect(asSchemaMigrationPendingError(new Error("connection refused"))).toBeNull();
  });

  test("schemaPendingFailure degrades safely when no relation is named", () => {
    const mapped = schemaPendingFailure(null);
    expect(mapped.status).toBe(503);
    expect(mapped.body.missingTable).toBeUndefined();
    expectWellFormedFailure(mapped.body);
  });
});

describe("mapErrorToApiFailure — validation (requirements 19.4, 19.9)", () => {
  test("maps a ZodError to 400 REQUEST_VALIDATION_FAILED naming every field", () => {
    const schema = z.object({ email: z.string().email(), age: z.number().int() });
    const result = schema.safeParse({ email: "nope", age: 1.5 });
    expect(result.success).toBe(false);
    const mapped = mapErrorToApiFailure(result.error);
    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(mapped.body.fieldPaths).toEqual(["email", "age"]);
    expectWellFormedFailure(mapped.body);
  });

  test("RequestValidationError preserves the offending paths", () => {
    const mapped = mapErrorToApiFailure(
      new RequestValidationError(["profile.name", "items[0].id"])
    );
    expect(mapped.status).toBe(400);
    expect(mapped.body.fieldPaths).toEqual(["profile.name", "items[0].id"]);
  });

  test("zodFieldPaths reports the request root for a top-level failure", () => {
    const result = z.string().safeParse(42);
    expect(result.success).toBe(false);
    expect(zodFieldPaths(result.error)).toEqual(["request"]);
  });

  test("validationFailure defaults to the request root when no path is given", () => {
    const mapped = validationFailure([]);
    expect(mapped.status).toBe(400);
    expect(mapped.body.fieldPaths).toEqual(["request"]);
  });
});

describe("mapErrorToApiFailure — typed authorization failures (requirement 19.5)", () => {
  const cases: ReadonlyArray<[ApiError, number, string]> = [
    [new AuthenticationRequiredError(), 401, "AUTHENTICATION_REQUIRED"],
    [new WorkspaceRoleForbiddenError(), 403, "WORKSPACE_ROLE_FORBIDDEN"],
    [new TenantAccessForbiddenError(), 403, "TENANT_ACCESS_FORBIDDEN"],
    [new ResourceNotFoundError(), 404, "RESOURCE_NOT_FOUND"],
  ];

  for (const [error, status, code] of cases) {
    test(`${code} maps to ${status} with a bilingual message`, () => {
      const mapped = mapErrorToApiFailure(error);
      expect(mapped.status).toBe(status);
      expect(mapped.body.code).toBe(code);
      expectWellFormedFailure(mapped.body);
    });
  }

  test("an ApiError with a registered code uses the contract message, not the thrown text", () => {
    const mapped = mapErrorToApiFailure(
      new ApiError("raw internal detail 42.99", 403, "TENANT_ACCESS_FORBIDDEN")
    );
    expect(mapped.status).toBe(403);
    expect(JSON.stringify(mapped.body)).not.toContain("raw internal detail");
    expect(JSON.stringify(mapped.body)).not.toContain("42.99");
  });

  test("an ApiError with an unregistered code keeps the status and a registry or generic message", () => {
    const mapped = mapErrorToApiFailure(
      new ApiError("legacy detail", 409, "SOME_LEGACY_CODE")
    );
    expect(mapped.status).toBe(409);
    expect(mapped.body.code).toBe("SOME_LEGACY_CODE");
    expectWellFormedFailure(mapped.body);
    expect(JSON.stringify(mapped.body)).not.toContain("legacy detail");
  });

  test("recognizes the email-verification guard by name", () => {
    const mapped = mapErrorToApiFailure({
      name: "EmailVerificationRequiredError",
      status: 403,
      code: "EMAIL_VERIFICATION_REQUIRED",
      message: "Email verification required",
    });
    expect(mapped.status).toBe(403);
    expect(mapped.body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
});

describe("mapErrorToApiFailure — unknown failures leak nothing (requirement 19.10)", () => {
  test("an unknown error becomes a generic bilingual 500", () => {
    const mapped = mapErrorToApiFailure(new Error("kaboom"));
    expect(mapped.status).toBe(500);
    expect(mapped.body.code).toBe("INTERNAL_ERROR");
    expectWellFormedFailure(mapped.body);
    expect(mapped).toEqual(internalFailure());
  });

  test("a SQL/credential/token/amount bearing error never reaches the client body", () => {
    const leaky = new Error(
      "SELECT * FROM \"User\" WHERE token='sk-abcdef0123456789' AND amount=1,234.56 -- postgresql://u:pw@db.neon.tech/prod"
    );
    const mapped = mapErrorToApiFailure(leaky);
    expect(mapped.status).toBe(500);
    const serialized = JSON.stringify(mapped.body);
    for (const secret of [
      "SELECT",
      "sk-abcdef",
      "1,234.56",
      "postgresql://",
      "db.neon.tech",
      "token=",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test("non-Error throwables also become a generic 500", () => {
    for (const thrown of ["a string", 42, null, undefined, { any: "object" }]) {
      const mapped = mapErrorToApiFailure(thrown);
      expect(mapped.status).toBe(500);
      expect(mapped.body.code).toBe("INTERNAL_ERROR");
    }
  });
});

describe("redaction (requirement 19.10)", () => {
  test("redactSensitiveText strips SQL, connection strings, credentials, tokens, and amounts", () => {
    const inputs = [
      "SELECT email FROM users WHERE id = 1",
      "postgresql://user:secret@ep-shared.neon.tech:5432/prod",
      "password=hunter2 secret=topsecret",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      "api_key: sk-abcdefgh12345678",
      "total 1,234.56 SAR and 99.99 more",
    ];
    for (const input of inputs) {
      const redacted = redactSensitiveText(input);
      expect(redacted).toContain("[redacted]");
    }
    expect(redactSensitiveText("postgresql://u:p@h/db")).not.toContain("://u:p@h");
    expect(redactSensitiveText("password=hunter2")).not.toContain("hunter2");
    expect(redactSensitiveText("value 1,234.56")).not.toContain("1,234.56");
  });

  test("failureLogRecord produces a bounded, redacted, code-tagged record", () => {
    const error = new Error(
      'relation "User" does not exist; password=hunter2; ' + "x".repeat(500)
    );
    const mapped = mapErrorToApiFailure(error);
    const record = failureLogRecord("some-route", error, mapped);
    expect(record.label).toBe("some-route");
    expect(record.code).toBe(mapped.body.code);
    expect(record.errorName).toBe("Error");
    expect(record.detail).not.toContain("hunter2");
    expect(record.detail.length).toBeLessThanOrEqual(201);
  });
});

describe("legacyFailureBody", () => {
  test("uses the registry message for a registered code", () => {
    const body = legacyFailureBody("EMAIL_ALREADY_REGISTERED");
    expect(body.code).toBe("EMAIL_ALREADY_REGISTERED");
    expectWellFormedFailure(body);
    expect(ARABIC.test(body.message.ar)).toBe(true);
  });

  test("falls back to the generic internal-error message for an unknown code but keeps the code", () => {
    // An unregistered code has no bilingual pair, so the body carries the
    // action-prefixed generic INTERNAL_ERROR message while preserving the code.
    const body = legacyFailureBody("SOME_UNKNOWN_CODE");
    expect(body.code).toBe("SOME_UNKNOWN_CODE");
    expect(body.message).toEqual(apiFailure("INTERNAL_ERROR").message);
    expectWellFormedFailure(body);
  });

  test("uses INTERNAL_ERROR as the code when none is supplied", () => {
    expect(legacyFailureBody(null).code).toBe("INTERNAL_ERROR");
  });
});

describe("client-side failure selectors", () => {
  const failure: MappedFailure = mappedApiFailure("SCHEMA_MIGRATION_PENDING", {
    missingTable: "InAppNotification",
  });

  test("selectApiFailureCode reads the stable code", () => {
    expect(selectApiFailureCode(failure.body)).toBe("SCHEMA_MIGRATION_PENDING");
    expect(selectApiFailureCode({})).toBeNull();
  });

  test("selectApiFailureMessage prefers the requested locale and falls back", () => {
    expect(selectApiFailureMessage(failure.body, "ar")).toBe(failure.body.message.ar);
    expect(selectApiFailureMessage(failure.body, "en")).toBe(failure.body.message.en);
    // Legacy plain-string error bodies still resolve.
    expect(selectApiFailureMessage({ error: "boom" }, "en")).toBe("boom");
    expect(selectApiFailureMessage({}, "en")).toBeNull();
  });
});
