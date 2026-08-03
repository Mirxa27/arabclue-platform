"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import {
  selectApiFailureCode,
  selectApiFailureMessage,
} from "@/lib/api-failure-message";
function ForgotInner() {
  const { locale, toggle } = useLocale();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ar = locale === "ar";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      const code = selectApiFailureCode(data);
      const bilingual = selectApiFailureMessage(data, locale);

      if (res.status === 429 || code === "RECOVERY_RATE_LIMITED") {
        setError(bilingual ?? tr("RECOVERY_RATE_LIMITED", locale));
        return;
      }

      if (!res.ok) {
        setError(
          bilingual ??
            (code === "RECOVERY_EMAIL_UNCONFIGURED"
              ? tr("RECOVERY_EMAIL_UNCONFIGURED", locale)
              : tr("auth_network_error", locale))
        );
        return;
      }

      // Anti-enumeration: accepted paths share confirmation text; unconfigured
      // delivery still returns 202 with its own stable code for operators.
      setMsg(
        bilingual ??
          (code === "RECOVERY_EMAIL_UNCONFIGURED"
            ? tr("RECOVERY_EMAIL_UNCONFIGURED", locale)
            : tr("account_recovery_confirmation", locale))
      );
    } catch {
      setError(tr("auth_network_error", locale));
    } finally {
      setLoading(false);
    }
  }

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
          type="button"
          onClick={toggle}
          className="h-9 rounded-full border border-border bg-card px-3.5 text-[12px] font-bold flex items-center gap-1.5"
        >
          <Globe className="size-3.5" />
          {ar ? "EN" : "عربي"}
        </button>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-[420px] rounded-[22px] border border-border bg-card/90 backdrop-blur-xl p-8 shadow-xl"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
          <Sparkles className="size-3.5" />
          {tr("auth_forgot_title", locale)}
        </div>
        <h1
          className={cn(
            "mt-4 text-[24px] font-bold tracking-tight",
            ar ? "font-[family-name:var(--font-ibm-arabic)]" : ""
          )}
        >
          {tr("auth_forgot_title", locale)}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {tr("auth_forgot_subtitle", locale)}
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {tr("auth_forgot_expiry_hint", locale)}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold" htmlFor="forgot-email">
              {tr("auth_email", locale)}
            </Label>
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={tr("auth_email_placeholder", locale)}
              className="h-11 rounded-xl"
            />
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive leading-snug"
            >
              {error}
            </div>
          )}
          {msg && (
            <div
              role="status"
              className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] leading-snug"
            >
              {msg}
            </div>
          )}
          <Button
            type="submit"
            className="w-full h-11 rounded-full font-semibold"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              tr("auth_forgot_btn", locale)
            )}
          </Button>
        </form>
        <div className="mt-6 text-center text-[12px] text-muted-foreground">
          <Link
            href="/login"
            className="underline underline-offset-4 font-semibold text-foreground"
          >
            {tr("auth_back_to_signin", locale)}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin" />
        </div>
      }
    >
      <ForgotInner />
    </Suspense>
  );
}
