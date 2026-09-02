import { NextRequest, NextResponse } from "next/server";
import { withTenant, jsonOk, jsonApiFailure, ApiError } from "@/lib/api-controller";
import {
  ContractVersioningError,
  getContractVersion,
} from "@/lib/contract-versioning";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; revision: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id: contractId, revision: revisionStr } = await params;
  const revision = parseInt(revisionStr, 10);

  if (!Number.isFinite(revision) || revision < 1) {
    return jsonApiFailure("CONTRACT_REVISION_INVALID", { status: 400 });
  }

  return withTenant(
    "session",
    async ({ workspace }) => {
      try {
        const version = await getContractVersion({
          contractId,
          workspaceId: workspace.id,
          revision,
        });

        return jsonOk({
          schemaVersion: 1,
          version,
        });
      } catch (error) {
        if (error instanceof ContractVersioningError) {
          throw new ApiError(error.message, error.status, error.code);
        }
        throw error;
      }
    },
    "contract-version-get"
  );
}
