/**
 * Marketing may only promise what the code actually does.
 *
 * Four claims shipped that the platform does not deliver. Each is pinned here
 * twice: once as a pattern that must not reappear in customer-facing source,
 * and once as an assertion about the capability that made it false. The second
 * half is the point — if someone later builds PDF OCR or a share link, that
 * assertion fails and tells us the copy may be widened again, instead of the
 * guard quietly outliving the reason it exists.
 *
 * These are not style nits. A buyer reads "OCR" next to "scanned documents"
 * and uploads a scanned tender; they read "local-first" under a padlock and
 * conclude their bid never leaves their control. Both would be wrong, and both
 * would be found out at the worst moment.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Every surface a prospect reads before signing: the landing page, the public
 * marketing pages, and the copy modules behind them.
 */
function customerFacingFiles(): string[] {
  return [
    ...walk(resolve(root, "src/components/marketing")),
    ...walk(resolve(root, "src/lib/marketing")),
    ...walk(resolve(root, "src/app/compliance")),
  ].filter((f) => !f.includes("__tests"));
}

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

type Claim = Readonly<{
  id: string;
  /** Wording that overstates what ships. */
  patterns: readonly RegExp[];
  /** Wordings that actually shipped and had to be corrected. */
  shipped: readonly string[];
}>;

const CLAIMS: readonly Claim[] = [
  {
    id: "ocr-on-pdfs",
    // OCR is real, for images. The false part is attaching it to PDFs and
    // scans, which is exactly the case that returns nothing.
    //
    // Deliberately single-line and both directions. A cross-line rule would
    // also fire on the honest answer, since explaining that scanned PDFs are
    // *not* OCR'd requires saying both words near each other. What this stops
    // is the natural way the claim comes back: asserting the link in one
    // breath. The context-only form is held instead by the capability test
    // below, which is the stronger guard anyway.
    patterns: [
      /OCR[^.\n]{0,40}\b(pdf|scan(ned)?)\b/i,
      /\b(pdf|scan(ned)?)\b[^.\n]{0,40}OCR/i,
    ],
    shipped: [
      "Scanned PDFs are processed with OCR",
      "OCR for scanned tenders",
      "تُستوعب ملفات PDF الممسوحة بـ OCR",
    ],
  },
  {
    id: "local-first",
    // Arabic gets the exact shipped phrase rather than a pattern: محلي also
    // spells "local content" (المحتوى المحلي), which is a real feature of this
    // product, and a pattern loose enough to catch the badge would ban it.
    patterns: [/local[- ]first/i, /\bon[- ]premise?s?\b/i, /آمن ومحلّي/],
    shipped: ['<span>{ar ? "آمن ومحلّي" : "Private & local-first"}</span>'],
  },
  {
    id: "share-link",
    patterns: [
      /share[- ]?link/i,
      /\bshare\b[^.\n]{0,20}\bwith (the )?team\b/i,
      /رابط مشاركة/,
    ],
    shipped: [
      'bodyEn: "Every clause: covered, in progress, missing. Share link with team — always synced.",',
      "كل فقرة: مغطاة، قيد العمل، مفقودة. رابط مشاركة مع الفريق — متزامن دائماً.",
    ],
  },
];

describe("customer-facing copy does not promise absent capabilities", () => {
  for (const claim of CLAIMS) {
    test(`no surface makes the ${claim.id} claim`, () => {
      const hits: string[] = [];
      for (const file of customerFacingFiles()) {
        const relative = file.split("/src/")[1] ?? file;
        const source = readFileSync(file, "utf8");
        for (const pattern of claim.patterns) {
          const match = source.match(pattern);
          if (match) hits.push(`${relative} — ${match[0].slice(0, 120)}`);
        }
      }
      expect(hits, `${claim.id} overclaimed:\n${hits.join("\n")}`).toEqual([]);
    });

    test(`the ${claim.id} scan still catches the wording that shipped`, () => {
      // Anti-vacuous: a pattern narrow enough to pass is narrow enough to miss.
      const missed = claim.shipped.filter(
        (s) => !claim.patterns.some((p) => p.test(s))
      );
      expect(missed, `no longer detected:\n${missed.join("\n")}`).toEqual([]);
    });
  }

  test("the scans do not fire on honest neighbouring copy", () => {
    // The other direction: patterns broad enough to match anything would pass
    // the scans above by making the copy impossible to write.
    const benign = [
      "Images and photographed pages are read with OCR.",
      "Hosting region is disclosed in your service agreement.",
      "Everyone in your workspace sees the same coverage matrix.",
      "تُقرأ الصور والصفحات المصوّرة عبر OCR.",
      "المحتوى المحلي والتوطين",
    ];
    const wrong = benign.filter((b) =>
      CLAIMS.some((c) => c.patterns.some((p) => p.test(b)))
    );
    expect(wrong, `honest line flagged:\n${wrong.join("\n")}`).toEqual([]);
  });
});

describe("the capabilities behind those claims are still absent", () => {
  test("OCR is still reachable only for image MIME types", () => {
    // If a PDF OCR fallback is ever added, this fails — and the FAQ answer
    // narrowed above may then be widened back.
    const ingestion = read("src/lib/agents/ingestion.ts");
    expect(ingestion).toContain("if (isImageMime(mimeType, originalName))");
    const pdfBranch = ingestion.slice(ingestion.indexOf('lower.endsWith(".pdf")'));
    expect(
      pdfBranch.slice(0, pdfBranch.indexOf("\n  }")),
      "the PDF branch now reaches OCR — revisit the scanned-documents answer"
    ).not.toContain("extractTextFromImage");
  });

  test("document content is still sent to third-party model providers", () => {
    // The whole basis of dropping "local-first": generation calls out.
    const gateway = read("src/lib/llm/gateway.ts");
    expect(gateway).toContain("anthropic/");
  });

  test("there is still no share-link capability", () => {
    const schema = read("prisma/schema.prisma");
    for (const token of ["shareToken", "shareLink", "publicLink"]) {
      expect(schema, `${token} exists — the share claim may be restored`).not.toContain(token);
    }
  });

  test("MFA is still opt-in per user", () => {
    // Copy may say MFA is available, not that it is in force.
    expect(read("prisma/schema.prisma")).toContain(
      "mfaEnabled         Boolean   @default(false)"
    );
    expect(read("src/app/compliance/page.tsx")).not.toMatch(
      /(?<!optional )session MFA/
    );
  });
});
