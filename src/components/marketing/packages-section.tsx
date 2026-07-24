"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Sparkles,
  ShieldCheck,
  Users,
  ArrowRight,
  ArrowLeft,
  Zap,
  Crown,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicLocale } from "@/components/marketing/public-shell";
import { MARKETING_PLANS, formatSar } from "@/lib/marketing-plans";
import { cn } from "@/lib/utils";

export function PackagesSection({
  id = "packages",
  compact = false,
}: {
  id?: string;
  compact?: boolean;
}) {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const CtaIcon = ar ? ArrowLeft : ArrowRight;
  const [yearly, setYearly] = useState(false);

  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-24 border-b border-white/10 overflow-hidden",
        compact ? "py-12 sm:py-16" : "py-16 sm:py-20 lg:py-28"
      )}
    >
      <div className="absolute inset-0 -z-10 bg-[oklch(0.13_0.02_260)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[oklch(0.16_0.025_260/.55)] to-transparent" />
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 -z-10 h-[860px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[40px]"
        style={{ background: "radial-gradient(ellipse at center, oklch(0.72 0.12 195 / 0.09), transparent 66%)" }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.55 }}
            className="max-w-[640px]"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1 backdrop-blur">
              <motion.span animate={{ rotate: [0, 18, -8, 0] }} transition={{ duration: 2.6, repeat: Infinity }}>
                <Sparkles className="h-3.5 w-3.5 text-amber-200/80" />
              </motion.span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{ar ? "الباقات والأسعار" : "Packages & pricing"}</span>
            </div>
            <h2 className="mt-4 text-[26px] sm:text-[34px] lg:text-[40px] font-semibold leading-[1.06] tracking-[-0.03em] text-white text-balance">
              {ar ? "اختر حجم عملك — الحصص واضحة من اليوم الأول" : "Pick your scale — quotas clear from day one"}
            </h2>
            <p className="mt-3.5 text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">
              {ar
                ? "أسعار شهرية بالريال السعودي. تُطبق الحدود عند الرفع وتشغيل الوكلاء — بلا مفاجآت في منتصف المناقصة. يمكنك الترقية أو التخفيض في أي وقت."
                : "Monthly SAR pricing. Limits at upload & agent run — no surprises mid-tender. Upgrade or downgrade anytime, no lock-in."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center gap-3"
          >
            {/* billing toggle */}
            <div className="relative flex items-center rounded-full border border-white/10 bg-white/[0.06] p-1 backdrop-blur">
              <button
                onClick={() => setYearly(false)}
                className={cn(
                  "relative z-10 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors",
                  !yearly ? "text-black" : "text-white/60 hover:text-white/80"
                )}
              >
                {ar ? "شهري" : "Monthly"}
              </button>
              <button
                onClick={() => setYearly(true)}
                className={cn(
                  "relative z-10 rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors flex items-center gap-1.5",
                  yearly ? "text-black" : "text-white/60 hover:text-white/80"
                )}
              >
                {ar ? "سنوي" : "Yearly"}
                <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 ring-1 ring-emerald-300/20">
                  -17%
                </span>
              </button>
              <motion.div
                layout
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-white shadow"
                animate={{ left: yearly ? "calc(50% + 2px)" : "4px" }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
              />
            </div>

            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-200/70" />
              {ar ? "بلا رسوم خفية" : "No hidden fees"}
            </span>
          </motion.div>
        </div>

        <div className="mt-10 lg:mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 items-stretch auto-rows-fr">
          {MARKETING_PLANS.map((plan, i) => {
            const isStarter = plan.code === "STARTER";
            const isPro = plan.code === "PRO";
            const Icon = isPro ? Crown : isStarter ? Zap : Building2;
            const price = yearly ? plan.priceYearly : plan.priceMonthly;
            const priceLabel = yearly ? (ar ? "/ سنة" : "/ year") : ar ? "/ شهر" : "/ mo";

            return (
              <motion.div
                key={plan.code}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.09, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -6, transition: { duration: 0.22 } }}
                className={cn(
                  "group relative flex flex-col rounded-[26px] p-[1.2px] transition-all",
                  plan.highlight
                    ? "bg-gradient-to-b from-[oklch(0.72_0.12_195/.7)] via-[oklch(0.72_0.12_195/.35)] to-white/10 shadow-[0_24px_80px_-24px_oklch(0.72_0.12_195/.55)]"
                    : "bg-gradient-to-b from-white/[0.11] to-white/[0.05] hover:from-white/[0.15] hover:to-white/[0.08]"
                )}
              >
                {/* shine */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px] opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -skew-x-12"
                    initial={{ x: "-120%" }}
                    whileHover={{ x: "120%" }}
                    transition={{ duration: 0.8 }}
                  />
                </div>

                {plan.highlight && (
                  <div className="absolute -top-3.5 left-1/2 z-20 -translate-x-1/2">
                    <motion.span
                      initial={{ scale: 0.9, y: 4 }}
                      whileInView={{ scale: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[oklch(0.72_0.12_195)] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[oklch(0.14_0.02_240)] shadow-[0_8px_20px_-8px_oklch(0.72_0.12_195/.6)]"
                    >
                      <Sparkles className="h-3 w-3" />
                      {ar ? "الأكثر اختياراً" : "Most chosen"}
                    </motion.span>
                  </div>
                )}

                <div className={cn("relative flex flex-1 flex-col rounded-[24.8px] backdrop-blur-xl overflow-hidden", plan.highlight ? "bg-[oklch(0.16_0.025_220)]" : "bg-[oklch(0.14_0.02_260)]")}>
                  {plan.highlight && <div className="pointer-events-none absolute -top-28 -right-20 h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,oklch(0.72_0.12_195/.20),transparent_70%)] blur-xl" />}

                  <div className="p-6 sm:p-7 flex flex-1 flex-col relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono font-semibold tracking-[0.22em] text-white/30">{plan.code}</p>
                        <h3 className="mt-1.5 text-[19px] font-semibold tracking-tight text-white flex items-center gap-2">
                          {ar ? plan.nameAr : plan.nameEn}
                          {isPro && <Crown className="h-4 w-4 text-amber-200/70" />}
                        </h3>
                        <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45 max-w-[28ch]">{ar ? plan.descriptionAr : plan.descriptionEn}</p>
                      </div>
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl ring-1 shadow-inner", plan.highlight ? "bg-cyan-400/10 text-cyan-200 ring-cyan-300/20" : "bg-white/[0.06] text-white/50 ring-white/10")}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-4">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={`${plan.code}-${yearly}-${locale}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.24 }}
                            className="text-[32px] font-bold tracking-tight text-white leading-none"
                          >
                            {formatSar(price, locale)}
                          </motion.span>
                        </AnimatePresence>
                        <span className="text-[11px] font-medium text-white/40">{priceLabel}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-[11px] text-white/35">
                          {yearly
                            ? ar
                              ? `≈ ${formatSar(Math.round(plan.priceYearly / 12), locale)} / شهر`
                              : `≈ ${formatSar(Math.round(plan.priceYearly / 12), locale)} / mo`
                            : ar
                              ? `أو ${formatSar(plan.priceYearly, locale)} سنوياً`
                              : `or ${formatSar(plan.priceYearly, locale)} / year`}
                        </span>
                      </div>
                    </div>

                    <ul className="mt-6 flex-1 space-y-3">
                      {(ar ? plan.featuresAr : plan.featuresEn).map((f, idx) => (
                        <motion.li
                          key={f}
                          initial={{ opacity: 0, x: 6 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.08 + idx * 0.04 }}
                          className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-white/70"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/15">
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="min-w-0 flex-1 break-words">{f}</span>
                        </motion.li>
                      ))}
                    </ul>

                    <div className="mt-8">
                      <Button
                        asChild
                        size="lg"
                        className={cn(
                          "group/btn w-full h-[46px] rounded-full font-semibold text-[13.5px] tracking-wide transition-all relative overflow-hidden",
                          plan.highlight
                            ? "bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] shadow-[0_10px_24px_-10px_oklch(0.72_0.12_195/.7)] hover:shadow-[0_14px_32px_-12px_oklch(0.72_0.12_195/.8)]"
                            : "bg-white/[0.08] text-white hover:bg-white/[0.12] border border-white/10 hover:border-white/15"
                        )}
                      >
                        <Link href="/login" className="inline-flex items-center justify-center gap-2">
                          <span className="relative z-10 flex items-center gap-2">
                            {ar ? "ابدأ الآن" : "Start now"}
                            <CtaIcon className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                          </span>
                          {plan.highlight && (
                            <motion.span
                              className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12"
                              initial={{ x: "-100%" }}
                              whileHover={{ x: "100%" }}
                              transition={{ duration: 0.6 }}
                            />
                          )}
                        </Link>
                      </Button>
                      <p className="mt-3 text-center text-[11px] leading-relaxed text-white/25">
                        {ar ? "بدون بطاقة • إلغاء أي وقت" : "No card • Cancel anytime"}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 w-fit mx-auto backdrop-blur"
        >
          <span className="text-[11px] font-medium text-white/40 text-center">{ar ? "جميع الباقات تشمل:" : "All plans include:"}</span>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { en: "PDPL & NCA", ar: "PDPL و NCA" },
              { en: "Bilingual export", ar: "تصدير ثنائي" },
              { en: "Pricing guard", ar: "حارس التسعير" },
              { en: "Audit log", ar: "سجل تدقيق" },
            ].map((t) => (
              <span key={t.en} className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">
                <Check className="h-3 w-3 text-emerald-300/60" />
                {ar ? t.ar : t.en}
              </span>
            ))}
          </div>
        </motion.div>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {[
            { icon: Users, en: "AR/EN support", ar: "دعم عربي/إنجليزي" },
            { icon: ShieldCheck, en: "Cancel anytime", ar: "إلغاء أي وقت" },
          ].map((b) => (
            <span key={b.en} className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-3 py-1 text-[11px] text-white/35">
              <b.icon className="h-3 w-3" />
              {ar ? b.ar : b.en}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
