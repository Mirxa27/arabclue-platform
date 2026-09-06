import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ProposalBuilderPreview } from "@/components/dashboard/proposal-builder-preview";
import { DocumentFileViewer } from "@/components/dashboard/document-file-viewer";
import { DocumentPreviewFrame } from "@/components/dashboard/document-preview-frame";
import type { ProposalSection } from "@/lib/proposal-builder-types";

const locale = document.documentElement.lang === "ar" ? "ar" : "en";
const title = {
    en: "Technical proposal - enterprise document management and implementation",
    ar: "العرض الفني لتطوير إدارة المستندات وتنفيذ الخدمات المؤسسية",
};
const sections: ProposalSection[] = Array.from({ length: 6 }, (_, index) => ({
    sectionKey: `browser-test-${index}`,
    sectionType: "technical-approach",
    sortOrder: index,
    isVisible: true,
    title: { en: `Delivery phase ${index + 1}`, ar: `مرحلة التنفيذ ${index + 1}` },
    content: {
        en: "## Scope and acceptance\n\nThe delivery team reviews the source documents before preparing the implementation schedule. **Acceptance criteria** remain linked to the approved requirements.\n\n| Requirement | Evidence | Status |\n| --- | --- | --- |\n| Document control | Approved source register | Pending review |\n\n- Preserve the original document.\n- Record the review decision.\n\n> Final delivery requires approval.\n\nReference: " + "unbroken-reference-".repeat(12),
        ar: "## النطاق ومعايير القبول\n\nيراجع فريق التنفيذ المستندات المصدرية قبل إعداد الجدول الزمني. ترتبط **معايير القبول** بالمتطلبات المعتمدة.\n\n| المتطلب | الدليل | الحالة |\n| --- | --- | --- |\n| ضبط المستندات | سجل المصادر المعتمد | قيد المراجعة |\n\n- الحفاظ على المستند الأصلي.\n- تسجيل قرار المراجعة.\n\n> يتطلب التسليم النهائي الموافقة.",
    },
}));

function ViewerHarness() {
    const [open, setOpen] = useState(false);
    const [generated, setGenerated] = useState(false);
    return (
        <main style={{ height: "100dvh", display: "flex", flexDirection: "column", padding: 16, gap: 12 }} dir={locale === "ar" ? "rtl" : "ltr"}>
            <button type="button" onClick={() => setOpen(true)} className="self-start rounded border px-3 py-2">Open attachment</button>
            <button type="button" onClick={() => setGenerated(true)} className="self-start rounded border px-3 py-2">Generated preview</button>
            <div style={{ flex: 1, minHeight: 0 }}>
                {generated ? (
                    <DocumentPreviewFrame locale={locale} proposalId="browser-test" title={title[locale]} stale />
                ) : (
                    <ProposalBuilderPreview locale={locale} sections={sections} metadata={{ title, locale, projectId: "browser-test", workspaceId: "browser-test", version: 3 }} />
                )}
            </div>
            <DocumentFileViewer open={open} onOpenChange={setOpen} locale={locale} title={title[locale]} fileName="implementation.docx" mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" storagePath="browser-test/implementation.docx" />
        </main>
    );
}

const root = document.getElementById("root");
if (!root) throw new Error("Browser test root is missing");
createRoot(root).render(<ViewerHarness />);