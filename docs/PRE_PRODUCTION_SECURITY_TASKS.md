# Pre-Production Security Hardening Tasks

**Status:** Development phase — These security issues are documented for pre-production hardening. They do not block feature development.

## Security Issues Requiring Remediation Before Production Deployment

### 1. Git History Contains Sensitive Files

**Issue:** `.env` file was committed to Git history  
**Risk:** Historical credentials may be exposed  
**Status:** ⚠️ Deferred to pre-production  
**Remediation:**
```bash
# Option A: BFG Repo-Cleaner (recommended)
brew install bfg
bfg --delete-files .env --no-blob-protection
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Option B: git-filter-repo
pip install git-filter-repo
git filter-repo --path .env --invert-paths
```

**Post-cleanup actions:**
- Force-push to all remotes: `git push origin --force --all`
- Notify all collaborators to re-clone the repository
- Rotate any credentials that were exposed

---

### 2. Git History Contains Embedded Credentials

**Issue:** Development credentials found in historical commits:
- `dbb59a7b6b0e:AGENTS.md`
- `7b95e7270d7a:AGENTS.md`
- `306ae667ed72:scripts/ensure-devtest.ts`
- `83045d348e6f:DEPLOY_ARABCLUE_COM.md`

**Risk:** Test accounts with `@arabclue.local` domain exposed  
**Status:** ⚠️ Deferred to pre-production  
**Remediation:**
```bash
# Clean specific files from history
git filter-repo --path AGENTS.md --path scripts/ensure-devtest.ts --path DEPLOY_ARABCLUE_COM.md --invert-paths
# Then restore current clean versions
git restore --source=HEAD@{1} AGENTS.md scripts/ensure-devtest.ts DEPLOY_ARABCLUE_COM.md
git commit -m "chore: restore cleaned files"
```

**Post-cleanup actions:**
- Rotate all development test account passwords
- Verify no production credentials were ever committed

---

### 3. Missing Production Environment Variables

**Issue:** Runtime environment missing required configuration  
**Status:** ⚠️ Development environment — safe to skip  

#### REDIS_URL (Required for production)
- **Purpose:** Distributed authentication and document-export rate limiting
- **Development:** Application degrades gracefully without Redis (in-memory fallback)
- **Production requirement:** Redis 6+ instance (Upstash, AWS ElastiCache, or self-hosted)
- **Example:** `redis://default:password@redis-host:6379`

#### CRON_SECRET (Required for production)
- **Purpose:** Authenticates scheduled job endpoints
- **Development:** Cron jobs typically disabled in local development
- **Production requirement:** Minimum 16 characters, cryptographically random
- **Generate:** `openssl rand -base64 24`
- **Example:** `KzU9XVc8Mw7JnQ2PxL4RvH6YtE0FqA3SbG`

#### BLOB_READ_WRITE_TOKEN (Required for production)
- **Purpose:** Vercel Blob storage for document uploads
- **Development:** Local filesystem fallback works for testing
- **Production requirement:** Set automatically via Vercel storage integration

---

## Development Environment Safety

### Current Status
✅ All 2,854 tests passing  
✅ Application functional without Redis (graceful degradation)  
✅ `.env.example` properly documents all required variables  
✅ `.gitignore` protects sensitive environment files  

### Known Safe for Development
- Embedded credentials are test-only `@arabclue.local` identities
- No production credentials have been committed
- Application handles missing optional dependencies gracefully
- Deployment safety gate prevents accidental production deployment

---

## Pre-Production Checklist

Before deploying to production, complete these tasks:

- [ ] **Git History Cleanup**
  - [ ] Remove `.env` from all commits
  - [ ] Remove embedded credentials from AGENTS.md, ensure-devtest.ts, DEPLOY_ARABCLUE_COM.md
  - [ ] Force-push cleaned history
  - [ ] Notify team to re-clone

- [ ] **Credential Rotation**
  - [ ] Generate new development test account passwords
  - [ ] Verify no production credentials were ever committed
  - [ ] Update all team members with new credentials

- [ ] **Production Environment Configuration**
  - [ ] Provision Redis instance (Upstash recommended for Vercel)
  - [ ] Set `REDIS_URL` in production environment
  - [ ] Generate and set `CRON_SECRET` (min 16 chars)
  - [ ] Configure `BLOB_READ_WRITE_TOKEN` via Vercel storage
  - [ ] Set all other required production variables from `.env.example`

- [ ] **Verification**
  - [ ] Run `bun run deploy:safety` and confirm all checks pass
  - [ ] Test Redis connectivity in staging
  - [ ] Verify cron job authentication works
  - [ ] Confirm blob storage uploads succeed

---

## Timeline

- **Current Phase:** Feature development — security issues documented but not blocking
- **Next Phase:** Pre-production hardening — address all issues before first production deployment
- **Production Ready:** All security tasks completed and verified

---

## Notes

This document tracks security issues that are **safe to defer during development** but **must be resolved before production**. The deployment safety gate ensures these issues cannot be accidentally deployed to production.

Development continues normally with these known issues documented and scheduled for pre-production remediation.
