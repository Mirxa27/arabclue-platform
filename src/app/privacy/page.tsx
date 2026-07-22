"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { privacyContent } from "@/lib/marketing/legal-content";

export default function PrivacyPage() {
  return <MarketingDocPage {...privacyContent} />;
}
