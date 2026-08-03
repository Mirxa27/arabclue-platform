"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Globe, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import { useSession } from "next-auth/react";
import { tr } from "@/lib/i18n";
import { selectApiFailureMessage } from "@/lib/api-failure-message";
import { INVITATION_ACCEPTANCE_BOUNDS } from "@/lib/invitation-roles";

function InviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const { locale, toggle } = useLocale();
  const [token, setToken] = useState(tokenFromUrl);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ar = locale === "ar";
  const isAuthed = sessionStatus === "authenticated" && !!session?.user?.id;

  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!token) {
      setError(tr("auth_token_required", locale));
      return;
    }
    if (!isAuthed) {
      const trimmedName = name.trim();
      if (
        trimmedName.length < INVITATION_ACCEPTANCE_BOUNDS.displayName.min ||
        trimmedName.length > INVITATION_ACCEPTANCE_BOUNDS.displayName.max
      ) {
        setError(
          tr("INVITATION_ACCEPTANCE_INVALID", locale, {
            fieldPath: "displayName",
          })
        );
        return;
      }
      if (
        password.length < INVITATION_ACCEPTANCE_BOUNDS.password.min ||
        password.length > INVITATION_ACCEPTANCE_BOUNDS.password.max
      ) {
        setError(
          tr("INVITATION_ACCEPTANCE_INVALID", locale, {
            fieldPath: "password",
          })
        );
        return;
      }
    }
    setLoading(true);
    try {
      const body: Record<string, string> = { token };
      if (!isAuthed) {
        body.name = name.trim();
        body.password = password;
      }
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => ({}));
      const failureText = selectApiFailureMessage(data, locale);
      if (res.status === 409) {
        setMsg(failureText ?? tr("ALREADY_A_MEMBER", locale));
        setTimeout(() => router.replace("/app"), 1200);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(failureText ?? tr("invitation_accept_failed", locale));
        setLoading(false);
        return;
      }
      setMsg(tr("INVITATION_ACCEPTED", locale));
      setTimeout(() => router.replace(isAuthed ? "/app" : "/login"), 1200);
    } catch {
      setError(tr("account_submit_failed", locale));
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
        className="relative w-full max-w-[460px] rounded-[22px] border border-border bg-card/90 backdrop-blur-xl p-8 shadow-xl"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary">
          <Sparkles className="size-3.5" />
          {tr("auth_invite_badge", locale)}
        </div>
        <h1
          className={cn(
            "mt-4 text-[24px] font-bold tracking-tight",
            ar ? "font-[family-name:var(--font-ibm-arabic)]" : ""
          )}
        >
          {tr("auth_invite_title", locale)}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {tr("auth_invite_subtitle", locale)}
        </p>
        {isAuthed && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-[12px] flex gap-2">
            <Mail className="size-4 shrink-0" />
            {session.user.email} — {tr("auth_invite_current_account", locale)}
          </div>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {!tokenFromUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold" htmlFor="invite-token">
                {tr("auth_invite_token_label", locale)}
              </Label>
              <Input
                id="invite-token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={tr("auth_invite_token_placeholder", locale)}
                className="h-11 rounded-xl"
                autoComplete="one-time-code"
              />
            </div>
          )}
          {!isAuthed && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold" htmlFor="invite-name">
                  {tr("auth_name", locale)}
                </Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={INVITATION_ACCEPTANCE_BOUNDS.displayName.min}
                  maxLength={INVITATION_ACCEPTANCE_BOUNDS.displayName.max}
                  className="h-11 rounded-xl"
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  className="text-xs font-semibold"
                  htmlFor="invite-password"
                >
                  {tr("auth_password", locale)}
                </Label>
                <Input
                  id="invite-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={INVITATION_ACCEPTANCE_BOUNDS.password.min}
                  maxLength={INVITATION_ACCEPTANCE_BOUNDS.password.max}
                  className="h-11 rounded-xl"
                  autoComplete="new-password"
                />
              </div>
            </>
          )}
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
              tr("auth_invite_accept_btn", locale)
            )}
          </Button>
        </form>
        <div className="mt-6 flex justify-between text-[12px] text-muted-foreground">
          <Link
            href="/login"
            className="underline underline-offset-4 font-semibold text-foreground"
          >
            {tr("auth_signin_link", locale)}
          </Link>
          <Link href="/register" className="underline underline-offset-4">
            {tr("auth_signup_link", locale)}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin" />
        </div>
      }
    >
      <InviteInner />
    </Suspense>
  );
}
