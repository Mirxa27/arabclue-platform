import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonApiFailure, withTenant } from "@/lib/api-controller";
import {
  PRESENCE_STALE_THRESHOLD_MS,
  PRESENCE_VIEWER_CAP,
  capPresenceViewers,
  presenceEventSchema,
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
  // The tenant is resolved server-side from the session's membership, not
  // read off the JWT claim: the claim is refreshed lazily and a stale or
  // forged workspaceId must never pick the tenant a presence row is read from.
  return withTenant("session", async ({ workspace }) => {
    const { searchParams } = new URL(request.url);
    const proposalId = searchParams.get("proposalId");
    const workspaceId = searchParams.get("workspaceId");

    if (!proposalId || !workspaceId) {
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", {
        fieldPaths: [!proposalId ? "proposalId" : "workspaceId"],
      });
    }

    // The client echoes the workspace it believes it is in; a mismatch is a
    // stale tab, refused rather than silently served from the real tenant.
    if (workspaceId !== workspace.id) {
      return jsonApiFailure("TENANT_ACCESS_FORBIDDEN");
    }

    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== workspace.id) {
      return jsonApiFailure("RESOURCE_NOT_FOUND");
    }

    await cleanupStalePresence(proposalId);
    const { viewers, total } = await loadViewers(proposalId);
    return snapshotResponse(viewers, total);
  }, "collaboration:presence:get");
}

/**
 * POST — join / heartbeat / leave. Heartbeats should be rate-limited by clients
 * to ~30s; every write also prunes stale rows.
 */
export async function POST(request: NextRequest) {
  return withTenant("session", async ({ workspace, userId }) => {
    // sendBeacon may post as text/plain; accept JSON string bodies too.
    const raw = await request.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    const parsed = presenceEventSchema.safeParse(json);
    if (!parsed.success) {
      const fieldPaths = parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join(".") : "body"
      );
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", {
        fieldPaths: fieldPaths.length > 0 ? fieldPaths : ["body"],
      });
    }
    const { proposalId, type, sectionKey } = parsed.data;

    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== workspace.id) {
      // One answer for "not yours" and "not there": the id must not be a probe.
      return jsonApiFailure("RESOURCE_NOT_FOUND");
    }

    const user = await db.user.findUnique({
      where: { id: userId },
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
              userId,
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
          userId,
        },
      },
      create: {
        proposalId,
        userId,
        workspaceId: workspace.id,
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
  }, "collaboration:presence:post");
}
