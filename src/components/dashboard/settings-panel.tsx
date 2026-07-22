"use client";

import { useLocale } from "@/lib/store";
import { useSession } from "next-auth/react";
import { Panel } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Shield } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function SettingsPanel() {
  const { locale, setLocale } = useLocale();
  const { data: session } = useSession();
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword() {
    setBusy(true);
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
      toast({ title: locale === "ar" ? "تم تغيير كلمة المرور" : "Password updated" });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel icon={Settings} title={locale === "ar" ? "الإعدادات" : "Settings"}>
        <div className="p-4 space-y-4">
          <div>
            <Label>{locale === "ar" ? "المستخدم" : "User"}</Label>
            <p className="text-sm">{session?.user?.name}</p>
            <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
            <p className="text-xs text-muted-foreground">{session?.user?.role}</p>
          </div>
          <div>
            <Label>{locale === "ar" ? "اللغة" : "Locale"}</Label>
            <div className="flex gap-2 mt-1">
              <Button
                size="sm"
                variant={locale === "ar" ? "default" : "outline"}
                onClick={() => setLocale("ar")}
              >
                العربية
              </Button>
              <Button
                size="sm"
                variant={locale === "en" ? "default" : "outline"}
                onClick={() => setLocale("en")}
              >
                English
              </Button>
            </div>
          </div>
        </div>
      </Panel>
      <Panel icon={Shield} title={locale === "ar" ? "الأمان" : "Security"}>
        <div className="p-4 space-y-3">
          <div>
            <Label>{locale === "ar" ? "كلمة المرور الحالية" : "Current password"}</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>{locale === "ar" ? "كلمة المرور الجديدة" : "New password"}</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={changePassword}
            disabled={busy || !currentPassword || newPassword.length < 10}
          >
            {locale === "ar" ? "تغيير كلمة المرور" : "Change password"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {locale === "ar"
              ? "لإعداد المصادقة الثنائية استخدم شاشة تسجيل الدخول عند التفعيل."
              : "Use the login MFA flow to set up two-factor authentication."}
          </p>
        </div>
      </Panel>
    </div>
  );
}
