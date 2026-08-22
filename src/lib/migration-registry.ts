/**
 * Declared ledger of every Prisma migration shipped under `prisma/migrations`.
 *
 * Requirement 16 obliges the readiness endpoint to compare *every* migration
 * present under `prisma/migrations` against the `_prisma_migrations` ledger of
 * the connected database, and to name the capabilities each unapplied migration
 * affects. The migration directory is not part of the serverless function
 * bundle, so this module is the runtime-addressable source of truth.
 *
 * `migration-registry.test.ts` asserts byte-for-byte parity between this array
 * and the actual `prisma/migrations` directory listing (identifier set and
 * lexicographic apply order), so the declaration can never drift from disk.
 */

/** Identifier of the platform-completion specification. */
export const PLATFORM_COMPLETION_SPEC = "platform-completion";

export interface MigrationRecord {
  /** Directory name under `prisma/migrations`, identical to the `_prisma_migrations.migration_name` value. */
  readonly id: string;
  /**
   * Specification that introduced this migration, when one did. Absent for
   * migrations that predate the named specification. Requirement 16.1 applies
   * the additive-SQL policy to exactly the migrations a specification
   * introduces, so this field — not a literal list held in a test — is the
   * source of truth for that scope.
   */
  readonly introducedBySpec?: string;
  /** 1-based position in the apply sequence. Prisma applies migrations in lexicographic directory order. */
  readonly position: number;
  /** Product capability names this migration is required by. */
  readonly capabilities: readonly string[];
  /** Tables created by this migration. Empty when the migration only adds columns, indexes, or constraints. */
  readonly createsTables: readonly string[];
  /**
   * The reverse action, or `null` when the migration has no reverse action.
   * A migration that only adds nullable columns or defaulted columns is
   * reversible by dropping them; a migration that backfills is not.
   */
  readonly reverse: string | null;
}

export const MIGRATIONS: readonly MigrationRecord[] = Object.freeze([
  {
    id: "20260722140000_postgres_baseline",
    position: 1,
    capabilities: [
      "authentication",
      "workspace tenancy",
      "tender projects",
      "document ingestion",
      "proposal generation",
      "agent runs",
      "compliance checks",
      "approval policy",
      "billing",
      "audit log",
      "knowledge records",
    ],
    createsTables: [
      "User",
      "UserSession",
      "Workspace",
      "WorkspaceMember",
      "TenderProject",
      "UploadedDocument",
      "DocumentChunk",
      "DocumentVersion",
      "BrandProfile",
      "PastProject",
      "AgentRun",
      "ComplianceCheck",
      "GeneratedProposal",
      "ProposalVersion",
      "AIProviderConfig",
      "EnvSetting",
      "SubscriptionPlan",
      "Subscription",
      "BillingRecord",
      "PaymentCheckout",
      "AuditLog",
      "Certificate",
      "StaffMember",
      "MethodologyAsset",
      "ContentLibraryItem",
      "Partnership",
      "TargetSector",
      "BidHistoryNote",
      "ApprovalPolicy",
      "ApprovalStep",
      "Restriction",
      "OnboardingProgress",
      "TenderRequirement",
      "ProposalReview",
    ],
    reverse: null,
  },
  {
    id: "20260722150000_payment_webhook_recurring",
    position: 2,
    capabilities: ["payment webhook idempotence", "recurring subscription billing"],
    createsTables: ["PaymentWebhookEvent", "MyFatoorahRecurringProfile"],
    reverse: 'DROP TABLE "MyFatoorahRecurringProfile"; DROP TABLE "PaymentWebhookEvent";',
  },
  {
    id: "20260722160000_knowledge_eligibility",
    position: 3,
    capabilities: ["knowledge eligibility screening"],
    createsTables: [],
    reverse: 'ALTER TABLE "Certificate" and "PastProject": drop the added eligibility columns.',
  },
  {
    id: "20260722170000_proposal_studio",
    position: 4,
    capabilities: ["proposal studio editing", "agent run telemetry"],
    createsTables: [],
    reverse: 'ALTER TABLE "AgentRun" and "GeneratedProposal": drop the added studio columns.',
  },
  {
    id: "20260722180000_provider_models_cache",
    position: 5,
    capabilities: ["LLM provider model cache"],
    createsTables: [],
    reverse: 'ALTER TABLE "AIProviderConfig": drop the added model-cache columns.',
  },
  {
    id: "20260723000000_copilot_mission_control",
    position: 6,
    capabilities: ["platform copilot", "mission control", "mission attachments"],
    createsTables: [
      "CopilotMission",
      "CopilotMessage",
      "CopilotAttachment",
      "CopilotAction",
    ],
    reverse:
      'DROP TABLE "CopilotAction"; DROP TABLE "CopilotAttachment"; DROP TABLE "CopilotMessage"; DROP TABLE "CopilotMission";',
  },
  {
    id: "20260723101000_provider_multi_engines",
    position: 7,
    capabilities: ["multi-engine LLM routing"],
    createsTables: [],
    reverse: 'ALTER TABLE "AIProviderConfig": drop the added engine columns.',
  },
  {
    id: "20260724161123_contract_templates",
    position: 8,
    capabilities: ["contract template provider selection"],
    createsTables: [],
    reverse: 'ALTER TABLE "AIProviderConfig": drop the added contract-template column.',
  },
  {
    id: "20260724180000_production_persistence",
    position: 9,
    capabilities: [
      "contract obligation tracking",
      "expiry notifications",
      "notification dismissal",
    ],
    createsTables: [
      "ContractObligationState",
      "ExpiryNotificationLog",
      "NotificationDismissal",
    ],
    reverse:
      'DROP TABLE "NotificationDismissal"; DROP TABLE "ExpiryNotificationLog"; DROP TABLE "ContractObligationState";',
  },
  {
    id: "20260724200000_contract_templates",
    position: 10,
    capabilities: [
      "contract template catalog",
      "contract template versioning",
      "standard clause library",
      "generated contracts",
    ],
    createsTables: [
      "ContractTemplate",
      "ContractTemplateVersion",
      "StandardClause",
      "GeneratedContract",
    ],
    reverse:
      'DROP TABLE "GeneratedContract"; DROP TABLE "StandardClause"; DROP TABLE "ContractTemplateVersion"; DROP TABLE "ContractTemplate";',
  },
  {
    id: "20260724214500_contract_template_safety",
    position: 11,
    capabilities: ["contract legal-review safety flags", "contract non-executable marking"],
    createsTables: [],
    reverse:
      'ALTER TABLE "ContractTemplate", "ContractTemplateVersion", "StandardClause", "GeneratedContract": drop the added legal-safety columns.',
  },
  {
    id: "20260724223000_knowledge_review_safety",
    position: 12,
    capabilities: ["knowledge approval queue", "knowledge review provenance"],
    createsTables: [],
    reverse:
      'ALTER TABLE "Certificate", "PastProject", "MethodologyAsset", "ContentLibraryItem": drop the added review columns.',
  },
  {
    id: "20260724231500_proposal_structured_snapshot",
    position: 13,
    capabilities: ["structured proposal snapshot", "authoritative bilingual export"],
    createsTables: [],
    reverse: 'ALTER TABLE "GeneratedProposal": drop the added snapshot columns.',
  },
  {
    id: "20260724234500_proposal_review_integrity",
    position: 14,
    capabilities: ["proposal review snapshot integrity"],
    createsTables: [],
    reverse: 'ALTER TABLE "ProposalReview": drop the added integrity columns.',
  },
  {
    id: "20260725001000_knowledge_evidence_integrity",
    position: 15,
    capabilities: ["knowledge evidence binding", "evidence checksum provenance"],
    createsTables: [],
    reverse:
      'ALTER TABLE "Certificate", "PastProject", "MethodologyAsset", "ContentLibraryItem": drop the added evidence-binding columns.',
  },
  {
    id: "20260725003000_contract_draft_persistence",
    position: 16,
    capabilities: ["contract draft persistence"],
    createsTables: [],
    reverse:
      'ALTER TABLE "ContractTemplate" and "GeneratedContract": drop the added draft columns.',
  },
  {
    id: "20260725004000_contract_render_snapshot",
    position: 17,
    capabilities: ["contract render snapshot"],
    createsTables: [],
    reverse: 'ALTER TABLE "GeneratedProposal": drop the added render-snapshot columns.',
  },
  {
    id: "20260725_phase4_proposal_system",
    position: 18,
    capabilities: [
      "activity analytics",
      "collaboration comments",
      "proposal builder sections",
      "template marketplace",
    ],
    createsTables: [
      "AnalyticsEvent",
      "CollaborationComment",
      "ProposalBuilderSection",
      "TemplateMarketplaceEntry",
    ],
    reverse:
      'DROP TABLE "TemplateMarketplaceEntry"; DROP TABLE "ProposalBuilderSection"; DROP TABLE "CollaborationComment"; DROP TABLE "AnalyticsEvent";',
  },
  {
    id: "20260726000000_platform_completion",
    position: 19,
    introducedBySpec: PLATFORM_COMPLETION_SPEC,
    capabilities: [
      "email verification",
      "credential recovery",
      "workspace invitations",
      "contract instance revision history",
      "transactional notification delivery",
      "in-application notifications",
      "marketplace ratings",
      "marketplace usage accounting",
      "recurring checkout idempotence",
      "proposal presence",
    ],
    createsTables: [
      "VerificationToken",
      "RecoveryToken",
      "WorkspaceInvitation",
      "GeneratedContractVersion",
      "RecurringCheckoutIntent",
      "TemplateMarketplaceApplication",
      "NotificationDelivery",
      "InAppNotification",
      "TemplateMarketplaceRating",
      "ProposalPresence",
    ],
    reverse:
      'DROP TABLE "ProposalPresence"; DROP TABLE "TemplateMarketplaceRating"; DROP TABLE "InAppNotification"; DROP TABLE "NotificationDelivery"; DROP TABLE "TemplateMarketplaceApplication"; DROP TABLE "RecurringCheckoutIntent"; DROP TABLE "GeneratedContractVersion"; DROP TABLE "WorkspaceInvitation"; DROP TABLE "RecoveryToken"; DROP TABLE "VerificationToken"; then drop the columns added by this migration.',
  },
  {
    id: "20260729100000_marketplace_rating_check",
    position: 20,
    capabilities: ["marketplace rating integrity"],
    createsTables: [],
    reverse:
      'ALTER TABLE "TemplateMarketplaceRating": DROP CONSTRAINT IF EXISTS "template_marketplace_rating_range_check";',
  },
  {
    id: "20260822170000_notification_delivery_channel_unique",
    position: 21,
    capabilities: ["multi-channel notification delivery"],
    createsTables: [],
    reverse:
      'CREATE UNIQUE INDEX "NotificationDelivery_eventId_recipientId_key" ON "NotificationDelivery"("eventId", "recipientId"); — only safe after collapsing multi-channel rows to one row per (eventId, recipientId).',
  },
  {
    id: "20260822180000_analytics_daily_summary",
    position: 22,
    capabilities: ["analytics retention archival"],
    createsTables: ["AnalyticsDailySummary"],
    reverse: 'DROP TABLE "AnalyticsDailySummary";',
  },
  {
    id: "20260822190000_auth_hardening_mfa",
    position: 23,
    capabilities: [
      "authentication",
      "MFA enrolment staging",
      "TOTP replay protection",
      "MFA recovery codes",
    ],
    createsTables: ["MfaRecoveryCode"],
    reverse:
      'DROP TABLE "MfaRecoveryCode"; ALTER TABLE "User" DROP COLUMN "pendingMfaSecret"; ALTER TABLE "User" DROP COLUMN "mfaLastUsedStep";',
  },
]);

/** Every declared migration identifier, in apply order. */
export const MIGRATION_IDS: readonly string[] = Object.freeze(
  MIGRATIONS.map((m) => m.id)
);

/**
 * Every migration a named specification introduces, in apply order. Callers that
 * enforce specification-scoped policies (for example the additive-SQL policy of
 * Requirement 16.1) resolve their scope through this function.
 */
export function migrationsIntroducedBySpec(
  spec: string
): readonly MigrationRecord[] {
  const normalized = spec.trim().toLowerCase();
  return Object.freeze(
    MIGRATIONS.filter(
      (migration) =>
        (migration.introducedBySpec ?? "").trim().toLowerCase() === normalized &&
        normalized.length > 0
    )
  );
}

/**
 * Capability names affected by the supplied unapplied migration identifiers.
 * Unknown identifiers are reported verbatim so an out-of-band migration is
 * never silently dropped from a readiness report.
 */
export function capabilitiesForMigrations(
  ids: readonly string[]
): readonly string[] {
  const byId = new Map(MIGRATIONS.map((m) => [m.id, m]));
  const out = new Set<string>();
  for (const id of ids) {
    const record = byId.get(id);
    if (!record) {
      out.add(`unregistered migration ${id}`);
      continue;
    }
    for (const capability of record.capabilities) out.add(capability);
  }
  return Object.freeze([...out]);
}

/**
 * The migration that creates the supplied table, or `null` when no declared
 * migration creates it. Used to explain a `SCHEMA_MIGRATION_PENDING` condition.
 */
export function migrationForTable(table: string): MigrationRecord | null {
  const normalized = table.trim().toLowerCase();
  if (!normalized) return null;
  for (const migration of MIGRATIONS) {
    if (migration.createsTables.some((t) => t.toLowerCase() === normalized)) {
      return migration;
    }
  }
  return null;
}
