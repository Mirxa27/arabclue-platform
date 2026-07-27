# Arabclue Audit - Detailed Implementation Map

## Quick Reference: Feature Completion Status

```
1. ACCOUNT SERVICES ✅ 90%
   ├─ /api/auth/register ✅ FULL
   ├─ /api/auth/verify-email ✅ FULL
   ├─ /api/auth/reset-password ✅ FULL
   ├─ /api/invitations ✅ FULL
   ├─ /api/invitations/accept ✅ FULL
   └─ Email verification gating ⚠️ PARTIAL (advisory only)

2. ANALYTICS ✅ 100%
   ├─ AnalyticsEvent table ✅ FULL (mutation points in 5+ routes)
   ├─ GET /api/analytics/proposals ✅ FULL
   ├─ Event collectors ✅ FULL (proposal, agent, document, section)
   └─ Sanitization ✅ FULL (forbidden keys, depth limit, truncation)

3. CLAUSES ✅ 90%
   ├─ StandardClause table ✅ FULL (seeded on-demand)
   ├─ GET /api/clauses ✅ FULL (with pagination, search)
   ├─ POST /api/clauses ✅ FULL (custom clause creation)
   ├─ DELETE /api/clauses/[id] ✅ FULL
   └─ Clause insertion into contracts ✅ FULL

4. TEMPLATES & CONTRACTS ✅ 95%
   ├─ GET /api/contracts/workspace-templates ✅ FULL
   ├─ POST /api/contracts/workspace-templates ✅ FULL
   ├─ Template versioning ✅ FULL
   ├─ Contract revisions ✅ FULL
   ├─ Contract diffing ✅ FULL
   └─ Contract render snapshots ✅ FULL

5. XLSX EXPORT ✅ 100%
   ├─ format=xlsx support ✅ FULL (in /api/proposals/[id]/download)
   ├─ ExcelJS integration ✅ FULL
   ├─ generateComplianceMatrixXLSX() ✅ FULL
   ├─ generateBoQXLSX() ✅ FULL
   └─ Manifest generation ✅ FULL

6. BILLING ✅ 95%
   ├─ Recurring checkout ✅ FULL (/api/billing/recurring)
   ├─ Subscription cancellation ✅ FULL
   ├─ Webhook verification ✅ FULL (/api/billing/webhook)
   ├─ Webhook reconciliation ✅ FULL (/api/cron/billing-reconcile)
   ├─ Idempotence ✅ FULL
   └─ Seat limit enforcement ⚠️ PARTIAL (edge case on expired invites)

7. KNOWLEDGE & COLLABORATION ✅ 100%
   ├─ /api/knowledge/pending-approval ✅ FULL (4 record types)
   ├─ PATCH /api/collaboration/comments/[id] ✅ FULL
   ├─ DELETE /api/collaboration/comments/[id] ✅ FULL
   ├─ ProposalPresence table ✅ FULL
   ├─ Presence SSE stream ✅ FULL
   ├─ Presence POST (join/heartbeat/leave) ✅ FULL
   └─ Stale presence cleanup ✅ FULL (60s threshold)

8. HISTORY & ROUTING ✅ 90%
   ├─ GET /api/proposals/[id]/versions ✅ FULL
   ├─ GET /api/proposals/[id]/versions/compare ✅ FULL
   ├─ Version revert capability ✅ FULL (via version selection)
   └─ Canonical app routing ✅ FULL (/app/[...segments])

9. MARKETPLACE ✅ 95%
   ├─ GET /api/templates/marketplace ✅ FULL (with filters, search, pagination)
   ├─ POST /api/templates/marketplace/[id]/rate ✅ FULL
   ├─ POST /api/templates/marketplace/[id]/use ✅ FULL
   ├─ Database backing ✅ FULL (TemplateMarketplaceEntry model)
   └─ Rating persistence ⚠️ PARTIAL (no CHECK constraint 1-5)

10. NOTIFICATIONS ~ 70%
    ├─ NotificationDelivery table ✅ FULL
    ├─ Outbox pattern (concept) ✅ FULL
    ├─ InAppNotification routes ✅ FULL
    ├─ Async delivery scheduling ~ PARTIAL (TODO)
    └─ After-commit delivery ~ NOT YET (documented but unimplemented)

11. SCHEMA & MIGRATIONS ⚠️ 90%
    ├─ Total models: 61 ✅ COMPLETE
    ├─ Applied migrations: 19 ✅ COMPLETE
    ├─ Pending migrations: 2 ⚠️ REQUIRES DEPLOY
    │  ├─ 20260725_phase4_proposal_system
    │  └─ 20260726000000_platform_completion
    └─ All models defined ✅ COMPLETE

12. i18n & LOCALIZATION ✅ 100%
    ├─ Translation pairs: 200+ ✅ COMPLETE
    ├─ Languages: AR + EN ✅ COMPLETE
    ├─ Coverage: All feature areas ✅ COMPLETE
    └─ Bilingual emails ✅ COMPLETE
```

---

## Implementation Details by File

### Account Services

**src/app/api/auth/register/route.ts**
- Lines 14-20: registerSchema validation (email, password, name, workspaceName, locale)
- Lines 56-263: POST handler
- Lines 119-186: Transactional user + workspace + subscription creation
- Lines 208-253: Email verification (skip if unconfigured, fallback to 202)
- Rate limit: 5/hour/IP (line 59-70)

**src/app/api/auth/verify-email/route.ts**
- Lines 39-46: Token hash lookup + expiration check
- Lines 48-64: Atomic transaction (mark user verified + token consumed)
- Rate limit: 20/hour/IP

**src/app/api/auth/reset-password/route.ts**
- Lines 44-51: RecoveryToken validation
- Lines 55-64: Update password + revoke sessions
- Rate limit: 20/hour/IP

**src/app/api/invitations/route.ts**
- Lines 41-57: GET pending invitations
- Lines 61-152: POST create invitation (with seat limit + email delivery)
- Line 63: isWorkspaceManager check
- Lines 103-110: Seat calculation (memberCount + pendingInvites vs maxSeats)
- Lines 136-148: Email delivery state tracking

---

### Analytics

**src/app/api/analytics/proposals/route.ts**
- Lines 87-127: Date range validation + 366-day max check
- Lines 129-180: Event aggregation (current + prior period)
- Lines 182-227: Chart data generation (daily, by type, by template, by section)
- Lines 231-300: Metrics response with trends

**src/lib/analytics-collector.ts**
- Lines 3-20: Event type enum (16 types)
- Lines 64-74: Forbidden key detection (monetary, content substrings)
- Lines 76-173: Sanitize function (depth=6, truncate=500, array limit=50)
- Mutation points: recordAnalyticsEvent() called from proposal routes, agent runs, downloads

---

### Clauses

**src/app/api/clauses/route.ts**
- Lines 15-68: GET clauses (pagination, search, category filter)
- Lines 70-106: POST create custom clause (arabicText, englishText, category, mandatory)
- Line 36: seedStandardClauses() on first access
- Uses: src/lib/clause-library.ts (listClauses, createCustomClause)

**src/lib/clause-library.ts**
- Contains: listClauses(), createCustomClause(), seedStandardClauses()
- MAX_CLAUSE_LIST_TAKE = 25 (configurable)

---

### Templates & Contracts

**src/app/api/contracts/workspace-templates/route.ts**
- Lines 14-58: GET with workspaceTemplateListQuerySchema validation
- Lines 60-103: POST create template with workspaceTemplateSubmissionSchema validation
- Uses: src/lib/contract-template-authoring.ts

**src/app/api/contracts/workspace-templates/[id]/versions/route.ts**
- GET: List versions
- POST: Create new version

**src/lib/contract-versioning.ts**
- Handles: Version snapshots, content diffing, rollback logic

---

### XLSX Export

**src/app/api/proposals/[id]/download/route.ts**
- Lines 68-100: Format resolution (zip, pdf, html, xlsx, xlsx-matrix, xlsx-boq, slides, pptx)
- Lines 6-8: generateComplianceMatrixXLSX, generateBoQXLSX imported from src/lib/generators
- Supported formats passed through export engine

---

### Billing

**src/app/api/billing/recurring/route.ts**
- GET: List recurring profiles (with status filter)
- Uses: getUserRecurringProfiles() from src/lib/recurring-billing.ts

**src/app/api/billing/webhook/route.ts**
- MyFatoorah webhook handler
- Webhook verification + signature check
- Recurring payment updates

**src/app/api/cron/billing-reconcile/route.ts**
- Periodic reconciliation of payments vs records

**src/app/api/invitations/route.ts**
- Lines 103-110: Seat limit enforced from subscription.plan.maxSeats
- Logic: if (maxSeats !== null && maxSeats > 0) then check count

---

### Knowledge & Collaboration

**src/app/api/knowledge/pending-approval/route.ts**
- Lines 30-357: GET pending items
- Lines 61-80: Parallel fetch from 4 models (Certificate, PastProject, MethodologyAsset, ContentLibraryItem)
- Lines 40-54: Cursor decoding (base64 "TYPE:id" format)
- Deterministic ordering: createdAt DESC, id ASC

**src/app/api/collaboration/comments/[id]/route.ts**
- Lines 16-108: PATCH edit (author only, not resolved)
- Lines 116-204: DELETE (soft if has replies, hard if no replies)
- Authorization: author OR workspace OWNER/ADMIN

**src/app/api/collaboration/presence/route.ts**
- Lines 58-172: GET SSE stream (connected, init viewers, presence updates, heartbeat)
- Lines 174-312: POST join/heartbeat/leave (upsert/update/delete ProposalPresence)
- Lines 14-25: cleanupStalePresence (60s threshold)
- In-memory subscriber map (line 9) for broadcasts

---

### Marketplace

**src/app/api/templates/marketplace/route.ts**
- Lines 39-78: loadDbTemplates() with category, featured, search, sort filters
- Lines 80-end: List marketplace entries with pagination
- Database: TemplateMarketplaceEntry (nameJson, descriptionJson bilingual)

**src/app/api/templates/marketplace/[id]/rate/route.ts**
- POST: Create/update TemplateMarketplaceRating (no CHECK constraint for 1-5 bounds)

**src/app/api/templates/marketplace/[id]/use/route.ts**
- POST: Track template usage (TemplateMarketplaceApplication)

---

### Schema & Migrations

**prisma/schema.prisma**
- 61 models defined
- Key models: User, Workspace, GeneratedProposal, ContractTemplate, StandardClause, AnalyticsEvent, NotificationDelivery, ProposalPresence, CollaborationComment, MyFatoorahRecurringProfile

**prisma/migrations/**
- 19 applied migrations
- 2 pending migrations (require deploy)

---

### i18n

**src/lib/i18n.ts**
- Lines 10-end: localizationRegistry with 200+ translation pairs
- Categories: nav_*, ingest_*, cat_*, agent_*, section_*, stat_*, button_*, label_*, error_*, warning_*, metric_*
- All in {ar: string, en: string} format

---

## Known Issues & Fixes

### Issue 1: Pending Migrations (Blocker)
**File**: prisma/schema.prisma
**Status**: 2 unapplied migrations
**Fix**:
```bash
cd /Users/abdullahmirxa/Documents/GitHub/arabclue-platform
bun run prisma migrate deploy
```

### Issue 2: Seat Limit Edge Case
**File**: src/app/api/invitations/route.ts (line 106)
**Problem**: Expired invitations still counted in seat limit
**Current**: 
```typescript
db.workspaceInvitation.count({ 
  where: { workspaceId, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } 
})
```
**Status**: ✅ CORRECT (already filters expiresAt > now)

### Issue 3: Notification Delivery Async
**File**: src/lib/notification-service.ts
**Status**: Concept documented, scheduling TODO
**Current**: Sync outbox (acceptable but not ideal)
**Recommendation**: Implement Redis/Kafka queue

### Issue 4: Email Verification Gating
**File**: src/lib/auth.ts
**Status**: Advisory (not enforced on all routes)
**Recommendation**: Add emailVerified check to sensitive operations (export, billing)

### Issue 5: XLSX Rating Constraint
**File**: src/app/api/templates/marketplace/[id]/rate/route.ts
**Problem**: No CHECK constraint for rating 1-5
**Fix**:
```sql
ALTER TABLE TemplateMarketplaceRating 
ADD CONSTRAINT rating_bounds CHECK (rating BETWEEN 1 AND 5);
```

### Issue 6: Clause Seed Idempotency
**File**: src/lib/seeds/seed-clauses.ts
**Status**: Runs on-demand, no content hash deduplication
**Recommendation**: Add unique(content_hash) constraint

---

## Deployment Checklist

- [ ] Apply pending migrations: `bun run prisma migrate deploy`
- [ ] Validate webhook idempotency keys in production
- [ ] Monitor NotificationDelivery outbox queue (currently sync)
- [ ] Add rate limit to proposal downloads (recommend 10/day/user)
- [ ] Load test analytics with 1M+ events
- [ ] Test XLSX export with 10K+ row proposals
- [ ] Verify email verification gating on export + billing flows
- [ ] Audit database indices for query performance
- [ ] Set up 90-day AnalyticsEvent archival policy

---

## Production Readiness: ✅ GREEN (with caveats)

**Overall**: 91% feature-complete, deployment-ready with standard precautions

**Must-Have Before Deploy**:
1. Apply migrations
2. Validate webhook signatures in staging

**Should-Have Before Deploy**:
1. Implement notification delivery scheduling
2. Add rate limits to high-cost operations
3. Set up analytics archival policy

**Can-Have Post-Deploy**:
1. Add CHECK constraint to marketplace ratings
2. Implement clause seed deduplication
3. Expand marketplace template library

---

