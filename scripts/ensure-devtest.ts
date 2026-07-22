/**
 * Upsert the AGENTS.md dev SUPER_ADMIN for local/shared-DB e2e.
 * Usage: bun run scripts/ensure-devtest.ts
 */
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const email = "devtest@arabclue.local";
const password = "DevTest2026!";

const hash = await hashPassword(password);

const user = await db.user.upsert({
  where: { email },
  update: {
    passwordHash: hash,
    role: "SUPER_ADMIN",
    active: true,
    mustChangePassword: false,
    mfaEnabled: false,
  },
  create: {
    email,
    name: "Dev Test Admin",
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
      workspaceId_userId: { workspaceId: workspace.id, userId: user.id },
    },
    update: { role: "OWNER" },
    create: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
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
    email: user.email,
    workspaceId: workspace?.id ?? null,
  })
);

await db.$disconnect();
