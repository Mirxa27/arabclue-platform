#!/usr/bin/env node
/**
 * Ensure public/downloads/arabclue-voice-agent.zip exists before next build.
 * Prefers a pre-packed artifact (Hostinger npm builds); otherwise runs pack via bun.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zipPath = path.join(
  root,
  "public",
  "downloads",
  "arabclue-voice-agent.zip",
);

if (existsSync(zipPath)) {
  console.log(`[ensure-extension-packed] using existing ${zipPath}`);
  process.exit(0);
}

const bun = process.platform === "win32" ? "bun.exe" : "bun";
const pack = spawnSync(bun, ["scripts/pack-extension.mjs"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

if (pack.status !== 0) {
  console.error(
    "[ensure-extension-packed] missing extension zip and bun pack failed. Run `bun run pack:extension` before deploy.",
  );
  process.exit(pack.status ?? 1);
}
