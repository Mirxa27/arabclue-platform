/**
 * Ensure the SUPER_ADMIN used by the completion E2E suite is active with a
 * known password.
 *
 * The credential comes from the environment and is never written here. An
 * earlier version hardcoded a plaintext SUPER_ADMIN password and upserted it
 * into whatever `DATABASE_URL` named, which against the shared Neon database
 * created a real privileged account with a credential published in the
 * repository.
 *
 * Guards mirror `scripts/ensure-devtest.ts`: refuse production, refuse Vercel,
 * refuse any non-local database host, and require an explicit opt-in. The suite
 * skips rather than fails when the opt-in is absent, so a developer running the
 * repo without E2E configured is not blocked.
 */
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

const REQUIRED_EMAIL_DOMAIN = "@arabclue.local";
const MIN_PASSWORD_LENGTH = 16;

function assertIsolatedDatabase(rawUrl: string | undefined): void {
  if (!rawUrl) throw new Error("DATABASE_URL is required for E2E setup");
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      `E2E setup refuses to seed a privileged account into a non-local database (host: ${hostname}). ` +
        "Point DATABASE_URL at an isolated local PostgreSQL instance."
    );
  }
}

export default async function globalSetup(): Promise<void> {
  if (process.env.E2E_ALLOW_ADMIN_SEED !== "yes") {
    console.warn(
      "[e2e] Skipping SUPER_ADMIN seed: set E2E_ALLOW_ADMIN_SEED=yes with E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD against an isolated local database."
    );
    return;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("E2E admin seeding is disabled in production");
  }
  assertIsolatedDatabase(process.env.DATABASE_URL);

  const email = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.E2E_ADMIN_PASSWORD ?? "";
  if (!email || !email.endsWith(REQUIRED_EMAIL_DOMAIN)) {
    throw new Error(
      `E2E_ADMIN_EMAIL must use the reserved ${REQUIRED_EMAIL_DOMAIN} domain`
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `E2E_ADMIN_PASSWORD must contain at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }

  const hash = await hashPassword(password);
  const user = await db.user.upsert({
    where: { email },
    update: {
      active: true,
      mustChangePassword: false,
      passwordHash: hash,
      role: "SUPER_ADMIN",
      mfaEnabled: false,
    },
    create: {
      email,
      name: "E2E Test Admin",
      passwordHash: hash,
      role: "SUPER_ADMIN",
      active: true,
      mustChangePassword: false,
      mfaEnabled: false,
      locale: "en",
    },
  });

  const workspace = await db.workspace.findFirst({
    where: { slug: "default-workspace" },
  });
  if (workspace) {
    await db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id,
        },
      },
      update: { role: "OWNER" },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "OWNER",
      },
    });
    await db.user.update({
      where: { id: user.id },
      data: { activeWorkspaceId: workspace.id },
    });
  }

  await db.$disconnect();
}
