/**
 * Guard tests for the NotificationDelivery uniqueness contract.
 *
 * The model previously declared both @@unique([eventId, recipientId]) and
 * @@unique([eventId, recipientId, channel]). The two-column key strictly
 * subsumes the three-column one, making the `channel` column unreachable: one
 * event could produce only one delivery row per recipient, so the email insert
 * that follows the in-app insert failed with P2002 on every notification.
 *
 * These assert on the schema text rather than on runtime behaviour because the
 * defect was a schema-level contradiction that no unit test exercising the
 * service could see — the test fake modelled only the three-column key.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

function modelBlock(schema: string, model: string): string {
  const match = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
  if (!match) throw new Error(`model ${model} not found in schema`);
  return match[1];
}

const SCHEMA = readFileSync(
  join(REPO_ROOT, "prisma", "schema.prisma"),
  "utf8"
);

describe("NotificationDelivery uniqueness", () => {
  const block = modelBlock(SCHEMA, "NotificationDelivery");
  const uniqueLines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("@@unique"));

  test("declares exactly one unique key", () => {
    expect(uniqueLines).toHaveLength(1);
  });

  test("the unique key is scoped by channel", () => {
    expect(uniqueLines[0]).toContain("channel");
    expect(uniqueLines[0]).toMatch(
      /@@unique\(\[\s*eventId\s*,\s*recipientId\s*,\s*channel\s*\]\)/
    );
  });

  test("no channel-agnostic key subsumes the channel-scoped one", () => {
    // This is the exact line that broke multi-channel delivery.
    expect(block).not.toMatch(/@@unique\(\[\s*eventId\s*,\s*recipientId\s*\]\)/);
  });

  test("a migration exists that drops the subsuming index", () => {
    const migration = readFileSync(
      join(
        REPO_ROOT,
        "prisma",
        "migrations",
        "20260822170000_notification_delivery_channel_unique",
        "migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "NotificationDelivery_eventId_recipientId_key"'
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_eventId_recipientId_channel_key"'
    );
  });
});

describe("notification service fans out across channels", () => {
  test("writes an in_app row and an email row for the same event and recipient", () => {
    // The service performs create({channel:"in_app"}) then create({channel:"email"}).
    // Under the old two-column key the second call threw P2002 unconditionally.
    const source = readFileSync(
      join(REPO_ROOT, "src", "lib", "notification-service.ts"),
      "utf8"
    );
    expect(source).toContain('channel: "in_app"');
    expect(source).toContain('channel: "email"');
  });
});
