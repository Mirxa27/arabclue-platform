"use client";

import { MarketingDocPage } from "@/components/marketing/doc-page";
import { cookiesContent } from "@/lib/marketing/legal-content";

export default function CookiesPage() {
  return <MarketingDocPage {...cookiesContent} />;
}
