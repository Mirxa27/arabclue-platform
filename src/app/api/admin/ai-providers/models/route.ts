import { redactSensitiveText } from "@/lib/api-failure";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { apiFailure, jsonApiFailure, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { adminAiProviderModelsSchema } from "@/lib/validation";
import { parseModelsCache } from "@/lib/llm/model-catalog";
import { fetchLiveProviderModels } from "@/lib/llm/fetch-models";
import { providerConnectionGuardError } from "@/lib/llm/provider-connection-guard";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type FetchBody = {
  provider?: string;
  apiBase?: string | null;
  apiKeyEnvKey?: string | null;
  /** When set, load credentials from an existing provider row and cache results */
  providerId?: string;
  /** refresh all configured provider connections */
  refreshAll?: boolean;
  /** return cached list only (no network) */
  cachedOnly?: boolean;
  /** Engine context (e.g. VOICE filters live/realtime models) */
  engine?: string | null;
};

/**
 * POST /api/admin/ai-providers/models
 * Auto-fetch live model list from the provider API and cache on the connection.
 * Never returns a hardcoded model catalog.
 */
export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
    await getBootstrapContext();
    // Each call spends a stored credential against an external provider; it
    // was the one AI-adjacent route with no ceiling. Per admin, not per
    // workspace: the models list is a platform-level action.
    const limited = await checkAiRateLimit({
      route: "admin.ai-providers.models",
      identifier: session.user.id,
      limit: 12,
      windowMs: 60_000,
    });
    if (limited) return limited;
    const body = await parseJsonBody(req, adminAiProviderModelsSchema);

    // Same guard the provider write paths run. This answers a caller-supplied
    // connection with a clear 400; rows loaded by `providerId` are checked
    // again inside `fetchLiveProviderModels` before anything is dispatched.
    if (!body.providerId) {
      const guardError = providerConnectionGuardError({
        provider: String(body.provider ?? "openai"),
        apiBase: body.apiBase,
        apiKeyEnvKey: body.apiKeyEnvKey,
      });
      if (guardError) return guardError;
    }

    try {
      const response = await handleModelsPost(body);
      // The credential never appears here: provider name, base host and the
      // row id are what an operator needs to trace a fetch.
      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.AI_PROVIDER_MODELS_FETCH,
        resource: "AIProviderConfig",
        resourceId: body.providerId ?? undefined,
        details: {
          provider: body.provider ?? null,
          apiBaseHost: body.apiBase ? safeHost(body.apiBase) : null,
          apiKeyEnvKey: body.apiKeyEnvKey ?? null,
          status: response.status,
        },
      });
      return response;
    } catch (err) {
      // The thrown message can carry a provider URL, a driver error, or a
      // fragment of the credential that was rejected, so it is logged and not
      // echoed. Everything else in this repository already answers through the
      // bilingual failure mapper.
      console.error("[admin/ai-providers/models]", err);
      return NextResponse.json(
        { ...apiFailure("AI_PROVIDER_MODELS_FETCH_FAILED"), models: [] },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }, "admin/ai-providers/models");
}

async function handleModelsPost(body: FetchBody) {

  if (body.refreshAll) {
    const rows = await db.aIProviderConfig.findMany({
      orderBy: { createdAt: "asc" },
    });
    const results: Array<{
      providerId: string;
      name: string;
      ok: boolean;
      count?: number;
      error?: string;
      fetchedAt?: string;
    }> = [];

    for (const row of rows) {
      try {
        const live = await fetchLiveProviderModels({
          provider: row.provider,
          apiBase: row.apiBase,
          apiKeyEnvKey: row.apiKeyEnvKey,
          engine: row.engine,
        });
        await db.aIProviderConfig.update({
          where: { id: row.id },
          data: {
            modelsCacheJson: JSON.stringify(live.models),
            modelsFetchedAt: new Date(live.fetchedAt),
          },
        });
        results.push({
          providerId: row.id,
          name: row.name,
          ok: true,
          count: live.models.length,
          fetchedAt: live.fetchedAt,
        });
      } catch (err) {
        results.push({
          providerId: row.id,
          name: row.name,
          ok: false,
          // Redacted: an upstream failure can carry the provider URL or a
          // fragment of the credential that was rejected.
          error: redactSensitiveText(
            err instanceof Error ? err.message : "fetch failed"
          ),
        });
      }
    }

    return NextResponse.json({
      refreshed: results,
      okCount: results.filter((r) => r.ok).length,
      failCount: results.filter((r) => !r.ok).length,
    });
  }

  let provider = (body.provider || "openai").toLowerCase();
  let apiBase = body.apiBase ?? null;
  let apiKeyEnvKey = body.apiKeyEnvKey ?? null;
  let providerId = body.providerId ?? null;
  let engine: string | null = body.engine ?? null;

  if (providerId) {
    const row = await db.aIProviderConfig.findUnique({
      where: { id: providerId },
    });
    if (!row) {
      return jsonApiFailure("AI_PROVIDER_NOT_FOUND", { status: 404 });
    }
    provider = row.provider.toLowerCase();
    apiBase = body.apiBase ?? row.apiBase;
    apiKeyEnvKey = body.apiKeyEnvKey ?? row.apiKeyEnvKey;
    engine = body.engine ?? row.engine;

    if (body.cachedOnly) {
      const cached = parseModelsCache(row.modelsCacheJson);
      return NextResponse.json({
        models: cached,
        source: cached.length ? "cache" : "empty",
        fetchedAt: row.modelsFetchedAt?.toISOString() ?? null,
        cached: true,
      });
    }
  }

  try {
    const live = await fetchLiveProviderModels({
      provider,
      apiBase,
      apiKeyEnvKey,
      engine,
    });

    if (providerId) {
      await db.aIProviderConfig.update({
        where: { id: providerId },
        data: {
          modelsCacheJson: JSON.stringify(live.models),
          modelsFetchedAt: new Date(live.fetchedAt),
        },
      });
    }

    return NextResponse.json({
      models: live.models,
      source: live.source,
      fetchedAt: live.fetchedAt,
      cached: Boolean(providerId),
    });
  } catch (err) {
    const message = redactSensitiveText(
      err instanceof Error ? err.message : "Failed to fetch models"
    );
    const missingKey = /API key missing/i.test(message);
    // Serve last cache on soft failure when providerId present
    if (providerId) {
      const row = await db.aIProviderConfig.findUnique({
        where: { id: providerId },
      });
      const cached = parseModelsCache(row?.modelsCacheJson);
      if (cached.length > 0) {
        return NextResponse.json({
          models: cached,
          source: "cache_stale",
          fetchedAt: row?.modelsFetchedAt?.toISOString() ?? null,
          warning: message,
          cached: true,
        });
      }
    }
    return NextResponse.json(
      {
        error: message,
        models: [],
        code: missingKey ? "API_KEY_MISSING" : "UPSTREAM_MODELS_FAILED",
      },
      // Application/config errors — not an infrastructure gateway failure
      { status: missingKey ? 400 : 422 }
    );
  }
}

/** Host of a URL for the audit trail; never the path or query, which can carry a key. */
function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
