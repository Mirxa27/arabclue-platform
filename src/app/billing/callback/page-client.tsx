"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function BillingCallbackPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [state, setState] = useState<"loading" | "ok" | "fail">("loading");
  const [message, setMessage] = useState("");

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
        const data = await res.json();
        if (data.ok) {
          setState("ok");
          setMessage("Subscription activated successfully");
        } else {
          setState("fail");
          setMessage(data.error || "Payment was not completed");
        }
      })
      .catch((err) => {
        setState("fail");
        setMessage(err instanceof Error ? err.message : "Callback failed");
      });
  }, [authStatus, params, router]);

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
