"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shield, Lock, Eye, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";

const PILLARS = [
  {
    icon: Shield,
    titleEn: "NCA-aligned controls",
    titleAr: "ضوابط متوافقة مع الهيئة الوطنية",
    bodyEn:
      "Map tender requirements to cybersecurity controls and surface NON_COMPLIANT findings with actionable gaps.",
    bodyAr:
      "اربط متطلبات المناقصة بضوابط الأمن السيبراني وأظهر حالات عدم الامتثال مع فجوات قابلة للمعالجة.",
  },
  {
    icon: Lock,
    titleEn: "PDPL-aware workflows",
    titleAr: "مسارات تراعي حماية البيانات",
    bodyEn:
      "Tenant-scoped storage, session MFA, and role gates keep personal and commercial data inside membership boundaries.",
    bodyAr:
      "تخزين حسب المستأجر، ومصادقة ثنائية للجلسة، وحواجز أدوار تبقي البيانات الشخصية والتجارية ضمن حدود العضوية.",
  },
  {
    icon: Eye,
    titleEn: "Immutable audit trail",
    titleAr: "سجل تدقيق غير قابل للتغيير",
    bodyEn:
      "Administrators review project, user, and configuration actions for regulated environments.",
    bodyAr:
      "يراجع المسؤولون إجراءات المشاريع والمستخدمين والضبط في البيئات الخاضعة للتنظيم.",
  },
  {
    icon: Scale,
    titleEn: "Local content evidence",
    titleAr: "أدلة المحتوى المحلي",
    bodyEn:
      "Local-content and saudization targets are tracked with evidence — not assumed compliant by default.",
    bodyAr:
      "تُتتبّع مستهدفات المحتوى المحلي والسعودة بالأدلة — لا تُفترض متوافقة افتراضياً.",
  },
] as const;

function ComplianceContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div>
      <section className="relative overflow-hidden border-b border-border/50">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 20% 0%, oklch(0.92 0.04 160), transparent), oklch(0.97 0.008 240)",
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
            className="mt-4 text-xl sm:text-2xl font-semibold max-w-2xl"
          >
            {ar
              ? "امتثال يمكن الدفاع عنه أمام المراجعين — لا قوائم شكلية."
              : "Compliance your reviewers can defend — not checkbox theatre."}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-3 max-w-xl text-sm text-muted-foreground leading-relaxed"
          >
            {ar
              ? "يُنشئ خط الوكلاء مصفوفة امتثال مرتبطة بالمشروع، مع حالات واضحة وأدلة للمحتوى المحلي."
              : "The agent pipeline produces a project-bound compliance matrix with explicit statuses and local-content evidence."}
          </motion.p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.titleEn}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="flex gap-4"
              >
                <div className="size-10 rounded-lg bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0 ring-1 ring-emerald-500/20">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">
                    {ar ? p.titleAr : p.titleEn}
                  </h2>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {ar ? p.bodyAr : p.bodyEn}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-14 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/for-owners">
              {ar ? "عرض صفحة الملاك" : "See owner overview"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/login">{ar ? "تسجيل الدخول" : "Sign in"}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function ComplianceMarketingPage() {
  return (
    <PublicShell activePath="/compliance">
      <ComplianceContent />
    </PublicShell>
  );
}
