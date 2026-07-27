export const TEST_DATABASE_ISOLATION_CONFIRMATION = "true";
export const BLOCKED_TEST_DATABASE_URL =
  "postgresql://blocked:blocked@127.0.0.1:1/arabclue_blocked_test?schema=public&connect_timeout=1";

const SHARED_DATABASE_URL_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "PRODUCTION_DATABASE_URL",
  "SHARED_DATABASE_URL",
  "NEON_DATABASE_URL",
] as const;

const ADMIN_DATABASE_NAMES = new Set(["postgres", "template0", "template1"]);

type Environment = Readonly<Record<string, string | undefined>>;

export type TestDatabaseGuardCode =
  | "TEST_DATABASE_PRODUCTION_RUNTIME"
  | "TEST_DATABASE_URL_REQUIRED"
  | "TEST_DATABASE_URL_INVALID"
  | "TEST_DATABASE_ADMIN_DATABASE"
  | "TEST_DATABASE_ISOLATION_UNCONFIRMED"
  | "TEST_DATABASE_IDENTITY_REQUIRED"
  | "TEST_DATABASE_IDENTITY_MISMATCH"
  | "TEST_DATABASE_SHARED_IDENTITY"
  | "TEST_DATABASE_REFERENCE_INVALID";

export class TestDatabaseGuardError extends Error {
  constructor(
    readonly code: TestDatabaseGuardCode,
    message: string,
  ) {
    super(message);
    this.name = "TestDatabaseGuardError";
  }
}

function normalizeHostname(hostname: string): string {
  const unwrapped = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!unwrapped.endsWith(".neon.tech")) return unwrapped;

  const labels = unwrapped.split(".");
  labels[0] = (labels[0] ?? "").replace(/-pooler$/u, "");
  return labels.join(".");
}

function parsePostgresUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_URL_INVALID",
      "TEST_DATABASE_URL must be a valid PostgreSQL URL",
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_URL_INVALID",
      "TEST_DATABASE_URL must use the postgres or postgresql protocol",
    );
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_URL_INVALID",
      "TEST_DATABASE_URL must name a host and database",
    );
  }
  return parsed;
}

/** Credential-free identity; Neon pooled/direct hosts normalize to one endpoint. */
export function databaseIdentity(rawUrl: string): string {
  const parsed = parsePostgresUrl(rawUrl);
  const hostname = normalizeHostname(parsed.hostname);
  const port = parsed.port || "5432";
  const database = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  const schema = (parsed.searchParams.get("schema")?.trim() || "public").toLowerCase();
  return `${hostname}:${port}/${database}?schema=${schema}`;
}

export type ApprovedTestDatabase = Readonly<{
  url: string;
  identity: string;
}>;

/**
 * Fails closed unless the caller explicitly confirms and names an isolated DB.
 * It compares credential-free identities so alternate users and Neon pooled vs
 * direct hostnames cannot bypass the shared/production database rejection.
 */
export function requireIsolatedTestDatabase(
  environment: Environment = process.env,
): ApprovedTestDatabase {
  if (
    environment.NODE_ENV === "production" ||
    environment.VERCEL_ENV === "production"
  ) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_PRODUCTION_RUNTIME",
      "Database-backed completion tests are disabled in production runtimes",
    );
  }

  const rawUrl = environment.TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_URL_REQUIRED",
      "TEST_DATABASE_URL is required for database-backed completion tests",
    );
  }

  const parsed = parsePostgresUrl(rawUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  if (ADMIN_DATABASE_NAMES.has(databaseName)) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_ADMIN_DATABASE",
      "Administrative PostgreSQL databases cannot be used by completion tests",
    );
  }

  if (
    environment.TEST_DATABASE_ISOLATED?.trim().toLowerCase() !==
    TEST_DATABASE_ISOLATION_CONFIRMATION
  ) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_ISOLATION_UNCONFIRMED",
      "Set TEST_DATABASE_ISOLATED=true only for a disposable isolated database",
    );
  }

  const expectedIdentity = environment.TEST_DATABASE_IDENTITY?.trim();
  if (!expectedIdentity) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_IDENTITY_REQUIRED",
      "TEST_DATABASE_IDENTITY must explicitly name the isolated database",
    );
  }

  const identity = databaseIdentity(rawUrl);
  if (expectedIdentity !== identity) {
    throw new TestDatabaseGuardError(
      "TEST_DATABASE_IDENTITY_MISMATCH",
      "TEST_DATABASE_IDENTITY does not match TEST_DATABASE_URL",
    );
  }

  for (const key of SHARED_DATABASE_URL_KEYS) {
    const referenceUrl = environment[key]?.trim();
    if (!referenceUrl) continue;

    let referenceIdentity: string;
    try {
      referenceIdentity = databaseIdentity(referenceUrl);
    } catch {
      throw new TestDatabaseGuardError(
        "TEST_DATABASE_REFERENCE_INVALID",
        `${key} is set but its database identity cannot be verified safely`,
      );
    }

    if (referenceIdentity === identity) {
      throw new TestDatabaseGuardError(
        "TEST_DATABASE_SHARED_IDENTITY",
        `TEST_DATABASE_URL resolves to the shared/production identity in ${key}`,
      );
    }
  }

  return Object.freeze({ url: rawUrl, identity });
}
