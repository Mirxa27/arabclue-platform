"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Menu,
  X,
  ArrowUpRight,
  Shield,
  Globe2,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ArabclueLogo } from "@/components/brand/arabclue-logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", labelEn: "Home", labelAr: "الرئيسية" },
  { href: "/#features", labelEn: "Features", labelAr: "المميزات" },
  { href: "/#how", labelEn: "How it works", labelAr: "كيف يعمل" },
  { href: "/pricing", labelEn: "Packages", labelAr: "الباقات" },
  { href: "/compliance", labelEn: "Compliance", labelAr: "الامتثال" },
  { href: "/faq", labelEn: "FAQ", labelAr: "الأسئلة" },
] as const;

type Locale = "ar" | "en";
const LOCALE_KEY = "arabclue-marketing-locale";

type LocaleApi = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggle: () => void;
};

const LocaleCtx = createContext<LocaleApi>({
  locale: "ar",
  setLocale: () => {},
  toggle: () => {},
});

export function usePublicLocale(): Locale {
  return useContext(LocaleCtx).locale;
}
export function usePublicLocaleApi(): LocaleApi {
  return useContext(LocaleCtx);
}

export function PublicShell({
  children,
  activePath,
  variant = "dark", // marketing defaults to dark immersive for futuristic look
}: {
  children: ReactNode;
  activePath?: string;
  variant?: "light" | "dark";
}) {
  const [locale, setLocaleRaw] = useState<Locale>("ar");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  // hydrate locale from localStorage once
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_KEY) : null;
    if (saved === "ar" || saved === "en") setLocaleRaw(saved as Locale);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleRaw(l);
    if (typeof window !== "undefined") window.localStorage.setItem(LOCALE_KEY, l);
  };
  const toggle = () => setLocale(locale === "ar" ? "en" : "ar");

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isDark = variant === "dark";
  const currentTheme = mounted ? (resolvedTheme as "light" | "dark" | undefined) : undefined;

  return (
    <LocaleCtx.Provider value={{ locale, setLocale, toggle }}>
      <div
        className={cn(
          "min-h-screen flex flex-col",
          isDark
            ? "bg-[oklch(0.13_0.02_260)] text-white marketing-dark-plane"
            : "bg-background text-foreground"
        )}
      >
        <header
          className={cn(
            "sticky top-0 z-50 border-b transition-all duration-300",
            scrolled
              ? isDark
                ? "border-white/10 bg-[oklch(0.13_0.02_260)]/85 backdrop-blur-2xl shadow-[0_1px_0_0_oklch(1_0_0/0.06)]"
                : "border-border/60 bg-background/85 backdrop-blur-2xl shadow-sm"
              : isDark
                ? "border-transparent bg-transparent"
                : "border-border/40 bg-background/70 backdrop-blur-xl"
          )}
        >
          <div className="mx-auto flex h-[64px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-3 min-w-0 group">
              <ArabclueLogo className="size-9 shadow-lg rounded-[10px] ring-1 ring-white/10" />
              <div className="flex flex-col leading-none">
                <span
                  className={cn(
                    "font-[family-name:var(--font-ibm-arabic)] text-[18px] font-bold tracking-tight",
                    isDark ? "text-white" : "text-foreground"
                  )}
                >
                  أراب كلاو
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold tracking-[0.18em] uppercase -mt-0.5",
                    isDark ? "text-white/60" : "text-muted-foreground"
                  )}
                >
                  Arabclue
                </span>
              </div>
              <span
                className={cn(
                  "hidden md:inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold ml-2",
                  isDark
                    ? "border-white/15 bg-white/5 text-white/60"
                    : "border-primary/15 bg-primary/5 text-primary"
                )}
              >
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SaaS
              </span>
            </Link>
            <nav className="hidden lg:flex items-center gap-1 text-[13px]">
              {NAV.map((item) => {
                const active = activePath === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative rounded-full px-3.5 py-2 font-medium transition-colors",
                      active
                        ? isDark
                          ? "bg-white text-black shadow"
                          : "bg-foreground text-background shadow"
                        : isDark
                          ? "text-white/60 hover:text-white hover:bg-white/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {locale === "ar" ? item.labelAr : item.labelEn}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-[12px] font-bold tracking-wide transition-all flex items-center gap-1.5",
                  isDark
                    ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Globe2 className="size-3.5" />
                <motion.span
                  key={locale}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {locale === "ar" ? "EN" : "عربي"}
                </motion.span>
              </button>

              <button
                type="button"
                onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                className={cn(
                  "h-9 w-9 rounded-full border flex items-center justify-center transition-all",
                  isDark
                    ? "border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
                title={currentTheme === "dark" ? "Light mode" : "Dark mode"}
                aria-label="Toggle theme"
              >
                {mounted && currentTheme === "dark" ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>

              <Button
                asChild
                size="sm"
                className={cn(
                  "hidden sm:inline-flex h-9 rounded-full font-semibold gap-1.5 px-5 shadow",
                  isDark
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                <Link href="/login">
                  {locale === "ar" ? "دخول المساحة" : "Enter workspace"}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn("lg:hidden rounded-full", isDark ? "text-white hover:bg-white/10 hover:text-white" : "")}
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
              >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </Button>
            </div>
          </div>
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "lg:hidden overflow-hidden border-t",
                  isDark ? "border-white/10 bg-[oklch(0.13_0.02_260)]" : "border-border bg-background"
                )}
              >
                <div className="px-4 py-5 space-y-2">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium",
                        isDark
                          ? "text-white/80 hover:bg-white/10 hover:text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <span>{locale === "ar" ? item.labelAr : item.labelEn}</span>
                      <ArrowUpRight className="size-4 opacity-50" />
                    </Link>
                  ))}
                  <Button
                    asChild
                    size="lg"
                    className={cn(
                      "w-full rounded-full mt-3 font-semibold",
                      isDark ? "bg-white text-black hover:bg-white/90" : "bg-foreground text-background"
                    )}
                  >
                    <Link href="/login">{locale === "ar" ? "دخول المساحة" : "Enter workspace"}</Link>
                  </Button>
                  <div
                    className={cn(
                      "mt-4 flex items-center gap-2 text-[11px] rounded-xl px-3 py-2.5",
                      isDark
                        ? "bg-white/5 text-white/50 border border-white/10"
                        : "bg-muted text-muted-foreground border border-border"
                    )}
                  >
                    <Shield className="size-3.5 flex-shrink-0" />
                    <span>{locale === "ar" ? "PDPL • NCA • Etimad جاهز" : "PDPL • NCA • Etimad Ready"}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>
        <main className="flex-1">{children}</main>
        <footer className={cn("border-t", isDark ? "border-white/10 bg-[oklch(0.11_0.02_260)]" : "border-border/60 bg-muted/30")}>
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
            <div className="py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
              <div>
                <div className="flex items-center gap-3">
                  <ArabclueLogo className="size-10 rounded-xl shadow ring-1 ring-white/10" />
                  <div>
                    <p
                      className={cn(
                        "font-[family-name:var(--font-ibm-arabic)] text-[17px] font-bold leading-none",
                        isDark ? "text-white" : "text-foreground"
                      )}
                    >
                      أراب كلاو
                    </p>
                    <p
                      className={cn(
                        "text-[11px] font-semibold tracking-[0.15em] uppercase mt-0.5",
                        isDark ? "text-white/50" : "text-muted-foreground"
                      )}
                    >
                      Arabclue SaaS
                    </p>
                  </div>
                </div>
                <p className={cn("mt-4 text-sm leading-relaxed max-w-[32ch]", isDark ? "text-white/60" : "text-muted-foreground")}>
                  {locale === "ar"
                    ? "منصة تشغيل عطاءات اعتماد بالذكاء الاصطناعي — من الاستيعاب إلى الحزمة الجاهزة، عربي/إنجليزي، مع امتثال قابل للتدقيق."
                    : "AI bid ops platform for Etimad — from intake to submission-ready package, AR/EN, with auditable compliance."}
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {["Etimad", "NCA", "PDPL", "ZATCA", "Vision 2030"].map((b) => (
                    <span
                      key={b}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide",
                        isDark ? "border-white/10 bg-white/5 text-white/50" : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className={cn("text-xs font-bold tracking-widest uppercase mb-4", isDark ? "text-white/40" : "text-muted-foreground")}>
                  {locale === "ar" ? "المنتج" : "Product"}
                </p>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link
                      href="/#features"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "المميزات" : "Features"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#how"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "كيف يعمل" : "How it works"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/pricing"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الباقات والأسعار" : "Packages & Pricing"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/for-owners"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "لأصحاب العمل" : "For Owners"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/faq"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الأسئلة الشائعة" : "FAQ"}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className={cn("text-xs font-bold tracking-widest uppercase mb-4", isDark ? "text-white/40" : "text-muted-foreground")}>
                  {locale === "ar" ? "الشركة" : "Company"}
                </p>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link
                      href="/about"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "عن أراب كلاو" : "About"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/compliance"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الامتثال" : "Compliance"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/security"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الأمن" : "Security"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "تواصل معنا" : "Contact"}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className={cn("text-xs font-bold tracking-widest uppercase mb-4", isDark ? "text-white/40" : "text-muted-foreground")}>
                  {locale === "ar" ? "قانوني" : "Legal"}
                </p>
                <ul className="space-y-2.5 text-sm">
                  <li>
                    <Link
                      href="/legal"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "مركز السياسات" : "Legal hub"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/privacy"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الخصوصية" : "Privacy"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الشروط" : "Terms"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/cookies"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "ملفات الارتباط" : "Cookies"}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/billing-policy"
                      className={cn("hover:underline", isDark ? "text-white/60 hover:text-white" : "text-muted-foreground hover:text-foreground")}
                    >
                      {locale === "ar" ? "الفوترة" : "Billing"}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div
              className={cn(
                "flex flex-col gap-4 py-6 border-t text-xs",
                isDark ? "border-white/10 text-white/35" : "border-border/60 text-muted-foreground"
              )}
            >
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {(
                  [
                    ["/acceptable-use", "Acceptable use", "الاستخدام المقبول"],
                    ["/dpa", "DPA", "ملحق المعالجة"],
                    ["/login", "Workspace login", "دخول المساحة"],
                  ] as const
                ).map(([href, en, arLabel]) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "hover:underline",
                      isDark ? "text-white/45 hover:text-white/80" : "hover:text-foreground"
                    )}
                  >
                    {locale === "ar" ? arLabel : en}
                  </Link>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <p>
                  © {new Date().getFullYear()} Arabclue · أراب كلاو —{" "}
                  {locale === "ar" ? "مساعد إعداد العطاءات بالذكاء الاصطناعي" : "AI Bid Preparation SaaS"}
                </p>
                <p className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {locale === "ar" ? "متوافق مع متطلبات المنافسة الحكومية" : "Built for KSA government procurement"}
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LocaleCtx.Provider>
  );
}
