import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authOptions } from "@/lib/auth";
import {
  EXTENSION_ZIP_RELATIVE,
  packExtensionZipToBuffer,
} from "@/lib/extension-pack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated download of the ArabClue Voice Agent Chrome extension ZIP.
 * Prefers a pre-packed public artifact; falls back to on-the-fly packing.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publicZip = path.join(process.cwd(), "public", EXTENSION_ZIP_RELATIVE);
    const bytes = existsSync(publicZip)
      ? await readFile(publicZip)
      : await packExtensionZipToBuffer();

    // Copy into a fresh ArrayBuffer-backed view for NextResponse BodyInit typing.
    const body = Uint8Array.from(bytes);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="arabclue-voice-agent.zip"',
        "Cache-Control": "private, max-age=300",
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to pack extension",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
