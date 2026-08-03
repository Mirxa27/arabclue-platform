/**
 * Ensure the seeded SUPER_ADMIN used by completion E2E is active with a known
 * password. Shared Neon + production deploys can deactivate @arabclue.local
 * identities; this restores the AGENTS.md account before the suite runs.
 */
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

const EMAIL = "devtest@arabclue.local";
const PASSWORD = "DevTest2026!";

export default async function globalSetup(): Promise<void> {
  const hash = await hashPassword(PASSWORD);
  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: {
      active: true,
      mustChangePassword: false,
      passwordHash: hash,
      role: "SUPER_ADMIN",
      mfaEnabled: false,
    },
    create: {
      email: EMAIL,
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
