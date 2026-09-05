/**
 * Retention nudges wired to real data: a submission deadline reminder cron and
 * a "trial ends in N days" notice, both deduped per tier through
 * ExpiryNotificationLog; the bell reads the stored onboarding row instead of
 * recomputing it every minute; and the empty mission screen stops offering a
 * command the pipeline will refuse.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEADLINE_REMINDER_THRESHOLDS_DAYS,
  daysUntil,
  reminderResourceId,
  reminderThreshold,
} from "../../app/api/cron/deadline-reminders/route";
import { trialEndingThreshold } from "../../app/api/cron/expiry-notifications/route";
import { missingRequiredSteps } from "../onboarding";
import { resolveMissionStarters } from "../mission-starters";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("deadline reminder tiers", () => {
  test("a deadline is reminded once each at 7, 3, and 1 day(s) — never past due", () => {
    expect([...DEADLINE_REMINDER_THRESHOLDS_DAYS]).toEqual([7, 3, 1]);
    expect(reminderThreshold(10)).toBeNull();
    expect(reminderThreshold(7)).toBe(7);
    expect(reminderThreshold(5)).toBe(7);
    expect(reminderThreshold(3)).toBe(3);
    expect(reminderThreshold(2)).toBe(3);
    expect(reminderThreshold(1)).toBe(1);
    expect(reminderThreshold(0)).toBeNull();
    expect(reminderThreshold(-1)).toBeNull();
  });

  test("days until a deadline round up so 'tomorrow' reads as one day", () => {
    const now = new Date("2026-06-01T09:00:00.000Z");
    expect(daysUntil(new Date(now.getTime() + 0.5 * DAY_MS), now)).toBe(1);
    expect(daysUntil(new Date(now.getTime() + 6.2 * DAY_MS), now)).toBe(7);
  });

  test("the dedup key is per project, deadline day, and tier", () => {
    const deadline = new Date("2026-06-08T15:00:00.000Z");
    expect(reminderResourceId("p1", deadline, 7)).toBe("p1:2026-06-08:7d");
    // Consecutive daily runs in the same tier collapse onto one key.
    expect(reminderResourceId("p1", deadline, 7)).toBe(reminderResourceId("p1", deadline, 7));
    expect(reminderResourceId("p1", deadline, 3)).not.toBe(reminderResourceId("p1", deadline, 7));
  });

  test("the cron is scheduled and mirrors the expiry cron's dedup table", () => {
    const vercel = JSON.parse(readFileSync(join(REPO_ROOT, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    expect(vercel.crons.some((c) => c.path === "/api/cron/deadline-reminders")).toBe(true);
    const source = readFileSync(
      join(REPO_ROOT, "src/app/api/cron/deadline-reminders/route.ts"),
      "utf8"
    );
    expect(source).toContain("expiryNotificationLog");
    expect(source).toContain('kind: "DEADLINE_REMINDER"');
    expect(source).toContain("sendTransactionalNotification");
    expect(source).toContain("DEADLINE_REMINDER_BUDGET_MS");
  });
});

describe("trial ending nudges", () => {
  test("a trial is nudged at 7, 3, and 1 day(s), not with 'subscription expired' copy", () => {
    expect(trialEndingThreshold(30)).toBeNull();
    expect(trialEndingThreshold(7)).toBe(7);
    expect(trialEndingThreshold(3)).toBe(3);
    expect(trialEndingThreshold(1)).toBe(1);
    expect(trialEndingThreshold(0)).toBeNull();

    const source = readFileSync(
      join(REPO_ROOT, "src/app/api/cron/expiry-notifications/route.ts"),
      "utf8"
    );
    expect(source).toContain('type: "TRIAL_ENDING"');
    expect(source).toContain('getPathForView("billing")');
    // The per-subscription owner and log lookups are batched with `in:`.
    expect(source).toContain("userId: { in: subs.map((s) => s.userId) }");
    expect(source).not.toContain("await db.workspaceMember.findFirst({");
    expect(source).toContain("EXPIRY_BUDGET_MS");
  });
});

describe("the bell reads the stored onboarding row", () => {
  test("missing steps are derived from the stored record and the required list", () => {
    expect(missingRequiredSteps({})).toEqual(["brand", "legal", "approvalChain", "restrictions"]);
    expect(
      missingRequiredSteps({ brand: true, legal: true, approvalChain: true, restrictions: true })
    ).toEqual([]);
    // Optional steps never count as missing.
    expect(missingRequiredSteps({ brand: true, legal: true, approvalChain: true, restrictions: true, trackRecord: false })).toEqual([]);
  });

  test("GET /api/notifications no longer recomputes onboarding on every poll", () => {
    const source = readFileSync(
      join(REPO_ROOT, "src/app/api/notifications/route.ts"),
      "utf8"
    );
    expect(source).toContain("readStoredOnboardingStatus");
    expect(source).not.toContain("computeOnboardingSteps");
  });
});

describe("the mission starter that onboarding would refuse", () => {
  test("is disabled and relabelled while setup is incomplete", () => {
    const en = resolveMissionStarters("en", { readyForProposals: false });
    const run = en[2]!;
    expect(run.command).toBe("Run the agents");
    expect(run.label).toBe("Finish setup to run the agents");
    expect(run.disabled).toBe(true);
    expect(en.slice(0, 2).every((s) => !s.disabled && s.label === s.command)).toBe(true);

    const ar = resolveMissionStarters("ar", { readyForProposals: false });
    expect(ar[2]!.label).toBe("أكمل الإعداد لتشغيل الوكلاء");
  });

  test("is offered as usual once ready, or while readiness is unknown", () => {
    for (const readiness of [{ readyForProposals: true }, null, undefined]) {
      const starters = resolveMissionStarters("en", readiness);
      expect(starters.every((s) => !s.disabled && s.label === s.command)).toBe(true);
    }
  });
});
