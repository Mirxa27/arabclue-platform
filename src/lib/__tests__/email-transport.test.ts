import { describe, expect, test } from "bun:test";
import { selectEmailTransport } from "../email";

/**
 * Transactional email had exactly one transport (Resend HTTP API), so a
 * deployment holding a working mailbox credential still could not send, and
 * every new account registered into a state it could never leave: the
 * verification message was unsendable and `requireSession` blocks unverified
 * users from every gated path.
 */
describe("email transport selection", () => {
  test("uses Resend when an API key is present", () => {
    const transport = selectEmailTransport({ RESEND_API_KEY: "re_live_key" });

    expect(transport.kind).toBe("resend");
  });

  test("prefers Resend over SMTP when both are configured", () => {
    // Documented precedence: the HTTP API needs no long-lived TCP connection,
    // which is the safer default on serverless.
    const transport = selectEmailTransport({
      RESEND_API_KEY: "re_live_key",
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_USER: "info@example.com",
      SMTP_PASSWORD: "secret",
    });

    expect(transport.kind).toBe("resend");
  });

  test("uses SMTP when only a mailbox credential is configured", () => {
    const transport = selectEmailTransport({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_USER: "info@example.com",
      SMTP_PASSWORD: "secret",
    });

    expect(transport.kind).toBe("smtp");
    if (transport.kind !== "smtp") return;
    expect(transport.host).toBe("smtp.hostinger.com");
    // 465 is implicit TLS and is the documented Hostinger default.
    expect(transport.port).toBe(465);
    expect(transport.secure).toBe(true);
  });

  test("treats port 587 as STARTTLS rather than implicit TLS", () => {
    // Pairing 587 with implicit TLS fails the handshake outright, so the
    // secure flag has to follow the port instead of being a fixed default.
    const transport = selectEmailTransport({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "587",
      SMTP_USER: "info@example.com",
      SMTP_PASSWORD: "secret",
    });

    expect(transport.kind).toBe("smtp");
    if (transport.kind !== "smtp") return;
    expect(transport.port).toBe(587);
    expect(transport.secure).toBe(false);
  });

  test("refuses a half-configured SMTP relay instead of attempting it", () => {
    // A host with no credential would authenticate as nobody and fail per
    // message at send time. Naming it as unconfigured surfaces it at the
    // readiness probe instead.
    const transport = selectEmailTransport({
      SMTP_HOST: "smtp.hostinger.com",
    });

    expect(transport.kind).toBe("none");
    if (transport.kind !== "none") return;
    expect(transport.reason).toBe("smtp_incomplete");
  });

  test("reports no transport when nothing is configured", () => {
    const transport = selectEmailTransport({});

    expect(transport.kind).toBe("none");
    if (transport.kind !== "none") return;
    expect(transport.reason).toBe("no_transport");
  });

  test("treats whitespace-only values as absent", () => {
    // A cleared dashboard field commonly leaves an empty string behind, which
    // would otherwise select a transport that cannot possibly connect.
    const transport = selectEmailTransport({
      RESEND_API_KEY: "   ",
      SMTP_HOST: "  ",
      SMTP_USER: "  ",
      SMTP_PASSWORD: "  ",
    });

    expect(transport.kind).toBe("none");
    if (transport.kind !== "none") return;
    expect(transport.reason).toBe("no_transport");
  });

  test("ignores a non-numeric port rather than dialling NaN", () => {
    const transport = selectEmailTransport({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "not-a-port",
      SMTP_USER: "info@example.com",
      SMTP_PASSWORD: "secret",
    });

    expect(transport.kind).toBe("smtp");
    if (transport.kind !== "smtp") return;
    expect(transport.port).toBe(465);
  });
});
