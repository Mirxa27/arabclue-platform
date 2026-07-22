"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import {
  legalHubRelated,
  legalHubSections,
} from "@/lib/marketing/company-content";
import { LEGAL_UPDATED } from "@/lib/marketing/legal-content";

export default function LegalHubPage() {
  return (
    <MarketingDocPage
      activePath="/legal"
      titleEn="Legal"
      titleAr="الشؤون القانونية"
      summaryEn="Policies governing ArabClue — privacy, terms, cookies, acceptable use, billing, and data processing."
      summaryAr="السياسات المنظمة لأراب كلاو — الخصوصية والشروط وملفات الارتباط والاستخدام المقبول والفوترة ومعالجة البيانات."
      updated={LEGAL_UPDATED}
      sections={legalHubSections}
      related={legalHubRelated}
    />
  );
}
