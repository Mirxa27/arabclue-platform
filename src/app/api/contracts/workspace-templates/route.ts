import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonError } from "@/lib/api-controller";
import {
  createWorkspaceTemplate,
  listWorkspaceTemplates,
  workspaceTemplateSubmissionSchema,
  workspaceTemplateListQuerySchema,
} from "@/lib/contract-template-authoring";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withTenant(
    "session",
    async (ctx) => {
      const url = new URL(request.url);
      const parseResult = workspaceTemplateListQuerySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        lifecycle: url.searchParams.get("lifecycle") ?? undefined,
      });

      if (!parseResult.success) {
        return jsonError(
          parseResult.error.issues[0]?.message ?? "Invalid query parameters",
          400,
          "INVALID_QUERY_PARAMS"
        );
      }

      // A missing ContractTemplate relation, a tenant `ApiError`, or any other
      // failure propagates to `withTenant`, which maps it through the central
      // bilingual `ApiFailure` mapper (requirements 16.2, 16.7, 19.9). The route
      // never builds its own missing-schema or degraded body.
      const result = await listWorkspaceTemplates({
        workspaceId: ctx.workspace.id,
        limit: parseResult.data.limit,
        cursor: parseResult.data.cursor,
        lifecycle: parseResult.data.lifecycle,
      });

      return jsonOk({
        templates: result.templates,
        nextCursor: result.nextCursor,
        count: result.templates.length,
      });
    },
    "workspace-templates:list"
  );
}

export async function POST(request: NextRequest) {
  return withTenant(
    "writer",
    async (ctx) => {
      const body = await request.json().catch(() => null);
      if (!body) {
        return jsonError("Invalid JSON", 400, "INVALID_JSON");
      }

      const parseResult = workspaceTemplateSubmissionSchema.safeParse(body);
      if (!parseResult.success) {
        const firstError = parseResult.error.issues[0];
        const code = firstError?.path.includes("key")
          ? "INVALID_TEMPLATE_KEY"
          : "INVALID_TEMPLATE_DATA";
        return jsonError(
          firstError?.message ?? "Invalid template data",
          400,
          code
        );
      }

      const template = await createWorkspaceTemplate({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        submission: parseResult.data,
      });

      return jsonOk({ template }, { status: 201 });
    },
    "workspace-templates:create"
  );
}
