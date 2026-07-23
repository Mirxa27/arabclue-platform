import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/platform-agent/extension
 * Install metadata for the in-app smart installer.
 */
export async function GET() {
  const manifestPath = path.join(
    process.cwd(),
    "extensions",
    "arabclue-agent",
    "manifest.json"
  );
  let version = "1.0.0";
  let name = "ArabClue Voice Agent";
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        version?: string;
        name?: string;
      };
      version = raw.version || version;
      name = raw.name || name;
    } catch {
      /* keep defaults */
    }
  }

  return NextResponse.json({
    ok: true,
    name,
    version,
    downloadUrl: "/api/platform-agent/extension/download",
    downloadPath: "/downloads/arabclue-voice-agent.zip",
    steps: [
      "download",
      "unzip",
      "open_extensions",
      "developer_mode",
      "load_unpacked",
      "verify",
    ],
    folderHint: "arabclue-voice-agent (unzipped) / arabclue-agent",
  });
}
