"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";
import { PackagesSection } from "@/components/marketing/packages-section";

function PricingContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 80% 0%, oklch(0.28 0.06 220 / 0.45), transparent),
              oklch(0.12 0.02 240)
            `,
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
            className="mt-4 text-xl sm:text-2xl font-semibold text-white/90 max-w-xl"
          >
            {ar ? "باقات واضحة لفرق المناقصات" : "Clear packages for tender teams"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-3 max-w-lg text-sm text-white/50 leading-relaxed"
          >
            {ar
              ? "من المبتدئ إلى المؤسسات — بالريال، مع حصص تُفرض عند الرفع وتشغيل الوكلاء."
              : "From Starter to Enterprise — in SAR, with quotas enforced at upload and agent run."}
          </motion.p>
        </div>
      </section>

      <PackagesSection compact />

      <section className="border-t border-white/10 py-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-none bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] font-semibold"
          >
            <Link href="/login">{ar ? "ادخل مساحة العمل" : "Enter workspace"}</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-none border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
          >
            <Link href="/">{ar ? "العودة للرئيسية" : "Back to home"}</Link>
          </Button>
        </div>
        <p className="mx-auto max-w-6xl px-4 sm:px-6 mt-8 text-xs text-white/35">
          {ar
            ? "يُفعَّل الاشتراك من لوحة الفوترة داخل مساحة العمل عبر ماي فاتورة."
            : "Subscriptions activate from billing inside the workspace via MyFatoorah."}
        </p>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <PublicShell activePath="/pricing" variant="dark">
      <PricingContent />
    </PublicShell>
  );
}
