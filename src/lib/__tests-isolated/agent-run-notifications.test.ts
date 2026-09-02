/**
 * The bidder who walked away hears that the proposal is ready.
 *
 * Autopilot lets a run start from an upload and finish minutes later; nothing
 * told the person who started it unless they kept the page open. The run's
 * initiator now gets the same transactional notification path reviews use —
 * in-app always, email when configured, one per run by event id — on
 * completion (link to the project's proposals) and on failure (link to the
 * agents page, where the classified reason is shown).
 */

import { beforeAll, describe, expect, test, mock } from "bun:test";

type Row = Record<string, unknown>;
const users: Row[] = [
  { id: "user-1", email: "bidder@example.invalid", locale: "ar", name: "Bidder" },
];
const inApp: Row[] = [];
const deliveries: Row[] = [];

type Svc = typeof import("../notification-service");
let svc: Svc;

beforeAll(async () => {
  mock.module("../db", () => ({
    db: {
      user: {
        findUnique: mock(({ where }: { where: { id: string } }) =>
          Promise.resolve(users.find((u) => u.id === where.id) ?? null),
        ),
      },
      inAppNotification: {
        create: mock(({ data }: { data: Row }) => {
          const row = { id: `n-${inApp.length + 1}`, ...data };
          inApp.push(row);
          return Promise.resolve(row);
        }),
      },
      notificationDelivery: {
        findUnique: mock(() => Promise.resolve(null)),
        findMany: mock(() => Promise.resolve([])),
        create: mock(({ data }: { data: Row }) => {
          const row = { id: `d-${deliveries.length + 1}`, attemptCount: 0, ...data };
          deliveries.push(row);
          return Promise.resolve(row);
        }),
        upsert: mock(({ create }: { create: Row }) => {
          const row = { id: `d-${deliveries.length + 1}`, attemptCount: 0, ...create };
          deliveries.push(row);
          return Promise.resolve(row);
        }),
        update: mock(({ data }: { data: Row }) => Promise.resolve(data)),
        updateMany: mock(() => Promise.resolve({ count: 0 })),
      },
    },
  }));
  mock.module("../email", () => ({
    isEmailConfigured: () => false,
    sendEmail: mock(() => Promise.resolve({ ok: false, error: "unconfigured" })),
  }));
  svc = await import("../notification-service");
});

describe("agent run notifications", () => {
  test("the initiator is the recipient, in their own language", async () => {
    const recipients = await svc.getNotificationRecipients("AGENT_RUN_COMPLETED", {
      workspaceId: "ws-1",
      userId: "user-1",
    });
    expect(recipients).toEqual([{ userId: "user-1", email: "bidder@example.invalid", locale: "ar" }]);
    expect(await svc.getNotificationRecipients("AGENT_RUN_FAILED", { workspaceId: "ws-1", userId: "nobody" })).toEqual([]);
  });

  test("completion writes one in-app notification linking to the project's proposals", async () => {
    const result = await svc.notifyAgentRunCompleted({
      workspaceId: "ws-1",
      userId: "user-1",
      runId: "run-1",
      projectId: "proj-1",
      projectTitle: "Cloud 2026",
    });
    expect(result.eventId).toBe("agent_run_completed_run-1");
    expect(result.totalRecipients).toBe(1);
    const note = inApp.find((n) => n.eventId === "agent_run_completed_run-1");
    expect(note).toBeDefined();
    expect(note?.type).toBe("AGENT_RUN_COMPLETED");
    expect(String(note?.href)).toBe("/app/projects/proj-1/proposals");
    expect(String(note?.titleAr).length).toBeGreaterThan(0);
    expect(String(note?.bodyEn)).toContain("Cloud 2026");
  });

  test("failure links to the agents page, where the reason is shown", async () => {
    const result = await svc.notifyAgentRunFailed({
      workspaceId: "ws-1",
      userId: "user-1",
      runId: "run-2",
      projectId: "proj-1",
      projectTitle: "Cloud 2026",
    });
    expect(result.eventId).toBe("agent_run_failed_run-2");
    const note = inApp.find((n) => n.eventId === "agent_run_failed_run-2");
    expect(note?.type).toBe("AGENT_RUN_FAILED");
    expect(String(note?.href)).toBe("/app/projects/proj-1/agents");
  });
});
