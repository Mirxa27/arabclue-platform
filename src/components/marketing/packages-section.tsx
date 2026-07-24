"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Sparkles, ShieldCheck, Users, ArrowRight, ArrowLeft } from "lucide-react";
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

  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-24 border-b border-white/10 overflow-hidden",
        compact ? "py-12 sm:py-16" : "py-16 sm:py-20 lg:py-28"
      )}
    >
      {/* Soft background */}
      <div className="absolute inset-0 -z-10 bg-[oklch(0.13_0.02_260)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[oklch(0.16_0.025_260/.5)] to-transparent" />
      <div className="absolute left-1/2 top-1/2 -z-10 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.72_0.12_195/.08),transparent_65%)] blur-2xl" />

      <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5 }}
            className="max-w-[640px]"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-amber-200/80" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{ar ? "الباقات والأسعار" : "Packages & pricing"}</span>
            </div>
            <h2 className="mt-4 text-[26px] sm:text-[32px] lg:text-[38px] font-semibold leading-[1.08] tracking-[-0.02em] text-white text-balance">
              {ar ? "اختر حجم عملك — الحصص واضحة من اليوم الأول" : "Pick your scale — quotas clear from day one"}
            </h2>
            <p className="mt-3.5 text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">
              {ar
                ? "أسعار شهرية بالريال السعودي. تُطبق الحدود عند الرفع وتشغيل الوكلاء — بلا مفاجآت في منتصف المناقصة. يمكنك الترقية أو التخفيض في أي وقت."
                : "Monthly SAR pricing. Limits enforce at upload and agent run — no surprises mid-tender. Upgrade or downgrade anytime."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center gap-2.5"
          >
            {[
              { icon: ShieldCheck, en: "No hidden fees", ar: "بلا رسوم خفية" },
              { icon: Users, en: "Support in AR/EN", ar: "دعم عربي/إنجليزي" },
            ].map((b) => (
              <span key={b.en} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-white/55">
                <b.icon className="h-3.5 w-3.5 text-cyan-200/70" />
                {ar ? b.ar : b.en}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="mt-10 lg:mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 items-stretch auto-rows-fr">
          {MARKETING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.code}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.45 }}
              className={cn(
                "group relative flex flex-col rounded-[24px] p-[1px] transition-all",
                plan.highlight
                  ? "bg-gradient-to-b from-[oklch(0.72_0.12_195/.6)] via-[oklch(0.72_0.12_195/.35)] to-white/10 shadow-[0_20px_60px_-20px_oklch(0.72_0.12_195/.5)]"
                  : "bg-gradient-to-b from-white/[0.10] to-white/[0.04] hover:from-white/[0.14] hover:to-white/[0.06]"
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[oklch(0.72_0.12_195)] px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[oklch(0.14_0.02_240)] shadow-lg shadow-cyan-500/20">
                    <Sparkles className="h-3 w-3" />
                    {ar ? "الأكثر اختياراً" : "Most chosen"}
                  </span>
                </div>
              )}

              <div
                className={cn(
                  "relative flex flex-1 flex-col rounded-[23px] backdrop-blur-xl overflow-hidden",
                  plan.highlight ? "bg-[oklch(0.16_0.025_220)]" : "bg-[oklch(0.14_0.02_260)]"
                )}
              >
                {/* top accent glow for highlighted */}
                {plan.highlight && (
                  <div className="pointer-events-none absolute -top-24 -right-24 h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,oklch(0.72_0.12_195/.18),transparent_70%)] blur-xl" />
                )}

                <div className="p-6 sm:p-7 flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-mono font-semibold tracking-[0.2em] text-white/30">{plan.code}</p>
                      <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight text-white">{ar ? plan.nameAr : plan.nameEn}</h3>
                      <p className="mt-1 text-[12px] leading-relaxed text-white/45 max-w-[28ch]">{ar ? plan.descriptionAr : plan.descriptionEn}</p>
                    </div>
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl ring-1",
                        plan.highlight ? "bg-cyan-400/10 text-cyan-200 ring-cyan-300/20" : "bg-white/[0.06] text-white/50 ring-white/10"
                      )}
                    >
                      <ShieldCheck className="h-[18px] w-[18px]" />
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[30px] font-bold tracking-tight text-white leading-none">
                        {formatSar(plan.priceMonthly, locale)}
                      </span>
                      <span className="text-[11px] font-medium text-white/40">{ar ? "/ شهر" : "/ month"}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/10" />
                      <span className="text-[11px] text-white/30">
                        {ar ? `أو ${formatSar(plan.priceYearly, locale)} سنوياً` : `or ${formatSar(plan.priceYearly, locale)} / year`}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {(ar ? plan.featuresAr : plan.featuresEn).map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px] leading-[1.5] text-white/65">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/15">
                          <Check className="h-3 w-3" />
                        </span>
                        <span className="min-w-0 flex-1 break-words">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Button
                      asChild
                      size="lg"
                      className={cn(
                        "w-full h-[46px] rounded-full font-semibold text-[13.5px] tracking-wide transition-all group/btn",
                        plan.highlight
                          ? "bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] shadow-[0_8px_20px_-8px_oklch(0.72_0.12_195/.6)] hover:shadow-[0_12px_28px_-10px_oklch(0.72_0.12_195/.7)]"
                          : "bg-white/[0.08] text-white hover:bg-white/[0.12] border border-white/10 hover:border-white/15"
                      )}
                    >
                      <Link href="/login" className="inline-flex items-center justify-center gap-2">
                        {ar ? "ابدأ الآن" : "Start now"}
                        <CtaIcon className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                      </Link>
                    </Button>
                    <p className="mt-3 text-center text-[11px] leading-relaxed text-white/25">
                      {ar ? "بدون بطاقة • إلغاء أي وقت" : "No card required • Cancel anytime"}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Reassurance row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 w-fit mx-auto backdrop-blur"
        >
          <span className="text-[11px] font-medium text-white/40 text-center">
            {ar ? "جميع الباقات تشمل:" : "All plans include:"}
          </span>
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
      </div>
    </section>
  );
}
