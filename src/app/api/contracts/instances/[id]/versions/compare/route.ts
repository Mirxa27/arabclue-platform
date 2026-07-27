import { NextRequest, NextResponse } from "next/server";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import {
  ContractVersioningError,
  compareContractRevisions,
  contractRevisionCompareQuerySchema,
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
      const parsed = contractRevisionCompareQuerySchema.safeParse(queryParams);

      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new ApiError(
          `Invalid comparison parameters: ${issues}`,
          400,
          "CONTRACT_REVISION_COMPARISON_INVALID"
        );
      }

      try {
        const comparison = await compareContractRevisions({
          contractId,
          workspaceId: workspace.id,
          revA: parsed.data.a,
          revB: parsed.data.b,
        });

        return jsonOk({
          schemaVersion: 1,
          comparison,
        });
      } catch (error) {
        if (error instanceof ContractVersioningError) {
          throw new ApiError(error.message, error.status, error.code);
        }
        throw error;
      }
    },
    "contract-versions-compare"
  );
}
