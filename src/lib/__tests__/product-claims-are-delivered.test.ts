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
    ...walk(resolve(root, "src/app/contact")),
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
  {
    id: "logo-on-spreadsheets",
    // Brand colour does reach every format. The logo reaches one: the PDF,
    // via the only <img> in any export path. Naming XLSX in the same breath
    // as "your logo" is the false part, so that adjacency is what is banned —
    // not either phrase alone, which are both fine on their own.
    patterns: [
      /\bXLSX\b[^.\n]{0,60}\byour logo\b/i,
      /\byour logo\b[^.\n]{0,60}\bXLSX\b/i,
      /XLSX[^.\n]{0,60}شعارك/,
      /شعارك[^.\n]{0,60}XLSX/,
    ],
    shipped: [
      "PDF, XLSX, full package — AR & EN, your logo, your fonts. Etimad-ready.",
      "PDF، XLSX، حزمة كاملة — عربي وإنجليزي، شعارك، خطوطك. جاهز لاعتماد.",
    ],
  },
  {
    id: "etimad-ready",
    // Etimad requires the technical and financial proposals as separate
    // uploads, normally PDF — the two-envelope split is statutory, not a UI
    // convention (Saudi Government Tenders and Procurement Law, Royal Decree
    // M/128). The pack splits them correctly but ships the financial envelope
    // as a spreadsheet, so it is not uploadable as it stands.
    //
    // Only "Etimad" directly adjacent to "ready" is banned. "Ready for your
    // next Etimad tender?" asks the reader a question and stays legal; naming
    // the market is not a conformance claim.
    // The trust bar writes the brand in Latin and the claim in Arabic, so the
    // mixed-script form needs its own pattern — neither single-script rule
    // sees "Etimad جاهز".
    patterns: [
      /etimad[- ]?ready/i,
      /etimad\s*جاهز/i,
      /جاهز\s*لاعتماد/,
      /اعتماد\s*جاهز/,
    ],
    shipped: [
      "PDF, XLSX, full package — AR & EN, your logo, your fonts. Etimad-ready.",
      "PDPL • NCA • Etimad Ready • Encrypted",
      "PDPL • NCA • Etimad جاهز • تشفير كامل",
      "From RFP intake to an Etimad-ready review pack",
      "من الاستيعاب إلى حزمة اعتماد جاهزة للمراجعة",
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
      "Your logo goes on the PDF cover.",
      "PDF, XLSX and the full package are all bilingual.",
      "Ready for your next Etimad tender?",
      "شعارك على ملف PDF",
      "جاهز لعطاءك القادم على اعتماد؟",
    ];
    const wrong = benign.filter((b) =>
      CLAIMS.some((c) => c.patterns.some((p) => p.test(b)))
    );
    expect(wrong, `honest line flagged:\n${wrong.join("\n")}`).toEqual([]);
  });
});

/**
 * The mirror image of the block above, and the more expensive mistake of the
 * two. An overclaim loses a customer at delivery; an underclaim loses them
 * before they ever sign up, silently, and nothing in the funnel records it.
 *
 * Registration is public, rate-limited, and provisions a workspace with the
 * registrant as OWNER. Two surfaces told prospects to go ask an administrator
 * for credentials instead.
 */
describe("customer-facing copy does not deny capabilities that ship", () => {
  const DENIALS: readonly RegExp[] = [
    /provisioned by (the )?(platform|tenant)/i,
    /platform[- ]provisioned account/i,
    /credentials issued for your organization/i,
    /تُنشأ مساحات العمل من مسؤولي/,
    /حساباً? مُنشأ من المنصة/,
    /ببيانات صادرة لمؤسستك/,
  ];

  test("no surface tells prospects they cannot open their own account", () => {
    const hits: string[] = [];
    for (const file of customerFacingFiles()) {
      const relative = file.split("/src/")[1] ?? file;
      const source = readFileSync(file, "utf8");
      for (const pattern of DENIALS) {
        const match = source.match(pattern);
        if (match) hits.push(`${relative} — ${match[0].slice(0, 120)}`);
      }
    }
    expect(hits, `self-serve denied:\n${hits.join("\n")}`).toEqual([]);
  });

  test("the denial scan still catches the wording that shipped", () => {
    const shipped = [
      "Workspaces are provisioned by platform or tenant administrators. Sign in at /login with credentials issued for your organization.",
      "تُنشأ مساحات العمل من مسؤولي المنصة أو المستأجر. سجّل الدخول من /login ببيانات صادرة لمؤسستك.",
      "Login requires a platform-provisioned account — contact your workspace admin for access, or email support@arabclue.com for enterprise onboarding.",
      "يتطلب تسجيل الدخول حساباً مُنشأ من المنصة — تواصل مع مسؤول مساحة عملك للوصول، أو راسل support@arabclue.com لتأهيل المؤسسات.",
    ];
    const missed = shipped.filter((s) => !DENIALS.some((p) => p.test(s)));
    expect(missed, `no longer detected:\n${missed.join("\n")}`).toEqual([]);
  });

  test("the denial scan leaves the true half of the story alone", () => {
    // Self-serve creates a workspace and makes you its owner. Joining someone
    // else's workspace really does need their invitation — saying so is
    // accurate, and the scan must not make it unsayable.
    const benign = [
      "Create a workspace at /register — you become its owner.",
      "Teammates join an existing workspace by invitation from an admin.",
      "Enterprise tenants can have workspaces provisioned for them on request.",
      "أنشئ مساحة عملك من /register وتصبح مالكها.",
      "ينضم الزملاء إلى مساحة قائمة بدعوة من مسؤولها.",
    ];
    const wrong = benign.filter((b) => DENIALS.some((p) => p.test(b)));
    expect(wrong, `true line flagged:\n${wrong.join("\n")}`).toEqual([]);
  });

  test("self-serve registration is still public and still grants ownership", () => {
    // If registration is ever closed off, this fails and the copy above may go
    // back to pointing people at an administrator.
    const route = read("src/app/api/auth/register/route.ts");
    expect(route).toContain("export async function POST");
    expect(route).toContain("REGISTRATION_RATE_LIMITED");
    expect(route, "register is behind a session — the FAQ answer must change").not.toContain(
      "getServerSession"
    );
    expect(read("src/lib/account-service.ts")).toContain(
      'export const REGISTRATION_MEMBERSHIP_ROLE = "OWNER" as const;'
    );
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

  test("the logo still reaches only the PDF/HTML channel", () => {
    // One <img> in one builder is the whole of it. No export library calls
    // addImage, so XLSX and PPTX carry brand colour and nothing else.
    for (const lib of [
      "src/lib/generators.ts",
      "src/lib/proposal-workbook-xlsx.ts",
      "src/lib/proposal-layout-export.ts",
      "src/lib/contract-export.ts",
      "src/lib/structured-bid-package.ts",
      "src/lib/markdown-docx.ts",
    ]) {
      expect(read(lib), `${lib} embeds an image — the logo claim may widen`).not.toContain(
        "addImage"
      );
    }
  });

  test("the XLSX writers still never set a brand font", () => {
    // exceljs falls back to its own default whenever `name` is unset, so the
    // workbook comes out in Calibri however the workspace configured itself.
    const generators = read("src/lib/generators.ts");
    const xlsxSection = generators.slice(
      generators.indexOf("export async function generateComplianceMatrixXLSX"),
      generators.indexOf("export function generateSlidesHTML")
    );
    expect(xlsxSection.length).toBeGreaterThan(1000);
    for (const token of ["resolveBrandFontStack", "resolveOfficeFontFace", "fontFamily"]) {
      expect(
        xlsxSection,
        `XLSX now uses ${token} — the "your fonts" claim may widen`
      ).not.toContain(token);
    }
  });

  test("the financial envelope is still spreadsheet-only", () => {
    // Etimad wants technical and financial uploaded separately, normally as
    // PDF. The split is right; the financial half is not a PDF, which is the
    // reason "Etimad-ready" had to come off the export copy.
    for (const packager of [
      "src/lib/generators.ts",
      "src/lib/structured-bid-package.ts",
    ]) {
      const source = read(packager);
      expect(source).toContain('zip.file("Financial_BoQ.xlsx"');
      expect(
        source,
        `${packager} now emits a financial PDF — revisit the Etimad-ready claim`
      ).not.toContain("Financial_BoQ.pdf");
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
