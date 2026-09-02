import { NextResponse } from "next/server";
import { jsonApiFailure } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  compileBilingualBusinessProfile,
  loadBusinessProfile,
} from "@/lib/business-profile";

export const dynamic = "force-dynamic";

/** GET — bilingual business profile snapshot assembled from onboarding knowledge. */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("UNAUTHORIZED", { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const profile = await loadBusinessProfile(workspace.id);
  const strict = compileBilingualBusinessProfile(profile, "strict");
  const draft = compileBilingualBusinessProfile(profile, "draft");

  return NextResponse.json({
    profile,
    bilingualExport: {
      strict: {
        canExport: strict.canExport,
        diagnosticCount: strict.diagnostics.length,
        blocking: strict.blockingDiagnostics.map((d) => ({
          code: d.code,
          path: d.path,
          message: d.message,
          severity: d.severity,
        })),
      },
      draft: {
        canExport: draft.canExport,
        diagnosticCount: draft.diagnostics.length,
        warningCount: draft.diagnostics.filter((d) => d.severity === "warning")
          .length,
      },
    },
  });
}
