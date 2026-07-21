import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/compliance?projectId=...
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const { workspace } = await getBootstrapContext();

  const where = projectId
    ? { projectId }
    : { project: { workspaceId: workspace.id } };

  const checks = await db.complianceCheck.findMany({
    where,
    orderBy: [{ framework: "asc" }, { controlId: "asc" }],
  });

  // Group by framework
  const grouped: Record<string, typeof checks> = {};
  for (const c of checks) {
    if (!grouped[c.framework]) grouped[c.framework] = [];
    grouped[c.framework].push(c);
  }

  const summary = {
    total: checks.length,
    compliant: checks.filter((c) => c.status === "COMPLIANT").length,
    partial: checks.filter((c) => c.status === "PARTIAL").length,
    nonCompliant: checks.filter((c) => c.status === "NON_COMPLIANT").length,
    pending: checks.filter((c) => c.status === "PENDING").length,
    na: checks.filter((c) => c.status === "NOT_APPLICABLE").length,
  };

  return NextResponse.json({ grouped, summary });
}
