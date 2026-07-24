"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "arabclue-dismissed-notifications";

export function useDismissedNotifications() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissedIds(readDismissedIds());
  }, []);

  const updateDismissedIds = useCallback((updater: (ids: Set<string>) => Set<string>) => {
    setDismissedIds((current) => {
      const next = updater(new Set(current));
      writeDismissedIds(next);
      return next;
    });
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      updateDismissedIds((ids) => {
        ids.add(id);
        return ids;
      });
    },
    [updateDismissedIds]
  );

  const dismissAll = useCallback(
    (ids: string[]) => {
      updateDismissedIds((current) => {
        for (const id of ids) current.add(id);
        return current;
      });
    },
    [updateDismissedIds]
  );

  const isDismissed = useCallback(
    (id: string) => dismissedIds.has(id),
    [dismissedIds]
  );

  return { dismissedIds, dismiss, dismissAll, isDismissed };
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
