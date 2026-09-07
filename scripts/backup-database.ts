/**
 * Operator entry point for database backups.
 *
 *   bun --env-file=.env scripts/backup-database.ts                 # dump now
 *   bun --env-file=.env scripts/backup-database.ts list            # what exists
 *   bun --env-file=.env scripts/backup-database.ts restore <key>   # dry run: counts only
 *   bun --env-file=.env scripts/backup-database.ts restore <key> --apply [--force]
 *
 * Destination follows BLOB_READ_WRITE_TOKEN: set → Vercel Blob under
 * backups/database/, unset → ./backups/. Restore never runs without --apply,
 * and without --force it refuses when the live database holds more rows than
 * the dump (the "old dump over live tenant" mistake).
 */
import { db } from "../src/lib/db";
import {
  listBackupKeys,
  readBackup,
  restoreDatabaseBackup,
  runDatabaseBackup,
} from "../src/lib/database-backup";

const [command = "dump", ...rest] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "dump": {
      const summary = await runDatabaseBackup();
      console.log(
        `backup written: ${summary.key} (${summary.destination}, ${summary.tables} tables, ${summary.rows} rows, ${(summary.bytes / 1024).toFixed(1)} KiB)`,
      );
      if (summary.pruned.length) console.log(`pruned ${summary.pruned.length} old backup(s)`);
      return;
    }
    case "list": {
      const keys = await listBackupKeys();
      if (keys.length === 0) console.log("no backups found");
      for (const key of keys) console.log(key);
      return;
    }
    case "restore": {
      const key = rest.find((a) => !a.startsWith("--"));
      if (!key) throw new Error("restore needs a backup key (see `list`)");
      const apply = rest.includes("--apply");
      const force = rest.includes("--force");
      const doc = await readBackup(key);
      console.log(`backup ${key} taken ${doc.takenAt} from database "${doc.database}"`);
      for (const [table, count] of Object.entries(doc.counts)) {
        if (count > 0) console.log(`  ${table.padEnd(36)} ${count}`);
      }
      if (!apply) {
        console.log("dry run — pass --apply to restore these rows (and --force to overwrite a larger live database)");
        return;
      }
      const result = await restoreDatabaseBackup(doc, { force });
      const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
      console.log(`restored ${total} rows across ${Object.keys(result.restored).length} tables`);
      if (result.skipped.length) console.log(`skipped (not in live schema): ${result.skipped.join(", ")}`);
      return;
    }
    default:
      throw new Error(`unknown command "${command}" (dump | list | restore <key>)`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
