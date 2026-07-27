import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorResponse } from "@/lib/api-controller";

// In-memory store for SSE connections (per-process; Vercel will have one per edge function instance)
const presenceSubscribers = new Map<string, Set<ReadableStreamDefaultController>>();

// Stale threshold: 60 seconds
const STALE_THRESHOLD_MS = 60 * 1000;

/** Clean up stale presence records for a proposal */
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

/** Broadcast presence update to all SSE subscribers for a proposal */
function broadcastPresenceUpdate(
  proposalId: string,
  eventType: "join" | "leave" | "update",
  presence: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    sectionKey?: string | null;
  }
): void {
  const subscribers = presenceSubscribers.get(proposalId);
  if (!subscribers || subscribers.size === 0) return;

  const message = `event: presence\ndata: ${JSON.stringify({
    type: eventType,
    presence,
  })}\n\n`;

  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const controller of subscribers) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Controller may be closed
    }
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const proposalId = searchParams.get("proposalId");
  const workspaceId = searchParams.get("workspaceId");

  if (!proposalId || !workspaceId) {
    return NextResponse.json({ error: "Missing proposalId or workspaceId" }, { status: 400 });
  }

  if (workspaceId !== session.user.workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { id: true, workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Clean up stale presence records
    await cleanupStalePresence(proposalId);

    // Fetch current viewers
    const currentViewers = await db.proposalPresence.findMany({
      where: { proposalId },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    const viewerList = currentViewers.map((v) => ({
      userId: v.userId,
      name: v.user.name,
      avatarUrl: v.user.avatarUrl,
      sectionKey: v.sectionKey,
      lastSeenAt: v.lastSeenAt.toISOString(),
    }));

    // Create SSE stream
    let controllerRef: ReadableStreamDefaultController | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        controllerRef = controller;

        // Send connected event
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
        );

        // Send initial viewer list within 2 seconds of connect
        controller.enqueue(
          new TextEncoder().encode(
            `event: presence\ndata: ${JSON.stringify({
              type: "init",
              viewers: viewerList,
            })}\n\n`
          )
        );

        // Register subscriber
        if (!presenceSubscribers.has(proposalId)) {
          presenceSubscribers.set(proposalId, new Set());
        }
        presenceSubscribers.get(proposalId)!.add(controller);

        // Heartbeat every 30s
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
            );
          } catch {
            // Controller closed
          }
        }, 30000);
      },
      cancel() {
        // Clean up on disconnect
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (controllerRef) {
          const subscribers = presenceSubscribers.get(proposalId);
          if (subscribers) {
            subscribers.delete(controllerRef);
            if (subscribers.size === 0) {
              presenceSubscribers.delete(proposalId);
            }
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    // A missing ProposalPresence relation and every other unexpected failure
    // map through the central bilingual ApiFailure mapper: HTTP 503
    // SCHEMA_MIGRATION_PENDING (naming the relation) or a generic 500 that
    // leaks no SQL, provider payload, or tenant value (requirements 16.2,
    // 16.7, 19.10).
    return toErrorResponse(error, "collaboration:presence:get");
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await request.json().catch(() => null)) as {
      proposalId?: string;
      type?: string;
      sectionKey?: string | null;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { proposalId, type, sectionKey } = body;

    if (!proposalId || !type) {
      return NextResponse.json({ error: "Missing proposalId or type" }, { status: 400 });
    }

    if (!["join", "heartbeat", "leave"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    // Validate proposal access
    const proposal = await db.generatedProposal.findUnique({
      where: { id: proposalId },
      select: { workspaceId: true },
    });

    if (!proposal || proposal.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, avatarUrl: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (type === "join") {
      // Upsert presence record
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
          sectionKey: sectionKey ?? null,
          lastSeenAt: new Date(),
        },
      });

      // Broadcast join
      broadcastPresenceUpdate(proposalId, "join", {
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
        sectionKey: sectionKey ?? null,
      });

      return NextResponse.json({ ok: true, type: "joined" });
    }

    if (type === "heartbeat") {
      // Update lastSeenAt and optionally sectionKey
      await db.proposalPresence.update({
        where: {
          proposalId_userId: {
            proposalId,
            userId: session.user.id,
          },
        },
        data: {
          lastSeenAt: new Date(),
          ...(sectionKey !== undefined && { sectionKey: sectionKey ?? null }),
        },
      }).catch(() => {
        // If record doesn't exist, create it (user rejoining)
        return db.proposalPresence.create({
          data: {
            proposalId,
            userId: session.user.id,
            workspaceId: session.user.workspaceId,
            sectionKey: sectionKey ?? null,
            lastSeenAt: new Date(),
          },
        });
      });

      // Broadcast update if sectionKey changed
      if (sectionKey !== undefined) {
        broadcastPresenceUpdate(proposalId, "update", {
          userId: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl,
          sectionKey: sectionKey ?? null,
        });
      }

      return NextResponse.json({ ok: true, type: "heartbeat" });
    }

    if (type === "leave") {
      // Delete presence record
      await db.proposalPresence
        .delete({
          where: {
            proposalId_userId: {
              proposalId,
              userId: session.user.id,
            },
          },
        })
        .catch(() => undefined); // Ignore if doesn't exist

      // Broadcast leave
      broadcastPresenceUpdate(proposalId, "leave", {
        userId: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      });

      return NextResponse.json({ ok: true, type: "left" });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Persistence failures (including a missing ProposalPresence relation) map
    // through the central bilingual ApiFailure mapper rather than a route-local
    // body (requirements 16.2, 16.7, 19.10).
    return toErrorResponse(error, "collaboration:presence:post");
  }
}
