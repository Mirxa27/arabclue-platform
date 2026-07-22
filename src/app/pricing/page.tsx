"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";

const PLANS = [
  {
    code: "STARTER",
    nameEn: "Starter",
    nameAr: "الأساسية",
    priceEn: "Contact sales",
    priceAr: "تواصل مع المبيعات",
    highlight: false,
    featuresEn: [
      "Up to 10 tender projects",
      "Document ingestion & matrix",
      "Core agent pipeline",
      "Arabic & English exports",
    ],
    featuresAr: [
      "حتى 10 مشاريع مناقصة",
      "استيعاب المستندات والمصفوفة",
      "خط وكلاء أساسي",
      "تصدير عربي وإنجليزي",
    ],
  },
  {
    code: "PRO",
    nameEn: "Professional",
    nameAr: "الاحترافية",
    priceEn: "Most popular",
    priceAr: "الأكثر اختياراً",
    highlight: true,
    featuresEn: [
      "Higher proposal quotas",
      "Compliance frameworks suite",
      "Version history & rewrite",
      "Team roles (writer / reviewer)",
      "Priority agent runs",
    ],
    featuresAr: [
      "حصص عطاءات أعلى",
      "حزمة أطر الامتثال",
      "سجل إصدارات وإعادة صياغة",
      "أدوار الفريق (كاتب / مراجع)",
      "تشغيل وكلاء بأولوية",
    ],
  },
  {
    code: "ENTERPRISE",
    nameEn: "Enterprise",
    nameAr: "المؤسسات",
    priceEn: "Custom",
    priceAr: "مخصص",
    highlight: false,
    featuresEn: [
      "Unlimited workspaces options",
      "SSO-ready controls",
      "Dedicated AI provider routing",
      "Audit export & retention policies",
      "Onboarding with your brand corpus",
    ],
    featuresAr: [
      "خيارات مساحات عمل غير محدودة",
      "ضوابط جاهزة لـ SSO",
      "توجيه مخصص لمزودي الذكاء",
      "تصدير تدقيق وسياسات احتفاظ",
      "تهيئة بهوية شركتكم ومشاريعكم السابقة",
    ],
  },
] as const;

function PricingContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border/50">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 70% 0%, oklch(0.9 0.04 230), transparent), oklch(0.97 0.008 240)",
          }}
        />
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-14 sm:pt-20">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-[family-name:var(--font-ibm-arabic)] text-3xl sm:text-4xl font-bold text-[oklch(0.28_0.07_258)]"
          >
            أراب كلاو
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-xl sm:text-2xl font-semibold"
          >
            {ar ? "باقات تناسب فرق المناقصات" : "Plans for tender operations teams"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-3 max-w-xl text-sm text-muted-foreground leading-relaxed"
          >
            {ar
              ? "الحصص تُفرض عند رفع المستندات وتشغيل الوكلاء — بلا مفاجآت في منتصف المناقصة."
              : "Quotas are enforced at document upload and agent run — no surprises mid-tender."}
          </motion.p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.code}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className={
                plan.highlight
                  ? "rounded-xl border-2 border-primary/40 bg-background p-6 shadow-sm"
                  : "rounded-xl border border-border/60 bg-background/80 p-6"
              }
            >
              <p className="text-[10px] font-mono font-semibold tracking-wider text-muted-foreground">
                {plan.code}
              </p>
              <h2 className="mt-1 text-lg font-bold">
                {ar ? plan.nameAr : plan.nameEn}
              </h2>
              <p className="mt-1 text-sm text-primary font-medium">
                {ar ? plan.priceAr : plan.priceEn}
              </p>
              <ul className="mt-5 space-y-2.5">
                {(ar ? plan.featuresAr : plan.featuresEn).map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-6 w-full"
                variant={plan.highlight ? "default" : "outline"}
              >
                <Link href="/login">
                  {ar ? "ابدأ مع هذه الباقة" : "Start with this plan"}
                </Link>
              </Button>
            </motion.div>
          ))}
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground">
          {ar
            ? "تُدار الباقات من لوحة المسؤول. تواصل مع مسؤول المنصة لتفعيل الاشتراك."
            : "Plans are managed from the admin console. Contact your platform admin to activate a subscription."}
        </p>
      </section>
    </div>
  );
}

export default function PricingPage() {
  return (
    <PublicShell activePath="/pricing">
      <PricingContent />
    </PublicShell>
  );
}
