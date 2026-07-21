import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  generateProposalPDF,
  generateComplianceMatrixXLSX,
  generateBoQXLSX,
  generateSlidesHTML,
  generateBidPackageZIP,
} from "@/lib/generators";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/proposals/[id]/download?format=zip|pdf|xlsx-matrix|xlsx-boq|slides
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getBootstrapContext();
  const format = req.nextUrl.searchParams.get("format") ?? "zip";

  const proposal = await db.generatedProposal.findUnique({
    where: { id },
    include: { project: true, workspace: { include: { brandProfiles: true } } },
  });
  if (!proposal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const brand = proposal.workspace.brandProfiles[0] ?? null;

  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
    resource: "GeneratedProposal",
    resourceId: id,
    details: { format },
  });

  let buffer: Buffer;
  let contentType: string;
  let filename: string;

  switch (format) {
    case "pdf":
      buffer = await generateProposalPDF(proposal, proposal.project, brand);
      contentType = "text/html";
      filename = "Technical_Proposal.html";
      break;
    case "xlsx-matrix":
      buffer = await generateComplianceMatrixXLSX(proposal.project, brand);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = "Compliance_Matrix.xlsx";
      break;
    case "xlsx-boq":
      buffer = await generateBoQXLSX(proposal.project, brand);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = "Financial_BoQ.xlsx";
      break;
    case "slides":
      buffer = Buffer.from(generateSlidesHTML(proposal, proposal.project, brand), "utf8");
      contentType = "text/html";
      filename = "Technical_Proposal_Slides.html";
      break;
    case "zip":
    default:
      buffer = await generateBidPackageZIP(proposal, proposal.project, brand);
      contentType = "application/zip";
      filename = "Arabclue_Bid_Package.zip";
      break;
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
  });
}
