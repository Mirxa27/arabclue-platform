"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2, Sparkles, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";

function ForgotInner() {
  const { locale: storedLocale } = useLocale();
  const [locale, setLocale] = useState<"ar" | "en">(storedLocale ?? "ar");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ar = locale === "ar";

  useEffect(() => { document.documentElement.dir = ar ? "rtl" : "ltr"; document.documentElement.lang = locale; }, [locale, ar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) { setMsg(ar ? "محاولات كثيرة — حاول لاحقاً" : "Too many attempts — try later"); setLoading(false); return; }
      setMsg(data.message || (ar ? "تم قبول الطلب — إذا كان البريد موجوداً ستصلك رسالة (صالح 60 دقيقة)" : "Request accepted — if email exists you will receive a message (valid 60min)"));
    } catch { setMsg(ar ? "خطأ في الشبكة" : "Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh opacity-40" />
      <div className="absolute inset-0 dot-bg opacity-[0.25]" />
      <div className="absolute top-6 w-full max-w-[900px] px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2"><ArabclueLogo className="size-8 rounded-lg" /><span className="font-[family-name:var(--font-ibm-arabic)] text-sm font-bold">أراب كلاو</span></Link>
        <button onClick={() => setLocale(ar ? "en" : "ar")} className="h-9 rounded-full border border-border bg-card px-3.5 text-[12px] font-bold flex items-center gap-1.5"><Globe className="size-3.5" />{ar ? "EN" : "عربي"}</button>
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-[420px] rounded-[22px] border border-border bg-card/90 backdrop-blur-xl p-8 shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary"><Sparkles className="size-3.5" />{ar ? "استعادة كلمة المرور" : "Forgot password"}</div>
        <h1 className={cn("mt-4 text-[24px] font-bold tracking-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>{ar ? "استعادة كلمة المرور" : "Forgot password"}</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">{ar ? "أدخل بريدك لإرسال رابط الاستعادة — صالح 60 دقيقة" : "Enter your email to receive a reset link — valid 60min"}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">{ar ? "البريد الإلكتروني" : "Email"}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.sa" className="h-11 rounded-xl" /></div>
          {msg && <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[12px] leading-snug">{msg}</div>}
          <Button type="submit" className="w-full h-11 rounded-full font-semibold" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : ar ? "إرسال رابط الاستعادة" : "Send reset link"}</Button>
        </form>
        <div className="mt-6 text-center text-[12px] text-muted-foreground"><Link href="/login" className="underline underline-offset-4 font-semibold text-foreground">{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</Link></div>
      </motion.div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin" /></div>}><ForgotInner /></Suspense>;
}
