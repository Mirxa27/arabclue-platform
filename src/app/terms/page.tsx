"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { termsContent } from "@/lib/marketing/legal-content";

export default function TermsPage() {
  return <MarketingDocPage {...termsContent} />;
}
