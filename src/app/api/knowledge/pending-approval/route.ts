import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

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
            OR: [{ approved: false }, { revokedAt: { not: null } }],
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.pastProject.findMany({
          where: {
            workspaceId: workspace.id,
            OR: [{ approved: false }, { revokedAt: { not: null } }],
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.contentLibraryItem.findMany({
          where: { workspaceId: workspace.id, approved: false },
          orderBy: { updatedAt: "desc" },
          take: 50,
        }),
        db.methodologyAsset.findMany({
          where: { workspaceId: workspace.id, approved: false },
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
