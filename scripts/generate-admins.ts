#!/usr/bin/env bun
/**
 * Generate admin credentials for all roles — SUPER_ADMIN, ADMIN, BIDDER, REVIEWER, FINANCE
 * Creates users in DB, ensures workspace membership, sets mustChangePassword=true
 * Outputs secure passwords to console and to admin-credentials.json (gitignored)
 *
 * Usage: bun run scripts/generate-admins.ts [--force]
 */
import { randomBytes } from "crypto";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

type Role = "SUPER_ADMIN" | "ADMIN" | "BIDDER" | "REVIEWER" | "FINANCE";

interface SeedUser {
  email: string;
  name: string;
  role: Role;
  nameAr?: string;
}

const USERS: SeedUser[] = [
  { email: "superadmin@arabclue.com", name: "Khalid Al-Otaibi (Super Admin)", role: "SUPER_ADMIN", nameAr: "خالد العتيبي - مشرف عام" },
  { email: "admin@arabclue.com", name: "Sara Al-Qahtani (Admin)", role: "ADMIN", nameAr: "سارة القحطاني - مسؤول" },
  { email: "bidder@arabclue.com", name: "Ahmed Al-Rashid (Bidder)", role: "BIDDER", nameAr: "أحمد الراشد - مناقص" },
  { email: "reviewer@arabclue.com", name: "Noura Al-Dosari (Reviewer)", role: "REVIEWER", nameAr: "نورة الدوسري - مراجع" },
  { email: "finance@arabclue.com", name: "Fahad Al-Harbi (Finance)", role: "FINANCE", nameAr: "فهد الحربي - مالية" },
];

function genPassword(length = 20): string {
  // Generate strong password with upper, lower, digit, symbol
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=?";
  const all = upper + lower + digits + symbols;
  const bytes = randomBytes(length);
  let pwd = "";
  pwd += upper[bytes[0] % upper.length];
  pwd += lower[bytes[1] % lower.length];
  pwd += digits[bytes[2] % digits.length];
  pwd += symbols[bytes[3] % symbols.length];
  for (let i = 4; i < length; i++) {
    pwd += all[bytes[i] % all.length];
  }
  // Shuffle
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

async function main() {
  const force = process.argv.includes("--force");
  console.log("==> Arabclue — Generating admin credentials");
  console.log(`    Force overwrite: ${force ? "YES" : "NO (existing users kept)"}`);
  console.log("");

  // Ensure bootstrap workspace exists
  const { getBootstrapContext } = await import("../src/lib/bootstrap");
  let ctx: any;
  try {
    ctx = await getBootstrapContext();
  } catch (e) {
    console.error("Bootstrap failed — ensure .env has DATABASE_URL, NEXTAUTH_SECRET, ARABCLUE_ENC_KEY, BOOTSTRAP_ADMIN_PASSWORD");
    console.error(e);
    process.exit(1);
  }

  const workspace = ctx.workspace;
  console.log(`==> Workspace: ${workspace.name} (${workspace.slug}) — ${workspace.id}`);
  console.log("");

  const credentials: Record<string, { email: string; password: string; role: Role; name: string }> = {};

  for (const u of USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    let password = genPassword(20);
    let hash = await hashPassword(password);

    if (existing) {
      if (!force) {
        console.log(`-- Keeping existing: ${u.email} (${u.role}) — use --force to rotate`);
        continue;
      }
      await db.user.update({
        where: { id: existing.id },
        data: {
          name: u.name,
          passwordHash: hash,
          role: u.role,
          mfaEnabled: false,
          mfaSecret: null,
          mustChangePassword: true,
          active: true,
        },
      });
      console.log(`✓ Rotated: ${u.email} (${u.role})`);
    } else {
      const created = await db.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: hash,
          role: u.role,
          mfaEnabled: false,
          locale: "ar",
          mustChangePassword: true,
          active: true,
        },
      });
      console.log(`✓ Created: ${u.email} (${u.role}) — id ${created.id}`);
      // Ensure workspace membership
      const memberExists = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: created.id } },
      });
      if (!memberExists) {
        await db.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: created.id, role: existing ? "MEMBER" : u.role === "SUPER_ADMIN" ? "OWNER" : "MEMBER" },
        });
      }
    }

    // Ensure membership for existing users too
    if (existing) {
      const mem = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: existing.id } },
      });
      if (!mem) {
        await db.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: existing.id, role: u.role === "SUPER_ADMIN" ? "OWNER" : "MEMBER" },
        });
      }
    }

    credentials[u.role] = { email: u.email, password, role: u.role, name: u.name };
  }

  // Ensure default plans exist
  const planCount = await db.subscriptionPlan.count();
  if (planCount === 0) {
    console.log("\n==> No subscription plans found — run bootstrap or check constants");
  }

  // Give SUPER_ADMIN an ENTERPRISE subscription if missing
  for (const role of ["SUPER_ADMIN", "ADMIN"] as Role[]) {
    const email = USERS.find((x) => x.role === role)?.email;
    if (!email) continue;
    const user = await db.user.findUnique({ where: { email } });
    if (!user) continue;
    const sub = await db.subscription.findUnique({ where: { userId: user.id } });
    if (!sub) {
      const entPlan = await db.subscriptionPlan.findFirst({ where: { name: "ENTERPRISE" } });
      if (entPlan) {
        const now = new Date();
        await db.subscription.create({
          data: {
            userId: user.id,
            planId: entPlan.id,
            status: "ACTIVE",
            billingCycle: "YEARLY",
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
          },
        });
        console.log(`✓ Created ENTERPRISE subscription for ${email}`);
      }
    }
  }

  console.log("\n=================================================================");
  console.log("  ADMIN CREDENTIALS — SAVE SECURELY, WILL NOT BE SHOWN AGAIN");
  console.log("=================================================================");
  for (const [role, cred] of Object.entries(credentials)) {
    console.log(`${role.padEnd(15)} | ${cred.email.padEnd(30)} | ${cred.password}`);
  }
  console.log("=================================================================");
  console.log("  - All users have mustChangePassword=true — forced change on first login");
  console.log("  - MFA disabled initially — enable via /app settings or /api/auth/mfa/setup");
  console.log("  - Roles:");
  console.log("    SUPER_ADMIN: full platform, manage users/plans/env/billing/audit");
  console.log("    ADMIN: manage users (non-admin), plans limited, no critical env keys");
  console.log("    BIDDER: create projects, upload docs, run agents, edit proposals");
  console.log("    REVIEWER: read-only except approve/reject in reviews queue");
  console.log("    FINANCE: can view billing, edit financial forms, writer except admin");
  console.log("=================================================================");

  // Write to file (gitignored)
  const fs = await import("fs/promises");
  const path = await import("path");
  const outPath = path.join(process.cwd(), "admin-credentials.json");
  await fs.writeFile(outPath, JSON.stringify(credentials, null, 2));
  console.log(`\n✓ Credentials also written to ${outPath} (gitignored)`);

  const envPath = path.join(process.cwd(), ".env.admin");
  const envLines = Object.entries(credentials)
    .map(([role, c]) => `${role}_EMAIL=${c.email}\n${role}_PASSWORD=${c.password}`)
    .join("\n");
  await fs.writeFile(envPath, `# Generated ${new Date().toISOString()}\n${envLines}\n`);
  console.log(`✓ And to ${envPath}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
