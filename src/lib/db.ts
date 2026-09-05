import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "./database-url";

const datasourceUrl = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

// Cached unconditionally. The dev-only guard was meant to avoid stale clients
// across HMR, but in production it let every module instance that survived a
// bundle split (route handlers, Workflow steps, instrumentation) build its own
// PrismaClient and connection pool on the same Lambda.
globalForPrisma.prisma = db;
