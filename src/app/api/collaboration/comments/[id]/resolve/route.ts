import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";

type Params = { params: Promise<{ id: string }> };

/**
 * Mark a collaboration comment as resolved.
 * Soft-fails with 501 when CollaborationComment table is not migrated.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing comment id" }, { status: 400 });
  }

  try {
    const comment = await db.collaborationComment.findUnique({
      where: { id },
      include: {
        proposal: { select: { workspaceId: true } },
      },
    });

    if (!comment || comment.proposal.workspaceId !== session.user.workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.collaborationComment.update({
      where: { id },
      data: { isResolved: true },
    });

    await audit({
      userId: session.user.id,
      action: "COLLABORATION_COMMENT_RESOLVE",
      resource: "CollaborationComment",
      resourceId: id,
      success: true,
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      comment: {
        id: updated.id,
        isResolved: updated.isResolved,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    if (isPrismaMissingTable(error)) {
      return NextResponse.json(
        {
          ok: false,
          empty: true,
          error:
            "Collaboration comments are not available on this database yet.",
        },
        { status: 501 }
      );
    }
    console.error("[collaboration/resolve]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
