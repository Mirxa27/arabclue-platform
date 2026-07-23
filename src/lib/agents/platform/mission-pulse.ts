/**
 * Mission Pulse — live analytics over a Mission Control session.
 * Pure computation is separated from the DB loader so it stays unit-testable
 * (the Prisma client is imported lazily inside `loadMissionPulse`).
 */

export type PulseAttachmentRow = {
  source: string;
  docCategory: string;
  routeStatus: string;
  confidence: number;
  createdAt: Date;
};

export type PulseActionRow = {
  toolName: string;
  status: string;
  createdAt: Date;
};

export type MissionPulse = {
  attachments: {
    total: number;
    bySource: Record<string, number>;
    byCategory: Record<string, number>;
    byRouteStatus: Record<string, number>;
    avgConfidence: number;
    needsClarification: number;
  };
  actions: {
    total: number;
    succeeded: number;
    failed: number;
    running: number;
    undone: number;
    topTools: Array<{ tool: string; count: number }>;
  };
  activity: {
    lastActivityAt: string | null;
    capturesLastHour: number;
    extensionCaptures: number;
  };
  health: "thriving" | "active" | "idle";
};

function tally<T>(rows: T[], key: (row: T) => string) {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row) || "unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function computeMissionPulse(input: {
  attachments: PulseAttachmentRow[];
  actions: PulseActionRow[];
  lastActivityAt?: Date | null;
  now?: Date;
}): MissionPulse {
  const now = input.now ?? new Date();
  const hourAgo = now.getTime() - 60 * 60 * 1000;

  const byStatus = tally(input.actions, (a) => a.status);
  const toolCounts = tally(input.actions, (a) => a.toolName);
  const topTools = Object.entries(toolCounts)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const attachmentsTotal = input.attachments.length;
  const avgConfidence = attachmentsTotal
    ? input.attachments.reduce((sum, a) => sum + (a.confidence || 0), 0) /
      attachmentsTotal
    : 0;

  const capturesLastHour = input.attachments.filter(
    (a) => a.createdAt.getTime() >= hourAgo
  ).length;
  const extensionCaptures = input.attachments.filter(
    (a) => a.source === "browser"
  ).length;

  const recentActions = input.actions.filter(
    (a) => a.createdAt.getTime() >= hourAgo
  ).length;
  const health: MissionPulse["health"] =
    capturesLastHour + recentActions >= 5
      ? "thriving"
      : capturesLastHour + recentActions >= 1
        ? "active"
        : "idle";

  return {
    attachments: {
      total: attachmentsTotal,
      bySource: tally(input.attachments, (a) => a.source),
      byCategory: tally(input.attachments, (a) => a.docCategory),
      byRouteStatus: tally(input.attachments, (a) => a.routeStatus),
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      needsClarification:
        tally(input.attachments, (a) => a.routeStatus)["NEEDS_CLARIFICATION"] ??
        0,
    },
    actions: {
      total: input.actions.length,
      succeeded: byStatus["SUCCEEDED"] ?? 0,
      failed: byStatus["FAILED"] ?? 0,
      running: byStatus["RUNNING"] ?? 0,
      undone: byStatus["UNDONE"] ?? 0,
      topTools,
    },
    activity: {
      lastActivityAt: input.lastActivityAt?.toISOString() ?? null,
      capturesLastHour,
      extensionCaptures,
    },
    health,
  };
}

/** Spoken-friendly one-liner the voice agent can narrate. */
export function narrateMissionPulse(
  pulse: MissionPulse,
  locale: "ar" | "en"
): string {
  const { attachments, actions, health } = pulse;
  if (locale === "ar") {
    const healthAr =
      health === "thriving" ? "نشطة جداً" : health === "active" ? "نشطة" : "هادئة";
    return (
      `المهمة ${healthAr}: ${attachments.total} مستند مُدخل ` +
      `(${attachments.needsClarification} يحتاج توضيحاً)، ` +
      `${actions.succeeded} أداة نجحت و${actions.failed} فشلت.`
    );
  }
  return (
    `Mission is ${health}: ${attachments.total} documents ingested ` +
    `(${attachments.needsClarification} need clarification), ` +
    `${actions.succeeded} tool runs succeeded, ${actions.failed} failed.`
  );
}

export async function loadMissionPulse(
  missionId: string,
  workspaceId: string
): Promise<MissionPulse | null> {
  const { db } = await import("@/lib/db");
  const mission = await db.copilotMission.findFirst({
    where: { id: missionId, workspaceId },
    select: {
      lastActivityAt: true,
      attachments: {
        select: {
          source: true,
          docCategory: true,
          routeStatus: true,
          confidence: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      },
      actions: {
        select: { toolName: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      },
    },
  });
  if (!mission) return null;
  return computeMissionPulse({
    attachments: mission.attachments,
    actions: mission.actions,
    lastActivityAt: mission.lastActivityAt,
  });
}
