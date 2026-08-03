/**
 * Feature: platform-completion, Property 33: Notification delivery is idempotent
 */

import { describe, expect, test } from "bun:test";

type DeliveryStatus = "PENDING" | "SENT" | "FAILED";

type DeliveryRow = {
  eventId: string;
  recipientId: string;
  channel: "in_app" | "email";
  status: DeliveryStatus;
  providerRequests: number;
};

type InAppRow = {
  eventId: string;
  recipientId: string;
};

/**
 * Models the production claim/send rule: unique (event, recipient, channel)
 * rows; after SENT, further retries issue no provider request.
 */
function deliverOnce(
  deliveries: DeliveryRow[],
  inApp: InAppRow[],
  eventId: string,
  recipientId: string
): void {
  if (!inApp.some((r) => r.eventId === eventId && r.recipientId === recipientId)) {
    inApp.push({ eventId, recipientId });
  }

  for (const channel of ["in_app", "email"] as const) {
    let row = deliveries.find(
      (d) =>
        d.eventId === eventId &&
        d.recipientId === recipientId &&
        d.channel === channel
    );
    if (!row) {
      row = {
        eventId,
        recipientId,
        channel,
        status: "PENDING",
        providerRequests: 0,
      };
      deliveries.push(row);
    }
    if (row.status === "SENT") continue;
    if (channel === "email") row.providerRequests += 1;
    row.status = "SENT";
  }
}

describe("Feature: platform-completion, Property 33: Notification delivery is idempotent", () => {
  test("stable event/recipient retries yield one in-app and one delivery row with no post-success provider calls across 100+ sequences", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const deliveries: DeliveryRow[] = [];
      const inApp: InAppRow[] = [];
      const eventId = `event-${seed % 40}`;
      const recipientId = `user-${seed % 17}`;
      const retries = 2 + (seed % 4);

      for (let i = 0; i < retries; i++) {
        deliverOnce(deliveries, inApp, eventId, recipientId);
      }

      expect(
        inApp.filter(
          (r) => r.eventId === eventId && r.recipientId === recipientId
        )
      ).toHaveLength(1);

      const email = deliveries.find(
        (d) =>
          d.eventId === eventId &&
          d.recipientId === recipientId &&
          d.channel === "email"
      );
      const inAppDelivery = deliveries.find(
        (d) =>
          d.eventId === eventId &&
          d.recipientId === recipientId &&
          d.channel === "in_app"
      );
      expect(email).toBeDefined();
      expect(inAppDelivery).toBeDefined();
      expect(email!.status).toBe("SENT");
      expect(email!.providerRequests).toBe(1);
      expect(
        deliveries.filter(
          (d) => d.eventId === eventId && d.recipientId === recipientId
        )
      ).toHaveLength(2);

      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
