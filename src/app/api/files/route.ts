import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkspaceStoragePath,
  readWorkspaceStoredFile,
} from "@/lib/storage";
import {
  RequestValidationError,
  ResourceNotFoundError,
  withTenant,
} from "@/lib/api-controller";
import { createStoredFileResponsePolicy } from "@/lib/file-delivery-policy";

export const dynamic = "force-dynamic";
const MAX_DELIVERED_FILE_BYTES = 50 * 1024 * 1024;

/** GET /api/files?path=uploads/... — serve stored upload bytes (auth + workspace scoped) */
export async function GET(req: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const pathValues = req.nextUrl.searchParams.getAll("path");
      if (pathValues.length !== 1) {
        throw new RequestValidationError(["path"]);
      }

      // Both rejections answer the same 404 on purpose: a rejected path is a traversal
      // attempt, and answering it differently from a genuinely absent file tells
      // the caller which guesses landed inside the workspace.
      let storagePath: string;
      try {
        storagePath = assertWorkspaceStoragePath(pathValues[0], workspace.id);
      } catch {
        throw new ResourceNotFoundError();
      }

      let bytes: Buffer;
      try {
        bytes = await readWorkspaceStoredFile(storagePath, workspace.id, {
          maxBytes: MAX_DELIVERED_FILE_BYTES,
        });
      } catch {
        throw new ResourceNotFoundError();
      }

      const policy = createStoredFileResponsePolicy(
        storagePath,
        req.nextUrl.searchParams.get("name"),
        req.nextUrl.searchParams.get("download") === "1"
      );
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          ...policy.headers,
          "Content-Length": String(bytes.length),
        },
      });
    },
    "[files GET]"
  );
}
