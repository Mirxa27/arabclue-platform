import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRegistrationOutcome } from "@/lib/registration-outcome";

/**
 * A registration whose verification email was never sent still answers 2xx,
 * because the account and its token really were committed. Reading only
 * `res.ok` sent that user to the "check your inbox" screen to wait for a
 * message no service was configured to deliver.
 */
describe("registration outcome", () => {
  test("sends the user to the inbox screen when the email was sent", () => {
    const outcome = readRegistrationOutcome({
      verificationRequired: true,
      emailDelivery: "SENT",
      account: { emailVerified: false },
    });

    expect(outcome).toBe("verify_email");
  });

  test("reports undeliverable when email delivery is unconfigured", () => {
    const outcome = readRegistrationOutcome({
      code: "VERIFICATION_EMAIL_UNCONFIGURED",
      verificationRequired: true,
      emailDelivery: "UNCONFIGURED",
      account: { emailVerified: false },
    });

    expect(outcome).toBe("undeliverable");
  });

  test("reports undeliverable when the provider rejected the send", () => {
    const outcome = readRegistrationOutcome({
      verificationRequired: true,
      emailDelivery: "FAILED",
      account: { emailVerified: false },
    });

    expect(outcome).toBe("undeliverable");
  });

  test("sends the user to sign-in when verification is not required", () => {
    const outcome = readRegistrationOutcome({
      verificationRequired: false,
      emailDelivery: "SKIPPED",
      account: { emailVerified: true },
    });

    expect(outcome).toBe("signed_up");
  });

  test("keeps the inbox screen when the body reports no delivery state", () => {
    // Absence is not evidence of failure — an older or proxied body that omits
    // the field must behave exactly as it did before this branch existed.
    const outcome = readRegistrationOutcome({ account: { emailVerified: false } });

    expect(outcome).toBe("verify_email");
  });

  test("treats an unreadable body as verification pending", () => {
    expect(readRegistrationOutcome(null)).toBe("verify_email");
    expect(readRegistrationOutcome("not json")).toBe("verify_email");
  });
});

/**
 * Source-level invariant: the runner has no DOM, so this proves the page reads
 * the outcome and guards its redirect with it, not that the banner looks right.
 */
describe("register page wiring", () => {
  const source = readFileSync(
    join(import.meta.dir, "..", "..", "app", "register", "page.tsx"),
    "utf8"
  );

  test("the page decides its next screen from the outcome", () => {
    expect(source).toContain("readRegistrationOutcome");
    expect(source).toContain("undeliverable");
  });

  test("an undeliverable registration is not redirected to the inbox screen", () => {
    const redirectIndex = source.indexOf("/verify-email?email=");
    const guardIndex = source.indexOf('"undeliverable"');

    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(redirectIndex);
  });
});
