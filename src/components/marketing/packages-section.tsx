"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicLocale } from "@/components/marketing/public-shell";
import {
  MARKETING_PLANS,
  formatSar,
} from "@/lib/marketing-plans";
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

  return (
    <section id={id} className={cn("scroll-mt-20", compact ? "py-16" : "py-20 sm:py-24")}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl"
        >
          <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[oklch(0.72_0.12_195)]">
            {ar ? "الباقات" : "Packages"}
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            {ar
              ? "اختر حجم عملك — الحصص واضحة من اليوم الأول"
              : "Pick your scale — quotas clear from day one"}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-white/55 leading-relaxed">
            {ar
              ? "أسعار شهرية بالريال. تُفرض الحدود عند الرفع وتشغيل الوكلاء — بلا مفاجآت في منتصف المناقصة."
              : "Monthly SAR pricing. Limits enforce at upload and agent run — no surprises mid-tender."}
          </p>
        </motion.div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {MARKETING_PLANS.map((plan, i) => (
            <motion.div
              key={plan.code}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className={cn(
                "relative flex flex-col border p-6 sm:p-7",
                plan.highlight
                  ? "border-[oklch(0.72_0.12_195)]/50 bg-[oklch(0.16_0.025_220)]"
                  : "border-white/10 bg-white/[0.03]"
              )}
            >
              {plan.highlight && (
                <span className="absolute -top-3 inset-x-0 mx-auto w-fit px-3 py-0.5 text-[10px] font-bold tracking-[0.16em] uppercase bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)]">
                  {ar ? "الأكثر اختياراً" : "Most chosen"}
                </span>
              )}
              <p className="text-[10px] font-mono font-semibold tracking-[0.2em] text-white/40">
                {plan.code}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {ar ? plan.nameAr : plan.nameEn}
              </h3>
              <p className="mt-1 text-xs text-white/45">
                {ar ? plan.descriptionAr : plan.descriptionEn}
              </p>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-tight text-white">
                  {formatSar(plan.priceMonthly, locale)}
                </span>
                <span className="text-xs text-white/40">
                  {ar ? "/ شهر" : "/ mo"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/35">
                {ar
                  ? `أو ${formatSar(plan.priceYearly, locale)} سنوياً`
                  : `or ${formatSar(plan.priceYearly, locale)} / year`}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {(ar ? plan.featuresAr : plan.featuresEn).map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-white/65">
                    <Check className="size-4 shrink-0 mt-0.5 text-[oklch(0.72_0.12_195)]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={cn(
                  "mt-8 w-full h-11 rounded-none font-semibold",
                  plan.highlight
                    ? "bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)]"
                    : "bg-white/10 text-white hover:bg-white/15"
                )}
              >
                <Link href="/login">
                  {ar ? "ابدأ الآن" : "Start now"}
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
