import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonError } from "@/lib/api-controller";
import {
  getWorkspaceTemplate,
  updateWorkspaceTemplate,
  deleteWorkspaceTemplate,
  workspaceTemplateUpdateSchema,
} from "@/lib/contract-template-authoring";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  return withTenant(
    "session",
    async (ctx) => {
      const { id } = await params;
      const template = await getWorkspaceTemplate({
        workspaceId: ctx.workspace.id,
        templateId: id,
      });

      if (!template) {
        return jsonError("Template not found", 404, "TEMPLATE_NOT_FOUND");
      }

      return jsonOk({ template });
    },
    "workspace-templates:get"
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  return withTenant(
    "writer",
    async (ctx) => {
      const { id } = await params;
      const body = await request.json().catch(() => null);
      if (!body) {
        return jsonError("Invalid JSON", 400, "INVALID_JSON");
      }

      const parseResult = workspaceTemplateUpdateSchema.safeParse(body);
      if (!parseResult.success) {
        return jsonError(
          parseResult.error.issues[0]?.message ?? "Invalid update data",
          400,
          "INVALID_TEMPLATE_DATA"
        );
      }

      // A version conflict, missing relation, or other domain `ApiError`
      // propagates to `withTenant` for central bilingual mapping; the route
      // returns no self-built failure body (requirements 16.2, 16.7, 19.9).
      const template = await updateWorkspaceTemplate({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        templateId: id,
        update: parseResult.data,
      });

      return jsonOk({ template });
    },
    "workspace-templates:update"
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  return withTenant(
    "writer",
    async (ctx) => {
      const { id } = await params;
      const result = await deleteWorkspaceTemplate({
        workspaceId: ctx.workspace.id,
        templateId: id,
      });

      return jsonOk({
        id: result.id,
        lifecycle: result.lifecycle,
        message: "Template retired successfully",
      });
    },
    "workspace-templates:delete"
  );
}
