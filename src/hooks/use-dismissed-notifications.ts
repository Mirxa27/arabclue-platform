"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "arabclue-dismissed-notifications";

/**
 * Cross-device notification dismissals via server, with localStorage as
 * optimistic cache + one-time migration of legacy local-only dismissals.
 */
export function useDismissedNotifications() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readDismissedIds();
      if (!cancelled) setDismissedIds(local);

      try {
        const res = await fetch("/api/notifications/dismiss");
        if (res.ok) {
          const data = (await res.json()) as { ids?: string[] };
          const serverIds = Array.isArray(data.ids) ? data.ids : [];
          const merged = new Set([...local, ...serverIds]);

          // Migrate legacy local-only ids to server
          const toMigrate = [...local].filter((id) => !serverIds.includes(id));
          if (toMigrate.length > 0) {
            await fetch("/api/notifications/dismiss", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: toMigrate }),
            });
          }

          if (!cancelled) {
            setDismissedIds(merged);
            writeDismissedIds(merged);
          }
        }
      } catch {
        /* keep local cache */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateDismissedIds = useCallback(
    (updater: (ids: Set<string>) => Set<string>) => {
      setDismissedIds((current) => {
        const next = updater(new Set(current));
        writeDismissedIds(next);
        return next;
      });
    },
    []
  );

  const persistServer = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await fetch("/api/notifications/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      /* optimistic local still applied */
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      updateDismissedIds((ids) => {
        ids.add(id);
        return ids;
      });
      void persistServer([id]);
    },
    [persistServer, updateDismissedIds]
  );

  const dismissAll = useCallback(
    (ids: string[]) => {
      updateDismissedIds((current) => {
        for (const id of ids) current.add(id);
        return current;
      });
      void persistServer(ids);
    },
    [persistServer, updateDismissedIds]
  );

  const isDismissed = useCallback(
    (id: string) => dismissedIds.has(id),
    [dismissedIds]
  );

  return { dismissedIds, dismiss, dismissAll, isDismissed, hydrated };
}

function readDismissedIds() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function writeDismissedIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}
