import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { unifiedDiff } from "@/lib/proposal-studio";

export const dynamic = "force-dynamic";

// GET /api/proposals/[id]/versions/compare?a=1&b=2
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const { id } = await params;

  const proposal = await db.generatedProposal.findUnique({ where: { id } });
  if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const a = Number(req.nextUrl.searchParams.get("a"));
  const b = Number(req.nextUrl.searchParams.get("b"));
  if (!a || !b) {
    return NextResponse.json(
      { error: "a and b version numbers required" },
      { status: 400 }
    );
  }

  const versions = await db.proposalVersion.findMany({
    where: { proposalId: id, version: { in: [a, b] } },
  });
  const va = versions.find((v) => v.version === a);
  const vb = versions.find((v) => v.version === b);
  if (!va || !vb) {
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }

  return NextResponse.json({
    a: va,
    b: vb,
    contentDiff: unifiedDiff(va.contentMd, vb.contentMd),
  });
}
