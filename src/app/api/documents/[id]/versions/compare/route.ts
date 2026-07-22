import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

function unifiedDiff(a: string, b: string): string[] {
  const aLines = (a || "").split("\n");
  const bLines = (b || "").split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const left = aLines[i];
    const right = bLines[i];
    if (left === right) {
      if (left !== undefined) out.push(`  ${left}`);
    } else {
      if (left !== undefined) out.push(`- ${left}`);
      if (right !== undefined) out.push(`+ ${right}`);
    }
  }
  return out;
}

// GET /api/documents/[id]/versions/compare?a=1&b=2
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
  const doc = await db.uploadedDocument.findUnique({ where: { id } });
  if (!doc || !assertWorkspaceMatch(doc.workspaceId, workspace.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const a = Number(req.nextUrl.searchParams.get("a"));
  const b = Number(req.nextUrl.searchParams.get("b"));
  if (!a || !b) {
    return NextResponse.json({ error: "a and b version numbers required" }, { status: 400 });
  }

  const versions = await db.documentVersion.findMany({
    where: { documentId: id, version: { in: [a, b] } },
  });
  const va = versions.find((v) => v.version === a);
  const vb = versions.find((v) => v.version === b);
  if (!va || !vb) {
    return NextResponse.json({ error: "version not found" }, { status: 404 });
  }

  const summaryDiff = unifiedDiff(va.parsedSummary ?? "", vb.parsedSummary ?? "");
  const entitiesDiff = unifiedDiff(va.extractedEntities ?? "", vb.extractedEntities ?? "");

  return NextResponse.json({
    a: va,
    b: vb,
    summaryDiff,
    entitiesDiff,
  });
}
