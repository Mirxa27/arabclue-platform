#!/usr/bin/env node
/**
 * Pre-deploy build gate (Kiro PreToolUse hook).
 *
 * Purpose:
 *   Fires before a terminal command runs. When that command is a *deploy*
 *   (Vercel CLI, or a `deploy` package script), it runs the project build
 *   FIRST and BLOCKS the deploy (exit 2) if the build fails. Non-deploy
 *   commands pass straight through (exit 0) without building.
 *
 * Nothing is hardcoded to a machine or absolute path:
 *   - the build is invoked via the package.json "build" script (single source
 *     of truth for what "build" means);
 *   - the project root is derived from this file's location, not from cwd;
 *   - the bun binary is resolved from PATH, falling back to $HOME/.bun/bin/bun
 *     (the documented location in AGENTS.md);
 *   - deploy detection lives in the two config lists below — edit those in one
 *     place to change behaviour everywhere.
 *
 * Exit codes (Kiro PreToolUse semantics):
 *   0 -> allow the command (build passed, or not a deploy)
 *   2 -> block the command (build failed, or gate misconfigured)
 *
 * Testing without triggering a real build:
 *   PREDEPLOY_GATE_DRYRUN=1 — reports `deployDetected=0|1` and exits 0.
 *
 * All human-readable output goes to stderr so stdout stays clean (Kiro may
 * parse a PreToolUse hook's stdout as a JSON permission decision).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Deploy-detection config — the single place to tune what counts as a deploy.
// ---------------------------------------------------------------------------

/** Command fragments that always count as a deploy. */
const DEPLOY_PATTERNS = [
  /\bvercel\s+deploy\b/i,
  /\bvercel\b[^\n]*--prod\b/i,
  /\bvercel\b[^\n]*--prebuilt\b/i,
  /\b(?:npx|bunx)\s+vercel\s+deploy\b/i,
  /\b(?:npx|bunx)\s+vercel\b[^\n]*--prod\b/i,
  /\b(?:bun|npm|pnpm|yarn)\s+run\s+deploy\b/i,
];

/**
 * A bare `vercel <subcommand>` invocation is treated as a deploy (the CLI's
 * default action is a deploy) UNLESS the subcommand is one of these read-only
 * / non-deploy operations.
 */
const NON_DEPLOY_VERCEL_SUBCOMMANDS = new Set([
  "dev", "build", "env", "link", "login", "logout", "pull", "logs", "log",
  "ls", "list", "inspect", "whoami", "teams", "team", "secrets", "certs",
  "cert", "alias", "domains", "dns", "git", "projects", "project", "switch",
  "help", "version", "rollback", "bisect", "telemetry", "cache",
]);

// ---------------------------------------------------------------------------

const log = (msg) => process.stderr.write(`[predeploy-gate] ${msg}\n`);

/** Decide whether a single command string is a deploy command. */
function isDeployCommand(cmd) {
  if (!cmd || typeof cmd !== "string") return false;

  for (const re of DEPLOY_PATTERNS) {
    if (re.test(cmd)) return true;
  }

  // Bare `vercel [subcommand]` at a command boundary. Default action deploys.
  const match = cmd.match(/(?:^|[\s;&|(])vercel(?:\s+([a-z][a-z-]*|--\S+))?/i);
  if (match) {
    const token = (match[1] || "").toLowerCase();
    if (!token) return true; // just `vercel`
    if (token.startsWith("--")) return true; // e.g. `vercel --prod`
    if (!NON_DEPLOY_VERCEL_SUBCOMMANDS.has(token)) return true;
  }

  return false;
}

/** Pull every `command` string out of an arbitrary hook payload object. */
function extractCommands(payload) {
  const found = [];
  const visit = (value) => {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, val] of Object.entries(value)) {
      if (key === "command" && typeof val === "string") found.push(val);
      else visit(val);
    }
  };
  visit(payload);
  return found;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Resolve a usable bun binary without hardcoding an absolute machine path. */
function resolveBun() {
  const which = process.platform === "win32" ? "where" : "which";
  const probe = spawnSync(which, ["bun"], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout.trim()) return "bun";

  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) {
    const local = join(home, ".bun", "bin", "bun");
    if (existsSync(local)) return local;
  }
  return "bun"; // last resort; errors clearly below if genuinely missing
}

function main() {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  const raw = readStdin();
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    /* payload not JSON — fall back to scanning the raw text */
  }

  const commands = payload ? extractCommands(payload) : [];
  const haystacks = commands.length ? commands : [raw];
  const deployDetected = haystacks.some(isDeployCommand);

  if (process.env.PREDEPLOY_GATE_DRYRUN === "1") {
    log(`DRY RUN — deployDetected=${deployDetected ? 1 : 0}`);
    process.exit(0);
  }

  if (!deployDetected) {
    process.exit(0); // not a deploy → allow, no build
  }

  // Confirm the build script exists rather than assuming it.
  let hasBuildScript = false;
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
    hasBuildScript = Boolean(pkg?.scripts?.build);
  } catch {
    /* handled below */
  }
  if (!hasBuildScript) {
    log('BLOCKED: no "build" script found in package.json — cannot gate the deploy.');
    process.exit(2);
  }

  const bun = resolveBun();
  log("Deploy command detected — running `bun run build` before deploy...");

  // stdout of the child is redirected to fd 2 (our stderr) so our own stdout
  // stays empty for Kiro's permission-decision parsing.
  const result = spawnSync(bun, ["run", "build"], {
    cwd: projectRoot,
    stdio: ["ignore", 2, 2],
  });

  if (result.error) {
    log(`BLOCKED: could not start build (${result.error.message}).`);
    process.exit(2);
  }
  if (result.status === 0) {
    log("Build succeeded — allowing deploy.");
    process.exit(0);
  }
  log(`BLOCKED: build failed (exit ${result.status ?? "signal"}) — deploy stopped.`);
  process.exit(2);
}

main();
