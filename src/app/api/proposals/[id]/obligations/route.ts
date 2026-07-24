import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { assertWorkspaceMatch } from "@/lib/workspace-context";
import { extractObligations } from "@/lib/contract-obligations";
import { parseContractArticles } from "@/lib/contract-format";
import { parseContractArtifacts } from "@/lib/contract-artifacts";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  obligationId: z.string().min(1).max(120),
  status: z.enum(["open", "done"]),
});

const migrateSchema = z.object({
  doneIds: z.array(z.string().min(1).max(120)).max(500),
});

/** GET /api/proposals/[id]/obligations — derived rows + persisted done-state */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("session", async ({ workspace }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    if (proposal.type !== "CONTRACT") {
      throw new ApiError("Not a contract proposal", 400);
    }

    const artifacts = parseContractArtifacts(proposal.artifactsJson);
    const articles =
      artifacts.articles?.length
        ? artifacts.articles
        : parseContractArticles(proposal.contentMd ?? "");
    const derived = extractObligations(articles, artifacts.milestones);
    const states = await db.contractObligationState.findMany({
      where: { proposalId: id },
    });
    const statusById = new Map(
      states.map((s) => [s.obligationId, s.status as "open" | "done"])
    );
    const items = derived.map((row) => ({
      ...row,
      status: statusById.get(row.id) ?? row.status,
    }));

    return jsonOk({
      items,
      doneIds: items.filter((i) => i.status === "done").map((i) => i.id),
    });
  }, "proposal-obligations");
}

/** PATCH /api/proposals/[id]/obligations — set one obligation status */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    if (proposal.type !== "CONTRACT") {
      throw new ApiError("Not a contract proposal", 400);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);

    const row = await db.contractObligationState.upsert({
      where: {
        proposalId_obligationId: {
          proposalId: id,
          obligationId: parsed.data.obligationId,
        },
      },
      create: {
        proposalId: id,
        obligationId: parsed.data.obligationId,
        status: parsed.data.status,
        updatedById: userId,
      },
      update: {
        status: parsed.data.status,
        updatedById: userId,
      },
    });

    return jsonOk({ item: row });
  }, "proposal-obligations");
}

/**
 * POST /api/proposals/[id]/obligations — one-time migrate localStorage doneIds
 * Body: { doneIds: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    const proposal = await db.generatedProposal.findUnique({ where: { id } });
    if (!proposal || !assertWorkspaceMatch(proposal.workspaceId, workspace.id)) {
      throw new ApiError("not found", 404);
    }
    if (proposal.type !== "CONTRACT") {
      throw new ApiError("Not a contract proposal", 400);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = migrateSchema.safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);

    const unique = [...new Set(parsed.data.doneIds)];
    if (unique.length === 0) {
      return jsonOk({ migrated: 0 });
    }

    await db.$transaction(
      unique.map((obligationId) =>
        db.contractObligationState.upsert({
          where: {
            proposalId_obligationId: { proposalId: id, obligationId },
          },
          create: {
            proposalId: id,
            obligationId,
            status: "done",
            updatedById: userId,
          },
          update: {
            status: "done",
            updatedById: userId,
          },
        })
      )
    );

    return jsonOk({ migrated: unique.length });
  }, "proposal-obligations");
}
