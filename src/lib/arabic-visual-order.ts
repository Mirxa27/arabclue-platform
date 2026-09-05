/**
 * Repairs Arabic text that a PDF text layer hands back in *visual* order.
 *
 * Some PDF producers embed Arabic as Presentation Forms (U+FB50–U+FDFF,
 * U+FE70–U+FEFC): one glyph per shaped letter, laid out left to right exactly
 * as drawn. pdf.js then runs its bidi pass only over the letters it classifies
 * as Arabic (the U+06xx block), so an extracted line comes out as
 *   • word order reversed (visual, left to right),
 *   • shaped glyphs inside a word still in visual order,
 *   • but every run of *base* letters inside a word already flipped back to
 *     logical order by pdf.js, and Latin words in their own order.
 * "ﺔﻘﻴﺛو ﺔﻴﻤﻫو" is "وثيقة وهمية" read from the wrong end.
 *
 * The repair is applied per line and only when the line contains presentation
 * forms, so text that arrived in logical order is left untouched:
 *   1. reverse the token order, then restore the order of Latin/digit runs;
 *   2. inside each token, undo pdf.js's partial reorder (flip base-letter runs
 *      and Latin runs back to visual), reverse the whole token glyph-cluster
 *      by glyph-cluster, and fold the shaped glyphs to base letters (NFKC).
 * Combining marks (harakat) precede their base glyph in a visual stream, so
 * they travel forward onto the next glyph; a trailing mark stays on the last.
 *
 * ponytail: heuristic, not a bidi engine. It restores pdf.js output for the
 * presentation-form case seen in real tender PDFs; a producer that emits
 * logical-order presentation forms would be reversed wrongly, not observed.
 */

const SHAPED = /[ﭐ-﷿ﹰ-ﻼ]/;
const MARK = /[ً-ٰٟۖ-ۭ]/;
/** Letters pdf.js classifies as Arabic and reorders itself. */
const BASE_LETTER =
  /[ؠ-يٮ-ۓەۮۯۺ-ۿݐ-ݿࢠ-ࣿ]/;
/** Characters pdf.js leaves in reading order inside an RTL line. */
const LTR_CHAR = /[A-Za-z0-9٠-٩۰-۹]/;
const ARABIC_ANY =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;

export function hasPresentationForms(text: string): boolean {
  return SHAPED.test(text);
}

/** Restores logical order for every line that carries presentation forms. */
export function restoreLogicalArabic(text: string): string {
  if (!hasPresentationForms(text)) return text;
  return text
    .split("\n")
    .map((line) => (hasPresentationForms(line) ? repairLine(line) : line))
    .join("\n");
}

function repairLine(line: string): string {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const reversed = tokens.reverse().map(repairToken);
  return leading + restoreLatinRuns(reversed).join(" ");
}

/** Latin phrases were never reversed by the producer; undo the token flip for them. */
function restoreLatinRuns(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isLatinToken(tokens[i])) {
      out.push(tokens[i]);
      i += 1;
      continue;
    }
    let j = i;
    while (j < tokens.length && isLatinToken(tokens[j])) j += 1;
    out.push(...tokens.slice(i, j).reverse());
    i = j;
  }
  return out;
}

function isLatinToken(token: string): boolean {
  return LTR_CHAR.test(token) && !ARABIC_ANY.test(token);
}

function repairToken(token: string): string {
  if (!SHAPED.test(token)) return token;
  const visual = undoPartialReorder(Array.from(token));
  return reverseVisual(visual).normalize("NFKC");
}

/**
 * pdf.js flipped each run of base letters (with their marks) to logical
 * order and kept Latin/digits readable; flip both back so the whole token is
 * uniformly visual before the final reversal.
 */
function undoPartialReorder(chars: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (BASE_LETTER.test(ch)) {
      let j = i + 1;
      while (j < chars.length && (BASE_LETTER.test(chars[j]) || MARK.test(chars[j]))) {
        j += 1;
      }
      out.push(...logicalRunToVisual(chars.slice(i, j)));
      i = j;
      continue;
    }
    if (LTR_CHAR.test(ch)) {
      let j = i + 1;
      while (j < chars.length && LTR_CHAR.test(chars[j])) j += 1;
      out.push(...chars.slice(i, j).reverse());
      i = j;
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out;
}

/** Logical "base + marks" clusters → visual stream where marks precede the base. */
function logicalRunToVisual(run: string[]): string[] {
  const clusters: string[][] = [];
  for (const ch of run) {
    if (MARK.test(ch) && clusters.length) clusters[clusters.length - 1].push(ch);
    else clusters.push([ch]);
  }
  return clusters.reverse().flatMap((c) => [...c.slice(1), c[0]]);
}

/** Reverses a visual glyph stream; marks end up after their base, as logical text wants. */
function reverseVisual(chars: string[]): string {
  const clusters: { base: string; marks: string[] }[] = [];
  let pending: string[] = [];
  for (const ch of chars) {
    if (MARK.test(ch)) {
      pending.push(ch);
      continue;
    }
    clusters.push({ base: ch, marks: pending });
    pending = [];
  }
  if (pending.length) {
    const last = clusters[clusters.length - 1];
    if (last) last.marks.push(...pending);
    else clusters.push({ base: "", marks: pending });
  }
  return clusters
    .reverse()
    .map((c) => c.base + c.marks.join(""))
    .join("");
}
