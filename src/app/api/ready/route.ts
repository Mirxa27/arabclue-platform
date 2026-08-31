import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMyFatoorahPublicConfig } from "@/lib/myfatoorah";
import { productionInfrastructureReadiness } from "@/lib/production-readiness";
import {
  checkMigrationReadiness,
  unreadableLedgerReport,
  type MigrationReadinessReport,
} from "@/lib/migration-readiness";
import {
  probeDistributedRateLimitBackend,
  requiresDistributedRateLimit,
} from "@/lib/rate-limit";
import { summarizeSealedSecrets } from "@/lib/secret-readiness";
import {
  providerNeedsApiKey,
  summarizeAiCredential,
  summarizeEngineCredentials,
} from "@/lib/ai-credential-readiness";
import {
  AGENT_ENGINES,
  providerServesEngine,
  type AgentEngine,
} from "@/lib/llm/model-catalog";
import { resolveProviderApiKey } from "@/lib/env-settings";
import { getAutonomyFlagsFromProcessEnv } from "@/lib/autonomy-flags";

export const dynamic = "force-dynamic";

/**
 * GET /api/ready — readiness probe for load balancers.
 *
 * Reports the schema-migration comparison (Requirement 16.3) separately from the
 * liveness result served by `/api/health`, and reports a not-ready state while
 * any declared migration is absent from the `_prisma_migrations` ledger
 * (Requirement 16.4). Issues no data-definition statement.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 120) : "unavailable",
    };
  }

  // Requirement 16.3/16.4/16.8 — declared migration set vs applied ledger.
  // Read-only comparison, bounded by a five-second deadline, never truncated.
  const migrations: MigrationReadinessReport = checks.database.ok
    ? await checkMigrationReadiness()
    : unreadableLedgerReport(
        "READINESS_DATABASE_UNREACHABLE",
        "database unreachable; migration ledger not read"
      );
  checks.migrations = { ok: migrations.ok, detail: migrations.detail };

  checks.nextauthSecret = {
    ok: Boolean(
      process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 16
    ),
  };
  checks.encKey = {
    ok:
      process.env.NODE_ENV !== "production" ||
      Boolean(
        process.env.ARABCLUE_ENC_KEY && process.env.ARABCLUE_ENC_KEY.length >= 16
      ),
  };

  // The check above only sees that the key is set. Whether it still opens the
  // rows it sealed is a different question, and the answer is invisible
  // everywhere else: a mismatched key reads as an empty settings table.
  if (checks.database.ok) {
    try {
      const sealed = await db.envSetting.findMany({
        select: { valueEncrypted: true },
      });
      checks.sealedSecrets = summarizeSealedSecrets(
        sealed.map((row) => row.valueEncrypted)
      );
    } catch {
      checks.sealedSecrets = { ok: false, detail: "secret_query_failed" };
    }
  }

  try {
    const activeProviders = await db.aIProviderConfig.count({
      where: { isActive: true },
    });
    checks.llmProviders = {
      ok: true,
      detail:
        activeProviders > 0
          ? `active:${activeProviders}`
          : "none_active_deterministic_fallback",
    };
  } catch {
    checks.llmProviders = { ok: false, detail: "provider_query_failed" };
  }

  // `active:N` above counts rows. Whether an engine can actually present a
  // credential is the question that decides if this deployment produces real
  // model output or silent fallbacks, and nothing else reports it. Swept per
  // engine, because a healthy DEFAULT hid a COMPLIANCE connection naming a
  // credential outside the provider allowlist and a DRAFTING connection whose
  // credential was sealed empty — both fabricated every answer.
  try {
    const actives = await db.aIProviderConfig.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    // Resolved from one fetch: calling getProviderForEngine per engine would
    // repeat the same query ten times on a probe the load balancer polls.
    const pickProvider = (engine: AgentEngine) =>
      actives.find((row) => providerServesEngine(row, engine)) ??
      (engine === "DEFAULT"
        ? undefined
        : actives.find((row) => providerServesEngine(row, "DEFAULT"))) ??
      actives[0];

    // Engines share credentials, so resolve each distinct name once.
    const resolved = new Map<string, Promise<boolean>>();
    const resolvesCredential = (provider: {
      provider: string;
      apiKeyEnvKey: string | null;
    }): Promise<boolean> => {
      const cacheKey = `${provider.provider}|${provider.apiKeyEnvKey ?? ""}`;
      const hit = resolved.get(cacheKey);
      if (hit) return hit;
      const pending = resolveProviderApiKey(
        provider.provider,
        provider.apiKeyEnvKey
      ).then(Boolean);
      resolved.set(cacheKey, pending);
      return pending;
    };

    const entries = await Promise.all(
      AGENT_ENGINES.map(async (engine) => {
        const provider = pickProvider(engine);
        if (!provider) return { engine, resolved: false };
        return {
          engine,
          resolved: providerNeedsApiKey(provider.provider)
            ? await resolvesCredential(provider)
            : true,
        };
      })
    );
    checks.aiEngines = summarizeEngineCredentials(entries);

    const defaultProvider = pickProvider("DEFAULT");
    const defaultNeedsKey = defaultProvider
      ? providerNeedsApiKey(defaultProvider.provider)
      : false;
    checks.aiCredential = summarizeAiCredential({
      hasActiveProvider: Boolean(defaultProvider),
      needsApiKey: defaultNeedsKey,
      apiKeyResolved:
        defaultProvider && defaultNeedsKey
          ? await resolvesCredential(defaultProvider)
          : false,
    });
  } catch {
    checks.aiCredential = { ok: false, detail: "credential_check_failed" };
  }

  // Whether a degraded provider makes this deployment refuse (`strict`) or
  // fabricate deterministic text presented as model output (`permissive`).
  // The deploy is the trust boundary for that switch, so nothing outside the
  // running instance can otherwise observe which behaviour is live. Read from
  // `process.env` deliberately: that is the same source the guard itself reads,
  // so the probe cannot report strict while enforcement is permissive.
  // Never gates readiness — a policy flag must not pull the site out of the
  // load balancer.
  checks.realAi = {
    ok: true,
    detail: getAutonomyFlagsFromProcessEnv().realAiOnly ? "strict" : "permissive",
  };

  try {
    const mf = await getMyFatoorahPublicConfig();
    checks.myfatoorah = {
      ok: true,
      detail: mf.configured
        ? `configured:${mf.environment ?? "unknown"}`
        : "not_configured",
    };
  } catch {
    checks.myfatoorah = { ok: false, detail: "config_error" };
  }

  const infrastructure = productionInfrastructureReadiness(process.env);
  checks.storage = infrastructure.storage;
  checks.rateLimit = infrastructure.rateLimit;
  checks.cron = infrastructure.cron;
  const distributedRateLimitRequired = requiresDistributedRateLimit(undefined);
  if (checks.rateLimit.ok && distributedRateLimitRequired) {
    const reachable = await probeDistributedRateLimitBackend();
    checks.rateLimit = {
      ok: reachable,
      detail: reachable ? "redis" : "redis_unavailable",
    };
  }
  if (!infrastructure.storage.ok) {
    console.warn(
      "[ready] BLOB_READ_WRITE_TOKEN unset on Vercel — uploads use /tmp and are lost on cold start"
    );
  }

  checks.email = {
    ok: true,
    detail: process.env.RESEND_API_KEY?.trim()
      ? "resend"
      : "degraded_no_resend",
  };

  const ready = Object.values(checks).every((c) => c.ok);
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const onVercel = Boolean(process.env.VERCEL);
  return NextResponse.json(
    {
      ready,
      code: ready ? null : (migrations.code ?? "READINESS_CHECK_FAILED"),
      service: "arabclue",
      checks,
      // Requirement 16.3 — reported separately from liveness, never truncated.
      schema: {
        ok: migrations.ok,
        code: migrations.code,
        declaredMigrations: migrations.declaredCount,
        appliedMigrations: migrations.appliedCount,
        unappliedMigrations: migrations.unapplied,
        affectedCapabilities: migrations.capabilities,
        durationMs: migrations.durationMs,
      },
      storage: blobConfigured
        ? "vercel_blob"
        : onVercel
          ? "ephemeral"
          : "local",
      rateLimit: checks.rateLimit.ok
        ? process.env.REDIS_URL?.trim()
          ? "redis"
          : "memory"
        : "unavailable",
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
