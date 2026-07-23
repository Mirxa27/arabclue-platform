import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { loadBusinessProfile } from "@/lib/business-profile";

export const dynamic = "force-dynamic";

/** GET — bilingual business profile snapshot assembled from onboarding knowledge. */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const profile = await loadBusinessProfile(workspace.id);
  return NextResponse.json({ profile });
}
