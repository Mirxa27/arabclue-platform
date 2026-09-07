-- Distributed rate limiting and render leases on the platform database.
--
-- Every Vercel function instance has its own memory, so an in-memory counter
-- is not a rate limit there, and the platform has no Redis. The one thing every
-- instance already shares is this database, so the login, registration, AI,
-- export and contract-draft limits move into two small tables updated with
-- single atomic statements (INSERT ... ON CONFLICT DO UPDATE ... RETURNING and
-- a conditional UPDATE), which is correct under concurrency without a lock
-- round-trip. Redis remains the backend when REDIS_URL is set.
--
-- RateLimitWindow: one row per limiter key and fixed window. The key is the
-- limiter's own bucket name (`login:email:<digest>`, `ai.rewrite:workspace:<id>`
-- ...) and the window is `floor(now / windowMs)`; rows are dropped once their
-- window has passed by the same lazy sweep that already prunes the memory
-- limiter, and by the analytics-retention cron as a backstop.
--
-- RateLimitLease: one row per outstanding capacity lease (document renders),
-- with the expiry the holder promised, so a crashed renderer's slot is
-- reclaimed as soon as the lease lapses.
--
-- Safety: strictly additive — two new tables and their indexes, no existing
-- column touched, applies cleanly to a populated database. Reverse: DROP TABLE
-- "RateLimitLease"; DROP TABLE "RateLimitWindow";

CREATE TABLE IF NOT EXISTS "RateLimitWindow" (
  "key"         TEXT NOT NULL,
  "windowStart" BIGINT NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 0,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("key", "windowStart")
);

CREATE INDEX IF NOT EXISTS "RateLimitWindow_expiresAt_idx"
  ON "RateLimitWindow"("expiresAt");

CREATE TABLE IF NOT EXISTS "RateLimitLease" (
  "token"     TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitLease_pkey" PRIMARY KEY ("token")
);

CREATE INDEX IF NOT EXISTS "RateLimitLease_key_expiresAt_idx"
  ON "RateLimitLease"("key", "expiresAt");
