import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/workspaces — current workspace + members
export async function GET() {
  const { workspace } = await getBootstrapContext();
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
    include: { user: { select: { id: true, name: true, email: true, role: true, locale: true, mfaEnabled: true } } },
  });
  return NextResponse.json({
    workspace,
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    })),
  });
}
