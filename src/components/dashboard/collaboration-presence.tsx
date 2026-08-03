"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, Circle } from "lucide-react";
import type { CollaborationPresence } from "@/lib/proposal-builder-types";
import { tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

const PRESENCE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
];

/** Heartbeat writes — keep under the 60s stale prune window. */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;
/** Durable snapshot poll — at most every three seconds (spec 8.6). */
const POLL_INTERVAL_MS = 3 * 1000;

type PresenceSnapshot = Readonly<{
  viewers: Array<{
    userId: string;
    name: string;
    avatarUrl?: string | null;
    sectionKey?: string | null;
    lastSeenAt?: string;
  }>;
}>;

function toPresenceList(viewers: PresenceSnapshot["viewers"]): CollaborationPresence[] {
  return viewers.map((v) => ({
    userId: v.userId,
    name: v.name,
    avatarUrl: v.avatarUrl ?? undefined,
    sectionKey: v.sectionKey ?? undefined,
  }));
}

export function CollaborationPresenceBar({
  proposalId,
  workspaceId,
  locale,
  currentSectionKey,
}: {
  proposalId: string | null;
  workspaceId: string;
  locale: string;
  currentSectionKey?: string | null;
}) {
  const loc = locale as Locale;
  const [presenceList, setPresenceList] = useState<CollaborationPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [presenceUnavailable, setPresenceUnavailable] = useState(false);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSectionKeyRef = useRef<string | null | undefined>(currentSectionKey);
  const mountedRef = useRef(true);

  const applyViewers = useCallback((viewers: PresenceSnapshot["viewers"]) => {
    if (!mountedRef.current) return;
    setPresenceList(toPresenceList(viewers));
    setIsConnected(true);
    setPresenceUnavailable(false);
  }, []);

  const markPresenceUnavailable = useCallback(() => {
    if (!mountedRef.current) return;
    setPresenceList([]);
    setIsConnected(false);
    setPresenceUnavailable(true);
  }, []);

  const sendPresence = useCallback(
    async (type: "join" | "heartbeat" | "leave", sectionKey?: string | null) => {
      if (!proposalId) return;

      try {
        const res = await fetch("/api/collaboration/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId,
            type,
            sectionKey: sectionKey ?? undefined,
          }),
        });
        if (!res.ok) {
          markPresenceUnavailable();
          return;
        }
        const data = (await res.json()) as PresenceSnapshot & { ok?: boolean };
        if (Array.isArray(data.viewers)) {
          applyViewers(data.viewers);
        }
      } catch {
        markPresenceUnavailable();
      }
    },
    [proposalId, applyViewers, markPresenceUnavailable]
  );

  const pollSnapshot = useCallback(async () => {
    if (!proposalId) return;
    try {
      const res = await fetch(
        `/api/collaboration/presence?proposalId=${encodeURIComponent(proposalId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        markPresenceUnavailable();
        return;
      }
      const data = (await res.json()) as PresenceSnapshot;
      if (Array.isArray(data.viewers)) {
        applyViewers(data.viewers);
      }
    } catch {
      markPresenceUnavailable();
    }
  }, [proposalId, workspaceId, applyViewers, markPresenceUnavailable]);

  useEffect(() => {
    if (currentSectionKey !== lastSectionKeyRef.current && isConnected) {
      lastSectionKeyRef.current = currentSectionKey;
      void sendPresence("heartbeat", currentSectionKey);
    }
  }, [currentSectionKey, isConnected, sendPresence]);

  useEffect(() => {
    if (!proposalId) return;
    mountedRef.current = true;

    void sendPresence("join", currentSectionKey);
    void pollSnapshot();

    heartbeatIntervalRef.current = setInterval(() => {
      void sendPresence("heartbeat", lastSectionKeyRef.current);
    }, HEARTBEAT_INTERVAL_MS);

    pollIntervalRef.current = setInterval(() => {
      void pollSnapshot();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      void sendPresence("leave");
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [proposalId, workspaceId, sendPresence, pollSnapshot, currentSectionKey]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (proposalId) {
        const data = JSON.stringify({
          proposalId,
          type: "leave",
        });
        navigator.sendBeacon("/api/collaboration/presence", data);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [proposalId]);

  if (!proposalId) return null;

  if (presenceUnavailable) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200"
        role="status"
      >
        <AlertCircle className="size-3.5 shrink-0" />
        <span>{tr("PRESENCE_UNAVAILABLE", loc)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2 rtl:space-x-reverse">
        {presenceList.slice(0, 5).map((presence, i) => (
          <div
            key={presence.userId}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white",
              PRESENCE_COLORS[i % PRESENCE_COLORS.length]
            )}
            title={`${presence.name}${presence.sectionKey ? ` (${presence.sectionKey})` : ""}`}
          >
            {presence.avatarUrl ? (
              <img
                src={presence.avatarUrl}
                alt={presence.name}
                className="size-full rounded-full object-cover"
              />
            ) : (
              presence.name.charAt(0).toUpperCase()
            )}
          </div>
        ))}
        {presenceList.length > 5 && (
          <div className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
            +{presenceList.length - 5}
          </div>
        )}
      </div>
      {presenceList.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {presenceList.length} {tr("presence_online", loc)}
        </span>
      )}
      {isConnected ? (
        <Circle className="size-2 fill-emerald-500 text-emerald-500" />
      ) : null}
    </div>
  );
}
