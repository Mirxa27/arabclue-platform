"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ChevronDown, Sparkles, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";
import { cn } from "@/lib/utils";

export type DocSection = {
  titleEn: string;
  titleAr: string;
  paragraphsEn?: string[];
  paragraphsAr?: string[];
  bulletsEn?: string[];
  bulletsAr?: string[];
};

export type FaqItem = {
  qEn: string;
  qAr: string;
  aEn: string;
  aAr: string;
};

export type RelatedLink = {
  href: string;
  labelEn: string;
  labelAr: string;
};

type MarketingDocProps = {
  activePath: string;
  titleEn: string;
  titleAr: string;
  summaryEn: string;
  summaryAr: string;
  updated?: string;
  sections?: DocSection[];
  faqs?: FaqItem[];
  related?: RelatedLink[];
  heroAccent?: "teal" | "blue" | "warm";
  children?: ReactNode;
};

const ACCENT = {
  teal: "radial-gradient(ellipse 70% 55% at 20% 0%, oklch(0.32 0.08 195 / 0.45), transparent 60%)",
  blue: "radial-gradient(ellipse 78% 58% at 80% 10%, oklch(0.34 0.07 230 / 0.5), transparent 62%)",
  warm: "radial-gradient(ellipse 62% 50% at 50% 0%, oklch(0.40 0.06 80 / 0.30), transparent 60%)",
} as const;

function DocBody({
  titleEn,
  titleAr,
  summaryEn,
  summaryAr,
  updated,
  sections,
  faqs,
  related,
  heroAccent = "teal",
  children,
}: Omit<MarketingDocProps, "activePath">) {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const CtaIcon = ar ? ArrowLeft : ArrowRight;
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="w-full overflow-clip">
      {/* Hero — premium editorial */}
      <section className="relative overflow-hidden border-b border-[var(--hairline)]">
        <div className="absolute inset-0 -z-10 bg-[oklch(0.11_0.02_260)]" />
        <div className="absolute inset-0 -z-10" style={{ background: `${ACCENT[heroAccent]}, linear-gradient(180deg, oklch(0.13 0.02 260) 0%, oklch(0.11 0.02 260) 100%)` }} />
        <div className="absolute inset-0 -z-10 opacity-[0.14] [mask-image:linear-gradient(to_bottom,black_20%,transparent_90%)]">
          <div className="h-full w-full bg-[linear-gradient(to_right,oklch(1_0_0/_0.06)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/_0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />
        </div>
        <motion.div aria-hidden className="absolute -top-24 -right-24 h-[560px] w-[560px] rounded-full blur-[32px] -z-10" style={{ background: "radial-gradient(circle, oklch(0.72 0.12 195 / 0.16), transparent 68%)" }} animate={{ x: [0, 16, -8, 0], y: [0, 12, -6, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        <div className="container-premium pt-14 pb-12 sm:pt-20 sm:pb-16 lg:pt-24 lg:pb-20">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-cyan-200/70" />
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/55">{ar ? "أراب كلاو • وثائق" : "Arabclue • Documentation"}</span>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }} className="mt-5 fluid-h2 font-[700] tracking-[-0.03em] text-white text-balance max-w-[20ch] sm:max-w-[24ch]">
            {ar ? titleAr : titleEn}
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.14 }} className="mt-4 max-w-[56ch] text-[14.5px] sm:text-[15.5px] leading-[1.7] text-white/60 text-pretty">
            {ar ? summaryAr : summaryEn}
          </motion.p>

          {updated && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }} className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/60" />
              {ar ? `آخر تحديث: ${updated}` : `Last updated: ${updated}`}
            </motion.p>
          )}
        </div>
      </section>

      <section className="container-premium py-10 sm:py-14 lg:py-16">
        {children && <div className="mb-10">{children}</div>}

        {/* Sections — bento editorial */}
        {sections && sections.length > 0 && (
          <div className="grid gap-4 sm:gap-5">
            {sections.map((section, i) => {
              const title = ar ? section.titleAr : section.titleEn;
              const paragraphs = ar ? (section.paragraphsAr ?? section.paragraphsEn) : (section.paragraphsEn ?? section.paragraphsAr);
              const bullets = ar ? (section.bulletsAr ?? section.bulletsEn) : (section.bulletsEn ?? section.bulletsAr);
              return (
                <motion.article
                  key={section.titleEn}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: Math.min(i * 0.05, 0.25), duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="group relative rounded-[22px] border border-[var(--hairline)] bg-white/[0.04] p-[1px] hover:border-white/15 transition-colors"
                >
                  <div className="rounded-[21px] bg-[oklch(0.14_0.02_260)]/90 backdrop-blur-xl p-6 sm:p-7 lg:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="text-[16px] sm:text-[17px] font-[600] tracking-[-0.02em] text-white">{title}</h2>
                      <span className="hidden sm:inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/30 ring-1 ring-white/10 text-[11px] font-mono">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    {paragraphs?.map((p) => (
                      <p key={p.slice(0, 48)} className="mt-3.5 text-[14px] leading-[1.75] text-white/60 max-w-[72ch] text-pretty">
                        {p}
                      </p>
                    ))}

                    {bullets && bullets.length > 0 && (
                      <ul className="mt-5 grid gap-2.5 max-w-[72ch]">
                        {bullets.map((b) => (
                          <li key={b.slice(0, 48)} className="flex items-start gap-2.5 text-[13.5px] leading-[1.6] text-white/60">
                            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/15">
                              <ShieldCheck className="h-3 w-3" />
                            </span>
                            <span className="min-w-0 flex-1 break-words">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}

        {/* FAQ — premium accordion */}
        {faqs && faqs.length > 0 && (
          <div className="mt-14 sm:mt-16">
            <div className="mb-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35">{ar ? "أسئلة شائعة" : "Frequently asked"}</p>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>
            <div className="grid gap-3">
              {faqs.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <motion.div
                    key={item.qEn}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: Math.min(i * 0.04, 0.2) }}
                    className={cn("rounded-[18px] border bg-white/[0.04] backdrop-blur transition-colors", isOpen ? "border-white/15 bg-white/[0.06]" : "border-[var(--hairline)] hover:border-white/12")}
                  >
                    <button onClick={() => setOpenFaq(isOpen ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                      <span className="text-[14px] font-[500] tracking-[-0.01em] text-white/80">{ar ? item.qAr : item.qEn}</span>
                      <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                        <ChevronDown className="h-4 w-4 text-white/50" />
                      </motion.span>
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }} className="overflow-hidden">
                          <div className="px-5 pb-5 pt-1">
                            <p className="text-[13.5px] leading-[1.7] text-white/55 max-w-[72ch] text-pretty">{ar ? item.aAr : item.aEn}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Related */}
        {related && related.length > 0 && (
          <div className="mt-14 border-t border-[var(--hairline)] pt-8">
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/30 mb-4">{ar ? "روابط ذات صلة" : "Related"}</p>
            <div className="flex flex-wrap gap-2.5">
              {related.map((r) => (
                <Link key={r.href} href={r.href} className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-4 h-[36px] text-[13px] font-[500] text-white/70 hover:bg-white/[0.08] hover:text-white hover:border-white/15 transition-all active:scale-[0.98]">
                  {ar ? r.labelAr : r.labelEn}
                  <ArrowUpRight className="size-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 sm:mt-14 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-11 rounded-full bg-white px-6 text-[13.5px] font-[600] tracking-[-0.01em] text-black hover:bg-white/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] active:scale-[0.98] transition-transform">
            <Link href="/login" className="inline-flex items-center gap-2">
              {ar ? "ادخل مساحة العمل" : "Enter workspace"}
              <CtaIcon className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 rounded-full border-white/12 bg-white/[0.04] px-6 text-[13.5px] font-[500] text-white/70 hover:bg-white/[0.08] hover:text-white active:scale-[0.98] transition-transform">
            <Link href="/">{ar ? "العودة للرئيسية" : "Back to home"}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export function MarketingDocPage(props: MarketingDocProps) {
  return (
    <PublicShell activePath={props.activePath} variant="dark">
      <DocBody {...props} />
    </PublicShell>
  );
}
