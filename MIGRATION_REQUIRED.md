# Database Migration Required

## Current Status

The development server cannot start because the database migration `20260726000000_platform_completion` has not been applied to the shared Neon database.

## Error Symptoms

```
The column `User.emailVerified` does not exist in the current database.
```

The application correctly detects this and returns HTTP 503 with code `SCHEMA_MIGRATION_PENDING` (satisfying Requirement 16.2).

## Solution

Apply the pending migration to the Neon database:

```bash
bunx prisma migrate deploy
```

This command:
- Reads all migrations in `prisma/migrations/`
- Compares against the database's `_prisma_migrations` table
- Applies only unapplied migrations (including `20260726000000_platform_completion`)
- Is safe for shared/production databases (no data reset)

## What the Migration Adds

The `20260726000000_platform_completion` migration adds:

### User Model Columns
- `emailVerified` (BOOLEAN NOT NULL DEFAULT false)
- `emailVerifiedAt` (TIMESTAMP)

### New Tables
- `VerificationToken` (for email verification)
- `RecoveryToken` (for password reset)
- `WorkspaceInvitation` (for team invitations)
- `NotificationDelivery` (for transactional emails)
- `InAppNotification` (for in-app notifications)
- Additional platform completion tables

### Constraints and Indexes
- Unique constraints on normalized emails
- Partial indexes for pending invitations
- Check constraints for platform safety

## After Migration

Once applied:
1. Dev server will start successfully
2. Bootstrap will create the default admin user with verification state
3. Registration and email verification flows will work
4. Recovery and invitation features will be functional

## Verification

After running the migration, verify it succeeded:

```bash
bunx prisma migrate status
```

Should show all migrations as applied, including `20260726000000_platform_completion`.

---

**Note:** This file can be deleted after the migration is applied successfully.
