"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

function ResetInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const { locale, toggle } = useLocale();
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ar = locale === "ar";

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (!token.trim()) {
      setError(tr("auth_token_required", locale));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tr("auth_password_mismatch", locale));
      return;
    }

    setLoading(true);
    try {
      // Domain schema validates `password` (criterion 2.9); do not invent alternate field names.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password: newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      const bilingual = selectApiFailureMessage(data, locale);
      const code = selectApiFailureCode(data);

      if (!res.ok) {
        const fallback =
          code === "RECOVERY_PASSWORD_REJECTED"
            ? tr("RECOVERY_PASSWORD_REJECTED", locale)
            : code === "RECOVERY_RATE_LIMITED"
              ? tr("RECOVERY_RATE_LIMITED", locale)
              : tr("RECOVERY_TOKEN_INVALID", locale);
        setError(bilingual ?? fallback);
        return;
      }

      setMsg(bilingual ?? tr("auth_reset_success", locale));
      setTimeout(() => router.replace("/login"), 1500);
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
          {tr("auth_reset_title", locale)}
        </div>
        <h1
          className={cn(
            "mt-4 text-[24px] font-bold tracking-tight",
            ar ? "font-[family-name:var(--font-ibm-arabic)]" : ""
          )}
        >
          {tr("auth_reset_title", locale)}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {tr("auth_reset_subtitle", locale)}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {!tokenFromUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold" htmlFor="reset-token">
                {tr("auth_reset_token_label", locale)}
              </Label>
              <Input
                id="reset-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={tr("auth_reset_token_placeholder", locale)}
                className="h-11 rounded-xl"
                autoComplete="one-time-code"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold" htmlFor="reset-password">
              {tr("auth_new_password", locale)}
            </Label>
            <Input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label
              className="text-xs font-semibold"
              htmlFor="reset-password-confirm"
            >
              {tr("auth_confirm_password", locale)}
            </Label>
            <Input
              id="reset-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              className="h-11 rounded-xl"
            />
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive"
            >
              {error}
            </div>
          )}
          {msg && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-700 dark:text-emerald-300"
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
              tr("auth_reset_btn", locale)
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin" />
        </div>
      }
    >
      <ResetInner />
    </Suspense>
  );
}
