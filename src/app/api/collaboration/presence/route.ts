import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

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

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
        );

        const interval = setInterval(() => {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
          );
        }, 30000);

        (request as { controller?: ReadableStreamDefaultController; interval?: ReturnType<typeof setInterval> }).controller = controller;
        (request as { controller?: ReadableStreamDefaultController; interval?: ReturnType<typeof setInterval> }).interval = interval;
      },
      cancel() {
        const req = request as { interval?: ReturnType<typeof setInterval> };
        clearInterval(req.interval);
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
    if (isPrismaMissingTable(error)) {
      return NextResponse.json({ ok: true, empty: true, degraded: true });
    }
    console.error("Presence stream error:", error);
    return NextResponse.json({ error: "Failed to open presence stream" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { proposalId, workspaceId, type, presence } = body;

    if (!proposalId || !workspaceId || !type || !presence) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return NextResponse.json({ ok: true, empty: true, degraded: true });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
