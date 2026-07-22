import { Suspense } from "react";
import { createPageMetadata } from "@/lib/seo";
import BillingCallbackPage from "./page-client";

export const metadata = createPageMetadata({
  title: "Payment confirmation",
  path: "/billing/callback",
  noIndex: true,
});

export default function Page() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm">Loading…</div>}>
      <BillingCallbackPage />
    </Suspense>
  );
}
