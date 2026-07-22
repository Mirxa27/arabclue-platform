"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, ShieldCheck, Users, FileCheck2, BarChart3, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";

const CAPABILITIES = [
  {
    icon: Bot,
    titleEn: "Multi-agent proposal factory",
    titleAr: "مصنع عطاءات متعدد الوكلاء",
    bodyEn:
      "Orchestrate ingestion, technical drafting, structure-only financial forms, and compliance checks in one controlled run — never bid pricing.",
    bodyAr:
      "نظّم الاستيعاب والصياغة الفنية وهيكل النماذج المالية وفحص الامتثال في تشغيل واحد — دون تسعير العطاء.",
  },
  {
    icon: ShieldCheck,
    titleEn: "Evidence-backed compliance",
    titleAr: "امتثال مدعوم بالأدلة",
    bodyEn:
      "Track NCA, PDPL, and local-content controls with statuses your reviewers can defend.",
    bodyAr:
      "تتبّع ضوابط الهيئة الوطنية وحماية البيانات والمحتوى المحلي بحالات يمكن لمراجعيك الدفاع عنها.",
  },
  {
    icon: Users,
    titleEn: "Account knowledge & approvals",
    titleAr: "قاعدة معرفة الحساب والاعتماد",
    bodyEn:
      "Onboard certificates, staff, methodologies, and approval chains once — reuse on every tender.",
    bodyAr:
      "هيّئ الشهادات والطاقم والمنهجيات وسلاسل الاعتماد مرة — وأعد استخدامها في كل مناقصة.",
  },
  {
    icon: FileCheck2,
    titleEn: "Requirements matrix",
    titleAr: "مصفوفة المتطلبات",
    bodyEn:
      "Every RFP clause becomes a trackable requirement: covered, in progress, or missing.",
    bodyAr:
      "كل فقرة من كراسة الشروط تصبح متطلباً قابلاً للتتبع: مغطى، قيد العمل، أو مفقود.",
  },
  {
    icon: BarChart3,
    titleEn: "Quota-aware operations",
    titleAr: "تشغيل يراعي الحصص",
    bodyEn:
      "Plan limits enforce at upload and agent run — no surprises mid-tender.",
    bodyAr:
      "حدود الباقة تُفرض عند الرفع وتشغيل الوكلاء — بلا مفاجآت في منتصف المناقصة.",
  },
  {
    icon: Building2,
    titleEn: "Built for Etimad teams",
    titleAr: "مبني لفرق اعتماد",
    bodyEn:
      "Arabic-first UI, bilingual exports, and workflows shaped for KSA government procurement.",
    bodyAr:
      "واجهة عربية أولاً، وتصدير ثنائي اللغة، ومسارات مصممة للمشتريات الحكومية السعودية.",
  },
] as const;

function OwnersContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 70% 0%, oklch(0.28 0.06 220 / 0.4), transparent),
              oklch(0.12 0.02 240)
            `,
          }}
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-16 pb-14 sm:pt-20">
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
            {ar
              ? "نظام تشغيل عطاءات لأصحاب مساحات العمل"
              : "Bid ops system for workspace owners"}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="mt-3 max-w-xl text-sm text-white/50 leading-relaxed"
          >
            {ar
              ? "من قاعدة معرفة الشركة إلى حزمة التصدير — مع امتثال قابل للتدقيق وتسعير بشري فقط."
              : "From company knowledge base to export package — with auditable compliance and human-only pricing."}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 flex flex-wrap gap-3"
          >
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
              <Link href="/#packages">{ar ? "عرض الباقات" : "View packages"}</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <motion.div
                key={c.titleEn}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="border-t border-white/15 pt-6"
              >
                <Icon className="size-5 text-[oklch(0.72_0.12_195)]" />
                <h2 className="mt-4 text-sm font-semibold text-white">
                  {ar ? c.titleAr : c.titleEn}
                </h2>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">
                  {ar ? c.bodyAr : c.bodyEn}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function ForOwnersPage() {
  return (
    <PublicShell activePath="/for-owners" variant="dark">
      <OwnersContent />
    </PublicShell>
  );
}
