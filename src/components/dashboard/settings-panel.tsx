"use client";

import { useLocale } from "@/lib/store";
import { useSession } from "next-auth/react";
import { Panel } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Settings, Shield, Loader2, Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { Locale } from "@/lib/types";

export function SettingsPanel() {
  const { locale, setLocale } = useLocale();
  const { data: session, status, update } = useSession();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);

  const [qr, setQr] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState("");
  const [currentMfaToken, setCurrentMfaToken] = useState("");
  const mfaEnabled = !!session?.user?.mfaEnabled;

  useEffect(() => {
    if (!session?.user) return;
    setName(session.user.name ?? "");
    setEmail(session.user.email ?? "");
    setAvatarUrl(session.user.avatarUrl ?? null);
    if (session.user.locale === "ar" || session.user.locale === "en") {
      if (session.user.locale !== locale) {
        setLocale(session.user.locale as Locale);
      }
    }
     
  }, [session?.user?.id, session?.user?.name, session?.user?.email, session?.user?.avatarUrl]);

  const initials =
    name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const emailChanged =
    email.trim().toLowerCase() !== (session?.user?.email ?? "").toLowerCase();
  const nameChanged = name.trim() !== (session?.user?.name ?? "");

  async function saveProfile() {
    setProfileBusy(true);
    try {
      const body: Record<string, string> = {};
      if (nameChanged) body.name = name.trim();
      if (emailChanged) {
        body.email = email.trim().toLowerCase();
        body.currentPassword = emailPassword;
      }
      if (Object.keys(body).length === 0) {
        toast({
          title: locale === "ar" ? "لا تغييرات للحفظ" : "No changes to save",
        });
        return;
      }
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEmailPassword("");
      await update?.({
        name: data.user.name,
        email: data.user.email,
        locale: data.user.locale,
        avatarUrl: data.user.avatarUrl,
      } as never);
      toast({
        title: locale === "ar" ? "تم تحديث الملف الشخصي" : "Profile updated",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveLocale(next: Locale) {
    setLocale(next);
    setProfileBusy(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await update?.({ locale: next } as never);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    setProfileBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/auth/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setAvatarUrl(data.avatarUrl ?? data.user?.avatarUrl ?? null);
      await update?.({
        avatarUrl: data.avatarUrl ?? data.user?.avatarUrl,
      } as never);
      toast({
        title: locale === "ar" ? "تم تحديث الصورة" : "Avatar updated",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setProfileBusy(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast({
        title:
          locale === "ar"
            ? "كلمتا المرور غير متطابقتين"
            : "Passwords do not match",
        variant: "destructive",
      });
      return;
    }
    setSecurityBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: locale === "ar" ? "تم تغيير كلمة المرور" : "Password updated",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSecurityBusy(false);
    }
  }

  async function setupMfa() {
    setSecurityBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mfaEnabled ? { currentToken: currentMfaToken } : {}
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "MFA setup failed");
      setQr(data.qrDataUrl ?? null);
      setMfaToken("");
      toast({
        title:
          locale === "ar"
            ? "امسح رمز QR ثم أكّد الرمز"
            : "Scan QR then confirm the code",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSecurityBusy(false);
    }
  }

  async function confirmMfa() {
    setSecurityBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: mfaToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invalid token");
      setQr(null);
      setMfaToken("");
      setCurrentMfaToken("");
      await update?.({ mfaEnabled: true } as never);
      toast({
        title: locale === "ar" ? "تم تفعيل MFA" : "MFA enabled",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSecurityBusy(false);
    }
  }

  async function disableMfa() {
    setSecurityBusy(true);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentToken: currentMfaToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCurrentMfaToken("");
      setQr(null);
      await update?.({ mfaEnabled: false } as never);
      toast({
        title: locale === "ar" ? "تم إيقاف MFA" : "MFA disabled",
      });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setSecurityBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        {locale === "ar" ? "جاري التحميل…" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel
        icon={Settings}
        title={locale === "ar" ? "الملف الشخصي" : "Profile"}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative group rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => fileRef.current?.click()}
              disabled={profileBusy}
              aria-label={locale === "ar" ? "تغيير الصورة" : "Change avatar"}
            >
              <Avatar className="size-16 border">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
                <AvatarFallback className="text-sm font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="size-4 text-white" />
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = "";
              }}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {session?.user?.role}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {locale === "ar"
                  ? "PNG/JPEG حتى 2MB"
                  : "PNG/JPEG up to 2MB"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{locale === "ar" ? "الاسم الكامل" : "Full name"}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder={locale === "ar" ? "اسمك" : "Your name"}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{locale === "ar" ? "البريد الإلكتروني" : "Email"}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {emailChanged && (
            <div className="space-y-1.5">
              <Label>
                {locale === "ar"
                  ? "كلمة المرور الحالية (لتغيير البريد)"
                  : "Current password (to change email)"}
              </Label>
              <Input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}

          <div>
            <Label>{locale === "ar" ? "لغة الواجهة" : "Interface language"}</Label>
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                variant={locale === "ar" ? "default" : "outline"}
                disabled={profileBusy}
                onClick={() => void saveLocale("ar")}
              >
                العربية
              </Button>
              <Button
                size="sm"
                variant={locale === "en" ? "default" : "outline"}
                disabled={profileBusy}
                onClick={() => void saveLocale("en")}
              >
                English
              </Button>
            </div>
          </div>

          <Button
            onClick={() => void saveProfile()}
            disabled={
              profileBusy ||
              (!nameChanged && !emailChanged) ||
              name.trim().length < 2 ||
              (emailChanged && !emailPassword)
            }
          >
            {profileBusy && <Loader2 className="size-4 animate-spin me-2" />}
            {locale === "ar" ? "حفظ الملف الشخصي" : "Save profile"}
          </Button>
        </div>
      </Panel>

      <Panel icon={Shield} title={locale === "ar" ? "الأمان" : "Security"}>
        <div className="p-4 space-y-3">
          <div>
            <Label>
              {locale === "ar" ? "كلمة المرور الحالية" : "Current password"}
            </Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label>
              {locale === "ar" ? "كلمة المرور الجديدة" : "New password"}
            </Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
            />
          </div>
          <div>
            <Label>
              {locale === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
            </Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
            />
          </div>
          <Button
            onClick={() => void changePassword()}
            disabled={
              securityBusy ||
              !currentPassword ||
              newPassword.length < 10 ||
              confirmPassword.length < 10
            }
          >
            {securityBusy && <Loader2 className="size-4 animate-spin me-2" />}
            {locale === "ar" ? "تغيير كلمة المرور" : "Change password"}
          </Button>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium">
              {locale === "ar"
                ? "المصادقة الثنائية (MFA)"
                : "Two-factor authentication (MFA)"}
              {mfaEnabled ? (
                <span className="ms-2 text-emerald-600">
                  {locale === "ar" ? "مفعّل" : "Enabled"}
                </span>
              ) : (
                <span className="ms-2 text-muted-foreground">
                  {locale === "ar" ? "غير مفعّل" : "Off"}
                </span>
              )}
            </p>
            {mfaEnabled && (
              <div>
                <Label>
                  {locale === "ar"
                    ? "رمز MFA الحالي"
                    : "Current MFA code"}
                </Label>
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={currentMfaToken}
                  onChange={(e) => setCurrentMfaToken(e.target.value)}
                  placeholder="000000"
                  className="font-mono tracking-widest"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void setupMfa()}
                disabled={
                  securityBusy || (mfaEnabled && currentMfaToken.length < 6)
                }
              >
                {mfaEnabled
                  ? locale === "ar"
                    ? "تدوير MFA"
                    : "Rotate MFA"
                  : locale === "ar"
                    ? "إعداد MFA"
                    : "Setup MFA"}
              </Button>
              {mfaEnabled && (
                <Button
                  variant="destructive"
                  onClick={() => void disableMfa()}
                  disabled={securityBusy || currentMfaToken.length < 6}
                >
                  {locale === "ar" ? "إيقاف MFA" : "Disable MFA"}
                </Button>
              )}
            </div>
            {qr && (
              <div className="flex flex-col items-center gap-2 pt-2">
                { }
                <img
                  src={qr}
                  alt="MFA QR"
                  className="rounded-xl border shadow-sm"
                />
                <Input
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaToken}
                  onChange={(e) => setMfaToken(e.target.value)}
                  placeholder="000000"
                  className="font-mono tracking-widest text-center"
                />
                <Button
                  onClick={() => void confirmMfa()}
                  disabled={securityBusy || mfaToken.length < 6}
                >
                  {locale === "ar" ? "تأكيد وتفعيل" : "Confirm & enable"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
