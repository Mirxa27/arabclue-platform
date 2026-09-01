import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { validateAndNormalizeLogoImage } from "@/lib/brand-logo";
import {
  jsonApiFailure,
  jsonRateLimitFailure,
} from "@/lib/api-controller";

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
      return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });
    }

    const rl = await rateLimit({
      key: `avatar:${session.user.id}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return jsonRateLimitFailure(
        describeRateLimitDenial(rl),
        "AVATAR_UPLOAD_RATE_LIMITED",
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonApiFailure("INVALID_REQUEST", { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return jsonApiFailure("INVALID_REQUEST", { status: 400 });
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      return jsonApiFailure("AVATAR_TOO_LARGE", { status: 400 });
    }

    const { workspace } = await getTenantContext(session.user.id);
    let image: Awaited<ReturnType<typeof validateAndNormalizeLogoImage>>;
    try {
      image = await validateAndNormalizeLogoImage(
        Buffer.from(await file.arrayBuffer()),
        file.name
      );
    } catch {
      return jsonApiFailure("INVALID_REQUEST", { status: 400 });
    }
    if (image.mimeType !== file.type || image.bytes.length > MAX_BYTES) {
      return jsonApiFailure("INVALID_REQUEST", { status: 400 });
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
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
