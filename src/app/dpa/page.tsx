"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { dpaContent } from "@/lib/marketing/legal-content";

export default function DpaPage() {
  return <MarketingDocPage {...dpaContent} />;
}
