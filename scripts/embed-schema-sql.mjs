import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "prisma", "migrations");
const parts = fs
  .readdirSync(dir)
  .filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
  .sort();

let sql = "";
for (const p of parts) {
  const f = path.join(dir, p, "migration.sql");
  if (fs.existsSync(f)) sql += `\n${fs.readFileSync(f, "utf8")}`;
}

const out = `/** Auto-generated from prisma/migrations — run: bun run build:schema-sql */\nexport const SCHEMA_SQL = ${JSON.stringify(sql)};\n`;
const dest = path.join(process.cwd(), "src", "lib", "schema-sql.ts");
fs.writeFileSync(dest, out);
console.log(`Wrote ${dest} (${out.length} chars)`);
