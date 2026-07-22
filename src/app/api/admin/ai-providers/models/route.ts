import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { parseModelsCache } from "@/lib/llm/model-catalog";
import { fetchLiveProviderModels } from "@/lib/llm/fetch-models";

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
};

/**
 * POST /api/admin/ai-providers/models
 * Auto-fetch live model list from the provider API and cache on the connection.
 * Never returns a hardcoded model catalog.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();

  const body = (await req.json().catch(() => ({}))) as FetchBody;

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
          error: err instanceof Error ? err.message : "fetch failed",
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
  let engine: string | null = null;

  if (providerId) {
    const row = await db.aIProviderConfig.findUnique({
      where: { id: providerId },
    });
    if (!row) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    provider = row.provider.toLowerCase();
    apiBase = body.apiBase ?? row.apiBase;
    apiKeyEnvKey = body.apiKeyEnvKey ?? row.apiKeyEnvKey;
    engine = row.engine;

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
    const message = err instanceof Error ? err.message : "Failed to fetch models";
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
    return NextResponse.json({ error: message, models: [] }, { status: 502 });
  }
}
