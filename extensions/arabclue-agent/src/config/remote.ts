/** Remote config loader — `/api/platform-agent/extension/config` with TTL cache */

import type { ExtensionSettings, RemoteExtensionConfig } from "../types";
import { DEFAULT_SETTINGS, FALLBACK_REMOTE_CONFIG, LIMITS, STORAGE } from "../constants";
import { normalizeApiBase } from "../utils";

interface CachedConfig {
  config: RemoteExtensionConfig;
  fetchedAt: number;
}

async function getApiBase(): Promise<string> {
  const stored = await chrome.storage.sync.get({ apiBase: DEFAULT_SETTINGS.apiBase });
  return normalizeApiBase(stored.apiBase as string);
}

/** Load remote config (cache-first, network refresh when stale) */
export async function loadRemoteConfig(force = false): Promise<RemoteExtensionConfig> {
  const cached = await getCachedConfig();
  if (!force && cached && Date.now() - cached.fetchedAt < LIMITS.REMOTE_CONFIG_TTL_MS) {
    return cached.config;
  }

  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/api/platform-agent/extension/config`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      if (cached) return { ...cached.config, authenticated: res.status !== 401 };
      return {
        ...FALLBACK_REMOTE_CONFIG,
        authenticated: res.status !== 401,
        fetchedAt: new Date().toISOString(),
      };
    }

    const data = (await res.json().catch(() => ({}))) as Partial<RemoteExtensionConfig> & {
      ok?: boolean;
    };

    const merged = mergeWithFallback(data);
    await setCachedConfig(merged);
    return merged;
  } catch {
    if (cached) return cached.config;
    return { ...FALLBACK_REMOTE_CONFIG, fetchedAt: new Date().toISOString() };
  }
}

/** Probe auth via config endpoint, then session, then /api/ready for online */
export async function probeAuthStatus(settings?: ExtensionSettings): Promise<{
  authenticated: boolean;
  online: boolean;
  user?: { id?: string; name?: string; email?: string };
  apiBase: string;
  version: string;
}> {
  const apiBase = normalizeApiBase(settings?.apiBase ?? (await getApiBase()));
  const version = chrome.runtime.getManifest().version;
  let online = false;
  let authenticated = false;
  let user: { id?: string; name?: string; email?: string } | undefined;

  try {
    const ready = await fetch(`${apiBase}/api/ready`, {
      method: "GET",
      credentials: "omit",
      signal: AbortSignal.timeout(8_000),
    });
    online = ready.ok || ready.status < 500;
  } catch {
    online = false;
  }

  try {
    const configRes = await fetch(`${apiBase}/api/platform-agent/extension/config`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (configRes.ok) {
      const data = (await configRes.json().catch(() => ({}))) as RemoteExtensionConfig;
      authenticated = data.authenticated === true || Boolean(data.user);
      user = data.user;
      online = true;
      const merged = mergeWithFallback(data);
      await setCachedConfig(merged);
    } else if (configRes.status === 401) {
      authenticated = false;
      online = true;
    }
  } catch {
    /* fall through to session probe */
  }

  if (!authenticated) {
    try {
      const sessionRes = await fetch(`${apiBase}/api/auth/session`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (sessionRes.ok) {
        const session = (await sessionRes.json().catch(() => null)) as {
          user?: { id?: string; name?: string; email?: string };
        } | null;
        if (session?.user) {
          authenticated = true;
          user = session.user;
          online = true;
        }
      } else if (sessionRes.status !== 0) {
        online = true;
      }
    } catch {
      /* ignore */
    }
  }

  return { authenticated, online, user, apiBase, version };
}

function mergeWithFallback(data: Partial<RemoteExtensionConfig>): RemoteExtensionConfig {
  return {
    portals: Array.isArray(data.portals) && data.portals.length
      ? data.portals
      : FALLBACK_REMOTE_CONFIG.portals,
    categories: Array.isArray(data.categories) && data.categories.length
      ? data.categories
      : FALLBACK_REMOTE_CONFIG.categories,
    featureFlags: {
      ...FALLBACK_REMOTE_CONFIG.featureFlags,
      ...(data.featureFlags || {}),
    },
    branding: {
      ...FALLBACK_REMOTE_CONFIG.branding,
      ...(data.branding || {}),
    },
    matchCriteriaDefaults: data.matchCriteriaDefaults,
    authenticated: data.authenticated,
    user: data.user,
    fetchedAt: new Date().toISOString(),
  };
}

async function getCachedConfig(): Promise<CachedConfig | null> {
  const stored = await chrome.storage.local.get({ [STORAGE.REMOTE_CONFIG]: null });
  const raw = stored[STORAGE.REMOTE_CONFIG] as CachedConfig | null;
  if (!raw?.config || typeof raw.fetchedAt !== "number") return null;
  return raw;
}

async function setCachedConfig(config: RemoteExtensionConfig): Promise<void> {
  const entry: CachedConfig = { config, fetchedAt: Date.now() };
  await chrome.storage.local.set({ [STORAGE.REMOTE_CONFIG]: entry });
}

/** Resolve Etimad list URL from remote config or fallback */
export async function getEtimadListUrl(): Promise<string> {
  const config = await loadRemoteConfig();
  const etimad = config.portals.find((p) => p.id === "etimad") || config.portals[0];
  return etimad?.listUrl || FALLBACK_REMOTE_CONFIG.portals[0].listUrl;
}
