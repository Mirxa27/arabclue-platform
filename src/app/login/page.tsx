"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Loader2,
  KeyRound,
  Sparkles,
  Globe,
  Lock,
  FileText,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";

function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/app";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get("callbackUrl"));
  const { data: session, update } = useSession();
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [changePwdForced, setChangePwdForced] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const ar = locale === "ar";

  const changePwd = changePwdForced || !!session?.user?.mustChangePassword;

  useEffect(() => {
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    const saved = localStorage.getItem("arabclue-marketing-locale");
    if (saved === "ar" || saved === "en") setLocale(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dir = ar ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale, ar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!needsMfa) {
        const pre = await fetch("/api/auth/precheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const preData = await pre.json();
        if (!pre.ok || !preData.ok) {
          setError(ar ? "بيانات الدخول غير صحيحة" : "Invalid email or password");
          setLoading(false);
          return;
        }
        if (preData.mfaRequired) {
          setNeedsMfa(true);
          setError(ar ? "أدخل رمز المصادقة الثنائية" : "Enter your MFA code");
          setLoading(false);
          return;
        }
      }

      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        mfaToken: needsMfa ? mfaToken : "",
      });

      if (res?.error || !res?.ok) {
        setError(ar ? "فشل تسجيل الدخول — تحقق من البيانات ورمز MFA" : "Sign-in failed — check credentials and MFA code");
        setLoading(false);
        return;
      }

      await update?.();
      const me = await fetch("/api/auth/session").then((r) => r.json());
      if (me?.user?.mustChangePassword) {
        setChangePwdForced(true);
        setLoading(false);
        return;
      }

      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError(ar ? "خطأ في الشبكة" : "Network error");
      setLoading(false);
    }
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError(ar ? "كلمة المرور الجديدة 10 أحرف على الأقل" : "New password must be at least 10 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(ar ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: password, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Password change failed");
      setLoading(false);
      return;
    }
    await update?.({ mustChangePassword: false } as any);
    router.replace(callbackUrl);
    router.refresh();
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
            <p className="text-[11px] tracking-[0.15em] uppercase text-white/50">Arabclue SaaS</p>
          </div>
        </Link>
        <div className="mt-16">
          <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={cn("text-[32px] font-bold leading-[1.05] tracking-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>
            {ar ? "ادخل مساحة عملك وشغّل مصنع العطاءات" : "Enter your workspace & run the bid factory"}
          </motion.h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/60 max-w-[36ch]">{ar ? "عربي/إنجليزي، امتثال بأدلة، تسعير يدوي دائماً، وسجل تدقيق كامل." : "AR/EN, evidence-backed compliance, manual pricing always, full audit trail."}</p>

          <div className="mt-10 space-y-3">
            {[
              { icon: FileText, title: ar ? "مصفوفة متطلبات حية" : "Live requirements matrix", desc: ar ? "كل بند RFP قابل للتتبع" : "Every RFP clause tracked" },
              { icon: ShieldCheck, title: ar ? "امتثال NCA/PDPL" : "NCA/PDPL compliance", desc: ar ? "مع أدلة قابلة للتدقيق" : "With auditable evidence" },
              { icon: Lock, title: ar ? "عزل مستأجر + MFA" : "Tenant isolation + MFA", desc: ar ? "أمان مؤسسي" : "Enterprise security" },
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

  if (changePwd) {
    return (
      <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]">
        {LeftPanel}
        <div className="flex items-center justify-center p-6 bg-background">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[420px] rounded-[22px] border border-border bg-card p-8 shadow-xl">
            <h1 className="text-[20px] font-bold tracking-tight">{ar ? "تغيير كلمة المرور مطلوب" : "Password change required"}</h1>
            <p className="mt-2 text-[12px] text-muted-foreground">{ar ? "يجب تعيين كلمة مرور جديدة قبل المتابعة." : "Set a new password before continuing."}</p>
            <form onSubmit={submitPasswordChange} className="mt-6 space-y-4">
              <div className="space-y-1.5"><Label className="text-xs">{ar ? "الحالية" : "Current"}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label className="text-xs">{ar ? "الجديدة" : "New"}</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} /></div>
              <div className="space-y-1.5"><Label className="text-xs">{ar ? "تأكيد" : "Confirm"}</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={10} /></div>
              {error && <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">{error}</p>}
              <Button type="submit" className="w-full rounded-full h-11 gap-2" disabled={loading}>{loading && <Loader2 className="size-4 animate-spin" />}{ar ? "حفظ والمتابعة" : "Save & continue"}</Button>
            </form>
          </motion.div>
        </div>
      </div>
    );
  }

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
              <button onClick={() => setLocale(ar ? "en" : "ar")} className="h-9 rounded-full border border-border bg-card px-3.5 text-[12px] font-bold flex items-center gap-1.5"><Globe className="size-3.5" />{ar ? "EN" : "عربي"}</button>
              <Button asChild variant="ghost" size="sm" className="rounded-full"><Link href="/">{ar ? "الرئيسية" : "Home"}</Link></Button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center p-6">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-[420px]">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary"><Sparkles className="size-3.5" />{ar ? "تسجيل الدخول الآمن" : "Secure sign-in"}</div>
                <h1 className={cn("mt-4 text-[26px] font-bold tracking-tight leading-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>{ar ? "مرحباً بعودتك" : "Welcome back"}</h1>
                <p className="mt-2 text-[13px] text-muted-foreground">{ar ? "ادخل مساحة عملك — الامتثال والتدقيق جاهزان." : "Enter your workspace — compliance & audit ready."}</p>
              </div>

              <div className="rounded-[20px] border border-border bg-card/90 backdrop-blur-xl p-6 shadow-[0_16px_40px_-24px_oklch(0.2_0.02_260/0.2)]">
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{ar ? "البريد الإلكتروني" : "Email"}</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="you@company.sa" className="h-11 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center justify-between"><span>{ar ? "كلمة المرور" : "Password"}</span><span className="text-[11px] font-normal text-muted-foreground flex items-center gap-1"><Eye className="size-3" />{ar ? "مشفرة" : "Encrypted"}</span></Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" className="h-11 rounded-xl" />
                  </div>
                  {needsMfa && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-1.5 overflow-hidden">
                      <Label className="text-xs font-semibold flex items-center gap-1"><KeyRound className="size-3" />{ar ? "رمز MFA" : "MFA Code"}</Label>
                      <Input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="000000" className="h-11 rounded-xl font-mono tracking-widest text-center text-[16px]" />
                    </motion.div>
                  )}
                  {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive leading-snug">{error}</div>}
                  <Button type="submit" className="w-full h-11 rounded-full font-semibold gap-2 text-[14px]" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}{ar ? "تسجيل الدخول" : "Sign in"}</Button>
                </form>

                <div className="mt-5 pt-5 border-t border-border/60 space-y-3">
                  <p className="text-[11px] text-muted-foreground leading-relaxed text-center flex items-center justify-center gap-1.5"><ShieldCheck className="size-3.5" />{ar ? "فعّل MFA من الإعدادات بعد تسجيل الدخول · جلسات JWT + تدقيق" : "Enable MFA from Settings after sign-in · JWT sessions + audit"}</p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <Link href="/pricing" className="hover:text-foreground underline underline-offset-4">{ar ? "الباقات" : "Pricing"}</Link>
                <span>•</span>
                <Link href="/compliance" className="hover:text-foreground underline underline-offset-4">{ar ? "الامتثال" : "Compliance"}</Link>
                <span>•</span>
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />{ar ? "مباشر" : "Live"}</span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[oklch(0.13_0.02_260)]">
          <Loader2 className="size-8 animate-spin text-white" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
