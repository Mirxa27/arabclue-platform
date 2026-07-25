"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Users, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CollaborationPresence } from "@/lib/proposal-builder-types";

const PRESENCE_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
];

export function CollaborationPresenceBar({
  proposalId,
  workspaceId,
  locale,
}: {
  proposalId: string | null;
  workspaceId: string;
  locale: string;
}) {
  const ar = locale === "ar";
  const [presenceList, setPresenceList] = useState<CollaborationPresence[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!proposalId) return;

    // SSE connection for presence updates
    const eventSource = new EventSource(
      `/api/collaboration/presence?proposalId=${proposalId}&workspaceId=${workspaceId}`
    );

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    eventSource.addEventListener("presence", (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: "join" | "leave" | "update";
          presence: CollaborationPresence;
        };

        setPresenceList((prev) => {
          if (data.type === "leave") {
            return prev.filter((p) => p.userId !== data.presence.userId);
          }
          const existing = prev.findIndex((p) => p.userId === data.presence.userId);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = data.presence;
            return updated;
          }
          return [...prev, data.presence];
        });
      } catch {
        // Ignore parse errors
      }
    });

    return () => {
      eventSource.close();
    };
  }, [proposalId, workspaceId]);

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
            title={presence.name}
          >
            {presence.name.charAt(0).toUpperCase()}
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