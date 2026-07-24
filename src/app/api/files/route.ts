import { NextRequest, NextResponse } from "next/server";
import { readStoredFile, fileExists } from "@/lib/storage";
import { requireSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import path from "path";

export const dynamic = "force-dynamic";

/** GET /api/files?path=uploads/... — serve stored upload bytes (auth + workspace scoped) */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { workspace } = await getTenantContext(session.user.id);

    const storagePath = req.nextUrl.searchParams.get("path");
    if (
      !storagePath ||
      storagePath.includes("..") ||
      !storagePath.startsWith("uploads/")
    ) {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }

    // Enforce tenant prefix: uploads/{workspaceId}/...
    const allowedPrefix = `uploads/${workspace.id}/`;
    if (!storagePath.startsWith(allowedPrefix)) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    if (!(await fileExists(storagePath))) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const bytes = await readStoredFile(storagePath);
    const ext = path.extname(storagePath).toLowerCase();
    const types: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".html": "text/html",
      ".htm": "text/html",
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    const download = req.nextUrl.searchParams.get("download") === "1";
    const name =
      req.nextUrl.searchParams.get("name") || path.basename(storagePath);
    const headers: Record<string, string> = {
      "Content-Type": types[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    };
    if (download) {
      headers["Content-Disposition"] = `attachment; filename="${name.replace(/"/g, "")}"`;
    }
    return new NextResponse(new Uint8Array(bytes), { headers });
  } catch (err) {
    console.error("[files GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
