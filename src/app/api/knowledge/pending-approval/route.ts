import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

const pendingReviewWhere = {
  OR: [
    { approved: false },
    { reviewStatus: { not: "APPROVED" as const } },
    { revokedAt: { not: null } },
    { evidenceRef: null },
    { provenanceJson: null },
    { reviewedById: null },
    { approvedAt: null },
    { contentHash: null },
  ],
};

/**
 * GET /api/knowledge/pending-approval
 * Lists knowledge items awaiting approval for workspace reviewers/owners.
 */
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const [certificates, pastProjects, library, methodologies] =
      await Promise.all([
        db.certificate.findMany({
          where: {
            workspaceId: workspace.id,
            ...pendingReviewWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.pastProject.findMany({
          where: {
            workspaceId: workspace.id,
            ...pendingReviewWhere,
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.contentLibraryItem.findMany({
          where: { workspaceId: workspace.id, ...pendingReviewWhere },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.methodologyAsset.findMany({
          where: { workspaceId: workspace.id, ...pendingReviewWhere },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
      ]);

    return jsonOk({
      certificates,
      pastProjects,
      library,
      methodologies,
      counts: {
        certificates: certificates.length,
        pastProjects: pastProjects.length,
        library: library.length,
        methodologies: methodologies.length,
        total:
          certificates.length +
          pastProjects.length +
          library.length +
          methodologies.length,
      },
    });
  }, "knowledge-pending-approval");
}
