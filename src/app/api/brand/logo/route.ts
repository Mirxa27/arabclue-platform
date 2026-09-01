import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/storage";
import {
  ApiError,
  RequestValidationError,
  withTenant,
} from "@/lib/api-controller";
import { audit } from "@/lib/audit";
import { validateAndNormalizeLogoImage } from "@/lib/brand-logo";

export const dynamic = "force-dynamic";

const ALLOWED_LOGO_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/** POST multipart logo upload */
export async function POST(req: NextRequest) {
  return withTenant(
    "writer",
    async ({ session, workspace, brandProfile }) => {
      if (!brandProfile) {
        throw new ApiError("No brand profile", 400, "NO_BRAND_PROFILE");
      }

      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        throw new RequestValidationError(["file"]);
      }
      // Rejected before `arrayBuffer()` so an oversize upload is turned away
      // without a second copy of it. `validateAndNormalizeLogoImage` re-checks
      // the same 1..8 MiB range on the real buffer, so a part whose size
      // disagrees with its bytes still cannot get through — this gate only buys
      // the specific "up to 8 MiB" sentence instead of "could not be read".
      if (
        !ALLOWED_LOGO_MIME_TYPES.has(file.type) ||
        file.size < 1 ||
        file.size > MAX_LOGO_BYTES
      ) {
        throw new ApiError(
          "Unsupported logo image type or size",
          400,
          "LOGO_IMAGE_TYPE_UNSUPPORTED"
        );
      }
      const bytes = Buffer.from(await file.arrayBuffer());

      // A buffer that will not decode and one whose declared type contradicts its
      // magic bytes share a code: the reader's move is the same either way, which
      // is to re-export the file. The mismatch is still worth catching separately
      // here — it is how a polyglot image gets served back under a type the
      // browser will sniff differently.
      let image: Awaited<ReturnType<typeof validateAndNormalizeLogoImage>>;
      try {
        image = await validateAndNormalizeLogoImage(bytes, file.name);
      } catch {
        throw new ApiError(
          "Logo image is not decodable",
          400,
          "LOGO_IMAGE_UNREADABLE"
        );
      }
      if (image.mimeType !== file.type) {
        throw new ApiError(
          "Logo MIME type does not match its contents",
          400,
          "LOGO_IMAGE_UNREADABLE"
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
    },
    "[brand logo POST]"
  );
}
