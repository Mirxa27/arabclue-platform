/**
 * Create a local writer account for isolated developer testing.
 *
 * Required:
 *   DEVTEST_EMAIL
 *   DEVTEST_PASSWORD
 *   ALLOW_LOCAL_DEV_ACCOUNT=yes
 *
 * This script refuses production, Vercel, and non-local database hosts. It
 * intentionally never creates a platform administrator.
 */
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

function requireLocalDatabase(rawUrl: string | undefined): void {
  if (!rawUrl) throw new Error("DATABASE_URL is required");
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      "Development accounts may only be created in an isolated local database"
    );
  }
}

if (
  process.env.NODE_ENV === "production" ||
  process.env.VERCEL ||
  process.env.ALLOW_LOCAL_DEV_ACCOUNT !== "yes"
) {
  throw new Error("Local development account creation is disabled");
}
requireLocalDatabase(process.env.DATABASE_URL);

const email = process.env.DEVTEST_EMAIL?.trim().toLowerCase();
const password = process.env.DEVTEST_PASSWORD ?? "";
if (!email || !email.endsWith("@arabclue.local")) {
  throw new Error("DEVTEST_EMAIL must use the reserved @arabclue.local domain");
}
if (password.length < 16) {
  throw new Error("DEVTEST_PASSWORD must contain at least 16 characters");
}

const hash = await hashPassword(password);
const user = await db.user.upsert({
  where: { email },
  update: {
    passwordHash: hash,
    role: "BIDDER",
    active: true,
    mustChangePassword: true,
    mfaEnabled: false,
  },
  create: {
    email,
    name: "Local Development User",
    passwordHash: hash,
    role: "BIDDER",
    active: true,
    mustChangePassword: true,
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
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    update: { role: "MEMBER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "MEMBER" },
  });
  await db.user.update({
    where: { id: user.id },
    data: { activeWorkspaceId: workspace.id },
  });
}

console.log(
  JSON.stringify({
    ok: true,
    userId: user.id,
    workspaceId: workspace?.id ?? null,
  })
);
await db.$disconnect();
