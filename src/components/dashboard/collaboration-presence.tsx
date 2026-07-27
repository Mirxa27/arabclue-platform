"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { Circle } from "lucide-react";
import type { CollaborationPresence } from "@/lib/proposal-builder-types";

const PRESENCE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
];

// Heartbeat interval: 30 seconds
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

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
  const ar = locale === "ar";
  const [presenceList, setPresenceList] = useState<CollaborationPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSectionKeyRef = useRef<string | null | undefined>(currentSectionKey);

  // Send presence update to server
  const sendPresence = useCallback(
    async (type: "join" | "heartbeat" | "leave", sectionKey?: string | null) => {
      if (!proposalId) return;

      try {
        await fetch("/api/collaboration/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId,
            type,
            sectionKey: sectionKey ?? undefined,
          }),
        });
      } catch {
        // Ignore errors silently
      }
    },
    [proposalId]
  );

  // Track section key changes and send heartbeat with update
  useEffect(() => {
    if (currentSectionKey !== lastSectionKeyRef.current && isConnected) {
      lastSectionKeyRef.current = currentSectionKey;
      sendPresence("heartbeat", currentSectionKey);
    }
  }, [currentSectionKey, isConnected, sendPresence]);

  useEffect(() => {
    if (!proposalId) return;

    // Join presence
    sendPresence("join", currentSectionKey);

    // SSE connection for presence updates
    const eventSource = new EventSource(
      `/api/collaboration/presence?proposalId=${proposalId}&workspaceId=${workspaceId}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    // Handle initial viewer list
    eventSource.addEventListener("presence", (event) => {
      try {
        const data = JSON.parse(event.data) as
          | {
              type: "init";
              viewers: Array<{
                userId: string;
                name: string;
                avatarUrl?: string | null;
                sectionKey?: string | null;
                lastSeenAt: string;
              }>;
            }
          | {
              type: "join" | "leave" | "update";
              presence: CollaborationPresence;
            };

        if (data.type === "init") {
          // Initial viewer list from server
          setPresenceList(
            data.viewers.map((v) => ({
              userId: v.userId,
              name: v.name,
              avatarUrl: v.avatarUrl ?? undefined,
              sectionKey: v.sectionKey ?? undefined,
            }))
          );
        } else if (data.type === "leave") {
          setPresenceList((prev) => prev.filter((p) => p.userId !== data.presence.userId));
        } else if (data.type === "join" || data.type === "update") {
          setPresenceList((prev) => {
            const existing = prev.findIndex((p) => p.userId === data.presence.userId);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = data.presence;
              return updated;
            }
            return [...prev, data.presence];
          });
        }
      } catch {
        // Ignore parse errors
      }
    });

    // Heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      sendPresence("heartbeat", lastSectionKeyRef.current);
    }, HEARTBEAT_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      // Send leave signal
      sendPresence("leave");

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [proposalId, workspaceId, sendPresence, currentSectionKey]);

  // Send leave on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (proposalId) {
        // Use sendBeacon for reliable delivery on page unload
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
          {presenceList.length} {ar ? "متصل" : "online"}
        </span>
      )}
      <Circle
        className={cn(
          "size-2",
          isConnected ? "fill-emerald-500 text-emerald-500" : "fill-muted-foreground text-muted-foreground"
        )}
      />
    </div>
  );
}
