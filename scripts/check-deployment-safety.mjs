#!/usr/bin/env bun

/**
 * Deployment safety gate. Run it with bun (`bun run deploy:safety`): the
 * migration-ledger check imports the TypeScript migration registry so the
 * runbook can never drift from `src/lib/migration-registry.ts`.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIGRATION_RUNBOOK_PATH,
  validateMigrationRunbook,
} from "../src/lib/migration-runbook.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function readRepositoryFile(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function isIgnored(relativePath) {
  const result = spawnSync(
    "git",
    ["check-ignore", "--no-index", "--quiet", "--", relativePath],
    { cwd: repositoryRoot, stdio: "ignore" },
  );

  return result.status === 0;
}

export function isSensitiveEnvironmentFile(relativePath) {
  const name = relativePath.split("/").at(-1) ?? "";
  return name.startsWith(".env") && name !== ".env.example";
}

/**
 * Requirement 16.5/16.9 — every schema-mutating command form.
 *
 * Covers migration apply (`migrate deploy`), migration development
 * (`migrate dev`), reset (`migrate reset`, `db reset`), schema push
 * (`db push`), the ledger-rewriting `migrate resolve`, arbitrary SQL through
 * `db execute`, and the `db:*` package-script aliases for all of them.
 */
const databaseMutationPattern =
  /\bprisma\s+(?:migrate\s+(?:deploy|dev|reset|resolve)|db\s+(?:push|reset|execute))\b|\bdb:(?:migrate|push|reset|execute)\b/iu;

/**
 * Scripts that must never issue a data-definition statement: the build script,
 * the development script, and the start script, including every variant this
 * repository ships and the local development setup helpers they call.
 */
export const SCHEMA_GUARDED_SCRIPT_NAMES = Object.freeze([
  "build",
  "build:vercel",
  "build:standalone",
  "dev",
  "dev:log",
  "dev:setup",
  "dev:clean",
  "start",
  "start:standalone",
]);

const scriptReferencePattern =
  /\b(?:bun|npm|pnpm|yarn)(?:\s+--\S+)*\s+run\s+([A-Za-z0-9:_-]+)/gu;
const embeddedRoleCredentialPattern =
  /^#\s+(?:SUPER_ADMIN|ADMIN|BIDDER|REVIEWER|FINANCE):\s+\S+\s+\/\s+\S+/gmu;
const embeddedDevelopmentIdentityPattern =
  /[A-Z0-9._%+-]+@arabclue\.local/iu;
const credentialRiskPaths = [
  "AGENTS.md",
  "scripts/ensure-devtest.ts",
  "DEPLOY_ARABCLUE_COM.md",
];

export function containsDatabaseMutation(command) {
  return databaseMutationPattern.test(String(command ?? ""));
}

/**
 * The named script and every package script it reaches through `bun run`,
 * `npm run`, `pnpm run`, or `yarn run`, so an indirectly invoked
 * schema-mutating command cannot hide behind one level of indirection.
 * Cycles terminate because each script name is expanded at most once.
 */
export function resolveScriptCommands(scripts, name, seen = new Set()) {
  const command = scripts?.[name];
  if (typeof command !== "string" || seen.has(name)) return [];
  seen.add(name);

  const resolved = [{ script: name, command }];
  scriptReferencePattern.lastIndex = 0;
  for (const match of command.matchAll(scriptReferencePattern)) {
    resolved.push(...resolveScriptCommands(scripts, match[1], seen));
  }
  return resolved;
}

/**
 * Requirement 16.9 — the guarded scripts that contain a schema-mutating
 * command, each named in the returned entry so the failure output can identify
 * the offending script and the exact command that triggered the rejection.
 */
export function schemaMutatingScriptFindings(
  scripts,
  names = SCHEMA_GUARDED_SCRIPT_NAMES,
) {
  const findings = [];
  for (const name of names) {
    for (const { script, command } of resolveScriptCommands(scripts, name)) {
      if (!containsDatabaseMutation(command)) continue;
      findings.push({ script: name, offendingScript: script, command });
    }
  }
  return findings;
}

/** Guarded script names that contain a schema-mutating command, directly or indirectly. */
export function schemaMutatingScripts(
  scripts,
  names = SCHEMA_GUARDED_SCRIPT_NAMES,
) {
  return [
    ...new Set(
      schemaMutatingScriptFindings(scripts, names).map((finding) =>
        finding.script === finding.offendingScript
          ? finding.script
          : `${finding.script} -> ${finding.offendingScript}`,
      ),
    ),
  ];
}

export function containsEmbeddedRoleCredential(markdown) {
  embeddedRoleCredentialPattern.lastIndex = 0;
  return embeddedRoleCredentialPattern.test(markdown);
}

export function containsEmbeddedDevelopmentIdentity(text) {
  return embeddedDevelopmentIdentityPattern.test(String(text));
}

export function sensitiveEnvironmentPathsFromGitObjectList(objectList) {
  return [
    ...new Set(
      String(objectList)
        .split("\n")
        .map((line) => {
          const separator = line.indexOf(" ");
          return separator === -1 ? "" : line.slice(separator + 1);
        })
        .filter((relativePath) => isSensitiveEnvironmentFile(relativePath)),
    ),
  ].sort();
}

export function runDeploymentSafetyCheck() {
  const failures = [];
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);

  const trackedEnvironmentFiles = trackedFiles.filter(
    isSensitiveEnvironmentFile,
  );

  if (trackedEnvironmentFiles.length > 0) {
    failures.push(
      `Sensitive environment files remain tracked: ${trackedEnvironmentFiles.join(", ")}`,
    );
  }

  const historicalSensitiveEnvironmentFiles =
    sensitiveEnvironmentPathsFromGitObjectList(
      execFileSync("git", ["rev-list", "--objects", "--all"], {
        cwd: repositoryRoot,
        encoding: "utf8",
      }),
    );
  if (historicalSensitiveEnvironmentFiles.length > 0) {
    failures.push(
      `Sensitive environment files remain in Git history: ${historicalSensitiveEnvironmentFiles.join(", ")}`,
    );
  }

  const currentCredentialRiskPaths = credentialRiskPaths.filter((relativePath) => {
    try {
      const text = readRepositoryFile(relativePath);
      return (
        containsEmbeddedRoleCredential(text) ||
        containsEmbeddedDevelopmentIdentity(text)
      );
    } catch {
      return false;
    }
  });
  if (currentCredentialRiskPaths.length > 0) {
    failures.push(
      `Credential-bearing development or deployment files remain tracked: ${currentCredentialRiskPaths.join(", ")}`,
    );
  }

  const historicalCredentialLocations = [];
  for (const relativePath of credentialRiskPaths) {
    const commits = execFileSync(
      "git",
      ["rev-list", "--all", "--", relativePath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    )
      .split("\n")
      .filter(Boolean);
    for (const commit of commits) {
      try {
        const text = execFileSync(
          "git",
          ["show", `${commit}:${relativePath}`],
          {
            cwd: repositoryRoot,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          },
        );
        if (
          containsEmbeddedRoleCredential(text) ||
          containsEmbeddedDevelopmentIdentity(text)
        ) {
          historicalCredentialLocations.push(
            `${commit.slice(0, 12)}:${relativePath}`,
          );
        }
      } catch {
        // The path did not exist in this commit.
      }
    }
  }
  if (historicalCredentialLocations.length > 0) {
    failures.push(
      `Embedded credentials remain in Git history: ${historicalCredentialLocations.join(", ")}`,
    );
  }

  for (const candidate of [
    ".env",
    ".env.local",
    ".env.preview",
    ".env.production",
    ".env.production.local",
  ]) {
    if (!isIgnored(candidate)) {
      failures.push(`Git ignore rules do not protect ${candidate}`);
    }
  }

  if (isIgnored(".env.example")) {
    failures.push(
      ".env.example must remain available as the placeholder template",
    );
  }

  if (!String(process.env.REDIS_URL ?? "").trim()) {
    failures.push(
      "REDIS_URL is required for distributed authentication and document-export rate limiting",
    );
  }
  if (!String(process.env.BLOB_READ_WRITE_TOKEN ?? "").trim()) {
    failures.push(
      "BLOB_READ_WRITE_TOKEN is required for durable document storage on Vercel",
    );
  }
  if (String(process.env.CRON_SECRET ?? "").trim().length < 16) {
    failures.push(
      "CRON_SECRET is required and must contain at least 16 characters",
    );
  }

  const vercelConfiguration = JSON.parse(readRepositoryFile("vercel.json"));
  const vercelBuildCommand = String(vercelConfiguration.buildCommand ?? "");

  if (containsDatabaseMutation(vercelBuildCommand)) {
    failures.push(
      "vercel.json buildCommand must not mutate a database; migrations require a separate approved release step",
    );
  }

  // Requirement 16.5/16.9 — build, development, and start scripts issue no DDL.
  const packageScripts =
    JSON.parse(readRepositoryFile("package.json")).scripts ?? {};
  for (const name of SCHEMA_GUARDED_SCRIPT_NAMES) {
    if (typeof packageScripts[name] !== "string") {
      failures.push(
        `package.json script "${name}" is missing; the deployment safety gate cannot verify it issues no data-definition statement`,
      );
    }
  }
  for (const finding of schemaMutatingScriptFindings(packageScripts)) {
    const origin =
      finding.script === finding.offendingScript
        ? `package.json script "${finding.script}"`
        : `package.json script "${finding.script}" through "${finding.offendingScript}"`;
    failures.push(
      `${origin} contains a schema-mutating command: ${finding.command.trim()}`,
    );
  }

  // Requirement 16.6 — the runbook ledger stays generated from the registry.
  const runbookValidation = validateMigrationRunbook(
    readRepositoryFile(MIGRATION_RUNBOOK_PATH),
  );
  if (!runbookValidation.ok) {
    failures.push(`[${runbookValidation.code}] ${runbookValidation.detail}`);
  }

  const deploymentGuide = readRepositoryFile("DEPLOY_ARABCLUE_COM.md");
  if (containsEmbeddedRoleCredential(deploymentGuide)) {
    failures.push(
      "DEPLOY_ARABCLUE_COM.md contains an embedded role credential row",
    );
  }

  if (failures.length > 0) {
    console.error("Deployment safety gate failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      "No deployment should proceed until every failure is remediated and credentials exposed through Git history are rotated.",
    );
    return 1;
  }

  console.log(
    "Deployment safety gate passed: environment files are protected, Redis, Blob, and cron authentication are configured, no role credentials are embedded, Vercel builds and the build/development/start scripts issue no data-definition statement, and the runbook migration ledger matches the migration registry.",
  );
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runDeploymentSafetyCheck();
}
