"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { aboutContent } from "@/lib/marketing/company-content";

export default function AboutPage() {
  return <MarketingDocPage {...aboutContent} />;
}
