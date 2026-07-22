import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { approvalPolicySchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const policy = await db.approvalPolicy.findUnique({
      where: { workspaceId: workspace.id },
      include: {
        steps: {
          orderBy: { stepIndex: "asc" },
          include: { reviewer: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });
    return jsonOk({
      policy,
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        user: m.user,
      })),
    });
  }, "approval-policy");
}

export async function PUT(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, approvalPolicySchema);
    if (!parsed.ok) return parsed.response;

    const memberIds = new Set(
      (
        await db.workspaceMember.findMany({
          where: { workspaceId: workspace.id },
          select: { userId: true },
        })
      ).map((m) => m.userId)
    );

    for (const step of parsed.data.steps) {
      if (!memberIds.has(step.reviewerId)) {
        throw new ApiError(`Reviewer ${step.reviewerId} is not a workspace member`, 400);
      }
    }

    const policy = await db.$transaction(async (tx) => {
      const p = await tx.approvalPolicy.upsert({
        where: { workspaceId: workspace.id },
        create: { workspaceId: workspace.id },
        update: {},
      });
      await tx.approvalStep.deleteMany({ where: { policyId: p.id } });
      await tx.approvalStep.createMany({
        data: parsed.data.steps.map((s, i) => ({
          policyId: p.id,
          stepIndex: i,
          reviewerId: s.reviewerId,
          stepRole:
            s.stepRole ??
            (i === parsed.data.steps.length - 1 ? "FINAL" : "TECHNICAL"),
        })),
      });
      return tx.approvalPolicy.findUnique({
        where: { id: p.id },
        include: {
          steps: {
            orderBy: { stepIndex: "asc" },
            include: {
              reviewer: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });
    });

    await computeOnboardingSteps(workspace.id);
    return jsonOk({ policy });
  }, "approval-policy");
}
