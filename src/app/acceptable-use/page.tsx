"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { aupContent } from "@/lib/marketing/legal-content";

export default function AcceptableUsePage() {
  return <MarketingDocPage {...aupContent} />;
}
