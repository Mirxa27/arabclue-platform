"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useLocale } from "@/lib/store";
import { apiErrorText } from "@/lib/api-failure-message";

export default function BillingCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { locale } = useLocale();
  const { status: authStatus } = useSession();
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  /**
   * The body, not a sentence built from it.
   *
   * Localizing inside the effect would make `locale` a dependency, and the
   * locale store rehydrates from storage a tick after mount — so the language
   * settling would re-fire a payment reconciliation. Holding the payload and
   * reading it at render keeps the fetch keyed only to auth and the query.
   */
  const [body, setBody] = useState<unknown>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace(
        `/login?callbackUrl=${encodeURIComponent(
          `/billing/callback?${params.toString()}`
        )}`
      );
      return;
    }
    if (authStatus !== "authenticated") return;

    const paymentId =
      params.get("paymentId") ||
      params.get("PaymentId") ||
      params.get("Id");
    const ref = params.get("ref");
    const status = params.get("status");

    const qs = new URLSearchParams();
    if (paymentId) qs.set("paymentId", paymentId);
    if (ref) qs.set("ref", ref);
    if (status) qs.set("status", status);

    fetch(`/api/billing/callback?${qs.toString()}`)
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);
        setState(
          data && typeof data === "object" && "ok" in data && data.ok
            ? "ok"
            : "fail"
        );
        setBody(data);
      })
      .catch(() => {
        // A dropped connection carries no body, so the render falls back. The
        // transport's own text is untranslated and names nothing a payer can
        // act on.
        setState("fail");
        setBody(null);
      });
  }, [authStatus, params, router]);

  // `error` on this contract is a bilingual object, and `res.json()` hands it
  // back as `any` — so it used to be assigned straight into a string state and
  // rendered as a bare child, which React refuses. That crash landed on the one
  // screen a payer sees after their money has already moved.
  const message =
    state === "ok"
      ? locale === "ar"
        ? "تم تفعيل الاشتراك بنجاح"
        : "Subscription activated successfully"
      : apiErrorText(
          body,
          locale,
          locale === "ar" ? "لم تكتمل عملية الدفع" : "Payment was not completed"
        );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[oklch(0.97_0.008_240)] p-6">
      <div className="max-w-md w-full text-center space-y-4 rounded-xl border border-border/60 bg-background p-8 shadow-sm">
        {state === "loading" && (
          <>
            <Loader2 className="size-10 animate-spin mx-auto text-primary" />
            <h1 className="text-lg font-semibold">Confirming payment…</h1>
            <p className="text-sm text-muted-foreground">
              Verifying MyFatoorah invoice status
            </p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="size-10 mx-auto text-emerald-600" />
            <h1 className="text-lg font-semibold">Payment successful</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild>
              <Link href="/app?view=billing">Open billing</Link>
            </Button>
          </>
        )}
        {state === "fail" && (
          <>
            <XCircle className="size-10 mx-auto text-destructive" />
            <h1 className="text-lg font-semibold">Payment not completed</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button asChild variant="outline">
              <Link href="/app?view=billing">Back to billing</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
