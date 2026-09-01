import { db } from "@/lib/db";

export async function getOrCreateMission(opts: {
  workspaceId: string;
  userId: string;
  locale?: "ar" | "en";
  activeProjectId?: string | null;
}) {
  const existing = await db.copilotMission.findFirst({
    where: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      status: "ACTIVE",
    },
    orderBy: { lastActivityAt: "desc" },
  });
  if (existing) {
    if (
      opts.activeProjectId !== undefined &&
      opts.activeProjectId !== existing.activeProjectId
    ) {
      return db.copilotMission.update({
        where: { id: existing.id },
        data: {
          activeProjectId: opts.activeProjectId,
          lastActivityAt: new Date(),
        },
      });
    }
    return existing;
  }

  return db.copilotMission.create({
    data: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      locale: opts.locale ?? "ar",
      activeProjectId: opts.activeProjectId ?? null,
      title: "Mission Control",
      status: "ACTIVE",
    },
  });
}

/**
 * A mission id from the client is a claim, not a fact.
 *
 * `syncMissionTranscript` starts with `deleteMany({ where: { missionId } })`
 * and no workspace predicate, so whoever picks the id picks whose transcript
 * gets replaced. The requested id is honoured only when it names a mission this
 * user owns in this workspace; anything else becomes the caller's own active
 * mission. Silently on purpose: refusing with 404 would tell a caller which
 * other-tenant ids exist.
 */
export async function resolveOwnedMissionId(opts: {
  requested: unknown;
  workspaceId: string;
  userId: string;
  fallbackId: string;
}): Promise<string> {
  const requested = opts.requested;
  if (typeof requested !== "string" || !requested) return opts.fallbackId;
  if (requested === opts.fallbackId) return opts.fallbackId;
  const owned = await db.copilotMission.findFirst({
    where: { id: requested, workspaceId: opts.workspaceId, userId: opts.userId },
    select: { id: true },
  });
  return owned?.id ?? opts.fallbackId;
}

export async function touchMission(missionId: string) {
  return db.copilotMission.update({
    where: { id: missionId },
    data: { lastActivityAt: new Date() },
  });
}

export async function appendMissionMessage(opts: {
  missionId: string;
  userId?: string | null;
  role: "user" | "assistant" | "system";
  parts: unknown;
}) {
  const row = await db.copilotMessage.create({
    data: {
      missionId: opts.missionId,
      userId: opts.userId ?? null,
      role: opts.role,
      partsJson: JSON.stringify(opts.parts),
    },
  });
  await touchMission(opts.missionId);
  return row;
}

export async function recordMissionAction(opts: {
  missionId: string;
  workspaceId: string;
  userId: string;
  toolName: string;
  status?: "RUNNING" | "SUCCEEDED" | "FAILED" | "UNDONE";
  input?: unknown;
  output?: unknown;
  errorText?: string;
  reversible?: boolean;
}) {
  return db.copilotAction.create({
    data: {
      missionId: opts.missionId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      toolName: opts.toolName,
      status: opts.status ?? "RUNNING",
      inputJson: opts.input == null ? null : JSON.stringify(opts.input),
      outputJson: opts.output == null ? null : JSON.stringify(opts.output),
      errorText: opts.errorText,
      reversible: opts.reversible ?? false,
    },
  });
}

export async function completeMissionAction(
  actionId: string,
  opts: {
    status: "SUCCEEDED" | "FAILED" | "UNDONE";
    output?: unknown;
    errorText?: string;
  }
) {
  return db.copilotAction.update({
    where: { id: actionId },
    data: {
      status: opts.status,
      outputJson: opts.output == null ? undefined : JSON.stringify(opts.output),
      errorText: opts.errorText,
    },
  });
}

export async function loadMissionBundle(missionId: string, workspaceId: string) {
  return db.copilotMission.findFirst({
    where: { id: missionId, workspaceId },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 200 },
      attachments: { orderBy: { createdAt: "desc" }, take: 50 },
      actions: { orderBy: { createdAt: "desc" }, take: 80 },
    },
  });
}
