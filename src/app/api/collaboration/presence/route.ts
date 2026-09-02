import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorResponse, jsonApiFailure } from "@/lib/api-controller";
import {
  PRESENCE_STALE_THRESHOLD_MS,
  PRESENCE_VIEWER_CAP,
  capPresenceViewers,
} from "@/lib/collaboration-presence";

/** Presence rows older than this are pruned on every read/write. */
const STALE_THRESHOLD_MS = PRESENCE_STALE_THRESHOLD_MS;

type PresenceViewer = Readonly<{
  userId: string;
  name: string;
  avatarUrl: string | null;
  sectionKey: string | null;
  lastSeenAt: string;
}>;

async function cleanupStalePresence(proposalId: string): Promise<void> {
  const threshold = new Date(Date.now() - STALE_THRESHOLD_MS);
  await db.proposalPresence
    .deleteMany({
      where: {
        proposalId,
        lastSeenAt: { lt: threshold },
      },
    })
    .catch(() => undefined);
}

async function loadViewers(proposalId: string): Promise<{
  viewers: PresenceViewer[];
  total: number;
}> {
  const currentViewers = await db.proposalPresence.findMany({
    where: { proposalId },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const mapped = currentViewers.map((v) => ({
    userId: v.userId,
    name: v.user.name,
    avatarUrl: v.user.avatarUrl,
    sectionKey: v.sectionKey,
    lastSeenAt: v.lastSeenAt.toISOString(),
  }));
  const capped = capPresenceViewers(
    mapped.map((v) => ({ ...v, lastSeenAt: v.lastSeenAt })),
    PRESENCE_VIEWER_CAP
  );
  return {
    viewers: capped.viewers,
    total: capped.total,
  };
}

function snapshotResponse(viewers: PresenceViewer[], total: number) {
  return NextResponse.json({
    viewers,
    total,
    serverTime: new Date().toISOString(),
  });
}

/**
 * GET — durable presence snapshot for a proposal.
 * Clients poll this endpoint (≤ every 3s). Process-local SSE was removed so
 * multi-instance deployments share one Prisma-backed source of truth.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return jsonApiFailure("UNAUTHORIZED");
  }

  const { searchParams } = new URL(request.url);
  const proposalId = searchParams.get("proposalId");
  const workspaceId = searchParams.get("workspaceId");

  if (!proposalId || !workspaceId) {
    return jsonApiFailure("REQUEST_VALIDATION_FAILED", {
      fieldPaths: [!proposalId ? "proposalId" : "workspaceId"],
    });
  }

  if (workspaceId !== session.user.workspaceId) {
    return jsonApiFailure("TENANT_ACCESS_FORBIDDEN");
  }

  try {
    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== workspaceId) {
      return jsonApiFailure("RESOURCE_NOT_FOUND");
    }

    await cleanupStalePresence(proposalId);
    const { viewers, total } = await loadViewers(proposalId);
    return snapshotResponse(viewers, total);
  } catch (error) {
    return toErrorResponse(error, "collaboration:presence:get");
  }
}

/**
 * POST — join / heartbeat / leave. Heartbeats should be rate-limited by clients
 * to ~30s; every write also prunes stale rows.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return jsonApiFailure("UNAUTHORIZED");
  }

  try {
    // sendBeacon may post as text/plain; accept JSON string bodies too.
    const raw = await request.text();
    let body: {
      proposalId?: string;
      type?: string;
      sectionKey?: string | null;
    } | null = null;
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : null;
    } catch {
      body = null;
    }
    if (!body || typeof body !== "object") {
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", { fieldPaths: ["body"] });
    }
    const { proposalId, type, sectionKey } = body;

    if (!proposalId || !type) {
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", {
        fieldPaths: [!proposalId ? "proposalId" : "type"],
      });
    }

    if (!["join", "heartbeat", "leave"].includes(type)) {
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", { fieldPaths: ["type"] });
    }

    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== session.user.workspaceId) {
      // One answer for "not yours" and "not there": the id must not be a probe.
      return jsonApiFailure("RESOURCE_NOT_FOUND");
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, avatarUrl: true },
    });

    if (!user) {
      return jsonApiFailure("RESOURCE_NOT_FOUND");
    }

    await cleanupStalePresence(proposalId);

    if (type === "leave") {
      await db.proposalPresence
        .delete({
          where: {
            proposalId_userId: {
              proposalId,
              userId: session.user.id,
            },
          },
        })
        .catch(() => undefined);

      const left = await loadViewers(proposalId);
      return NextResponse.json({
        ok: true,
        type: "left",
        viewers: left.viewers,
        total: left.total,
      });
    }

    await db.proposalPresence.upsert({
      where: {
        proposalId_userId: {
          proposalId,
          userId: session.user.id,
        },
      },
      create: {
        proposalId,
        userId: session.user.id,
        workspaceId: session.user.workspaceId,
        sectionKey: sectionKey ?? null,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
        ...(sectionKey !== undefined ? { sectionKey: sectionKey ?? null } : {}),
      },
    });

    const snapshot = await loadViewers(proposalId);
    return NextResponse.json({
      ok: true,
      type: type === "join" ? "joined" : "heartbeat",
      viewers: snapshot.viewers,
      total: snapshot.total,
    });
  } catch (error) {
    return toErrorResponse(error, "collaboration:presence:post");
  }
}
