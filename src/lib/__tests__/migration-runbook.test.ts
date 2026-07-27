import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  MIGRATION_LEDGER_BEGIN,
  MIGRATION_LEDGER_END,
  MIGRATION_RUNBOOK_PATH,
  applyMigrationLedger,
  documentedMigrationIds,
  renderMigrationLedger,
  validateMigrationRunbook,
} from "../migration-runbook";
import { MIGRATIONS, type MigrationRecord } from "../migration-registry";

/**
 * Requirement 16.6 — the runbook migration ledger is generated from
 * `migration-registry.ts` and validated by executable code, so it can never
 * become an independent hand-maintained list that drifts from the registry.
 */

const runbook = readFileSync(
  new URL(`../../../${MIGRATION_RUNBOOK_PATH}`, import.meta.url),
  "utf8",
);

describe("Requirement 16.6: the committed runbook matches the registry", () => {
  test("the generated block is present and byte-identical", () => {
    const validation = validateMigrationRunbook(runbook);
    expect(typeof validation.detail).toBe("string");
    expect(validation.code).toBeNull();
    expect(validation.ok).toBe(true);
    expect(validation.missingMigrations).toEqual([]);
    expect(validation.staleMigrations).toEqual([]);
  });

  test("regenerating the block is a no-op for the committed document", () => {
    expect(applyMigrationLedger(runbook)).toBe(runbook);
  });

  test("documents every declared migration exactly once, in apply order", () => {
    expect([...documentedMigrationIds(runbook)]).toEqual(
      MIGRATIONS.map((migration) => migration.id),
    );
  });

  test("documents each migration's position, capabilities, and reverse action", () => {
    for (const migration of MIGRATIONS) {
      const heading = `### ${migration.position}. \`${migration.id}\``;
      const start = runbook.indexOf(heading);
      expect(start).toBeGreaterThan(-1);
      const section = runbook.slice(start, start + 4_000);

      expect(section).toContain(
        `- **Apply position:** ${migration.position} of ${MIGRATIONS.length}`,
      );
      expect(section).toContain("- **Capabilities:**");
      expect(section).toContain("- **Reverse action:**");
      for (const capability of migration.capabilities) {
        expect(section).toContain(capability);
      }
      if (migration.reverse === null) {
        expect(section).toContain("no reverse action");
      } else {
        expect(section).toContain(migration.reverse);
      }
    }
  });

  test("documents the five named platform-completion prerequisites and the completion migration", () => {
    for (const id of [
      "20260724231500_proposal_structured_snapshot",
      "20260725001000_knowledge_evidence_integrity",
      "20260725003000_contract_draft_persistence",
      "20260725004000_contract_render_snapshot",
      "20260725_phase4_proposal_system",
      "20260726000000_platform_completion",
    ]) {
      expect(documentedMigrationIds(runbook)).toContain(id);
    }
  });

  test("hand-written release procedure outside the markers is preserved", () => {
    const regenerated = applyMigrationLedger(runbook);
    expect(regenerated).toContain("## Database release procedure");
    expect(regenerated).toContain("## Pre-deployment gates");
    expect(regenerated.indexOf("## Database release procedure")).toBeLessThan(
      regenerated.indexOf(MIGRATION_LEDGER_BEGIN),
    );
    expect(regenerated.indexOf("## Pre-deployment gates")).toBeGreaterThan(
      regenerated.indexOf(MIGRATION_LEDGER_END),
    );
  });
});

describe("drift detection", () => {
  const sample: readonly MigrationRecord[] = [
    {
      id: "20260101000000_one",
      position: 1,
      capabilities: ["first capability"],
      createsTables: ["Alpha"],
      reverse: 'DROP TABLE "Alpha";',
    },
    {
      id: "20260102000000_two",
      position: 2,
      capabilities: ["second capability"],
      createsTables: [],
      reverse: null,
    },
  ];

  const document = `# Runbook\n\n${renderMigrationLedger(sample)}\n\n## Gates\n`;

  test("a synchronized document validates", () => {
    const validation = validateMigrationRunbook(document, sample);
    expect(validation.ok).toBe(true);
    expect(validation.code).toBeNull();
  });

  test("a newly declared migration is reported as undocumented", () => {
    const extended: readonly MigrationRecord[] = [
      ...sample,
      {
        id: "20260103000000_three",
        position: 3,
        capabilities: ["third capability"],
        createsTables: ["Gamma"],
        reverse: 'DROP TABLE "Gamma";',
      },
    ];

    const validation = validateMigrationRunbook(document, extended);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("MIGRATION_RUNBOOK_STALE");
    expect(validation.missingMigrations).toEqual(["20260103000000_three"]);
    expect(validation.detail).toContain("sync-migration-runbook.mjs --write");
  });

  test("a removed migration is reported as no longer declared", () => {
    const validation = validateMigrationRunbook(document, [sample[0]]);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("MIGRATION_RUNBOOK_STALE");
    expect(validation.staleMigrations).toEqual(["20260102000000_two"]);
  });

  test("an edited capability list inside the block is rejected", () => {
    const tampered = document.replace(
      "second capability",
      "second capability, invented capability",
    );
    const validation = validateMigrationRunbook(tampered, sample);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("MIGRATION_RUNBOOK_STALE");
    expect(validation.detail).toContain("first difference at offset");
  });

  test("a document without markers is rejected rather than silently accepted", () => {
    const validation = validateMigrationRunbook("# Runbook\n", sample);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("MIGRATION_RUNBOOK_MARKERS_MISSING");
    expect(validation.missingMigrations.length).toBe(sample.length);
    expect(() => applyMigrationLedger("# Runbook\n", sample)).toThrow();
  });

  test("markers in the wrong order are rejected", () => {
    const inverted = `# Runbook\n\n${MIGRATION_LEDGER_END}\n\n${MIGRATION_LEDGER_BEGIN}\n`;
    const validation = validateMigrationRunbook(inverted, sample);
    expect(validation.ok).toBe(false);
    expect(validation.code).toBe("MIGRATION_RUNBOOK_MARKERS_OUT_OF_ORDER");
  });

  test("generation is idempotent and repairs a tampered block", () => {
    const tampered = document.replace("first capability", "tampered");
    const repaired = applyMigrationLedger(tampered, sample);
    expect(validateMigrationRunbook(repaired, sample).ok).toBe(true);
    expect(applyMigrationLedger(repaired, sample)).toBe(repaired);
  });

  test("a capability containing a table separator is escaped in the index table", () => {
    const piped: readonly MigrationRecord[] = [
      {
        id: "20260104000000_four",
        position: 1,
        capabilities: ["piped | capability"],
        createsTables: [],
        reverse: null,
      },
    ];
    const rendered = renderMigrationLedger(piped);
    const indexRow = rendered
      .split("\n")
      .find(
        (line) =>
          line.startsWith("|") && line.includes("`20260104000000_four`"),
      );

    expect(indexRow).toBeDefined();
    expect(indexRow).toContain("piped \\| capability");
    expect(indexRow?.includes("piped | capability")).toBe(false);
    expect(validateMigrationRunbook(`x\n${rendered}\ny`, piped).ok).toBe(true);
  });
});
