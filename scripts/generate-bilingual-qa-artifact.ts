import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  BilingualDocumentSpec,
  BilingualInlineNode,
} from "../src/lib/bilingual-layout";
import {
  generateBilingualPdf,
  renderBilingualArtifact,
} from "../src/lib/bilingual-pdf";

const inline = (text: string): readonly BilingualInlineNode[] => [
  { type: "text", text },
];

const document: BilingualDocumentSpec = {
  id: "phase2-qa-sample",
  version: "1",
  title: {
    en: inline("Managed Cloud Services Proposal"),
    ar: inline("عرض خدمات السحابة المُدارة"),
  },
  sections: [
    {
      id: "executive-summary",
      alignmentKey: "qa.executive-summary",
      title: {
        en: inline("Executive summary"),
        ar: inline("الملخص التنفيذي"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "summary",
          content: {
            en: inline(
              "A bilingual delivery plan for service reference PO-2026-18, with measurable governance, transition, and support."
            ),
            ar: inline(
              "خطة تنفيذ ثنائية اللغة لمرجع الخدمة PO-2026-18، تشمل الحوكمة القابلة للقياس والانتقال والدعم التشغيلي."
            ),
          },
        },
        {
          type: "list",
          id: "outcomes",
          ordered: true,
          items: [
            {
              id: "transition",
              content: {
                en: inline("Controlled service transition"),
                ar: inline("انتقال منضبط للخدمة"),
              },
            },
            {
              id: "monitoring",
              content: {
                en: inline("Continuous monitoring and reporting"),
                ar: inline("المراقبة والتقارير المستمرة"),
              },
            },
          ],
        },
      ],
    },
    {
      id: "service-levels",
      alignmentKey: "qa.service-levels",
      title: {
        en: inline("Service levels"),
        ar: inline("مستويات الخدمة"),
      },
      blocks: [
        {
          type: "table",
          id: "sla-table",
          caption: {
            en: inline("Illustrative service measures"),
            ar: inline("مقاييس الخدمة التوضيحية"),
          },
          repeatHeader: true,
          columns: [
            {
              id: "measure",
              header: {
                en: inline("Measure"),
                ar: inline("المقياس"),
              },
              widthPercent: 60,
            },
            {
              id: "target",
              header: {
                en: inline("Tender target"),
                ar: inline("مستهدف المنافسة"),
              },
              align: "numeric",
              widthPercent: 40,
            },
          ],
          rows: [
            {
              id: "availability",
              cells: {
                measure: {
                  content: {
                    en: inline("Availability"),
                    ar: inline("التوافر"),
                  },
                },
                target: {
                  content: {
                    en: inline("Not supplied"),
                    ar: inline("غير مزود"),
                  },
                },
              },
            },
            {
              id: "response",
              cells: {
                measure: {
                  content: {
                    en: inline("Critical response time"),
                    ar: inline("زمن الاستجابة للحالات الحرجة"),
                  },
                },
                target: {
                  content: {
                    en: inline("Not supplied"),
                    ar: inline("غير مزود"),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    {
      id: "review-notice",
      alignmentKey: "qa.review-notice",
      title: {
        en: inline("Review notice"),
        ar: inline("إشعار المراجعة"),
      },
      blocks: [
        {
          type: "paragraph",
          id: "notice",
          content: {
            en: inline(
              "Illustrative QA fixture only. Tender-specific facts require source verification and human approval."
            ),
            ar: inline(
              "نموذج توضيحي لضمان الجودة فقط. تتطلب بيانات المنافسة التحقق من المصدر والاعتماد البشري."
            ),
          },
        },
      ],
    },
  ],
};

const outputDirectory =
  process.env.BILINGUAL_QA_OUTPUT_DIR ||
  path.join("/tmp", "arabclue-bilingual-qa");
await mkdir(outputDirectory, { recursive: true });

const preview = await renderBilingualArtifact(document, { target: "screen" });
const pdf = await generateBilingualPdf(document);
const htmlPath = path.join(outputDirectory, "phase2-bilingual-qa.html");
const pdfPath = path.join(outputDirectory, "phase2-bilingual-qa.pdf");
await writeFile(htmlPath, preview.html, "utf8");
await writeFile(pdfPath, pdf.pdf);

console.log(
  JSON.stringify(
    {
      htmlPath,
      pdfPath,
      htmlSha256: preview.sha256,
      pairCount: preview.quality.pairCount,
      pdfBytes: pdf.pdf.byteLength,
    },
    null,
    2
  )
);
