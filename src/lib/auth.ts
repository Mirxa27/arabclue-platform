import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import { db } from "./db";
import { verifyPassword } from "./password";
import { verifyMfaToken } from "./mfa";
import { audit, AUDIT_ACTIONS } from "./audit";
import { rateLimit } from "./rate-limit";
import type { Role } from "./types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      mfaEnabled: boolean;
      locale: string;
      mustChangePassword: boolean;
    };
    mfaVerified: boolean;
    sessionToken?: string;
  }
  interface User {
    id: string;
    email: string;
    name: string;
    role: Role;
    mfaEnabled: boolean;
    locale: string;
    mfaVerified: boolean;
    mustChangePassword: boolean;
    sessionToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mfaEnabled: boolean;
    mfaVerified: boolean;
    locale: string;
    mustChangePassword: boolean;
    sessionToken?: string;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaToken: { label: "MFA Token", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase() ?? "";
        const password = credentials?.password ?? "";
        const mfaToken = credentials?.mfaToken?.trim() ?? "";

        const rl = rateLimit({
          key: `login:${email || "unknown"}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        });
        if (!rl.ok) {
          await audit({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            details: { email, reason: "rate_limited" },
            severity: "WARN",
            success: false,
          });
          return null;
        }

        const { getBootstrapContext } = await import("./bootstrap");
        try {
          await getBootstrapContext();
        } catch (err) {
          console.error("[auth] bootstrap failed", err);
        }

        if (!email || !password) return null;

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          await audit({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            details: { email, reason: "not_found_or_inactive" },
            severity: "WARN",
            success: false,
          });
          return null;
        }

        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          await audit({
            userId: user.id,
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            details: { email, reason: "bad_password" },
            severity: "WARN",
            success: false,
          });
          return null;
        }

        let mfaVerified = !user.mfaEnabled;
        if (user.mfaEnabled) {
          if (!user.mfaSecret || !mfaToken || !verifyMfaToken(user.mfaSecret, mfaToken)) {
            return null;
          }
          mfaVerified = true;
        }

        await db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
        await db.userSession.create({
          data: {
            userId: user.id,
            token: sessionToken,
            expiresAt,
          },
        });

        await audit({
          userId: user.id,
          action: AUDIT_ACTIONS.LOGIN,
          resource: "User",
          resourceId: user.id,
          details: { mfa: user.mfaEnabled },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          mfaEnabled: user.mfaEnabled,
          locale: user.locale,
          mfaVerified,
          mustChangePassword: user.mustChangePassword,
          sessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.mfaEnabled = user.mfaEnabled;
        token.mfaVerified = user.mfaVerified;
        token.locale = user.locale;
        token.mustChangePassword = user.mustChangePassword;
        token.sessionToken = user.sessionToken;
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
        if (typeof session.locale === "string") {
          token.locale = session.locale;
        }
      }
      // Revocation check
      if (token.sessionToken) {
        const row = await db.userSession.findUnique({
          where: { token: token.sessionToken },
        });
        if (!row || row.expiresAt < new Date()) {
          // Invalidate by clearing id — session callback will fail requireSession
          token.id = "";
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: (token.email as string) ?? "",
        name: (token.name as string) ?? "",
        role: token.role,
        mfaEnabled: token.mfaEnabled,
        locale: token.locale,
        mustChangePassword: !!token.mustChangePassword,
      };
      session.mfaVerified = token.mfaVerified;
      session.sessionToken = token.sessionToken;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      const sessionToken = (token as { sessionToken?: string } | undefined)?.sessionToken;
      if (sessionToken) {
        await db.userSession.deleteMany({ where: { token: sessionToken } });
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id || (session.user.mfaEnabled && !session.mfaVerified)) {
    return null;
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!session) return null;
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") return null;
  return session;
}

export async function requireSuperAdmin() {
  const session = await requireSession();
  if (!session || session.user.role !== "SUPER_ADMIN") return null;
  return session;
}

/** Write operations blocked for REVIEWER (read-only). FINANCE may write financial-related; treated as writer for now except admin. */
export async function requireWriter() {
  const session = await requireSession();
  if (!session) return null;
  if (session.user.role === "REVIEWER") return null;
  return session;
}

/** REVIEWER may approve/reject; writers and admins may also act on reviews. */
export async function requireReviewerAction() {
  return requireSession();
}

export function canGrantRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "ADMIN") {
    return targetRole !== "SUPER_ADMIN" && targetRole !== "ADMIN";
  }
  return false;
}

export function canWriteRole(role: Role): boolean {
  return role !== "REVIEWER";
}
