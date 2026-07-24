import { NextRequest, NextResponse } from "next/server";
import {
  assertWorkspaceStoragePath,
  readWorkspaceStoredFile,
} from "@/lib/storage";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { createStoredFileResponsePolicy } from "@/lib/file-delivery-policy";

export const dynamic = "force-dynamic";
const MAX_DELIVERED_FILE_BYTES = 50 * 1024 * 1024;

/** GET /api/files?path=uploads/... — serve stored upload bytes (auth + workspace scoped) */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);

    const pathValues = req.nextUrl.searchParams.getAll("path");
    if (pathValues.length !== 1) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }
    let storagePath: string;
    try {
      storagePath = assertWorkspaceStoragePath(pathValues[0], workspace.id);
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    let bytes: Buffer;
    try {
      bytes = await readWorkspaceStoredFile(storagePath, workspace.id, {
        maxBytes: MAX_DELIVERED_FILE_BYTES,
      });
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
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
  } catch (err) {
    console.error("[files GET]", err);
    return NextResponse.json(
      { error: "Unable to serve file" },
      { status: 500 }
    );
  }
}
