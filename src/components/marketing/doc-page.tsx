"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PublicShell,
  usePublicLocale,
} from "@/components/marketing/public-shell";
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
  teal: "radial-gradient(ellipse 60% 50% at 15% 0%, oklch(0.26 0.05 195 / 0.4), transparent)",
  blue: "radial-gradient(ellipse 70% 50% at 80% 0%, oklch(0.28 0.06 220 / 0.45), transparent)",
  warm: "radial-gradient(ellipse 55% 45% at 50% 0%, oklch(0.30 0.04 80 / 0.25), transparent)",
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

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: `${ACCENT[heroAccent]}, oklch(0.12 0.02 240)`,
          }}
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-12 sm:pt-20">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-[family-name:var(--font-ibm-arabic)] text-4xl sm:text-5xl font-bold text-white"
          >
            أراب كلاو
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mt-4 text-xl sm:text-2xl font-semibold text-white/90 max-w-2xl"
          >
            {ar ? titleAr : titleEn}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-3 max-w-xl text-sm text-white/50 leading-relaxed"
          >
            {ar ? summaryAr : summaryEn}
          </motion.p>
          {updated ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-4 text-[11px] text-white/35 tracking-wide"
            >
              {ar ? `آخر تحديث: ${updated}` : `Last updated: ${updated}`}
            </motion.p>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
        {children}

        {sections?.map((section, i) => {
          const title = ar ? section.titleAr : section.titleEn;
          const paragraphs = ar
            ? section.paragraphsAr ?? section.paragraphsEn
            : section.paragraphsEn ?? section.paragraphsAr;
          const bullets = ar
            ? section.bulletsAr ?? section.bulletsEn
            : section.bulletsEn ?? section.bulletsAr;
          return (
            <motion.article
              key={section.titleEn}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: Math.min(i * 0.03, 0.2) }}
              className={cn(
                "border-t border-white/10 py-8 first:border-t-0 first:pt-0"
              )}
            >
              <h2 className="text-base font-semibold text-white tracking-tight">
                {title}
              </h2>
              {paragraphs?.map((p) => (
                <p
                  key={p.slice(0, 48)}
                  className="mt-3 text-sm text-white/55 leading-relaxed max-w-3xl"
                >
                  {p}
                </p>
              ))}
              {bullets && bullets.length > 0 ? (
                <ul className="mt-4 space-y-2 max-w-3xl">
                  {bullets.map((b) => (
                    <li
                      key={b.slice(0, 48)}
                      className="text-sm text-white/55 leading-relaxed ps-4 relative before:absolute before:start-0 before:top-[0.55em] before:size-1 before:rounded-full before:bg-[oklch(0.72_0.12_195)]"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </motion.article>
          );
        })}

        {faqs && faqs.length > 0 ? (
          <div className="space-y-0">
            {faqs.map((item, i) => (
              <motion.details
                key={item.qEn}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                className="group border-t border-white/10 py-5 first:border-t-0"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-sm font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>{ar ? item.qAr : item.qEn}</span>
                  <span className="text-white/40 group-open:rotate-45 transition-transform text-lg leading-none shrink-0">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-white/55 leading-relaxed max-w-3xl pe-8">
                  {ar ? item.aAr : item.aEn}
                </p>
              </motion.details>
            ))}
          </div>
        ) : null}

        {related && related.length > 0 ? (
          <div className="mt-10 border-t border-white/10 pt-8">
            <p className="text-xs font-bold tracking-widest uppercase text-white/35 mb-4">
              {ar ? "روابط ذات صلة" : "Related"}
            </p>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[12px] text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {ar ? r.labelAr : r.labelEn}
                  <ArrowUpRight className="size-3.5 opacity-60" />
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-12 flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-none bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] font-semibold"
          >
            <Link href="/login">
              {ar ? "ادخل مساحة العمل" : "Enter workspace"}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-none border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
          >
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
