#!/usr/bin/env bun
/**
 * Production-integrity scanner runner (task 12.3 / Requirement 19.1–19.11).
 *
 * Runs all static integrity scanners against the repository source tree and
 * reports findings. Exits with code 1 when any finding is produced.
 *
 * Exemptions (Requirement 19.10):
 * - Test files (`__tests__/`)
 * - Frozen catalogs (`contract-templates.ts`, `/document-templates/`)
 * - Explicit amount/currency validation comparisons
 * Production fallback data is NOT exempt.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  scanProductionIntegritySource,
  scanForOrphanedCapabilities,
  validateCapabilityReachability,
  isExemptPath,
  type IntegrityFinding,
} from "../src/lib/production-integrity-scanner";

const REPO_ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const findings: IntegrityFinding[] = [];

  // 1. Capability reachability validation (Requirement 19.1, 19.2)
  findings.push(...validateCapabilityReachability(REPO_ROOT));

  // 2. Orphaned capabilities (Requirement 19.1)
  findings.push(...scanForOrphanedCapabilities(REPO_ROOT));

  // 3. Source-level scanners (Requirement 19.3, 19.7, 19.10, 19.11)
  const sourceRoots = [
    path.join(REPO_ROOT, "src"),
    path.join(REPO_ROOT, "scripts"),
  ];

  for (const root of sourceRoots) {
    const files = walk(root);
    for (const file of files) {
      const relativePath = path.relative(REPO_ROOT, file);
      if (isExemptPath(relativePath)) continue;

      let source: string;
      try {
        source = readFileSync(file, "utf8");
      } catch {
        continue;
      }

      findings.push(...scanProductionIntegritySource(source, relativePath));
    }
  }

  // Report
  if (findings.length === 0) {
    console.log("✅ Integrity scan passed — no findings.");
    process.exit(0);
  }

  console.error(`❌ Integrity scan failed — ${findings.length} finding(s):`);
  for (const finding of findings) {
    console.error(`  [${finding.code}] ${finding.path}`);
    console.error(`    ${finding.detail}`);
  }
  process.exit(1);
}

main();
