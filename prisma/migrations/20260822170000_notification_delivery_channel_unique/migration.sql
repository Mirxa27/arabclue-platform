-- Notification delivery: drop the channel-agnostic unique key (audit: correctness).
--
-- "NotificationDelivery" carried two unique keys:
--
--   NotificationDelivery_eventId_recipientId_key          (eventId, recipientId)
--   NotificationDelivery_eventId_recipientId_channel_key  (eventId, recipientId, channel)
--
-- The two-column key strictly subsumes the three-column one, which makes the
-- "channel" column unreachable: only one delivery row can exist per
-- (event, recipient). notification-service.ts fans one event out to an in-app
-- row and then an email row for the same recipient, so the second insert failed
-- with P2002 on every notification that had an email channel. Both the
-- EMAIL_UNCONFIGURED branch and the real-send branch use create(), so an unset
-- RESEND_API_KEY did not mask it.
--
-- Dropping the redundant index restores per-channel fan-out. The remaining
-- three-column key still provides the idempotency guarantee the dispatcher
-- relies on (one row per event, recipient, and channel).
--
-- Safety: dropping an index is non-blocking for readers, requires no table
-- rewrite, and cannot fail on existing data — the surviving three-column key is
-- strictly weaker, so every row that satisfies the old constraint also
-- satisfies the new one. IF EXISTS keeps the migration idempotent.

DROP INDEX IF EXISTS "NotificationDelivery_eventId_recipientId_key";

-- Re-assert the surviving key so a database that somehow lacks it converges.
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_eventId_recipientId_channel_key"
  ON "NotificationDelivery"("eventId", "recipientId", "channel");
