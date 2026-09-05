/**
 * Activation-funnel analytics for the public account routes.
 *
 * Registration and verification are the top of the funnel, but the account
 * routes are thin boundaries whose tests inject an in-memory Account_Service
 * and no database. The recorder is therefore a dependency: the production one
 * appends through the Analytics_Collector (one bounded attempt, never throws,
 * never changes the route's response — criterion 4.4), and a test that injects
 * a service without a recorder records nothing.
 */

import {
  analyticsRequestOrigin,
  recordActivationAnalyticsEvent,
} from "./analytics-collector";
import type { Locale } from "./types";

export type ActivationAnalyticsRecorder = Readonly<{
  /** The account, its workspace, and its verification token were committed. */
  accountRegistered(input: {
    readonly userId: string;
    readonly workspaceId: string;
    readonly locale: Locale;
  }): Promise<void>;
  /** A verification token was consumed and the user marked verified. */
  emailVerified(input: {
    readonly userId: string;
    readonly verifiedAt: string;
  }): Promise<void>;
}>;

export const noopActivationAnalytics: ActivationAnalyticsRecorder = Object.freeze({
  async accountRegistered() {},
  async emailVerified() {},
});

/**
 * The verification result names the user but not their workspace; the event
 * belongs to the workspace the registration created, which is the one they
 * own. Resolved lazily so importing this module loads no database client.
 */
async function resolveOwnedWorkspaceId(userId: string): Promise<string | null> {
  try {
    const { db } = await import("./db");
    const membership = await db.workspaceMember.findFirst({
      where: { userId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });
    return membership?.workspaceId ?? null;
  } catch (error) {
    console.error("[activation-analytics] workspace lookup failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export const productionActivationAnalytics: ActivationAnalyticsRecorder =
  Object.freeze({
    async accountRegistered(input) {
      await recordActivationAnalyticsEvent({
        eventType: "account_registered",
        entityId: input.userId,
        mutationRef: input.userId,
        origin: analyticsRequestOrigin({
          tenantWorkspaceId: input.workspaceId,
          actorUserId: input.userId,
        }),
        metadata: { locale: input.locale },
      });
    },
    async emailVerified(input) {
      const workspaceId = await resolveOwnedWorkspaceId(input.userId);
      if (!workspaceId) return;
      await recordActivationAnalyticsEvent({
        eventType: "email_verified",
        entityId: input.userId,
        // One verification per account; the instant makes a re-verification
        // after an administrator reset a distinct committed mutation.
        mutationRef: input.verifiedAt,
        origin: analyticsRequestOrigin({
          tenantWorkspaceId: workspaceId,
          actorUserId: input.userId,
        }),
      });
    },
  });
