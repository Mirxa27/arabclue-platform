/**
 * Invitation role vocabulary shared by the Invitation_Service, its routes, the
 * bilingual invitation email, and the pending-invitation UI.
 *
 * Criterion 3.1 admits exactly two target roles — administrator and member — so
 * an invitation can never grant workspace ownership. The vocabulary lives in its
 * own module so the email builder and the domain service share one source
 * without a circular import.
 */

/** Target roles an invitation may grant (criterion 3.1). */
export const INVITATION_TARGET_ROLES = ["ADMIN", "MEMBER"] as const;

export type InvitationTargetRole = (typeof INVITATION_TARGET_ROLES)[number];

/**
 * Acceptance field bounds. Criteria 3.2 and 3.11 fix the display name at 2–120
 * characters and the password minimum at 10. The password maximum is the
 * platform-wide 128-character limit required by requirement 19.4.
 *
 * Declared here, beside the role vocabulary, because this module has no runtime
 * dependencies and can therefore be imported by a client component without
 * pulling persistence, hashing, or provider code into the browser bundle.
 */
export const INVITATION_ACCEPTANCE_BOUNDS = Object.freeze({
  displayName: Object.freeze({ min: 2, max: 120 }),
  password: Object.freeze({ min: 10, max: 128 }),
});

/** Workspace membership roles permitted to manage invitations (criterion 3.5). */
export const INVITATION_MANAGER_ROLES = ["OWNER", "ADMIN"] as const;

export type InvitationManagerRole = (typeof INVITATION_MANAGER_ROLES)[number];

export function isInvitationTargetRole(
  value: unknown
): value is InvitationTargetRole {
  return (
    typeof value === "string" &&
    (INVITATION_TARGET_ROLES as readonly string[]).includes(value)
  );
}

export function isInvitationManagerRole(
  value: unknown
): value is InvitationManagerRole {
  return (
    typeof value === "string" &&
    (INVITATION_MANAGER_ROLES as readonly string[]).includes(value)
  );
}

/**
 * Whether the caller may create, list, or revoke workspace invitations
 * (criteria 3.1, 3.5, 3.6, 3.7).
 *
 * Same rule as `isWorkspaceManager` in `auth.ts`, expressed without that
 * module's database import so the domain service stays free of persistence.
 */
export function canManageInvitations(
  membershipRole: string,
  platformRole: string
): boolean {
  if (isInvitationManagerRole(membershipRole)) return true;
  return platformRole === "SUPER_ADMIN" || platformRole === "ADMIN";
}
