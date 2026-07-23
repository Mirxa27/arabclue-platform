import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import {
  buildBusinessProfileHTML,
  generateBusinessProfilePDF,
  loadBusinessProfile,
} from "@/lib/business-profile";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?format=pdf|html&locale=ar|en — export capability statement. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const format = req.nextUrl.searchParams.get("format") ?? "pdf";
  const localeParam = req.nextUrl.searchParams.get("locale");
  const locale = localeParam === "en" ? "en" : "ar";

  const profile = await loadBusinessProfile(workspace.id);
  const slug = workspace.slug || "company";

  if (format === "html") {
    const html = buildBusinessProfileHTML(profile, {
      locale,
      forPrint: false,
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "BusinessProfile",
      resourceId: workspace.id,
      details: { format: "html", locale },
    }).catch(() => {});
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${slug}-business-profile.html"`,
      },
    });
  }

  try {
    const pdf = await generateBusinessProfilePDF(profile, locale);
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ARTIFACT_DOWNLOAD,
      resource: "BusinessProfile",
      resourceId: workspace.id,
      details: { format: "pdf", locale },
    }).catch(() => {});
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug}-business-profile-${locale}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `PDF generation failed: ${message}`, code: "PDF_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
