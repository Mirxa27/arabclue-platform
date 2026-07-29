import {
  TestDatabaseGuardError,
  databaseIdentity,
  requireIsolatedTestDatabase,
  type ApprovedTestDatabase,
} from "../../../src/lib/__tests__/support/test-database";

export {
  TestDatabaseGuardError,
  databaseIdentity,
  requireIsolatedTestDatabase,
  type ApprovedTestDatabase,
};

/**
 * Returns approved isolated DB settings when the guard passes; otherwise null.
 * Completion E2E uses this to decide whether stateful setup is permitted.
 */
export function tryIsolatedTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): ApprovedTestDatabase | null {
  try {
    return requireIsolatedTestDatabase(environment);
  } catch (error) {
    if (error instanceof TestDatabaseGuardError) return null;
    throw error;
  }
}

export function hasIsolatedTestDatabase(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return tryIsolatedTestDatabase(environment) !== null;
}
