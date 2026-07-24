import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import { requireWriter } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";
import { validateAndNormalizeLogoImage } from "@/lib/brand-logo";

export const dynamic = "force-dynamic";

/** POST multipart logo upload */
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  if (!brandProfile) {
    return NextResponse.json({ error: "No brand profile" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const allowedMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
  ]);
  if (!allowedMimeTypes.has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) {
    return NextResponse.json(
      { error: "PNG, JPEG, or WebP image up to 8 MiB required" },
      { status: 400 }
    );
  }

  let image: Awaited<ReturnType<typeof validateAndNormalizeLogoImage>>;
  try {
    image = await validateAndNormalizeLogoImage(
      Buffer.from(await file.arrayBuffer()),
      file.name
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid or undecodable logo image" },
      { status: 400 }
    );
  }
  if (image.mimeType !== file.type) {
    return NextResponse.json(
      { error: "Logo MIME type does not match its contents" },
      { status: 400 }
    );
  }

  const stored = await saveUpload({
    workspaceId: workspace.id,
    originalName: file.name,
    bytes: image.bytes,
  });

  const logoUrl = `/api/files?path=${encodeURIComponent(stored.storagePath)}`;
  const updated = await db.brandProfile.update({
    where: { id: brandProfile.id },
    data: { logoUrl },
  });

  await audit({
    userId: session.user.id,
    action: "BRAND_LOGO_UPLOAD",
    resource: "BrandProfile",
    resourceId: updated.id,
    details: { storagePath: stored.storagePath },
  });

  return NextResponse.json({ brandProfile: updated, logoUrl });
}
