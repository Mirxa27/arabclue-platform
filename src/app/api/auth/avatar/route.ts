import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { rateLimitAsync as rateLimit } from "@/lib/rate-limit";
import { validateAndNormalizeLogoImage } from "@/lib/brand-logo";

export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** POST multipart — upload profile avatar (workspace-scoped file) */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit({
      key: `avatar:${session.user.id}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPEG, or WebP images allowed" },
        { status: 400 }
      );
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Avatar must be under 2MB" }, { status: 400 });
    }

    const { workspace } = await getTenantContext(session.user.id);
    let image: Awaited<ReturnType<typeof validateAndNormalizeLogoImage>>;
    try {
      image = await validateAndNormalizeLogoImage(
        Buffer.from(await file.arrayBuffer()),
        file.name
      );
    } catch {
      return NextResponse.json(
        { error: "Invalid or undecodable avatar image" },
        { status: 400 }
      );
    }
    if (image.mimeType !== file.type || image.bytes.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "Avatar MIME type or normalized size is invalid" },
        { status: 400 }
      );
    }
    const stored = await saveUpload({
      workspaceId: workspace.id,
      originalName: `avatar-${session.user.id}-${file.name || "photo.png"}`,
      bytes: image.bytes,
    });

    const avatarUrl = `/api/files?path=${encodeURIComponent(stored.storagePath)}`;
    const updated = await db.user.update({
      where: { id: session.user.id },
      data: { avatarUrl },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        avatarUrl: true,
        mfaEnabled: true,
      },
    });

    await audit({
      userId: session.user.id,
      action: "PROFILE_UPDATE",
      resource: "User",
      resourceId: session.user.id,
      details: { fields: ["avatarUrl"] },
    });

    return NextResponse.json({ user: updated, avatarUrl });
  } catch (err) {
    console.error("[auth/avatar]", err);
    return NextResponse.json(
      { error: "Unable to update avatar" },
      { status: 500 }
    );
  }
}
