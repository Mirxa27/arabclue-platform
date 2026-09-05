import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTrialBanner, TRIAL_BANNER_DAYS } from "@/components/dashboard/trial-banner";

const trial = (daysLeft: number) => ({
  entitlement: "TRIAL",
  trial: { active: true, endsAt: "2026-10-05T00:00:00.000Z", daysLeft },
  billingOwner: { isSelf: true },
});

describe("resolveTrialBanner", () => {
  test("silent while the trial has more than a week left, loud in the last week", () => {
    expect(resolveTrialBanner(trial(TRIAL_BANNER_DAYS + 1))).toBeNull();
    expect(resolveTrialBanner(trial(TRIAL_BANNER_DAYS))).toMatchObject({ kind: "ending", daysLeft: 7 });
    expect(resolveTrialBanner(trial(1))).toMatchObject({ kind: "ending", daysLeft: 1 });
  });

  test("the wall shows once the trial has ended, whatever the trial payload says", () => {
    expect(
      resolveTrialBanner({ entitlement: "TRIAL_ENDED", trial: { active: false, endsAt: null, daysLeft: 0 }, billingOwner: { isSelf: true } })
    ).toEqual({ kind: "ended" });
  });

  test("paid workspaces and teammates see nothing", () => {
    expect(resolveTrialBanner({ entitlement: "ACTIVE", trial: { active: false, endsAt: null, daysLeft: null }, billingOwner: { isSelf: true } })).toBeNull();
    expect(resolveTrialBanner({ ...trial(2), billingOwner: { isSelf: false } })).toBeNull();
    expect(resolveTrialBanner(undefined)).toBeNull();
  });

  test("the banner is mounted once, in the shell, above every view", () => {
    const shell = readFileSync(join(process.cwd(), "src/components/dashboard/app-shell.tsx"), "utf8");
    expect(shell).toContain("<TrialBanner />");
  });
});
