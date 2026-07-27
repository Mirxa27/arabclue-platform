"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Globe, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import {
  selectApiFailureCode,
  selectApiFailureMessage,
} from "@/lib/api-failure-message";
import type { Locale } from "@/lib/types";

function VerifyInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { locale: storedLocale } = useLocale();
  const { status: sessionStatus, update: refreshSession } = useSession();
  const [locale, setLocale] = useState<Locale>(storedLocale ?? "ar");
  const [status, setStatus] = useState<
    "idle" | "verifying" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const ar = locale === "ar";
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const emailHint = searchParams.get("email")?.trim() ?? "";

  useEffect(() => {
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale, ar]);

  const verify = useCallback(
    async (token: string) => {
      setStatus("verifying");
      setMessage(null);
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || selectApiFailureCode(data) === "VERIFICATION_TOKEN_INVALID") {
          setStatus("error");
          setMessage(
            selectApiFailureMessage(data, locale) ?? tr("auth_verify_failed", locale)
          );
          return;
        }
        setStatus("success");
        setMessage(
          selectApiFailureMessage(data, locale) ?? tr("auth_verify_success", locale)
        );
        // Requirement 1.6 / design 4.1 — refresh the live session claim so a
        // signed-in browser is admitted immediately instead of waiting for the
        // periodic claim refresh. Harmless when no session is present.
        try {
          await refreshSession({ emailVerified: true });
        } catch {
          // A refresh failure must not block the confirmed verification.
        }
        const destination = sessionStatus === "authenticated" ? "/app" : "/login";
        setTimeout(() => router.replace(destination), 1500);
      } catch {
        setStatus("error");
        setMessage(tr("auth_network_error", locale));
      }
    },
    [locale, refreshSession, router, sessionStatus]
  );

  useEffect(() => {
    if (tokenFromUrl) {
      verify(tokenFromUrl);
    }
  }, [tokenFromUrl, verify]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-40" />
      <div className="absolute inset-0 dot-bg opacity-[0.25]" />
      <div className="absolute top-6 w-full max-w-[900px] px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <ArabclueLogo className="size-8 rounded-lg" />
          <span className="font-[family-name:var(--font-ibm-arabic)] text-sm font-bold">
            {tr("appName", "ar")}
          </span>
        </Link>
        <button
          onClick={() => setLocale(ar ? "en" : "ar")}
          className="h-9 rounded-full border border-border bg-card px-3.5 text-[12px] font-bold flex items-center gap-1.5"
        >
          <Globe className="size-3.5" />
          {ar ? "EN" : "عربي"}
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-[460px] rounded-[22px] border border-border bg-card/90 backdrop-blur-xl p-8 shadow-xl"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
          <Sparkles className="size-3.5" />
          {tr("auth_verify_title", locale)}
        </div>
        <h1
          className={cn(
            "mt-4 text-[24px] font-bold tracking-tight",
            ar ? "font-[family-name:var(--font-ibm-arabic)]" : ""
          )}
        >
          {tr("auth_verify_title", locale)}
        </h1>
        {emailHint && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {tr("account_delivery_sent", locale, { email: emailHint })} —{" "}
            {tr("account_verification_email_expiry", locale, { hours: 24 })}
          </p>
        )}
        <div className="mt-6">
          {status === "idle" && !tokenFromUrl && (
            <div className="text-[13px] text-muted-foreground leading-relaxed">
              <p>{tr("auth_verify_paste_hint", locale)}</p>
              <div className="mt-4 flex gap-2">
                <input
                  id="manual-token"
                  placeholder={tr("auth_verify_token_placeholder", locale)}
                  className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-[13px]"
                />
                <Button
                  onClick={() => {
                    const el = document.getElementById(
                      "manual-token"
                    ) as HTMLInputElement | null;
                    if (el?.value) verify(el.value.trim());
                  }}
                  className="rounded-full h-11"
                >
                  {tr("auth_verify_action", locale)}
                </Button>
              </div>
            </div>
          )}
          {status === "verifying" && (
            <div className="flex items-center gap-2 text-[14px]">
              <Loader2 className="size-5 animate-spin" /> {tr("auth_verifying", locale)}
            </div>
          )}
          {status === "success" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex gap-2 text-[13px] text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-5 shrink-0" />
              {message}
            </div>
          )}
          {status === "error" && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 flex gap-2 text-[13px] text-destructive">
              <XCircle className="size-5 shrink-0" />
              {message}
            </div>
          )}
        </div>
        <div className="mt-8 flex gap-2">
          <Button asChild variant="outline" className="rounded-full flex-1">
            <Link href="/login">{tr("auth_signin_link", locale)}</Link>
          </Button>
          <Button asChild variant="ghost" className="rounded-full flex-1">
            <Link href="/register">{tr("auth_signup_link", locale)}</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
