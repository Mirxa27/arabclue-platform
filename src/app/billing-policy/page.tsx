"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { billingContent } from "@/lib/marketing/legal-content";

export default function BillingPolicyPage() {
  return <MarketingDocPage {...billingContent} />;
}
