-- Activation-funnel events join the closed analytics vocabulary.
--
-- `AnalyticsEvent_event_type_check` (20260726000000_platform_completion) pins
-- "eventType" to the fourteen values ANALYTICS_EVENT_TYPES held at the time.
-- The activation family — account_registered, email_verified,
-- project_created, checkout_started, checkout_completed — was added to the
-- TypeScript vocabulary afterwards and never to the constraint, so every
-- top-of-funnel append failed with 23514, the collector swallowed the failure
-- by design (criterion 4.4), and the admin activation funnel reported zero
-- registrations while accounts were being created.
--
-- A CHECK constraint cannot be widened in place: the only way is to drop it
-- and add the wider one. Both statements are guarded so the migration is
-- idempotent, and the new constraint is NOT VALID so no existing row is
-- scanned. The list below mirrors ANALYTICS_EVENT_TYPES in
-- src/lib/analytics-collector.ts; analytics-collector.test.ts pins the two
-- together.
--
-- Safety: metadata-only. DROP CONSTRAINT and ADD CONSTRAINT ... NOT VALID are
-- catalog changes without a table scan or rewrite. Reverse: drop this
-- constraint and re-add the fourteen-value list (activation rows written in
-- the meantime would then violate it, so the reverse must also delete them or
-- stay NOT VALID).

DO $mig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsEvent_event_type_check'
      AND conrelid = '"AnalyticsEvent"'::regclass
      AND pg_get_constraintdef(oid) NOT LIKE '%account_registered%'
  ) THEN
    ALTER TABLE "AnalyticsEvent" DROP CONSTRAINT "AnalyticsEvent_event_type_check";
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AnalyticsEvent_event_type_check'
      AND conrelid = '"AnalyticsEvent"'::regclass
  ) THEN
    ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_event_type_check"
      CHECK ("eventType" IN (
        'proposal_created',
        'proposal_edited',
        'proposal_submitted',
        'proposal_approved',
        'proposal_rejected',
        'proposal_exported',
        'agent_run_started',
        'agent_run_completed',
        'agent_run_failed',
        'agent_run_cancelled',
        'document_uploaded',
        'document_version_created',
        'template_used',
        'section_added',
        'account_registered',
        'email_verified',
        'project_created',
        'checkout_started',
        'checkout_completed'
      )) NOT VALID;
  END IF;
END
$mig$;
