"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/for-owners", labelEn: "For owners", labelAr: "لأصحاب العمل" },
  { href: "/pricing", labelEn: "Pricing", labelAr: "الأسعار" },
  { href: "/compliance", labelEn: "Compliance", labelAr: "الامتثال" },
] as const;

const LocaleCtx = createContext<"ar" | "en">("ar");

export function usePublicLocale() {
  return useContext(LocaleCtx);
}

export function PublicShell({
  children,
  activePath,
}: {
  children: ReactNode;
  activePath?: string;
}) {
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  return (
    <LocaleCtx.Provider value={locale}>
      <div className="min-h-screen flex flex-col bg-[oklch(0.97_0.008_240)] text-foreground">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-[oklch(0.97_0.008_240)]/90 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link
              href="/for-owners"
              className="font-[family-name:var(--font-ibm-arabic)] text-lg font-bold tracking-tight text-[oklch(0.32_0.08_258)]"
            >
              أراب كلاو
              <span className="ms-1.5 font-[family-name:var(--font-geist-sans)] text-sm font-semibold text-muted-foreground">
                Arabclue
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "transition-colors hover:text-primary",
                    activePath === item.href
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {locale === "ar" ? item.labelAr : item.labelEn}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setLocale((l) => (l === "ar" ? "en" : "ar"))}
              >
                {locale === "ar" ? "EN" : "عربي"}
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/login">
                  {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
              >
                {open ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </div>
          </div>

          {open && (
            <div className="md:hidden border-t border-border/60 px-4 py-3 space-y-2 bg-background/95">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium"
                >
                  {locale === "ar" ? item.labelAr : item.labelEn}
                </Link>
              ))}
              <Button asChild size="sm" className="w-full">
                <Link href="/login">
                  {locale === "ar" ? "تسجيل الدخول" : "Sign in"}
                </Link>
              </Button>
            </div>
          )}
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border/60 py-8">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} Arabclue · أراب كلاو</p>
            <p>
              {locale === "ar"
                ? "متوافق مع اعتماد، الهيئة الوطنية للأمن السيبراني، وحماية البيانات الشخصية"
                : "Aligned with Etimad, NCA, and PDPL requirements"}
            </p>
          </div>
        </footer>
      </div>
    </LocaleCtx.Provider>
  );
}
