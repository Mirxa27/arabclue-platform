import { describe, expect, test } from "bun:test";
import { onboardingNotificationId } from "../notification-ids";

describe("notification ids", () => {
  test("fingerprints onboarding notifications by current missing steps", () => {
    const initial = onboardingNotificationId(["brand", "approval"]);
    const changed = onboardingNotificationId(["brand"]);

    expect(initial).toBe("onboarding-brand%2Capproval");
    expect(changed).toBe("onboarding-brand");
    expect(changed).not.toBe(initial);
  });
});
