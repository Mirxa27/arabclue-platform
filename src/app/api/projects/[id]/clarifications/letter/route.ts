import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenant, jsonOk, ApiError, parseSearchParams } from "@/lib/api-controller";
import { db } from "@/lib/db";
import { assertExportFormatAllowed } from "@/lib/quotas";
import { listClarifications, LETTER_STATUSES } from "@/lib/tender-interrogation/repository";
import { composeClarificationLetter } from "@/lib/tender-interrogation/letter";
import { resolveBidderDisplayName } from "@/lib/text-quality";
import { requireTenantProject } from "../_shared";

export const dynamic = "force-dynamic";
/** PDF rendering launches Chromium. */
export const maxDuration = 120;

const querySchema = z.object({
  format: z.enum(["md", "html", "pdf", "json"]).optional().default("json"),
  locale: z.enum(["ar", "en"]).optional().default("ar"),
});

function safeFilename(base: string, ext: string): string {
  return `${base.replace(/[^\w.-]+/g, "_").slice(0, 60) || "clarifications"}.${ext}`;
}

/**
 * The clarification letter over the kept and submitted questions.
 * `json` returns both Markdown locales; `md` returns the requested locale as a
 * download; `html` renders the paired AR|EN document; `pdf` prints it.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("session", async ({ workspace, userId, brandProfile }) => {
    const { id } = await params;
    const project = await requireTenantProject(id, workspace.id);
    const { format, locale } = parseSearchParams(req, querySchema);

    const kept = (await listClarifications(id)).filter((i) => LETTER_STATUSES.includes(i.status));
    if (kept.length === 0) throw new ApiError("No kept clarifications", 409, "NO_KEPT_CLARIFICATIONS");

    const identity = await db.workspace.findUnique({
      where: { id: workspace.id },
      select: { name: true, nameAr: true },
    });
    const bidderEn = resolveBidderDisplayName("en", brandProfile, identity);
    const bidderAr = resolveBidderDisplayName("ar", brandProfile, identity);

    const letter = composeClarificationLetter({
      project: { title: project.title, titleAr: project.titleAr, etimadRef: project.etimadRef },
      bidder: { name: bidderEn, nameAr: bidderAr },
      items: kept.map((i) => ({ id: i.id, questionEn: i.questionEn, questionAr: i.questionAr, quotes: i.quotes })),
    });

    const base = `clarifications_${project.etimadRef ?? project.id}`;
    if (format === "json") {
      return jsonOk({ count: letter.count, markdown: letter.markdown, plain: letter.plain });
    }
    if (format === "md") {
      return new NextResponse(letter.markdown[locale], {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeFilename(`${base}_${locale}`, "md")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (format === "html") {
      const { renderBilingualArtifact } = await import("@/lib/bilingual-pdf");
      const artifact = await renderBilingualArtifact(letter.document, { target: "screen" });
      return new NextResponse(artifact.html, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    await assertExportFormatAllowed(userId, "pdf");
    const { generateBilingualPdf } = await import("@/lib/bilingual-pdf");
    const { pdfHeaderTemplate, pdfFooterTemplate } = await import("@/lib/letterhead");
    const primaryColor = brandProfile?.primaryColor ?? "#0f766e";
    const result = await generateBilingualPdf(letter.document, {
      target: "print",
      pdf: {
        headerTemplate: pdfHeaderTemplate({ companyName: bidderEn, companyNameAr: bidderAr, etimadRef: project.etimadRef, primaryColor }),
        footerTemplate: pdfFooterTemplate({ companyName: bidderEn, primaryColor, statusLabel: "Clarification requests", statusLabelAr: "استفسارات المنافسة" }),
      },
    });
    return new NextResponse(new Uint8Array(result.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(base, "pdf")}"`,
        "Content-Length": String(result.pdf.length),
        "Cache-Control": "no-store",
      },
    });
  }, "clarifications/letter");
}
