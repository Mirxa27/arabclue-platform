"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Building2,
  ShieldCheck,
  Bot,
  FileCheck2,
  Users,
  BarChart3,
  ArrowLeft,
} from "lucide-react";
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
      "Track NCA, PDPL, and local-content controls with statuses your reviewers can defend — not placeholder checklists.",
    bodyAr:
      "تتبّع ضوابط الهيئة الوطنية وحماية البيانات والمحتوى المحلي بحالات يمكن لمراجعيك الدفاع عنها — لا قوائم شكلية.",
  },
  {
    icon: Users,
    titleEn: "Account knowledge base & approvals",
    titleAr: "قاعدة معرفة الحساب والاعتماد",
    bodyEn:
      "Complete 10-part onboarding (brand, certs, staff, library, restrictions), then route proposals through your approval chain.",
    bodyAr:
      "أكمل إعداد الحساب بعشرة أقسام (الهوية، الشهادات، الفريق، المكتبة، القيود)، ثم مرّر العروض عبر سلسلة الاعتماد.",
  },
  {
    icon: BarChart3,
    titleEn: "Quota and plan visibility",
    titleAr: "وضوح الحصص والباقات",
    bodyEn:
      "See document and proposal usage against your plan before a run fails — billing stays predictable for finance teams.",
    bodyAr:
      "اطّلع على استخدام المستندات والعطاءات مقابل باقتك قبل فشل التشغيل — تبقى التكاليف متوقعة لفرق المالية.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    titleEn: "Complete account onboarding",
    titleAr: "أكمل إعداد الحساب",
    bodyEn: "Brand, certificates, staff, library, approval chain, and restrictions.",
    bodyAr: "الهوية والشهادات والفريق والمكتبة وسلسلة الاعتماد والقيود.",
  },
  {
    n: "02",
    titleEn: "Ingest RFP packages",
    titleAr: "استوعب حزم طلب العروض",
    bodyEn: "Upload PDFs and attachments; agents extract requirements into the matrix.",
    bodyAr: "ارفع ملفات PDF والمرفقات؛ يستخرج الوكلاء المتطلبات إلى المصفوفة.",
  },
  {
    n: "03",
    titleEn: "Draft, approve, export",
    titleAr: "صغ، اعتمد، صدّر",
    bodyEn: "Edit technical sections, enter prices yourself, approve, download branded package.",
    bodyAr: "حرّر الأقسام الفنية، أدخل الأسعار بنفسك، اعتمد، وحمّل الحزمة بعلامتك.",
  },
] as const;

function OwnersContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";

  return (
    <div>
      {/* Hero — brand first, one composition */}
      <section className="relative overflow-hidden border-b border-border/50">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -10%, oklch(0.88 0.06 250), transparent), linear-gradient(180deg, oklch(0.96 0.02 240), oklch(0.97 0.008 240))",
          }}
        />
        <div
          className="absolute inset-0 -z-10 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(0.45 0.18 258 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(0.45 0.18 258 / 0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="font-[family-name:var(--font-ibm-arabic)] text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[oklch(0.28_0.07_258)]"
          >
            أراب كلاو
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="mt-1 text-sm sm:text-base font-semibold tracking-[0.18em] uppercase text-[oklch(0.45_0.14_258)]"
          >
            Arabclue · For Owners
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.14 }}
            className="mt-6 max-w-2xl text-xl sm:text-2xl font-semibold leading-snug text-foreground/90"
          >
            {ar
              ? "منصة تشغيل عطاءات اعتماد لفرقك — من الاستيعاب إلى الحزمة الجاهزة للتقديم."
              : "An Etimad proposal operations platform for your team — from intake to submission-ready packages."}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="mt-4 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed"
          >
            {ar
              ? "صمّمت لأصحاب العمل الذين يديرون عدة مناقصات متزامنة ويحتاجون امتثالاً قابلاً للتدقيق، وصلاحيات واضحة، ومخرجات ثنائية اللغة."
              : "Built for owners running concurrent tenders who need audit-ready compliance, clear roles, and bilingual deliverables."}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg" className="gap-2">
              <Link href="/login">
                {ar ? "ادخل مساحة العمل" : "Enter workspace"}
                <ArrowLeft className="size-4 rtl:rotate-180" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">{ar ? "عرض الباقات" : "View plans"}</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight">
          {ar ? "ما الذي يحصل عليه مالك المساحة؟" : "What workspace owners get"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          {ar
            ? "أدوات تشغيلية كاملة — وليست مجرد مسودة نصية."
            : "Full operational tooling — not a generic text draft tool."}
        </p>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.titleEn}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="flex gap-4"
              >
                <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/15">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">
                    {ar ? cap.titleAr : cap.titleEn}
                  </h3>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                    {ar ? cap.bodyAr : cap.bodyEn}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="border-y border-border/50 bg-background/60">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">
          <div className="flex items-center gap-2 text-primary mb-6">
            <Building2 className="size-4" />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {ar ? "مسار العمل" : "Operating path"}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">
            {ar ? "ثلاث خطوات من المناقصة إلى الحزمة" : "Three steps from RFP to package"}
          </h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.n}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <span className="font-mono text-2xl font-bold text-primary/30">
                  {step.n}
                </span>
                <h3 className="mt-2 text-sm font-semibold">
                  {ar ? step.titleAr : step.titleEn}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {ar ? step.bodyAr : step.bodyEn}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 mb-3">
              <FileCheck2 className="size-4" />
              <span className="text-xs font-semibold tracking-wide uppercase">
                {ar ? "جاهزية التقديم" : "Submission readiness"}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight max-w-md">
              {ar
                ? "مخرجات فنية ومالية ومصفوفة امتثال في حزمة واحدة."
                : "Technical, financial, and compliance matrix artifacts in one package."}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-lg leading-relaxed">
              {ar
                ? "يدعم العربية والإنجليزية، مع تتبع الإصدارات وإمكانية التحرير قبل التصدير النهائي."
                : "Arabic and English supported, with version history and in-app editing before final export."}
            </p>
          </div>
          <Button asChild size="lg">
            <Link href="/login">
              {ar ? "ابدأ الآن" : "Get started"}
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function ForOwnersPage() {
  return (
    <PublicShell activePath="/for-owners">
      <OwnersContent />
    </PublicShell>
  );
}
