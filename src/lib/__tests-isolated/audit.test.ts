import { beforeAll, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

let createCalls: any[] = [];
let webhookCalled = false;

type AuditModule = typeof import("../audit");
let audit: AuditModule["audit"];
let AUDIT_ACTIONS: AuditModule["AUDIT_ACTIONS"];

beforeAll(async () => {
mock.module("../db", () => ({
  db: {
    auditLog: {
      create: mock((args: any) => {
        createCalls.push(args);
        return Promise.resolve({ id: "audit-1", ...args.data });
      }),
    },
  },
}));

mock.module("../outbound-webhook", () => ({
  notifyWebhook: mock(() => {
    webhookCalled = true;
    return Promise.resolve();
  }),
}));

({ audit, AUDIT_ACTIONS } = await import("../audit"));
});

function resetState() {
  createCalls = [];
  webhookCalled = false;
}

describe("audit", () => {
  test("writes audit log with required fields", async () => {
    resetState();
    await audit({
      userId: "user-1",
      action: "LOGIN",
      resource: "session",
      resourceId: "sess-1",
      details: { ip: "1.2.3.4" },
      ipAddress: "1.2.3.4",
      userAgent: "Mozilla/5.0",
      severity: "INFO",
      success: true,
    });
    expect(createCalls.length).toBe(1);
    const data = createCalls[0].data;
    expect(data.userId).toBe("user-1");
    expect(data.action).toBe("LOGIN");
    expect(data.resource).toBe("session");
    expect(data.resourceId).toBe("sess-1");
    expect(data.details).toBe(JSON.stringify({ ip: "1.2.3.4" }));
    expect(data.ipAddress).toBe("1.2.3.4");
    expect(data.userAgent).toBe("Mozilla/5.0");
    expect(data.severity).toBe("INFO");
    expect(data.success).toBe(true);
  });

  test("defaults severity to INFO and success to true", async () => {
    resetState();
    await audit({ action: "TEST_ACTION" });
    const data = createCalls[0].data;
    expect(data.severity).toBe("INFO");
    expect(data.success).toBe(true);
  });

  test("nulls optional fields when not provided", async () => {
    resetState();
    await audit({ action: "TEST" });
    const data = createCalls[0].data;
    expect(data.userId).toBeNull();
    expect(data.resource).toBeNull();
    expect(data.resourceId).toBeNull();
    expect(data.details).toBeNull();
    expect(data.ipAddress).toBeNull();
    expect(data.userAgent).toBeNull();
  });

  test("triggers webhook for WARN severity", async () => {
    resetState();
    await audit({ action: "TEST", severity: "WARN" });
    expect(webhookCalled).toBe(true);
  });

  test("triggers webhook for ERROR severity", async () => {
    resetState();
    await audit({ action: "TEST", severity: "ERROR" });
    expect(webhookCalled).toBe(true);
  });

  test("triggers webhook for CRITICAL severity", async () => {
    resetState();
    await audit({ action: "TEST", severity: "CRITICAL" });
    expect(webhookCalled).toBe(true);
  });

  test("triggers webhook for ARTIFACT_DOWNLOAD action", async () => {
    resetState();
    await audit({ action: "ARTIFACT_DOWNLOAD", severity: "INFO" });
    expect(webhookCalled).toBe(true);
  });

  test("triggers webhook for PROPOSAL_GENERATE action", async () => {
    resetState();
    await audit({ action: "PROPOSAL_GENERATE", severity: "INFO" });
    expect(webhookCalled).toBe(true);
  });

  test("does not trigger webhook for INFO severity with non-special action", async () => {
    resetState();
    await audit({ action: "LOGIN", severity: "INFO" });
    expect(webhookCalled).toBe(false);
  });

  test("never throws — swallows db errors", async () => {
    resetState();
    const { db } = await import("../db");
    (db.auditLog.create as any).mockImplementationOnce(() =>
      Promise.reject(new Error("DB down"))
    );
    await expect(
      audit({ action: "TEST" })
    ).resolves.toBeUndefined();
  });

  test("serializes details object to JSON string", async () => {
    resetState();
    const details = { key: "value", nested: { a: 1 } };
    await audit({ action: "TEST", details });
    expect(createCalls[0].data.details).toBe(JSON.stringify(details));
  });
});

describe("AUDIT_ACTIONS", () => {
  test("contains standard action constants", () => {
    expect(AUDIT_ACTIONS.LOGIN).toBe("LOGIN");
    expect(AUDIT_ACTIONS.LOGOUT).toBe("LOGOUT");
    expect(AUDIT_ACTIONS.LOGIN_FAILED).toBe("LOGIN_FAILED");
    expect(AUDIT_ACTIONS.CONFIG_CHANGE).toBe("CONFIG_CHANGE");
    expect(AUDIT_ACTIONS.PROPOSAL_GENERATE).toBe("PROPOSAL_GENERATE");
    expect(AUDIT_ACTIONS.ARTIFACT_DOWNLOAD).toBe("ARTIFACT_DOWNLOAD");
    expect(AUDIT_ACTIONS.MFA_ENABLE).toBe("MFA_ENABLE");
    expect(AUDIT_ACTIONS.MFA_DISABLE).toBe("MFA_DISABLE");
    expect(AUDIT_ACTIONS.BILLING_RECONCILE).toBe("BILLING_RECONCILE");
    expect(AUDIT_ACTIONS.COMMENT_CREATE).toBe("COMMENT_CREATE");
  });

  test("action constants are string literals", () => {
    for (const value of Object.values(AUDIT_ACTIONS)) {
      expect(typeof value).toBe("string");
    }
  });
});
