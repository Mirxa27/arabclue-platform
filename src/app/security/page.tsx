"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { securityContent } from "@/lib/marketing/company-content";

export default function SecurityPage() {
  return <MarketingDocPage {...securityContent} />;
}
