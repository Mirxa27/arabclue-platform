"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { faqItems, faqRelated } from "@/lib/marketing/company-content";

export default function FaqPage() {
  return (
    <MarketingDocPage
      activePath="/faq"
      titleEn="Frequently asked questions"
      titleAr="الأسئلة الشائعة"
      summaryEn="Agents, pricing guardrails, billing, compliance, and access — answered clearly."
      summaryAr="الوكلاء وحواجز التسعير والفوترة والامتثال والوصول — بإجابات واضحة."
      heroAccent="blue"
      faqs={faqItems}
      related={faqRelated}
    />
  );
}
