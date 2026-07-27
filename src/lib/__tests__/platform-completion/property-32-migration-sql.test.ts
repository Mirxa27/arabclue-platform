/**
 * Feature: platform-completion, Property 32: Migration SQL is additive
 *
 * Deterministic static analysis only. This test reads migration files and
 * package scripts from disk and parses them; it opens no database connection and
 * runs no Prisma command.
 *
 * Validates: Requirements 16.1, 16.5, 16.9
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fc from "fast-check";
import {
  PLATFORM_COMPLETION_SPEC,
  migrationsIntroducedBySpec,
} from "../../migration-registry";
import {
  MIGRATION_SQL_RULES,
  type MigrationSqlRuleCode,
  analyzeMigrationSql,
  formatMigrationSqlViolations,
  migrationSqlViolations,
  parseMigrationSql,
  sqlRegions,
  stripSqlComments,
} from "../../migration-sql-policy";
import { completionPropertyOptions } from "../support";
import {
  SCHEMA_GUARDED_SCRIPT_NAMES,
  containsDatabaseMutation,
  resolveScriptCommands,
  schemaMutatingScriptFindings,
  schemaMutatingScripts,
} from "../../../../scripts/check-deployment-safety.mjs";

const PROPERTY_TAG =
  "Feature: platform-completion, Property 32: Migration SQL is additive";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const specMigrations = migrationsIntroducedBySpec(PLATFORM_COMPLETION_SPEC);

function migrationSql(id: string): string {
  return readFileSync(join(MIGRATIONS_DIR, id, "migration.sql"), "utf8");
}

function rulesFor(sql: string): readonly MigrationSqlRuleCode[] {
  return migrationSqlViolations(sql).map((violation) => violation.rule);
}

const packageScripts = (
  JSON.parse(
    readFileSync(new URL("../../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> }
).scripts ?? {};

/** Additive statement forms the policy must accept. */
const ALLOWED_SQL: readonly (readonly [string, string])[] = [
  ["create table", 'CREATE TABLE "Widget" ("id" TEXT NOT NULL, CONSTRAINT "Widget_pkey" PRIMARY KEY ("id"));'],
  [
    "create table if not exists with not-null columns",
    'CREATE TABLE IF NOT EXISTS "Widget" ("id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);',
  ],
  ["create index if not exists", 'CREATE INDEX IF NOT EXISTS "Widget_id_idx" ON "Widget"("id");'],
  [
    "create unique partial expression index",
    'CREATE UNIQUE INDEX IF NOT EXISTS "Widget_email_key" ON "Widget" (lower(btrim("email"))) WHERE "deletedAt" IS NULL;',
  ],
  ["add nullable column", 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nickname" TEXT;'],
  [
    "add not-null column carrying a default",
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false;',
  ],
  [
    "add several columns in one statement",
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "a" TEXT, ADD COLUMN IF NOT EXISTS "b" NUMERIC(10, 2) NOT NULL DEFAULT 0;',
  ],
  [
    "add constraint not valid",
    'ALTER TABLE "Widget" ADD CONSTRAINT "Widget_rating_check" CHECK ("rating" BETWEEN 1 AND 5) NOT VALID;',
  ],
  ["validate constraint", 'ALTER TABLE "Widget" VALIDATE CONSTRAINT "Widget_rating_check";'],
  ["set default", 'ALTER TABLE "Widget" ALTER COLUMN "status" SET DEFAULT \'PENDING\';'],
  ["create type", `CREATE TYPE "WidgetState" AS ENUM ('DRAFT', 'ACTIVE');`],
  ["alter type add value", `ALTER TYPE "WidgetState" ADD VALUE IF NOT EXISTS 'RETIRED';`],
  ["comment on", `COMMENT ON TABLE "Widget" IS 'Widgets';`],
  [
    "guarded do block adding a constraint",
    [
      "DO $mig$",
      "BEGIN",
      "  IF NOT EXISTS (",
      "    SELECT 1 FROM pg_constraint WHERE conname = 'Widget_owner_fkey'",
      "  ) THEN",
      '    ALTER TABLE "Widget" ADD CONSTRAINT "Widget_owner_fkey"',
      '      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL NOT VALID;',
      "  END IF;",
      "END",
      "$mig$;",
    ].join("\n"),
  ],
  [
    "do block declaring variables and looping",
    [
      "DO $mig$",
      "DECLARE",
      "  target TEXT;",
      "  guard TEXT;",
      "BEGIN",
      "  FOREACH target IN ARRAY ARRAY['Widget', 'Gadget']",
      "  LOOP",
      "    guard := target || '_owner_fkey';",
      "    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = guard) THEN",
      "      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (\"n\" > 0) NOT VALID', target, guard);",
      "    END IF;",
      "  END LOOP;",
      "END",
      "$mig$;",
    ].join("\n"),
  ],
  [
    "idempotency guard dropping a constraint of a table the same migration creates",
    [
      'CREATE TABLE IF NOT EXISTS "Widget" ("id" TEXT NOT NULL, "ownerId" TEXT);',
      'ALTER TABLE "Widget" DROP CONSTRAINT IF EXISTS "Widget_owner_fkey";',
      'ALTER TABLE "Widget" ADD CONSTRAINT "Widget_owner_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id");',
    ].join("\n"),
  ],
];

/** Forbidden statement classes, each with the rule that must reject it. */
const FORBIDDEN_SQL: readonly (readonly [string, string, MigrationSqlRuleCode])[] = [
  ["drop table", 'DROP TABLE "User";', "DROP_TABLE"],
  ["drop table if exists", 'DROP TABLE IF EXISTS "User";', "DROP_TABLE"],
  ["drop column", 'ALTER TABLE "User" DROP COLUMN "email";', "DROP_COLUMN"],
  [
    "drop constraint on a pre-existing table",
    'ALTER TABLE "User" DROP CONSTRAINT "User_email_key";',
    "DROP_CONSTRAINT",
  ],
  ["drop index", 'DROP INDEX "User_email_key";', "DROP_INDEX"],
  ["drop schema", "DROP SCHEMA public CASCADE;", "DROP_SCHEMA"],
  ["drop type", 'DROP TYPE "WidgetState";', "DROP_TYPE"],
  ["drop database", "DROP DATABASE neondb;", "DROP_DATABASE"],
  ["truncate", 'TRUNCATE TABLE "User";', "TRUNCATE"],
  ["rename table", 'ALTER TABLE "User" RENAME TO "Account";', "RENAME"],
  ["rename column", 'ALTER TABLE "User" RENAME COLUMN "email" TO "mail";', "RENAME"],
  ["rename index", 'ALTER INDEX "User_email_key" RENAME TO "User_mail_key";', "RENAME"],
  [
    "alter column type",
    'ALTER TABLE "User" ALTER COLUMN "email" TYPE VARCHAR(64);',
    "ALTER_COLUMN_TYPE",
  ],
  [
    "alter column set data type",
    'ALTER TABLE "User" ALTER COLUMN "email" SET DATA TYPE VARCHAR(64);',
    "ALTER_COLUMN_TYPE",
  ],
  [
    "set not null on an existing column",
    'ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;',
    "SET_NOT_NULL",
  ],
  [
    "add not-null column without a default",
    'ALTER TABLE "User" ADD COLUMN "nickname" TEXT NOT NULL;',
    "ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT",
  ],
  [
    "add not-null column without a default among additive actions",
    'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "a" TEXT, ADD COLUMN IF NOT EXISTS "b" TEXT NOT NULL;',
    "ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT",
  ],
  [
    "drop hidden inside an untagged do block",
    'DO $$ BEGIN DROP TABLE "User"; END $$;',
    "DROP_TABLE",
  ],
  [
    "drop hidden inside a tagged do block behind a condition",
    [
      "DO $mig$",
      "BEGIN",
      "  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'User') THEN",
      '    ALTER TABLE "User" DROP COLUMN "email";',
      "  END IF;",
      "END",
      "$mig$;",
    ].join("\n"),
    "DROP_COLUMN",
  ],
  [
    "destructive dynamic sql",
    `DO $mig$ BEGIN EXECUTE 'DROP TABLE "User"'; END $mig$;`,
    "DESTRUCTIVE_DYNAMIC_SQL",
  ],
  ["delete statement", 'DELETE FROM "User";', "UNSUPPORTED_STATEMENT"],
  ["update statement", 'UPDATE "User" SET "email" = \'x\';', "UNSUPPORTED_STATEMENT"],
  [
    "unsupported alter action",
    'ALTER TABLE "User" DISABLE TRIGGER ALL;',
    "UNSUPPORTED_ALTER_ACTION",
  ],
  ["drop view", 'DROP VIEW "UserSummary";', "NON_ADDITIVE_DROP"],
  [
    "drop not null on an existing column",
    'ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;',
    "NON_ADDITIVE_DROP",
  ],
];

const SCHEMA_MUTATING_COMMANDS: readonly string[] = [
  "prisma migrate dev --name x",
  "prisma migrate deploy",
  "prisma migrate reset --force",
  "prisma db push",
  "prisma db execute --file ./ddl.sql",
];

const schemaSource = readFileSync(
  join(process.cwd(), "prisma", "schema.prisma"),
  "utf8",
);

// ─── Additive-SQL invariants the migration author verified ──────────────────
// These helpers reuse the shared lexer/parser from `migration-sql-policy`
// (`sqlRegions`, `stripSqlComments`, `parseMigrationSql`, `analyzeMigrationSql`)
// rather than re-scanning SQL, and stay pure and side-effect free.

/** 1-based line number of a character offset. */
function lineForOffset(text: string, offset: number): number {
  let line = 1;
  const limit = Math.min(offset, text.length);
  for (let index = 0; index < limit; index += 1) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

/**
 * Comment-stripped copy of `text` whose string-literal, dollar-quoted, and
 * double-quoted-identifier bodies are blanked (newlines preserved), so a
 * keyword appearing in prose, dynamic SQL, or an identifier is never read as
 * PL/pgSQL control flow.
 */
function controlFlowCode(text: string): string {
  const stripped = stripSqlComments(text);
  const characters = [...stripped];
  for (const region of sqlRegions(stripped)) {
    if (
      region.kind === "stringLiteral" ||
      region.kind === "dollarQuoted" ||
      region.kind === "quotedIdentifier"
    ) {
      for (let index = region.bodyStart; index < region.bodyEnd; index += 1) {
        if (characters[index] !== "\n") characters[index] = " ";
      }
    }
  }
  return characters.join("");
}

interface DollarBlock {
  readonly tag: string;
  readonly line: number;
  readonly closed: boolean;
  readonly beginCount: number;
  readonly bareEndCount: number;
  readonly openIfCount: number;
  readonly endIfCount: number;
  readonly openLoopCount: number;
  readonly endLoopCount: number;
  readonly balanced: boolean;
}

function countMatches(haystack: string, needle: RegExp): number {
  return (haystack.match(needle) ?? []).length;
}

/**
 * Structural summary of every `$tag$ ... $tag$` block: whether its opening
 * delimiter is closed and whether BEGIN/END, IF/END IF, and LOOP/END LOOP are
 * balanced. Region geometry decides closure — an unterminated block has no
 * closing delimiter, so its close-tag length is zero.
 */
function dollarQuotedBlocks(sql: string): readonly DollarBlock[] {
  return sqlRegions(sql)
    .filter((region) => region.kind === "dollarQuoted")
    .map((region) => {
      const openTagLength = region.bodyStart - region.start;
      const closeTagLength = region.end - region.bodyEnd;
      const closed = openTagLength > 0 && closeTagLength === openTagLength;
      const code = controlFlowCode(sql.slice(region.bodyStart, region.bodyEnd));

      const endIfCount = countMatches(code, /\bEND\s+IF\b/giu);
      const endLoopCount = countMatches(code, /\bEND\s+LOOP\b/giu);
      const endCaseCount = countMatches(code, /\bEND\s+CASE\b/giu);
      const bareEndCount =
        countMatches(code, /\bEND\b/giu) -
        endIfCount -
        endLoopCount -
        endCaseCount;
      const beginCount = countMatches(code, /\bBEGIN\b/giu);
      const openIfCount = countMatches(code, /\bIF\b/giu) - endIfCount;
      const openLoopCount = countMatches(code, /\bLOOP\b/giu) - endLoopCount;

      return {
        tag: sql.slice(region.start, region.bodyStart),
        line: lineForOffset(sql, region.start),
        closed,
        beginCount,
        bareEndCount,
        openIfCount,
        endIfCount,
        openLoopCount,
        endLoopCount,
        balanced:
          closed &&
          beginCount === bareEndCount &&
          openIfCount === endIfCount &&
          openLoopCount === endLoopCount,
      };
    });
}

interface AddedConstraint {
  readonly line: number;
  readonly source: "statement" | "dynamic";
  readonly hasNotValid: boolean;
  readonly snippet: string;
}

const ADD_CONSTRAINT = /\bADD\s+CONSTRAINT\b/iu;
const NOT_VALID = /\bNOT\s+VALID\b/iu;

function snippetOf(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, 100);
}

/** Single-quoted string bodies of a statement — the payload of dynamic DDL. */
function singleQuotedLiterals(text: string): readonly string[] {
  return sqlRegions(text)
    .filter((region) => region.kind === "stringLiteral")
    .map((region) => text.slice(region.bodyStart, region.bodyEnd));
}

/**
 * Every `ADD CONSTRAINT` the migration issues, whether written directly or
 * executed through `EXECUTE format(...)`, with whether it carries `NOT VALID`.
 * A statement's `.scanned` masks string literals, so a direct match never
 * double counts a dynamic constraint; the dynamic pass inspects the executed
 * literal itself.
 */
function addedConstraints(sql: string): readonly AddedConstraint[] {
  const usages: AddedConstraint[] = [];
  for (const statement of parseMigrationSql(sql)) {
    if (ADD_CONSTRAINT.test(statement.scanned)) {
      usages.push({
        line: statement.line,
        source: "statement",
        hasNotValid: NOT_VALID.test(statement.scanned),
        snippet: snippetOf(statement.scanned),
      });
    }
    for (const literal of singleQuotedLiterals(statement.text)) {
      if (ADD_CONSTRAINT.test(literal)) {
        usages.push({
          line: statement.line,
          source: "dynamic",
          hasNotValid: NOT_VALID.test(literal),
          snippet: snippetOf(literal),
        });
      }
    }
  }
  return usages;
}

/** Body of a `model <name> { ... }` block, brace-balanced. */
function prismaModelBlock(schema: string, model: string): string {
  const header = new RegExp(String.raw`(?:^|\n)\s*model\s+${model}\s*\{`, "u");
  const match = header.exec(schema);
  if (!match) throw new Error(`model ${model} not found in schema.prisma`);
  const open = schema.indexOf("{", match.index);
  let depth = 0;
  for (let index = open; index < schema.length; index += 1) {
    if (schema[index] === "{") depth += 1;
    else if (schema[index] === "}") {
      depth -= 1;
      if (depth === 0) return schema.slice(open + 1, index);
    }
  }
  throw new Error(`model ${model} block is unterminated in schema.prisma`);
}

/** Field/column list of an index attribute with any sort modifiers stripped. */
function indexColumns(inside: string): readonly string[] {
  return inside
    .split(",")
    .map((column) => column.trim().replace(/\(.*\)\s*$/u, "").trim())
    .filter((column) => column.length > 0);
}

/**
 * The index and unique-constraint names Prisma declares for `model`, using the
 * declared `map:` name where present and the documented default
 * (`<table>_<fields>_<idx|key>`) otherwise. Primary keys are excluded: the task
 * scopes this check to index/unique names, which Prisma emits through
 * CREATE (UNIQUE) INDEX statements the migration must contain.
 */
function prismaIndexUniqueNames(
  schema: string,
  model: string,
): readonly string[] {
  const block = prismaModelBlock(schema, model);
  const table = /@@map\(\s*"([^"]+)"\s*\)/u.exec(block)?.[1] ?? model;
  const names: string[] = [];

  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("//")) continue;

    const uniqueBlock =
      /^@@unique\(\s*\[([^\]]*)\]\s*(?:,\s*map:\s*"([^"]+)")?/u.exec(line);
    if (uniqueBlock) {
      names.push(
        uniqueBlock[2] ??
          `${table}_${indexColumns(uniqueBlock[1]).join("_")}_key`,
      );
      continue;
    }

    const indexBlock =
      /^@@index\(\s*\[([^\]]*)\]\s*(?:,\s*map:\s*"([^"]+)")?/u.exec(line);
    if (indexBlock) {
      names.push(
        indexBlock[2] ??
          `${table}_${indexColumns(indexBlock[1]).join("_")}_idx`,
      );
      continue;
    }

    if (line.startsWith("@@")) continue; // @@id / @@map — not an index/unique name.

    // Field-level `@unique` (single @, never the `@@unique` handled above).
    if (/(?:^|\s)@unique\b/u.test(line)) {
      const field = /^([A-Za-z_][A-Za-z0-9_]*)/u.exec(line)?.[1];
      const mapped = /@unique\(\s*map:\s*"([^"]+)"\s*\)/u.exec(line)?.[1];
      if (field) names.push(mapped ?? `${table}_${field}_key`);
    }
  }

  return names;
}

describe(PROPERTY_TAG, () => {
  describe("every migration introduced by this specification is additive", () => {
    test("the registry resolves at least the platform-completion baseline migration", () => {
      expect(specMigrations.map((migration) => migration.id)).toContain(
        "20260726000000_platform_completion",
      );
      for (const migration of specMigrations) {
        expect(migration.introducedBySpec).toBe(PLATFORM_COMPLETION_SPEC);
      }
    });

    for (const migration of specMigrations) {
      test(`${migration.id} contains only additive statements`, () => {
        const sql = migrationSql(migration.id);
        const analysis = analyzeMigrationSql(sql);

        expect(
          formatMigrationSqlViolations(analysis.violations, migration.id),
        ).toEqual([]);
        expect(analysis.statements.length).toBeGreaterThan(0);
      });

      test(`${migration.id} creates exactly the tables the registry declares`, () => {
        const analysis = analyzeMigrationSql(migrationSql(migration.id));
        expect([...analysis.createdTables].sort()).toEqual(
          [...migration.createsTables].map((table) => table.toLowerCase()).sort(),
        );
      });

      test(`${migration.id} would be rejected if a non-additive statement were added`, () => {
        // Confirms the check has teeth on the real file rather than parsing it
        // into nothing. The file on disk is never modified.
        const mutated = [
          migrationSql(migration.id),
          'ALTER TABLE "User" DROP COLUMN "email";',
        ].join("\n");
        expect(rulesFor(mutated)).toEqual(["DROP_COLUMN"]);
      });

      test(`${migration.id} adds no column that is NOT NULL without a default`, () => {
        const offenders = migrationSqlViolations(migrationSql(migration.id)).filter(
          (violation) =>
            violation.rule === "ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT",
        );
        expect(offenders).toEqual([]);
      });
    }
  });

  describe("the policy accepts additive statements", () => {
    for (const [name, sql] of ALLOWED_SQL) {
      test(`accepts ${name}`, () => {
        expect(formatMigrationSqlViolations(migrationSqlViolations(sql))).toEqual(
          [],
        );
      });
    }
  });

  describe("the policy rejects every non-additive class", () => {
    for (const [name, sql, rule] of FORBIDDEN_SQL) {
      test(`rejects ${name} with ${rule}`, () => {
        expect(rulesFor(sql)).toContain(rule);
      });
    }

    test("every declared policy rule is exercised by a fixture", () => {
      const covered = new Set(FORBIDDEN_SQL.map(([, , rule]) => rule));
      const uncovered = Object.keys(MIGRATION_SQL_RULES).filter(
        (rule) => !covered.has(rule as MigrationSqlRuleCode),
      );
      expect(uncovered).toEqual([]);
    });
  });

  describe("comments and string literals are not statements", () => {
    test("a forbidden statement following a comment is still reported once", () => {
      const sql = [
        '-- This migration must never DROP TABLE "User".',
        "/* Block comment mentioning TRUNCATE and RENAME. */",
        'DROP TABLE "User";',
      ].join("\n");
      const violations = migrationSqlViolations(sql);

      expect(violations.map((violation) => violation.rule)).toEqual([
        "DROP_TABLE",
      ]);
      expect(violations[0].line).toBe(3);
    });

    test("a DROP inside a comment alone is not a violation", () => {
      const sql = [
        '-- DROP TABLE "User"; TRUNCATE "User"; ALTER TABLE "User" RENAME TO "X";',
        'CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");',
      ].join("\n");
      expect(migrationSqlViolations(sql)).toEqual([]);
    });

    test("a DROP inside a string literal is not a violation", () => {
      const sql = `COMMENT ON TABLE "User" IS 'Never DROP TABLE or TRUNCATE this table';`;
      expect(migrationSqlViolations(sql)).toEqual([]);
    });

    test("a semicolon inside a string literal does not end the statement", () => {
      const sql = `COMMENT ON COLUMN "User"."email" IS 'first; second; DROP TABLE "User";';`;
      const statements = parseMigrationSql(sql);

      expect(statements).toHaveLength(1);
      expect(migrationSqlViolations(sql)).toEqual([]);
    });

    test("a forbidden statement after a string literal containing DROP is reported", () => {
      const sql = [
        `COMMENT ON TABLE "User" IS 'mentions DROP TABLE only as prose';`,
        'ALTER TABLE "User" DROP COLUMN "email";',
      ].join("\n");
      expect(rulesFor(sql)).toEqual(["DROP_COLUMN"]);
    });
  });

  describe("statement parsing", () => {
    test("expands DO block bodies into analyzable statements", () => {
      const statements = parseMigrationSql(
        [
          "DO $mig$",
          "DECLARE",
          "  guard TEXT;",
          "BEGIN",
          '  ALTER TABLE "Widget" ADD COLUMN IF NOT EXISTS "note" TEXT;',
          "END",
          "$mig$;",
        ].join("\n"),
      );

      expect(statements[0].container).toBeNull();
      expect(statements.some((statement) => statement.role === "declaration")).toBe(
        true,
      );
      expect(
        statements.some(
          (statement) =>
            statement.container !== null &&
            /ADD COLUMN/iu.test(statement.scanned),
        ),
      ).toBe(true);
    });

    test("reports the line of each violation", () => {
      const sql = [
        'CREATE TABLE IF NOT EXISTS "Widget" ("id" TEXT NOT NULL);',
        "",
        'ALTER TABLE "User" RENAME TO "Account";',
      ].join("\n");
      expect(migrationSqlViolations(sql)[0].line).toBe(3);
    });
  });

  describe("randomized synthetic SQL", () => {
    const allowed = fc.constantFrom(...ALLOWED_SQL.map(([, sql]) => sql));
    const forbidden = fc.constantFrom(
      ...FORBIDDEN_SQL.map(([, sql, rule]) => ({ sql, rule })),
    );

    test("any sequence of additive statements yields no violation", () => {
      fc.assert(
        fc.property(fc.array(allowed, { minLength: 1, maxLength: 6 }), (parts) => {
          expect(migrationSqlViolations(parts.join("\n\n"))).toEqual([]);
        }),
        completionPropertyOptions(),
      );
    });

    test("one non-additive statement anywhere in the file is reported", () => {
      fc.assert(
        fc.property(
          fc.array(allowed, { maxLength: 5 }),
          forbidden,
          fc.nat(),
          (parts, offender, position) => {
            const at = parts.length === 0 ? 0 : position % (parts.length + 1);
            const file = [
              ...parts.slice(0, at),
              offender.sql,
              ...parts.slice(at),
            ].join("\n\n");
            expect(rulesFor(file)).toContain(offender.rule);
          },
        ),
        completionPropertyOptions(),
      );
    });
  });

  describe("Requirement 16.5: build, development, and start scripts issue no DDL", () => {
    test("the guarded set covers the build, development, and start scripts", () => {
      for (const name of ["build", "dev", "start"]) {
        expect(SCHEMA_GUARDED_SCRIPT_NAMES).toContain(name);
        expect(typeof packageScripts[name]).toBe("string");
      }
    });

    test("no guarded script mutates the schema, directly or through bun run", () => {
      expect(schemaMutatingScripts(packageScripts)).toEqual([]);
    });

    test("operator-only database scripts stay available", () => {
      for (const name of [
        "db:push",
        "db:migrate",
        "db:migrate:deploy",
        "db:reset",
      ]) {
        expect(containsDatabaseMutation(packageScripts[name] ?? "")).toBe(true);
      }
    });
  });

  describe("Requirement 16.9: the failure output names the offending script", () => {
    for (const command of SCHEMA_MUTATING_COMMANDS) {
      test(`names build for a direct \`${command}\``, () => {
        const findings = schemaMutatingScriptFindings(
          { build: `${command} && next build` },
          ["build"],
        );
        expect(findings).toHaveLength(1);
        expect(findings[0].script).toBe("build");
        expect(findings[0].command).toContain(command);
      });

      test(`names dev and the invoked script for an indirect \`${command}\``, () => {
        const offenders = schemaMutatingScripts(
          {
            dev: "bun run db:sync && next dev -p 3000",
            "db:sync": command,
          },
          ["dev"],
        );
        expect(offenders).toEqual(["dev -> db:sync"]);
      });
    }

    test("names start for a mutation reached two scripts deep", () => {
      expect(
        schemaMutatingScripts(
          {
            start: "bun run prepare:start && next start",
            "prepare:start": "bun run db:sync",
            "db:sync": "prisma db push",
          },
          ["start"],
        ),
      ).toEqual(["start -> db:sync"]);
    });
  });

  describe("Requirement 16.5: reuses resolveScriptCommands from the scanner", () => {
    test("every guarded script and its bun-run targets are DDL-free", () => {
      for (const name of SCHEMA_GUARDED_SCRIPT_NAMES) {
        const resolved = resolveScriptCommands(packageScripts, name);
        if (typeof packageScripts[name] === "string") {
          expect(resolved[0]).toEqual({
            script: name,
            command: packageScripts[name],
          });
        }
        for (const { command } of resolved) {
          expect(containsDatabaseMutation(command)).toBe(false);
        }
      }
    });

    test("resolveScriptCommands follows a mutation hidden two scripts deep", () => {
      const resolved = resolveScriptCommands(
        {
          start: "bun run prepare:start && next start",
          "prepare:start": "bun run db:sync",
          "db:sync": "prisma db push",
        },
        "start",
      );
      expect(
        resolved.some(({ command }) => containsDatabaseMutation(command)),
      ).toBe(true);
    });
  });

  describe("Requirement 16.1: DO $mig$ blocks are paired and balanced", () => {
    for (const migration of specMigrations) {
      const blocks = dollarQuotedBlocks(migrationSql(migration.id));

      test(`${migration.id} guards additive DDL inside DO $mig$ blocks`, () => {
        expect(blocks.length).toBeGreaterThanOrEqual(15);
        for (const block of blocks) expect(block.tag).toBe("$mig$");
      });

      test(`${migration.id} closes every block with balanced BEGIN/END, IF/END IF, LOOP/END LOOP`, () => {
        const unbalanced = blocks
          .filter((block) => !block.balanced)
          .map(
            (block) =>
              `line ${block.line}: closed=${block.closed} ` +
              `begin=${block.beginCount}/${block.bareEndCount} ` +
              `if=${block.openIfCount}/${block.endIfCount} ` +
              `loop=${block.openLoopCount}/${block.endLoopCount}`,
          );
        expect(unbalanced).toEqual([]);
      });
    }

    test("an unterminated $mig$ block is detected", () => {
      const [block] = dollarQuotedBlocks(
        'DO $mig$ BEGIN ALTER TABLE "X" ADD COLUMN IF NOT EXISTS "y" TEXT; END',
      );
      expect(block.closed).toBe(false);
      expect(block.balanced).toBe(false);
    });

    test("a missing END IF unbalances the block", () => {
      const [block] = dollarQuotedBlocks("DO $mig$ BEGIN IF true THEN PERFORM 1; END $mig$;");
      expect(block.closed).toBe(true);
      expect(block.openIfCount).toBe(1);
      expect(block.endIfCount).toBe(0);
      expect(block.balanced).toBe(false);
    });

    test("a balanced loop-and-conditional block is accepted", () => {
      const [block] = dollarQuotedBlocks(
        [
          "DO $mig$",
          "BEGIN",
          "  FOREACH x IN ARRAY ARRAY['a'] LOOP",
          "    IF x IS NOT NULL THEN PERFORM 1; END IF;",
          "  END LOOP;",
          "END",
          "$mig$;",
        ].join("\n"),
      );
      expect(block.balanced).toBe(true);
    });
  });

  describe("Requirement 16.1: every added constraint is created NOT VALID", () => {
    for (const migration of specMigrations) {
      const constraints = addedConstraints(migrationSql(migration.id));

      test(`${migration.id} adds foreign-key and check constraints`, () => {
        expect(constraints.length).toBeGreaterThanOrEqual(20);
        // The knowledge-decision and submitted-by constraints are issued through
        // EXECUTE format(...), so a dynamic constraint must be found.
        expect(constraints.some((usage) => usage.source === "dynamic")).toBe(
          true,
        );
      });

      test(`${migration.id} carries NOT VALID on every added constraint`, () => {
        const missing = constraints
          .filter((usage) => !usage.hasNotValid)
          .map((usage) => `line ${usage.line} (${usage.source}): ${usage.snippet}`);
        expect(missing).toEqual([]);
      });
    }

    test("a direct ADD CONSTRAINT without NOT VALID is reported", () => {
      const usages = addedConstraints(
        'ALTER TABLE "X" ADD CONSTRAINT "X_chk" CHECK ("n" > 0);',
      );
      expect(usages).toHaveLength(1);
      expect(usages[0].source).toBe("statement");
      expect(usages[0].hasNotValid).toBe(false);
    });

    test("a dynamic ADD CONSTRAINT is judged by its executed literal", () => {
      const valid = addedConstraints(
        "DO $mig$ BEGIN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (n > 0) NOT VALID', 'X', 'Y'); END $mig$;",
      );
      expect(
        valid.some((usage) => usage.source === "dynamic" && usage.hasNotValid),
      ).toBe(true);

      const invalid = addedConstraints(
        "DO $mig$ BEGIN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (n > 0)', 'X', 'Y'); END $mig$;",
      );
      expect(
        invalid.some(
          (usage) => usage.source === "dynamic" && !usage.hasNotValid,
        ),
      ).toBe(true);
    });
  });

  describe("Requirement 16.1: schema.prisma index/unique names resolve to migration SQL", () => {
    for (const migration of specMigrations) {
      const createdIndexes = new Set(
        analyzeMigrationSql(migrationSql(migration.id)).createdIndexes,
      );

      for (const table of migration.createsTables) {
        test(`${migration.id}: every ${table} index/unique is created in the migration SQL`, () => {
          const declared = prismaIndexUniqueNames(schemaSource, table);
          expect(declared.length).toBeGreaterThan(0);
          const missing = declared.filter(
            (name) => !createdIndexes.has(name.toLowerCase()),
          );
          expect(missing).toEqual([]);
        });
      }
    }

    test("the resolver derives default and mapped index/unique names", () => {
      const schema = [
        "model Widget {",
        "  id   String @id @default(cuid())",
        "  name String @unique",
        "  slug String",
        "  @@unique([slug])",
        "  @@index([name, slug])",
        '  @@index([slug], map: "Widget_custom_idx")',
        "}",
      ].join("\n");
      const names = prismaIndexUniqueNames(schema, "Widget");
      expect(names).toContain("Widget_name_key");
      expect(names).toContain("Widget_slug_key");
      expect(names).toContain("Widget_name_slug_idx");
      expect(names).toContain("Widget_custom_idx");
      expect(names).not.toContain("Widget_pkey");
    });
  });
});
