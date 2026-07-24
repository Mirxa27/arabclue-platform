#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const databaseMutationPattern =
  /\bprisma\s+(?:migrate\s+(?:deploy|dev)|db\s+(?:push|reset))\b|\bdb:(?:migrate|push|reset)\b/iu;
const embeddedRoleCredentialPattern =
  /^#\s+(?:SUPER_ADMIN|ADMIN|BIDDER|REVIEWER|FINANCE):\s+\S+\s+\/\s+\S+/gmu;

export function containsDatabaseMutation(command) {
  return databaseMutationPattern.test(command);
}

export function containsEmbeddedRoleCredential(markdown) {
  embeddedRoleCredentialPattern.lastIndex = 0;
  return embeddedRoleCredentialPattern.test(markdown);
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

  const vercelConfiguration = JSON.parse(readRepositoryFile("vercel.json"));
  const vercelBuildCommand = String(vercelConfiguration.buildCommand ?? "");

  if (containsDatabaseMutation(vercelBuildCommand)) {
    failures.push(
      "vercel.json buildCommand must not mutate a database; migrations require a separate approved release step",
    );
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
    "Deployment safety gate passed: environment files are protected, distributed rate limiting is configured, no role credentials are embedded, and Vercel builds are database-read-only.",
  );
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runDeploymentSafetyCheck();
}
