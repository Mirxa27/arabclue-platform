"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import {
  Menu,
  X,
  ArrowUpRight,
  Shield,
  Globe2,
  Sun,
  Moon,
  Sparkles,
  Lock,
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
  variant = "dark",
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
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isDark = variant === "dark";
  const currentTheme = mounted ? (resolvedTheme as "light" | "dark" | undefined) : undefined;

  return (
    <LocaleCtx.Provider value={{ locale, setLocale, toggle }}>
      <MotionConfig reducedMotion="user">
        <div
        className={cn(
          "min-h-screen flex flex-col antialiased",
          isDark
            ? "bg-[oklch(0.13_0.02_260)] text-white marketing-dark-plane selection:bg-cyan-300/20"
            : "bg-background text-foreground"
        )}
      >
        {/* Premium header — Linear/Stripe inspired: surface ladder + hairline + glass 2.0 */}
        <header
          className={cn(
            "sticky top-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            scrolled
              ? isDark
                ? "border-b border-[var(--hairline)] bg-[rgba(12,13,16,0.72)] supports-[backdrop-filter]:bg-[rgba(12,13,16,0.72)] backdrop-blur-[16px] backdrop-saturate-[1.4] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset,0_1px_0_0_rgba(255,255,255,0.06)]"
                : "border-b border-border/50 bg-background/80 backdrop-blur-[16px] shadow-sm"
              : isDark
                ? "border-b border-transparent bg-transparent"
                : "border-b border-border/20 bg-background/60 backdrop-blur-xl"
          )}
        >
          <div className="container-premium flex h-[64px] sm:h-[68px] items-center justify-between gap-3 sm:gap-4">
            <Link href="/" className="flex items-center gap-3 min-w-0 group outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-full pr-1">
              <div className="relative">
                <ArabclueLogo className="size-9 sm:size-[38px] rounded-[11px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset,0_8px_16px_rgba(0,0,0,0.24)] group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset,0_12px_24px_rgba(0,0,0,0.32)] transition-all duration-300" />
                <span className="pointer-events-none absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_oklch(0.7_0.15_160)] animate-pulse" />
              </div>
              <div className="flex flex-col leading-none min-w-0">
                <span className={cn("font-[family-name:var(--font-ibm-arabic)] text-[17px] sm:text-[18px] font-bold tracking-[-0.02em] truncate", isDark ? "text-white" : "text-foreground")}>
                  أراب كلاو
                </span>
                <span className={cn("text-[10px] font-bold tracking-[0.18em] uppercase -mt-0.5", isDark ? "text-white/55" : "text-muted-foreground")}>Arabclue</span>
              </div>
              <span className={cn("hidden md:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ml-1.5 transition-colors", isDark ? "border-white/10 bg-white/[0.05] text-white/60 group-hover:bg-white/[0.08] group-hover:border-white/15" : "border-primary/15 bg-primary/5 text-primary")}>
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SaaS
              </span>
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              {NAV.map((item) => {
                const active = activePath === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative rounded-full px-3.5 h-[32px] inline-flex items-center justify-center text-[13px] font-[500] tracking-[-0.01em] transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300",
                      active
                        ? isDark
                          ? "bg-white text-black shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset] font-[600]"
                          : "bg-foreground text-background shadow font-[600]"
                        : isDark
                          ? "text-white/55 hover:text-white hover:bg-white/[0.07] active:bg-white/[0.10] active:scale-[0.98]"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.98]"
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
                  "h-[36px] sm:h-[40px] inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 text-[12px] font-[600] tracking-wide transition-all duration-200 min-w-[44px] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.97]",
                  isDark ? "border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/[0.10] hover:text-white hover:border-white/15" : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
                aria-label="Toggle language"
              >
                <Globe2 className="size-3.5 shrink-0" />
                <motion.span key={locale} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="hidden xs:inline">
                  {locale === "ar" ? "EN" : "عربي"}
                </motion.span>
              </button>

              <button
                type="button"
                onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
                className={cn(
                  "h-[36px] w-[36px] sm:h-[40px] sm:w-[40px] rounded-full border inline-flex items-center justify-center transition-all duration-200 min-w-[44px] min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.96]",
                  isDark ? "border-white/10 bg-white/[0.06] text-white/60 hover:bg-white/[0.10] hover:text-white" : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
                title={currentTheme === "dark" ? "Light mode" : "Dark mode"}
                aria-label="Toggle theme"
              >
                {mounted && currentTheme === "dark" ? <Sun className="size-[16px]" /> : <Moon className="size-[16px]" />}
              </button>

              <Button
                asChild
                size="sm"
                className={cn(
                  "hidden sm:inline-flex h-[40px] rounded-full font-[600] tracking-[-0.01em] gap-1.5 px-5 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.14)_inset] transition-all active:scale-[0.98] text-[13px]",
                  isDark ? "bg-white text-black hover:bg-white/90" : "bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                <Link href="/login" className="inline-flex items-center gap-1.5">
                  {locale === "ar" ? "دخول المساحة" : "Enter workspace"}
                  <ArrowUpRight className="size-3.5 opacity-70" />
                </Link>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "lg:hidden rounded-full h-[40px] w-[40px] min-h-[44px] min-w-[44px] active:scale-[0.96] transition-transform",
                  isDark ? "text-white hover:bg-white/[0.08] hover:text-white" : ""
                )}
                onClick={() => setOpen((v) => !v)}
                aria-label="Menu"
                aria-expanded={open}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={open ? "x" : "menu"}
                    initial={{ rotate: -90, opacity: 0, scale: 0.8 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.18 }}
                    className="inline-flex"
                  >
                    {open ? <X className="size-5" /> : <Menu className="size-5" />}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </div>
          </div>

          {/* Mobile drawer — premium: backdrop + surface ladder + bento items */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "lg:hidden overflow-hidden border-t backdrop-blur-[20px]",
                  isDark ? "border-[var(--hairline)] bg-[rgba(12,13,16,0.88)]" : "border-border bg-background/95"
                )}
              >
                <div className="container-premium py-5 sm:py-6">
                  <div className="grid gap-2">
                    {NAV.map((item, i) => (
                      <motion.div key={item.href} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "group flex items-center justify-between rounded-[14px] border px-4 h-[48px] text-[14px] font-[500] tracking-[-0.01em] transition-all active:scale-[0.98]",
                            isDark ? "border-white/[0.07] bg-white/[0.04] text-white/75 hover:bg-white/[0.08] hover:text-white hover:border-white/[0.12]" : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span>{locale === "ar" ? item.labelAr : item.labelEn}</span>
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] group-hover:bg-white/[0.10] transition-colors">
                            <ArrowUpRight className="size-4 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </span>
                        </Link>
                      </motion.div>
                    ))}

                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        asChild
                        size="lg"
                        className={cn("h-[48px] rounded-full w-full font-[600] text-[14px]", isDark ? "bg-white text-black hover:bg-white/90" : "bg-foreground text-background")}
                      >
                        <Link href="/login" onClick={() => setOpen(false)}>
                          {locale === "ar" ? "دخول المساحة" : "Enter workspace"}
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        size="lg"
                        className={cn(
                          "h-[48px] rounded-full w-full font-[500] border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white",
                          !isDark && "border-border bg-background text-muted-foreground"
                        )}
                      >
                        <Link href="/pricing" onClick={() => setOpen(false)}>
                          {locale === "ar" ? "الباقات" : "Pricing"}
                        </Link>
                      </Button>
                    </motion.div>

                    <div className={cn("mt-4 flex items-center gap-2.5 rounded-[14px] border px-3.5 py-3 text-[12px] leading-[1.4]", isDark ? "bg-white/[0.04] border-white/[0.08] text-white/50" : "bg-muted border-border text-muted-foreground")}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                        <Shield className="size-4" />
                      </div>
                      <span className="min-w-0 flex-1">
                        {locale === "ar" ? "PDPL • NCA • Etimad جاهز • تشفير كامل" : "PDPL • NCA • Etimad Ready • Encrypted"}
                      </span>
                      <Lock className="size-3.5 opacity-50 shrink-0" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main className="flex-1 min-w-0">{children}</main>

        {/* Premium footer — surface 0 + hairline + editorial spacing */}
        <footer className={cn("relative border-t overflow-hidden", isDark ? "border-[var(--hairline)] bg-[var(--surface-0)]" : "border-border/50 bg-muted/20")}>
          {/* subtle aurora glow */}
          <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-[280px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.12_195/0.06),transparent_70%)] blur-[24px]" />
          <div className="container-premium relative">
            <div className="py-12 sm:py-14 lg:py-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <ArabclueLogo className="size-10 rounded-[12px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]" />
                  <div className="min-w-0">
                    <p className={cn("font-[family-name:var(--font-ibm-arabic)] text-[17px] font-bold leading-none tracking-[-0.02em] truncate", isDark ? "text-white" : "text-foreground")}>
                      أراب كلاو
                    </p>
                    <p className={cn("text-[11px] font-[600] tracking-[0.14em] uppercase mt-0.5 flex items-center gap-1.5", isDark ? "text-white/40" : "text-muted-foreground")}>
                      Arabclue SaaS
                      <span className="inline-flex h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                    </p>
                  </div>
                </div>
                <p className={cn("mt-5 text-[13.5px] leading-[1.65] max-w-[34ch] text-pretty", isDark ? "text-white/55" : "text-muted-foreground")}>
                  {locale === "ar"
                    ? "نظام تشغيل عطاءات اعتماد بالذكاء الاصطناعي — من الاستيعاب إلى الحزمة الجاهزة، عربي/إنجليزي، مع امتثال قابل للتدقيق وهوية علامتك."
                    : "AI bid operating system for Etimad — intake to submission-ready pack, AR/EN, auditable compliance, your brand identity intact."}
                </p>
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {["Etimad", "NCA", "PDPL", "ZATCA", "Vision 2030"].map((b) => (
                    <span
                      key={b}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-[500] tracking-wide transition-colors hover:bg-white/[0.06]",
                        isDark ? "border-[var(--hairline)] bg-white/[0.04] text-white/45" : "border-border bg-background text-muted-foreground"
                      )}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/45">
                  <Sparkles className="h-3 w-3 text-amber-200/60" />
                  {locale === "ar" ? "مبني بحب في الرياض" : "Crafted with care in Riyadh"}
                </div>
              </div>

              <div className="min-w-0">
                <p className={cn("text-[11px] font-[700] tracking-[0.16em] uppercase mb-4", isDark ? "text-white/30" : "text-muted-foreground")}>
                  {locale === "ar" ? "المنتج" : "Product"}
                </p>
                <ul className="space-y-2.5 text-[13.5px]">
                  {[
                    ["/#features", "Features", "المميزات"],
                    ["/#how", "How it works", "كيف يعمل"],
                    ["/pricing", "Packages & Pricing", "الباقات والأسعار"],
                    ["/for-owners", "For Owners", "لأصحاب العمل"],
                    ["/faq", "FAQ", "الأسئلة الشائعة"],
                  ].map(([href, en, arLabel]) => (
                    <li key={href as string}>
                      <Link href={href as string} className={cn("inline-flex items-center gap-1.5 transition-colors hover:underline underline-offset-4 decoration-white/20", isDark ? "text-white/55 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
                        {locale === "ar" ? arLabel : en}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0">
                <p className={cn("text-[11px] font-[700] tracking-[0.16em] uppercase mb-4", isDark ? "text-white/30" : "text-muted-foreground")}>
                  {locale === "ar" ? "الشركة" : "Company"}
                </p>
                <ul className="space-y-2.5 text-[13.5px]">
                  {[
                    ["/about", "About", "عن أراب كلاو"],
                    ["/compliance", "Compliance", "الامتثال"],
                    ["/security", "Security", "الأمن"],
                    ["/contact", "Contact", "تواصل معنا"],
                  ].map(([href, en, arLabel]) => (
                    <li key={href as string}>
                      <Link href={href as string} className={cn("hover:underline underline-offset-4", isDark ? "text-white/55 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
                        {locale === "ar" ? arLabel : en}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0">
                <p className={cn("text-[11px] font-[700] tracking-[0.16em] uppercase mb-4", isDark ? "text-white/30" : "text-muted-foreground")}>
                  {locale === "ar" ? "قانوني" : "Legal"}
                </p>
                <ul className="space-y-2.5 text-[13.5px]">
                  {[
                    ["/legal", "Legal hub", "مركز السياسات"],
                    ["/privacy", "Privacy", "الخصوصية"],
                    ["/terms", "Terms", "الشروط"],
                    ["/cookies", "Cookies", "ملفات الارتباط"],
                    ["/billing-policy", "Billing", "الفوترة"],
                  ].map(([href, en, arLabel]) => (
                    <li key={href as string}>
                      <Link href={href as string} className={cn("hover:underline underline-offset-4", isDark ? "text-white/55 hover:text-white" : "text-muted-foreground hover:text-foreground")}>
                        {locale === "ar" ? arLabel : en}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={cn("flex flex-col gap-4 py-6 border-t text-[12px]", isDark ? "border-[var(--hairline)] text-white/30" : "border-border/50 text-muted-foreground")}>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {[
                  ["/acceptable-use", "Acceptable use", "الاستخدام المقبول"],
                  ["/dpa", "DPA", "ملحق المعالجة"],
                  ["/login", "Workspace login", "دخول المساحة"],
                ].map(([href, en, arLabel]) => (
                  <Link key={href as string} href={href as string} className={cn("hover:underline underline-offset-4 transition-colors", isDark ? "text-white/40 hover:text-white/70" : "hover:text-foreground")}>
                    {locale === "ar" ? arLabel : en}
                  </Link>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <p className="text-[12px] leading-[1.5]">© {new Date().getFullYear()} Arabclue · أراب كلاو — {locale === "ar" ? "مساعد إعداد العطاءات بالذكاء الاصطناعي" : "AI Bid Preparation SaaS"}</p>
                <p className="flex items-center gap-2 text-[11px]">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {locale === "ar" ? "متوافق مع متطلبات المنافسة الحكومية" : "Built for KSA government procurement"}
                </p>
              </div>
            </div>
          </div>
        </footer>
      </div>
      </MotionConfig>
    </LocaleCtx.Provider>
  );
}
