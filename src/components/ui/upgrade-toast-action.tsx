"use client";

import { startTransition } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useUI } from "@/lib/store";

/**
 * The one action a plan-limit toast should offer: open Billing. Rendered by
 * the Toaster, so it reads the store itself instead of receiving a callback.
 */
export function UpgradeToastAction({ locale }: { locale: "ar" | "en" }) {
  const setView = useUI((s) => s.setView);
  return (
    <ToastAction
      altText={locale === "ar" ? "فتح الفوترة" : "Open billing"}
      onClick={() => startTransition(() => setView("billing"))}
    >
      {locale === "ar" ? "ترقية الباقة" : "Upgrade plan"}
    </ToastAction>
  );
}
