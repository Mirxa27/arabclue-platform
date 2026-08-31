import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";
import { db } from "./db";
import { passwordNeedsRehash, hashPassword, verifyPassword } from "./password";
import { consumeMfaChallenge } from "./mfa-challenge";
import { consumeLoginRateLimits, extractClientIp } from "./login-rate-limit";
import { audit, AUDIT_ACTIONS } from "./audit";
import type { Role } from "./types";
import { isProductionBlockedDevelopmentIdentity } from "./production-identities";
import { resolveEmailVerifiedClaim } from "./email-verification-policy";

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
      avatarUrl?: string | null;
      workspaceId: string;
      emailVerified: boolean;
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
    avatarUrl?: string | null;
    workspaceId?: string;
    emailVerified: boolean;
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
    claimsRefreshedAt?: number;
    avatarUrl?: string | null;
    emailVerified: boolean;
  }
}

/**
 * The only paths an authenticated-but-unverified session may reach
 * (requirement 1.5). Keep in sync with VERIFICATION_ALLOWED in src/proxy.ts:
 * the verification surface and action, the sign-out action plus its CSRF token,
 * and the minimum session-refresh path.
 */
export const VERIFICATION_ALLOWLIST = [
  "/verify-email",
  "/api/auth/verify-email",
  // The unverified session is the caller who needs a new link; denying the
  // reissue here would make a failed send or a lapsed token unrecoverable.
  "/api/auth/resend-verification",
  "/api/auth/session",
  "/api/auth/signout",
  "/api/auth/csrf",
];

export function isVerificationAllowedPath(path: string): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return VERIFICATION_ALLOWLIST.some((allowed) => lower.includes(allowed.toLowerCase()));
}

export function getRequestPathForVerificationCheck(): string {
  return "";
}

const CLAIMS_REFRESH_MS = 60_000;

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
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase() ?? "";
        const password = credentials?.password ?? "";
        const mfaToken = credentials?.mfaToken?.trim() ?? "";
        const ip = extractClientIp(req?.headers);

        // Email cap stops guessing one account. IP cap stops spraying the
        // same password across many accounts from one origin. Prefer Redis
        // when REDIS_URL is set; otherwise use in-memory limits.
        const rl = await consumeLoginRateLimits(email, ip);
        if (!rl.ok) {
          const reason =
            rl.backend === "unavailable"
              ? "rate_limit_service_unavailable"
              : "rate_limited";
          console.warn(`[auth] authorize rejected: ${reason}`, {
            email,
            dimension: rl.dimension,
          });
          await audit({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            details: { email, reason, dimension: rl.dimension },
            severity: "WARN",
            success: false,
          });
          return null;
        }
        if (isProductionBlockedDevelopmentIdentity(email)) {
          console.warn("[auth] authorize rejected: reserved_development_identity", { email });
          await audit({
            action: AUDIT_ACTIONS.LOGIN_FAILED,
            details: { reason: "reserved_development_identity" },
            severity: "CRITICAL",
            success: false,
          });
          return null;
        }

        const { getBootstrapContext } = await import("./bootstrap");
        try {
          await getBootstrapContext();
        } catch (err) {
          console.error("[auth] bootstrap failed — rejecting login", err);
          return null;
        }

        if (!email || !password) {
          console.warn("[auth] authorize rejected: missing_email_or_password");
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          console.warn("[auth] authorize rejected: not_found_or_inactive", { email, active: user?.active });
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
          console.warn("[auth] authorize rejected: bad_password", { email });
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
          const challenge = await consumeMfaChallenge({
            userId: user.id,
            storedSecret: user.mfaSecret,
            lastUsedStep: user.mfaLastUsedStep,
            token: mfaToken,
          });
          if (!challenge.ok) {
            console.warn("[auth] authorize rejected: mfa_failed", {
              email,
              hasSecret: !!user.mfaSecret,
              hasToken: !!mfaToken,
              reason: challenge.reason,
            });
            await audit({
              userId: user.id,
              action: AUDIT_ACTIONS.LOGIN_FAILED,
              details: { email, reason: `mfa_${challenge.reason}` },
              severity: "WARN",
              success: false,
            });
            return null;
          }
          mfaVerified = true;
        }

        await db.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            ...(passwordNeedsRehash(user.passwordHash)
              ? { passwordHash: await hashPassword(password) }
              : {}),
          },
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
          avatarUrl: user.avatarUrl,
          workspaceId: user.activeWorkspaceId ?? undefined,
          emailVerified: resolveEmailVerifiedClaim(user.emailVerified),
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
        token.avatarUrl = user.avatarUrl ?? null;
        token.workspaceId =
          (user as { workspaceId?: string | null }).workspaceId ?? undefined;
        token.emailVerified = resolveEmailVerifiedClaim(
          (user as { emailVerified?: boolean }).emailVerified
        );
        token.claimsRefreshedAt = Date.now();
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
        if (typeof session.locale === "string") {
          token.locale = session.locale;
        }
        if (typeof session.name === "string") {
          token.name = session.name;
        }
        if (typeof session.email === "string") {
          token.email = session.email;
        }
        if (typeof session.mfaEnabled === "boolean") {
          token.mfaEnabled = session.mfaEnabled;
        }
        if (typeof (session as { emailVerified?: boolean }).emailVerified === "boolean") {
          token.emailVerified = (session as { emailVerified: boolean }).emailVerified;
        }
        if ("avatarUrl" in session) {
          token.avatarUrl = (session as { avatarUrl?: string | null }).avatarUrl ?? null;
        }
        if (typeof (session as { workspaceId?: string }).workspaceId === "string") {
          token.workspaceId = (session as { workspaceId: string }).workspaceId;
        }
        token.claimsRefreshedAt = 0; // force DB refresh next tick for consistency
      }

      // Revocation check
      if (
        isProductionBlockedDevelopmentIdentity(
          String(token.email ?? "")
        )
      ) {
        if (token.sessionToken) {
          await db.userSession.deleteMany({
            where: { token: token.sessionToken },
          });
        }
        token.id = "";
        token.sessionToken = undefined;
        return token;
      }
      if (token.sessionToken) {
        const row = await db.userSession.findUnique({
          where: { token: token.sessionToken },
        });
        if (!row || row.expiresAt < new Date()) {
          token.id = "";
          return token;
        }
      }

      // Refresh role / active / MFA / mustChangePassword / emailVerified from DB (at least every minute)
      const now = Date.now();
      const stale =
        !token.claimsRefreshedAt || now - token.claimsRefreshedAt > CLAIMS_REFRESH_MS;
      if (token.id && stale) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id },
          select: {
            role: true,
            active: true,
            mfaEnabled: true,
            locale: true,
            mustChangePassword: true,
            email: true,
            name: true,
            avatarUrl: true,
            activeWorkspaceId: true,
            emailVerified: true,
          },
        });
        if (!dbUser || !dbUser.active) {
          token.id = "";
          return token;
        }
        token.role = dbUser.role as Role;
        token.mfaEnabled = dbUser.mfaEnabled;
        token.locale = dbUser.locale;
        token.mustChangePassword = dbUser.mustChangePassword;
        token.email = dbUser.email;
        token.name = dbUser.name;
        token.avatarUrl = dbUser.avatarUrl;
        token.workspaceId = dbUser.activeWorkspaceId ?? token.workspaceId;
        token.emailVerified = resolveEmailVerifiedClaim(dbUser.emailVerified);
        token.claimsRefreshedAt = now;
      }

      // Temporary skip policy: always admit sessions while the flag is on.
      token.emailVerified = resolveEmailVerifiedClaim(!!token.emailVerified);

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
        avatarUrl: token.avatarUrl ?? null,
        workspaceId: (token.workspaceId as string | undefined) ?? "",
        emailVerified: resolveEmailVerifiedClaim(!!token.emailVerified),
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

type SessionOpts = { allowMustChangePassword?: boolean; allowUnverified?: boolean };

export class EmailVerificationRequiredError extends Error {
  status = 403;
  code = "EMAIL_VERIFICATION_REQUIRED";
  constructor(message = "Email verification required") {
    super(message);
    this.name = "EmailVerificationRequiredError";
  }
}

export async function requireSession(opts?: SessionOpts) {
  const session = await getSession();
  if (!session?.user?.id || (session.user.mfaEnabled && !session.mfaVerified)) {
    return null;
  }
  if (session.user.mustChangePassword && !opts?.allowMustChangePassword) {
    return null;
  }
  if (
    !opts?.allowUnverified &&
    !resolveEmailVerifiedClaim(session.user.emailVerified)
  ) {
    const path = getRequestPathForVerificationCheck();
    if (!isVerificationAllowedPath(path)) {
      throw new EmailVerificationRequiredError();
    }
  }
  return session;
}

export async function requireAdmin(opts?: SessionOpts) {
  const session = await requireSession(opts);
  if (!session) return null;
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") return null;
  return session;
}

export async function requireSuperAdmin(opts?: SessionOpts) {
  const session = await requireSession(opts);
  if (!session || session.user.role !== "SUPER_ADMIN") return null;
  return session;
}

/** Write operations blocked for REVIEWER (read-only). FINANCE may write financial-related; treated as writer for now except admin. */
export async function requireWriter(opts?: SessionOpts) {
  const session = await requireSession(opts);
  if (!session) return null;
  if (session.user.role === "REVIEWER") return null;
  if (
    !opts?.allowUnverified &&
    !resolveEmailVerifiedClaim(session.user.emailVerified)
  ) {
    const path = getRequestPathForVerificationCheck();
    if (!isVerificationAllowedPath(path)) {
      throw new EmailVerificationRequiredError();
    }
  }
  return session;
}

/**
 * Session gate for acting on a review step.
 *
 * Authorization for a review decision is by **assignment**, not by platform
 * role: `decideProposalReview` rejects any caller who is not the review's
 * `reviewerId` with `REVIEW_REVIEWER_MISMATCH`, and the assignment itself comes
 * from the workspace approval policy, which only a workspace OWNER or ADMIN may
 * edit. A platform-role check here would therefore add nothing and would break
 * the legitimate case of a BIDDER or FINANCE member named as an approver.
 *
 * This function exists to name that decision explicitly. It deliberately adds
 * no role constraint beyond `requireSession` (which still enforces MFA
 * step-up, the password-change gate, and email verification).
 */
export async function requireReviewerAction() {
  const session = await requireSession();
  if (!session) return null;
  return session;
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

/** Workspace OWNER/ADMIN, or platform SUPER_ADMIN/ADMIN. */
export function isWorkspaceManager(
  membershipRole: string,
  platformRole: Role
): boolean {
  if (membershipRole === "OWNER" || membershipRole === "ADMIN") return true;
  return platformRole === "SUPER_ADMIN" || platformRole === "ADMIN";
}

/** Revoke all JWT-backed sessions for a user (deactivate / privilege change). */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.userSession.deleteMany({ where: { userId } });
}
