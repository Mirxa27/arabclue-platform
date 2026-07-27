import { NextRequest, NextResponse } from "next/server";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import {
  ContractVersioningError,
  listContractVersions,
  contractVersionListQuerySchema,
} from "@/lib/contract-versioning";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: contractId } = await params;

  return withTenant(
    "session",
    async ({ workspace }) => {
      const queryParams = Object.fromEntries(
        request.nextUrl.searchParams.entries()
      );
      const parsed = contractVersionListQuerySchema.safeParse(queryParams);

      if (!parsed.success) {
        throw new ApiError(
          "Invalid query parameters.",
          400,
          "CONTRACT_VERSION_QUERY_INVALID"
        );
      }

      try {
        const result = await listContractVersions({
          contractId,
          workspaceId: workspace.id,
          cursor: parsed.data.cursor,
          take: parsed.data.take,
        });

        return jsonOk({
          schemaVersion: 1,
          contractId,
          versions: result.versions,
          nextCursor: result.nextCursor,
        });
      } catch (error) {
        if (error instanceof ContractVersioningError) {
          throw new ApiError(error.message, error.status, error.code);
        }
        throw error;
      }
    },
    "contract-versions-list"
  );
}
