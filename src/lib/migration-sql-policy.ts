/**
 * Static additive-migration policy for the SQL files under `prisma/migrations`.
 *
 * Requirement 16.1 obliges every schema change introduced by the
 * platform-completion specification to be expressed as an additive migration
 * that adds only tables, columns, indexes, or constraints; that drops or renames
 * nothing; that narrows no column type; and in which every added column is
 * nullable or carries a default so the statement applies to a table that already
 * holds rows.
 *
 * This module is the single implementation of that check. It parses SQL text
 * statically — it never connects to a database, never executes SQL, and never
 * shells out to Prisma — so it is safe to run from unit tests and from the
 * deployment safety gate. `migration-registry.test.ts` and
 * `__tests__/platform-completion/property-32-migration-sql.test.ts` both consume
 * it rather than re-implementing statement parsing.
 *
 * Deliberate policy decisions:
 *
 * - **Type narrowing is undecidable in general**, so every
 *   `ALTER COLUMN ... TYPE` / `ALTER COLUMN ... SET DATA TYPE` statement is
 *   rejected outright. A strictly additive migration never needs one; a genuine
 *   widening belongs in a separately reviewed release step.
 * - **String literals and comments are not SQL.** A `DROP TABLE` inside a quoted
 *   string or a comment is text, not a statement, and is not reported. Because
 *   that leaves dynamic SQL unexamined, `EXECUTE` statements get one extra rule
 *   (`DESTRUCTIVE_DYNAMIC_SQL`) that inspects the literal they execute.
 * - **Double-quoted identifiers are read as written.** A keyword hidden inside a
 *   quoted identifier (`"drop table"`) is reported rather than excused; the
 *   policy fails closed on deliberately obfuscated names.
 * - **The allowed-statement list is deliberately narrow.** Adding a new statement
 *   form is a specification decision, not a parser tweak.
 */

/* ────────────────────────────── lexical scanning ───────────────────────────── */

export type SqlRegionKind =
  | "code"
  | "lineComment"
  | "blockComment"
  | "stringLiteral"
  | "quotedIdentifier"
  | "dollarQuoted";

export interface SqlRegion {
  readonly kind: SqlRegionKind;
  /** Inclusive start offset of the region, including any delimiter. */
  readonly start: number;
  /** Exclusive end offset of the region, including any delimiter. */
  readonly end: number;
  /** Inclusive start offset of the region content, excluding delimiters. */
  readonly bodyStart: number;
  /** Exclusive end offset of the region content, excluding delimiters. */
  readonly bodyEnd: number;
}

/** `$$` or `$tag$` dollar-quote delimiter at the start of the supplied slice. */
const DOLLAR_DELIMITER = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/u;

/**
 * Split SQL text into comment, string-literal, quoted-identifier,
 * dollar-quoted, and code regions. Every offset refers to the input string, so
 * masking a region never changes the length of the text and line numbers stay
 * stable.
 */
export function sqlRegions(sql: string): readonly SqlRegion[] {
  const regions: SqlRegion[] = [];
  let codeStart = 0;
  let index = 0;

  const pushCode = (end: number): void => {
    if (end > codeStart) {
      regions.push({
        kind: "code",
        start: codeStart,
        end,
        bodyStart: codeStart,
        bodyEnd: end,
      });
    }
  };

  const pushDelimited = (
    kind: SqlRegionKind,
    start: number,
    end: number,
    bodyStart: number,
    bodyEnd: number,
  ): void => {
    pushCode(start);
    regions.push({
      kind,
      start,
      end,
      bodyStart,
      bodyEnd: Math.max(bodyStart, bodyEnd),
    });
    codeStart = end;
    index = end;
  };

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (char === "-" && next === "-") {
      const lineEnd = sql.indexOf("\n", index);
      const end = lineEnd === -1 ? sql.length : lineEnd;
      pushDelimited("lineComment", index, end, index + 2, end);
      continue;
    }

    if (char === "/" && next === "*") {
      // PostgreSQL block comments nest.
      let depth = 1;
      let cursor = index + 2;
      while (cursor < sql.length && depth > 0) {
        if (sql[cursor] === "/" && sql[cursor + 1] === "*") {
          depth += 1;
          cursor += 2;
          continue;
        }
        if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
          depth -= 1;
          cursor += 2;
          continue;
        }
        cursor += 1;
      }
      pushDelimited("blockComment", index, cursor, index + 2, cursor - 2);
      continue;
    }

    if (char === "'" || char === '"') {
      const kind: SqlRegionKind =
        char === "'" ? "stringLiteral" : "quotedIdentifier";
      let cursor = index + 1;
      let closed = false;
      while (cursor < sql.length) {
        if (sql[cursor] !== char) {
          cursor += 1;
          continue;
        }
        if (sql[cursor + 1] === char) {
          // Doubled delimiter is an escaped delimiter, not the terminator.
          cursor += 2;
          continue;
        }
        cursor += 1;
        closed = true;
        break;
      }
      const end = closed ? cursor : sql.length;
      pushDelimited(kind, index, end, index + 1, closed ? end - 1 : end);
      continue;
    }

    if (char === "$") {
      const delimiter = DOLLAR_DELIMITER.exec(sql.slice(index));
      if (delimiter) {
        const tag = delimiter[0];
        const bodyStart = index + tag.length;
        const closing = sql.indexOf(tag, bodyStart);
        const bodyEnd = closing === -1 ? sql.length : closing;
        const end = closing === -1 ? sql.length : closing + tag.length;
        pushDelimited("dollarQuoted", index, end, bodyStart, bodyEnd);
        continue;
      }
    }

    index += 1;
  }

  pushCode(sql.length);
  return regions;
}

/** Replace every character of the range with `fill`, keeping newlines. */
function blankRange(
  characters: string[],
  start: number,
  end: number,
  fill = " ",
): void {
  for (let offset = start; offset < end; offset += 1) {
    if (characters[offset] !== "\n") characters[offset] = fill;
  }
}

/**
 * Line and block comments replaced by spaces. Offsets, lengths, and line
 * numbers are preserved, and a comment marker inside a string literal or a
 * dollar-quoted body is left alone.
 */
export function stripSqlComments(sql: string): string {
  const characters = [...sql];
  for (const region of sqlRegions(sql)) {
    if (region.kind === "lineComment" || region.kind === "blockComment") {
      blankRange(characters, region.start, region.end);
    }
  }
  return characters.join("");
}

function maskRegionBodies(
  sql: string,
  kinds: readonly SqlRegionKind[],
  fill = " ",
): string {
  const wanted = new Set(kinds);
  const characters = [...sql];
  for (const region of sqlRegions(sql)) {
    if (wanted.has(region.kind)) {
      blankRange(characters, region.bodyStart, region.bodyEnd, fill);
    }
  }
  return characters.join("");
}

/**
 * Structural view used for depth-aware keyword and comma scanning: quoted
 * identifier bodies are replaced with a non-whitespace filler so a parenthesis
 * or comma inside a name cannot skew nesting depth, and so the result keeps the
 * exact length and whitespace layout of the input.
 */
function shapeOf(sql: string): string {
  return maskRegionBodies(sql, ["quotedIdentifier"], "_");
}

/**
 * String-literal and dollar-quoted bodies blanked so keyword scanning never
 * reads quoted text as SQL. Quoted identifiers stay readable so table and index
 * names remain available.
 */
export function maskSqlLiterals(sql: string): string {
  return maskRegionBodies(stripSqlComments(sql), [
    "stringLiteral",
    "dollarQuoted",
  ]);
}

/* ───────────────────────────── statement structure ─────────────────────────── */

export interface MigrationSqlStatement {
  /** 1-based position in the executable statement sequence. */
  readonly index: number;
  /** 1-based line of the statement start in the original file. */
  readonly line: number;
  /** Statement text with comments removed. */
  readonly text: string;
  /** Statement text with comments removed and quoted content blanked. */
  readonly scanned: string;
  /** `scanned` with quoted identifiers blanked as well; used for depth scanning. */
  readonly structural: string;
  /** Describes the enclosing `DO` block, or `null` for a top-level statement. */
  readonly container: string | null;
  /** `declaration` marks a PL/pgSQL `DECLARE` section rather than a statement. */
  readonly role: "statement" | "declaration";
}

interface RawStatement {
  readonly offset: number;
  readonly text: string;
  readonly scanned: string;
  readonly structural: string;
}

function lineOf(sql: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < sql.length; index += 1) {
    if (sql[index] === "\n") line += 1;
  }
  return line;
}

/** Depth-aware, quote-aware split of already comment-stripped SQL on `;`. */
function splitStatements(text: string): RawStatement[] {
  const scannedAll = maskRegionBodies(text, ["stringLiteral", "dollarQuoted"]);
  const structuralAll = shapeOf(scannedAll);
  const boundaries: number[] = [];

  for (const region of sqlRegions(text)) {
    if (region.kind !== "code") continue;
    for (let offset = region.start; offset < region.end; offset += 1) {
      if (text[offset] === ";") boundaries.push(offset);
    }
  }

  const statements: RawStatement[] = [];
  let start = 0;
  for (const boundary of [...boundaries, text.length]) {
    let from = start;
    let to = boundary;
    while (from < to && /\s/u.test(text[from])) from += 1;
    while (to > from && /\s/u.test(text[to - 1])) to -= 1;
    if (to > from) {
      statements.push({
        offset: from,
        text: text.slice(from, to),
        scanned: scannedAll.slice(from, to),
        structural: structuralAll.slice(from, to),
      });
    }
    start = boundary + 1;
  }
  return statements;
}

function collapse(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Offset of the first `keyword` occurrence outside parentheses and brackets. */
function keywordAtDepthZero(structural: string, keyword: string): number {
  const pattern = new RegExp(`\\b${keyword}\\b`, "giu");
  let depth = 0;
  const depthAt = new Array<number>(structural.length).fill(0);
  for (let index = 0; index < structural.length; index += 1) {
    depthAt[index] = depth;
    const char = structural[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
  }
  for (const match of structural.matchAll(pattern)) {
    const at = match.index ?? -1;
    if (at >= 0 && depthAt[at] === 0) return at;
  }
  return -1;
}

const MAX_NESTING_DEPTH = 4;

/**
 * Every executable statement in the file, in order, with the body of each
 * `DO $tag$ ... $tag$` block expanded so a statement hidden inside a block is
 * analyzed as SQL rather than skipped.
 */
export function parseMigrationSql(sql: string): readonly MigrationSqlStatement[] {
  const stripped = stripSqlComments(sql);
  const collected: MigrationSqlStatement[] = [];

  const visit = (
    raw: RawStatement,
    container: string | null,
    depth: number,
  ): void => {
    const line = lineOf(stripped, raw.offset);
    const isDoBlock = /^DO\b/iu.test(collapse(raw.scanned));

    collected.push({
      index: collected.length + 1,
      line,
      text: raw.text,
      scanned: raw.scanned,
      structural: raw.structural,
      container,
      role: "statement",
    });

    if (!isDoBlock || depth >= MAX_NESTING_DEPTH) return;

    const block = sqlRegions(raw.text).find(
      (region) => region.kind === "dollarQuoted",
    );
    if (!block) return;

    const bodyOffset = raw.offset + block.bodyStart;
    // Comments inside a dollar-quoted body are not stripped by the outer pass.
    const body = stripSqlComments(
      raw.text.slice(block.bodyStart, block.bodyEnd),
    );
    const nestedContainer = `DO block starting at line ${line}`;

    const bodyStructural = shapeOf(
      maskRegionBodies(body, ["stringLiteral", "dollarQuoted"]),
    );
    const beginAt = keywordAtDepthZero(bodyStructural, "BEGIN");
    const declarationEnd = beginAt === -1 ? 0 : beginAt;
    const declaration = body.slice(0, declarationEnd);

    if (collapse(declaration).length > 0) {
      collected.push({
        index: collected.length + 1,
        line: lineOf(stripped, bodyOffset),
        text: declaration.trim(),
        scanned: maskSqlLiterals(declaration).trim(),
        structural: shapeOf(maskSqlLiterals(declaration)).trim(),
        container: nestedContainer,
        role: "declaration",
      });
    }

    for (const nested of splitStatements(body.slice(declarationEnd))) {
      visit(
        {
          ...nested,
          offset: bodyOffset + declarationEnd + nested.offset,
        },
        nestedContainer,
        depth + 1,
      );
    }
  };

  for (const statement of splitStatements(stripped)) {
    visit(statement, null, 0);
  }

  return collected;
}

/* ──────────────────────────────── policy rules ─────────────────────────────── */

export type MigrationSqlRuleCode =
  | "DROP_TABLE"
  | "DROP_COLUMN"
  | "DROP_CONSTRAINT"
  | "DROP_INDEX"
  | "DROP_SCHEMA"
  | "DROP_TYPE"
  | "DROP_DATABASE"
  | "NON_ADDITIVE_DROP"
  | "TRUNCATE"
  | "RENAME"
  | "ALTER_COLUMN_TYPE"
  | "SET_NOT_NULL"
  | "ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT"
  | "DESTRUCTIVE_DYNAMIC_SQL"
  | "UNSUPPORTED_STATEMENT"
  | "UNSUPPORTED_ALTER_ACTION";

export const MIGRATION_SQL_RULES: Readonly<
  Record<MigrationSqlRuleCode, string>
> = Object.freeze({
  DROP_TABLE: "drops a table",
  DROP_COLUMN: "drops a column",
  DROP_CONSTRAINT: "drops a constraint of a pre-existing table",
  DROP_INDEX: "drops an index this migration does not create",
  DROP_SCHEMA: "drops a schema",
  DROP_TYPE: "drops a type",
  DROP_DATABASE: "drops a database",
  NON_ADDITIVE_DROP: "removes an existing schema object or column property",
  TRUNCATE: "empties an existing table",
  RENAME: "renames an existing schema object",
  ALTER_COLUMN_TYPE:
    "changes the type of an existing column, which can narrow it",
  SET_NOT_NULL: "makes an existing column NOT NULL",
  ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT:
    "adds a NOT NULL column without a DEFAULT, so the statement fails on a table holding rows",
  DESTRUCTIVE_DYNAMIC_SQL: "executes dynamic SQL containing a destructive statement",
  UNSUPPORTED_STATEMENT: "is not one of the allowed additive statement forms",
  UNSUPPORTED_ALTER_ACTION: "is not one of the allowed additive ALTER TABLE actions",
});

export interface MigrationSqlViolation {
  readonly rule: MigrationSqlRuleCode;
  readonly line: number;
  readonly statementIndex: number;
  readonly container: string | null;
  readonly detail: string;
  readonly snippet: string;
}

export interface MigrationSqlAnalysis {
  readonly statements: readonly MigrationSqlStatement[];
  readonly createdTables: readonly string[];
  readonly createdIndexes: readonly string[];
  readonly violations: readonly MigrationSqlViolation[];
}

export interface MigrationSqlPolicyOptions {
  /**
   * When true, a statement form outside the additive allowlist is not reported.
   * Used for migrations that predate this specification, whose destructive
   * statements are still rejected but whose statement vocabulary is not
   * constrained retroactively.
   */
  readonly allowUnclassifiedStatements?: boolean;
}

const ALLOWED_STATEMENTS: readonly RegExp[] = [
  /^CREATE\s+TABLE\b/iu,
  /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/iu,
  /^CREATE\s+TYPE\b/iu,
  /^CREATE\s+SCHEMA\b/iu,
  /^CREATE\s+EXTENSION\b/iu,
  /^COMMENT\s+ON\b/iu,
  /^ALTER\s+TABLE\b/iu,
  /^ALTER\s+TYPE\s+\S+\s+ADD\s+VALUE\b/iu,
  /^DO\b/iu,
  /^SET\b/iu,
];

/** PL/pgSQL forms that carry no data-definition statement of their own. */
const CONTROL_STATEMENTS: readonly RegExp[] = [
  /^BEGIN\b/iu,
  /^END\b/iu,
  /^DECLARE\b/iu,
  /^ELSE\b/iu,
  /^EXIT\b/iu,
  /^CONTINUE\b/iu,
  /^RETURN\b/iu,
  /^RAISE\b/iu,
  /^PERFORM\b/iu,
  /^SELECT\b/iu,
  /^EXECUTE\b/iu,
  /^GET\s+DIAGNOSTICS\b/iu,
  /^NULL$/iu,
  /^[A-Za-z_"][\w".]*\s*:=/u,
];

const IDENTIFIER = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_]*)`;

const ALLOWED_ALTER_ACTIONS: readonly RegExp[] = [
  /^ADD\s+CONSTRAINT\b/iu,
  /^ADD\s+(?:PRIMARY\s+KEY|UNIQUE|FOREIGN\s+KEY|CHECK|EXCLUDE)\b/iu,
  /^VALIDATE\s+CONSTRAINT\b/iu,
  new RegExp(String.raw`^ALTER\s+(?:COLUMN\s+)?${IDENTIFIER}\s+SET\s+DEFAULT\b`, "iu"),
];

const ADD_COLUMN_ACTION = /^ADD\s+(?:COLUMN\b|IF\s+NOT\s+EXISTS\b|["A-Za-z_])/iu;

const ALTER_TABLE_PREFIX = new RegExp(
  String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(${IDENTIFIER})(?:\.(${IDENTIFIER}))?\s*`,
  "iu",
);

const DROP_OBJECT = /\bDROP\s+(?:IF\s+EXISTS\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)/giu;
const ALTER_COLUMN_TYPE = new RegExp(
  String.raw`\bALTER\s+(?:COLUMN\s+)?${IDENTIFIER}\s+(?:SET\s+DATA\s+)?TYPE\b`,
  "iu",
);
const DESTRUCTIVE_IN_DYNAMIC_SQL =
  /\bDROP\s+(?:IF\s+EXISTS\s+)?(?:TABLE|COLUMN|CONSTRAINT|INDEX|SCHEMA|TYPE|DATABASE)\b|\bTRUNCATE\b|\bRENAME\b|\bSET\s+NOT\s+NULL\b/iu;

const DROP_RULES: Readonly<Record<string, MigrationSqlRuleCode>> = Object.freeze({
  TABLE: "DROP_TABLE",
  COLUMN: "DROP_COLUMN",
  CONSTRAINT: "DROP_CONSTRAINT",
  INDEX: "DROP_INDEX",
  SCHEMA: "DROP_SCHEMA",
  TYPE: "DROP_TYPE",
  DATABASE: "DROP_DATABASE",
});

function unquote(identifier: string | undefined): string {
  if (!identifier) return "";
  const trimmed = identifier.trim();
  return trimmed.startsWith('"')
    ? trimmed.slice(1, -1).replace(/""/gu, '"')
    : trimmed;
}

function snippetOf(text: string): string {
  const collapsed = collapse(text);
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}...` : collapsed;
}

/**
 * Split an ALTER TABLE action list on the commas that sit outside parentheses,
 * so a comma inside `CHECK (...)`, `FOREIGN KEY (...)`, or `NUMERIC(10, 2)` never
 * splits an action.
 */
function splitAlterActions(actionList: string): readonly string[] {
  const text = collapse(actionList);
  const shape = shapeOf(text);
  const actions: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < shape.length; index += 1) {
    const char = shape[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      actions.push(text.slice(start, index));
      start = index + 1;
    }
  }
  actions.push(text.slice(start));
  return actions.map(collapse).filter((action) => action.length > 0);
}

/**
 * Strip PL/pgSQL control wrappers (`BEGIN`, `IF ... THEN`, `FOREACH ... LOOP`,
 * `END IF`) so the statement they wrap can be classified on its own. Returns an
 * empty string when the fragment carries no statement at all.
 */
function unwrapControlPrefix(scanned: string): string {
  let text = collapse(scanned);

  for (let pass = 0; pass < 8; pass += 1) {
    const before = text;
    // Recomputed after every cut so offsets stay aligned with `text`.
    let shape = shapeOf(text);

    const cut = (at: number): void => {
      text = text.slice(at).trim();
      shape = shapeOf(text);
    };

    if (/^BEGIN\b/iu.test(shape)) cut("BEGIN".length);
    else if (/^(?:IF|ELSIF)\b/iu.test(shape)) {
      const then = keywordAtDepthZero(shape, "THEN");
      if (then === -1) break;
      cut(then + "THEN".length);
    } else if (/^ELSE\b/iu.test(shape)) cut("ELSE".length);
    else if (/^(?:FOREACH|FOR|WHILE)\b/iu.test(shape)) {
      const loop = keywordAtDepthZero(shape, "LOOP");
      if (loop === -1) break;
      cut(loop + "LOOP".length);
    } else if (/^LOOP\b/iu.test(shape)) cut("LOOP".length);

    const trailing = /\bEND(?:\s+(?:IF|LOOP|CASE))?$/iu.exec(shape);
    if (trailing) {
      text = trailing.index === 0 ? "" : text.slice(0, trailing.index).trim();
    }

    if (text === before) break;
  }

  return text;
}

function dynamicSqlLiterals(statement: MigrationSqlStatement): readonly string[] {
  return sqlRegions(statement.text)
    .filter(
      (region) =>
        region.kind === "stringLiteral" || region.kind === "dollarQuoted",
    )
    .map((region) => statement.text.slice(region.bodyStart, region.bodyEnd));
}

function collectCreatedObjects(
  statements: readonly MigrationSqlStatement[],
): { tables: Set<string>; indexes: Set<string> } {
  const tables = new Set<string>();
  const indexes = new Set<string>();
  const tablePattern = new RegExp(
    String.raw`^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER})`,
    "iu",
  );
  const indexPattern = new RegExp(
    String.raw`^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(${IDENTIFIER})`,
    "iu",
  );

  for (const statement of statements) {
    const text = collapse(statement.scanned);
    const table = tablePattern.exec(text);
    if (table) tables.add(unquote(table[1]).toLowerCase());
    const index = indexPattern.exec(text);
    if (index) indexes.add(unquote(index[1]).toLowerCase());
  }
  return { tables, indexes };
}

/**
 * Parse the supplied migration SQL and report every statement that is not
 * additive. An empty `violations` array means the file satisfies Requirement
 * 16.1 under this policy.
 */
export function analyzeMigrationSql(
  sql: string,
  options: MigrationSqlPolicyOptions = {},
): MigrationSqlAnalysis {
  const statements = parseMigrationSql(sql);
  const created = collectCreatedObjects(statements);
  const violations: MigrationSqlViolation[] = [];

  const report = (
    statement: MigrationSqlStatement,
    rule: MigrationSqlRuleCode,
    detail: string,
  ): void => {
    violations.push({
      rule,
      line: statement.line,
      statementIndex: statement.index,
      container: statement.container,
      detail,
      snippet: snippetOf(statement.text),
    });
  };

  for (const statement of statements) {
    const scanned = collapse(statement.scanned);
    const unwrapped = unwrapControlPrefix(statement.scanned);
    const alterPrefix = ALTER_TABLE_PREFIX.exec(unwrapped);
    const alterTarget = unquote(alterPrefix?.[2] ?? alterPrefix?.[1]).toLowerCase();
    const targetIsSelfCreated =
      alterTarget.length > 0 && created.tables.has(alterTarget);

    /* Drops. A constraint or index drop that guards an object this same
       migration creates is an idempotency guard on a brand-new object, not a
       change to a pre-existing one, so it stays additive. */
    for (const match of scanned.matchAll(DROP_OBJECT)) {
      const object = collapse(match[1] ?? "").toUpperCase();
      const keyword = object.split(" ")[0] ?? "";
      const rule = DROP_RULES[keyword] ?? "NON_ADDITIVE_DROP";

      if (rule === "DROP_CONSTRAINT" && targetIsSelfCreated) continue;
      if (rule === "DROP_INDEX") {
        const names = [...statement.scanned.matchAll(/"((?:[^"]|"")+)"/gu)].map(
          (name) => unquote(`"${name[1]}"`).toLowerCase(),
        );
        if (names.length > 0 && names.every((name) => created.indexes.has(name))) {
          continue;
        }
      }
      report(
        statement,
        rule,
        rule === "NON_ADDITIVE_DROP"
          ? `DROP ${object} is not additive`
          : `DROP ${keyword} is not additive`,
      );
    }

    if (/\bTRUNCATE\b/iu.test(scanned)) {
      report(statement, "TRUNCATE", "TRUNCATE empties an existing table");
    }
    if (/\bRENAME\b/iu.test(scanned)) {
      report(statement, "RENAME", "RENAME changes an existing object name");
    }
    if (ALTER_COLUMN_TYPE.test(scanned)) {
      report(
        statement,
        "ALTER_COLUMN_TYPE",
        "ALTER COLUMN ... TYPE can narrow an existing column and is never required by an additive migration",
      );
    }
    if (/\bSET\s+NOT\s+NULL\b/iu.test(scanned)) {
      report(
        statement,
        "SET_NOT_NULL",
        "SET NOT NULL rejects existing rows that hold NULL",
      );
    }
    if (/\bEXECUTE\b/iu.test(scanned)) {
      for (const literal of dynamicSqlLiterals(statement)) {
        if (DESTRUCTIVE_IN_DYNAMIC_SQL.test(literal)) {
          report(
            statement,
            "DESTRUCTIVE_DYNAMIC_SQL",
            `dynamic SQL contains a destructive statement: ${snippetOf(literal)}`,
          );
        }
      }
    }

    if (statement.role === "declaration" || unwrapped.length === 0) continue;

    const isAllowedStatement = ALLOWED_STATEMENTS.some((pattern) =>
      pattern.test(unwrapped),
    );
    const isControl =
      statement.container !== null &&
      CONTROL_STATEMENTS.some((pattern) => pattern.test(unwrapped));
    // A statement already rejected by a specific rule needs no generic report:
    // `DROP TABLE` is reported as DROP_TABLE, not also as an unknown form.
    const alreadyReported = violations.some(
      (violation) => violation.statementIndex === statement.index,
    );

    if (!isAllowedStatement && !isControl) {
      if (!options.allowUnclassifiedStatements && !alreadyReported) {
        report(
          statement,
          "UNSUPPORTED_STATEMENT",
          `statement form is not additive: ${snippetOf(unwrapped)}`,
        );
      }
      continue;
    }

    if (!alterPrefix) continue;

    const actions = splitAlterActions(unwrapped.slice(alterPrefix[0].length));

    for (const action of actions) {
      if (/^DROP\b/iu.test(action)) continue; // Reported by the drop rules above.

      if (ADD_COLUMN_ACTION.test(action) && !/^ADD\s+CONSTRAINT\b/iu.test(action)) {
        const notNull = /\bNOT\s+NULL\b/iu.test(
          action.replace(/\bIF\s+NOT\s+EXISTS\b/giu, " "),
        );
        if (notNull && !/\bDEFAULT\b/iu.test(action)) {
          report(
            statement,
            "ADD_COLUMN_NOT_NULL_WITHOUT_DEFAULT",
            `added column is NOT NULL without a DEFAULT: ${snippetOf(action)}`,
          );
        }
        continue;
      }

      if (ALLOWED_ALTER_ACTIONS.some((pattern) => pattern.test(action))) continue;

      if (!options.allowUnclassifiedStatements) {
        report(
          statement,
          "UNSUPPORTED_ALTER_ACTION",
          `ALTER TABLE action is not additive: ${snippetOf(action)}`,
        );
      }
    }
  }

  return {
    statements,
    createdTables: Object.freeze([...created.tables]),
    createdIndexes: Object.freeze([...created.indexes]),
    violations: Object.freeze(violations),
  };
}

/** Convenience wrapper returning only the violations. */
export function migrationSqlViolations(
  sql: string,
  options: MigrationSqlPolicyOptions = {},
): readonly MigrationSqlViolation[] {
  return analyzeMigrationSql(sql, options).violations;
}

/** One readable line per violation, suitable for a failing assertion message. */
export function formatMigrationSqlViolations(
  violations: readonly MigrationSqlViolation[],
  source = "migration.sql",
): readonly string[] {
  return violations.map(
    (violation) =>
      `${source}:${violation.line} [${violation.rule}] ${violation.detail}` +
      (violation.container ? ` (${violation.container})` : "") +
      ` — ${violation.snippet}`,
  );
}
