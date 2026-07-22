"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [changePwdForced, setChangePwdForced] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePwd = changePwdForced || !!session?.user?.mustChangePassword;

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

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
          setError(
            locale === "ar"
              ? "بيانات الدخول غير صحيحة"
              : "Invalid email or password"
          );
          setLoading(false);
          return;
        }
        if (preData.mfaRequired) {
          setNeedsMfa(true);
          setError(
            locale === "ar"
              ? "أدخل رمز المصادقة الثنائية"
              : "Enter your MFA authenticator code"
          );
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
        setError(
          locale === "ar"
            ? "فشل تسجيل الدخول — تحقق من البيانات ورمز MFA"
            : "Sign-in failed — check credentials and MFA code"
        );
        setLoading(false);
        return;
      }

      // Refresh session to read mustChangePassword
      await update?.();
      const me = await fetch("/api/auth/session").then((r) => r.json());
      if (me?.user?.mustChangePassword) {
        setChangePwdForced(true);
        setLoading(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(locale === "ar" ? "خطأ في الشبكة" : "Network error");
      setLoading(false);
    }
  }

  async function setupMfa() {
    if (!email || !password) {
      setError(
        locale === "ar"
          ? "أدخل البريد وكلمة المرور أولاً"
          : "Enter email and password first"
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Setup failed");
      } else {
        setQr(data.qrDataUrl);
        setNeedsMfa(true);
      }
    } catch {
      setError("Setup failed");
    }
    setLoading(false);
  }

  async function confirmMfaEnable() {
    if (!mfaToken || !email || !password) return;
    setLoading(true);
    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, token: mfaToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invalid token");
    } else {
      setError(
        locale === "ar"
          ? "تم تفعيل MFA — سجّل الدخول الآن بالرمز"
          : "MFA enabled — sign in with your code"
      );
      setQr(null);
      setNeedsMfa(true);
    }
    setLoading(false);
  }

  async function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 10) {
      setError(
        locale === "ar"
          ? "كلمة المرور الجديدة 10 أحرف على الأقل"
          : "New password must be at least 10 characters"
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(locale === "ar" ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
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
    await update?.({ mustChangePassword: false });
    router.replace("/");
    router.refresh();
  }

  if (changePwd) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.35_0.08_255)_0%,_oklch(0.16_0.03_250)_45%,_oklch(0.12_0.02_250)_100%)]"
        />
        <Card className="relative w-full max-w-md p-7 space-y-5 border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40">
          <h1 className="text-lg font-semibold tracking-tight">
            {locale === "ar" ? "تغيير كلمة المرور مطلوب" : "Password change required"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {locale === "ar"
              ? "يجب تعيين كلمة مرور جديدة قبل المتابعة."
              : "Set a new password before continuing."}
          </p>
          <form onSubmit={submitPasswordChange} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {locale === "ar" ? "كلمة المرور الجديدة" : "New password"}
              </Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={10}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
              </Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={10}
              />
            </div>
            {error && (
              <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              {locale === "ar" ? "حفظ والمتابعة" : "Save & continue"}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-4">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_oklch(0.35_0.08_255)_0%,_oklch(0.16_0.03_250)_45%,_oklch(0.12_0.02_250)_100%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <Card className="relative w-full max-w-md p-7 space-y-6 border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Arabclue</h1>
              <p className="text-[11px] text-muted-foreground tracking-wide">
                أراب كلاو · Etimad AI
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-[10px]"
            onClick={() => setLocale((l) => (l === "ar" ? "en" : "ar"))}
          >
            {locale === "ar" ? "EN" : "ع"}
          </Button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="you@company.sa"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{locale === "ar" ? "كلمة المرور" : "Password"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {needsMfa && (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <KeyRound className="size-3" />
                {locale === "ar" ? "رمز MFA" : "MFA Code"}
              </Label>
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                placeholder="000000"
                className="font-mono tracking-widest"
              />
            </div>
          )}
          {error && (
            <p className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2 py-1.5">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
          </Button>
        </form>

        <div className="border-t border-border/60 pt-3 space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-[10px] flex-1"
              onClick={setupMfa}
              disabled={loading}
            >
              {locale === "ar" ? "إعداد MFA" : "Setup MFA"}
            </Button>
            {qr && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="text-[10px] flex-1"
                onClick={confirmMfaEnable}
                disabled={loading || mfaToken.length < 6}
              >
                {locale === "ar" ? "تأكيد التفعيل" : "Confirm enable"}
              </Button>
            )}
          </div>
          {qr && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <img src={qr} alt="MFA QR" className="rounded-lg border border-border" />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
