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

function ResetInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";
  const { locale: storedLocale } = useLocale();
  const [locale, setLocale] = useState<"ar" | "en">(storedLocale ?? "ar");
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ar = locale === "ar";

  useEffect(() => { document.documentElement.dir = ar ? "rtl" : "ltr"; document.documentElement.lang = locale; }, [locale, ar]);
  useEffect(() => { if (tokenFromUrl) setToken(tokenFromUrl); }, [tokenFromUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    if (!token) { setError(ar ? "الرمز مطلوب" : "Token required"); return; }
    if (newPassword.length < 10 || newPassword.length > 128) { setError(ar ? "كلمة المرور 10-128 حرف" : "Password 10-128 chars"); return; }
    setLoading(true);
    try {
      // Domain schema validates `password` (criterion 2.9); do not invent alternate field names.
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || data.message || (ar ? "فشل إعادة التعيين — رمز غير صالح أو منتهي" : "Reset failed — invalid or expired token")); setLoading(false); return; }
      setMsg(ar ? "تمت إعادة التعيين — سجّل الدخول الآن" : "Password reset — please sign in");
      setTimeout(() => router.replace("/login"), 1500);
    } catch { setError(ar ? "خطأ في الشبكة" : "Network error"); }
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
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary"><Sparkles className="size-3.5" />{ar ? "إعادة تعيين كلمة المرور" : "Reset password"}</div>
        <h1 className={cn("mt-4 text-[24px] font-bold tracking-tight", ar ? "font-[family-name:var(--font-ibm-arabic)]" : "")}>{ar ? "تعيين كلمة مرور جديدة" : "Set a new password"}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {!tokenFromUrl && <div className="space-y-1.5"><Label className="text-xs font-semibold">{ar ? "رمز الاستعادة" : "Reset token"}</Label><Input value={token} onChange={(e) => setToken(e.target.value)} placeholder={ar ? "الصق الرمز من البريد" : "Paste token from email"} className="h-11 rounded-xl" /></div>}
          <div className="space-y-1.5"><Label className="text-xs font-semibold">{ar ? "كلمة المرور الجديدة" : "New password"}</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} maxLength={128} className="h-11 rounded-xl" /></div>
          {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive">{error}</div>}
          {msg && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-[12px] text-emerald-700 dark:text-emerald-300">{msg}</div>}
          <Button type="submit" className="w-full h-11 rounded-full font-semibold" disabled={loading}>{loading ? <Loader2 className="size-4 animate-spin" /> : ar ? "تعيين كلمة مرور جديدة" : "Set new password"}</Button>
        </form>
        <div className="mt-6 text-center text-[12px] text-muted-foreground"><Link href="/login" className="underline underline-offset-4 font-semibold text-foreground">{ar ? "العودة لتسجيل الدخول" : "Back to sign in"}</Link></div>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="size-8 animate-spin" /></div>}><ResetInner /></Suspense>;
}
