#!/usr/bin/env bun

/**
 * Keeps the migration ledger in the production deployment runbook synchronized
 * with `src/lib/migration-registry.ts` (Requirement 16.6).
 *
 * Usage (bun, because the generator imports the TypeScript registry):
 *   bun scripts/sync-migration-runbook.mjs            # validate, exit 1 on drift
 *   bun scripts/sync-migration-runbook.mjs --check    # same as above
 *   bun scripts/sync-migration-runbook.mjs --write    # rewrite the generated block
 *
 * The script reads and writes local documentation only. It never opens a
 * database connection and never issues a data-definition statement.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIGRATION_RUNBOOK_PATH,
  applyMigrationLedger,
  validateMigrationRunbook,
} from "../src/lib/migration-runbook.ts";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runbookPath = join(repositoryRoot, MIGRATION_RUNBOOK_PATH);

export function syncMigrationRunbook({ write = false } = {}) {
  const committed = readFileSync(runbookPath, "utf8");

  if (!write) {
    const validation = validateMigrationRunbook(committed);
    if (validation.ok) {
      console.log(`Migration runbook is synchronized: ${validation.detail}`);
      return 0;
    }
    console.error(`Migration runbook check failed [${validation.code}]:`);
    console.error(`- ${validation.detail}`);
    return 1;
  }

  const regenerated = applyMigrationLedger(committed);
  if (regenerated === committed) {
    console.log(`Migration runbook already matches the registry; no write needed.`);
    return 0;
  }
  writeFileSync(runbookPath, regenerated, "utf8");
  console.log(`Regenerated the migration ledger in ${MIGRATION_RUNBOOK_PATH}.`);
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const write = process.argv.slice(2).includes("--write");
  process.exitCode = syncMigrationRunbook({ write });
}
