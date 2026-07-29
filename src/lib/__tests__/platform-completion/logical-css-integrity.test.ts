/**
 * Logical CSS / physical-direction integrity (task 12.2 / 12.4 slice).
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Tailwind physical-direction utility classes (not prose like "right-to-left"). */
const PHYSICAL_CLASS_RE =
  /(?:^|["'`\s])(?:-?(?:ml|mr|pl|pr)-(?:\[[^\]]+\]|\d)|(?:-?left|-?right)-(?:\[[^\]]+\]|\d|\/\d)|text-(?:left|right)|border-[lr](?:-\d)?)(?:["'`\s]|$)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("logical CSS integrity for completion surfaces", () => {
  test("dashboard and admin completion components avoid physical direction classes", () => {
    const roots = [
      path.join(process.cwd(), "src/components/dashboard"),
      path.join(process.cwd(), "src/components/admin"),
    ];
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf8");
        if (PHYSICAL_CLASS_RE.test(source)) {
          offenders.push(path.relative(process.cwd(), file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
