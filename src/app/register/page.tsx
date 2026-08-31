"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Globe, ShieldCheck, FileText, Lock, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { selectApiFailureMessage } from "@/lib/api-failure-message";
import { readRegistrationOutcome } from "@/lib/registration-outcome";

function RegisterFormInner() {
  const router = useRouter();
  const { locale, toggle } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const ar = locale === "ar";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      // Server-side schema validation is authoritative (Req 19.4); the browser
      // sends the raw fields and renders the bilingual result from the shared
      // response contract rather than any locally embedded message.
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim(),
          workspaceName: workspaceName.trim(),
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          selectApiFailureMessage(data, locale) ?? tr("auth_network_error", locale)
        );
        setLoading(false);
        return;
      }
      const outcome = readRegistrationOutcome(data);
      if (outcome === "undeliverable") {
        // The account is committed but no verification message was sent, so
        // the inbox screen would be a dead end. The server's own text names
        // the reason and who can fix it.
        setError(
          selectApiFailureMessage(data, locale) ??
            tr("VERIFICATION_EMAIL_UNCONFIGURED", locale)
        );
        setLoading(false);
        return;
      }
      setSuccess(
        selectApiFailureMessage(data, locale) ??
          (outcome === "verify_email"
            ? tr("auth_register_check_email", locale)
            : tr("account_registration_success", locale))
      );
      setTimeout(
        () =>
          router.replace(
            outcome === "verify_email"
              ? "/verify-email?email=" + encodeURIComponent(email.trim())
              : "/login"
          ),
        1500
      );
    } catch {
      setError(tr("auth_network_error", locale));
      setLoading(false);
    }
  }

  const LeftPanel = (
    <div className="relative hidden lg:flex flex-col justify-between p-10 overflow-hidden bg-[oklch(0.13_0.02_260)] text-white">
      <div className="absolute inset-0">
        <div className="aurora aurora-blob-1 left-[-20%] top-[-10%] opacity-60" />
        <div className="aurora aurora-blob-2 right-[-10%] top-[20%] opacity-50" />
        <div className="absolute inset-0 grid-bg opacity-[0.06]" />
      </div>
      <div className="relative z-10">
        <Link href="/" className="flex items-center gap-3">
          <ArabclueLogo className="size-10 rounded-xl" />
          <div>
            <p className="font-[family-name:var(--font-ibm-arabic)] text-[18px] font-bold leading-none">أراب كلاو</p>
            <p className="text-[11px] tracking-[0.15em] uppercase text-white/50">Arabclue</p>
          </div>
        </Link>
        <div className="mt-16">
          <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn("text-[32px] font-bold leading-[1.05] tracking-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>
            {ar ? "أنشئ مساحة عملك وشغّل مصنع العطاءات" : "Create your workspace & run the bid factory"}
          </motion.h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/60 max-w-[36ch]">{ar ? "عربي/إنجليزي، امتثال بأدلة، تسعير يدوي دائماً، وسجل تدقيق كامل." : "AR/EN, evidence-backed compliance, manual pricing always, full audit trail."}</p>
          <div className="mt-10 space-y-3">
            {[
              { icon: FileText, title: ar ? "مصفوفة متطلبات حية" : "Live requirements matrix", desc: ar ? "كل بند RFP قابل للتتبع" : "Every RFP clause tracked" },
              { icon: ShieldCheck, title: ar ? "امتثال NCA/PDPL" : "NCA/PDPL compliance", desc: ar ? "مع أدلة قابلة للتدقيق" : "With auditable evidence" },
              { icon: Building2, title: ar ? "مساحة عمل فورية" : "Instant workspace", desc: ar ? "مالك تلقائي + باقة STARTER" : "Owner auto + STARTER plan" },
            ].map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.07 }} className="flex gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="size-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0"><f.icon className="size-4 text-white/80" /></div>
                <div><p className="text-[13px] font-semibold">{f.title}</p><p className="text-[11px] text-white/50">{f.desc}</p></div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-between text-[11px] text-white/40 border-t border-white/10 pt-6">
        <span>© {new Date().getFullYear()} Arabclue</span>
        <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> {ar ? "PDPL متوافق" : "PDPL Compliant"}</span>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr] bg-background">
      {LeftPanel}
      <div className="relative flex flex-col bg-background">
        <div className="absolute inset-0 gradient-mesh opacity-40" />
        <div className="absolute inset-0 dot-bg opacity-[0.25]" />
        <div className="relative flex flex-1 flex-col">
          <div className="flex items-center justify-between p-6">
            <Link href="/" className="lg:hidden flex items-center gap-2"><ArabclueLogo className="size-8 rounded-lg" /><span className="font-[family-name:var(--font-ibm-arabic)] text-sm font-bold">أراب كلاو</span></Link>
            <div className="flex items-center gap-2 ms-auto">
              <button onClick={toggle} className="h-9 rounded-full border border-border bg-card px-3.5 text-[12px] font-bold flex items-center gap-1.5"><Globe className="size-3.5" />{ar ? "EN" : "عربي"}</button>
              <Button asChild variant="ghost" size="sm" className="rounded-full"><Link href="/">{ar ? "الرئيسية" : "Home"}</Link></Button>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-[440px]">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary"><Sparkles className="size-3.5" />{tr("auth_register_title", locale)}</div>
                <h1 className={cn("mt-4 text-[26px] font-bold tracking-tight leading-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>{tr("auth_register_subtitle", locale)}</h1>
                <p className="mt-2 text-[13px] text-muted-foreground">{tr("auth_register_verify_hint", locale)}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-card/90 backdrop-blur-xl p-6 shadow-[0_16px_40px_-24px_oklch(0.2_0.02_260/0.2)]">
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{tr("auth_name", locale)}</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder={tr("auth_name_placeholder", locale)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{tr("auth_workspace_name", locale)}</Label>
                      <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} required minLength={2} maxLength={80} placeholder={tr("auth_workspace_placeholder", locale)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">{tr("auth_email", locale)}</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder={tr("auth_email_placeholder", locale)} className="h-11 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center justify-between"><span>{tr("auth_password", locale)}</span><span className="text-[11px] font-normal text-muted-foreground">{tr("account_password_requirements", locale, { min: 10, max: 128 })}</span></Label>
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" className="h-11 rounded-xl" />
                    </div>
                  </div>
                  {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive leading-snug">{error}</div>}
                  {success && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-700 dark:text-emerald-300 leading-snug">{success}</div>}
                  <Button type="submit" className="w-full h-11 rounded-full font-semibold gap-2 text-[14px]" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}{tr("auth_register_btn", locale)}</Button>
                </form>
                <div className="mt-5 pt-5 border-t border-border/60 text-center text-[12px] text-muted-foreground">
                  {tr("auth_have_account", locale)} <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">{tr("auth_signin_link", locale)}</Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[oklch(0.13_0.02_260)]"><Loader2 className="size-8 animate-spin text-white" /></div>}>
      <RegisterFormInner />
    </Suspense>
  );
}
