"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  FileSearch,
  ShieldCheck,
  PenLine,
  Ban,
  Sparkles,
  Users,
  CheckCircle2,
  FileText,
  Layers,
  Clock3,
  Shield,
  Building2,
  Award,
  Zap,
  Globe2,
  HeartHandshake,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";
import { PackagesSection } from "@/components/marketing/packages-section";

/* ---------------------------------------------
   Data
--------------------------------------------- */
const STEPS = [
  {
    n: "01",
    titleEn: "Upload the tender pack",
    titleAr: "ارفع حزمة المناقصة",
    bodyEn: "Drop RFP, BoQ, drawings and annexes. Arabclue reads Arabic & English, maps clauses, and builds your live matrix.",
    bodyAr: "اسحب كراسة الشروط والكميات والمخططات والملاحق. أراب كلاو يقرأ العربي والإنجليزي ويبني مصفوفة المتطلبات فوراً.",
    icon: FileSearch,
    accent: "from-cyan-400/20 to-teal-400/10",
    iconBg: "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20",
  },
  {
    n: "02",
    titleEn: "Agents draft & check",
    titleAr: "الوكلاء يصيغون ويفحصون",
    bodyEn: "Technical narrative, method statements, compliance map, and structure-only financial forms — organized, cited, ready for your experts.",
    bodyAr: "سرد فني وخطط تنفيذية وخريطة امتثال ونماذج مالية هيكلية فقط — منظمة وموثقة وجاهزة لخبرائك.",
    icon: ShieldCheck,
    accent: "from-amber-300/20 to-orange-300/10",
    iconBg: "bg-amber-300/10 text-amber-200 ring-1 ring-amber-300/20",
  },
  {
    n: "03",
    titleEn: "Humans price & approve",
    titleAr: "البشر يسعّرون ويعتمدون",
    bodyEn: "Your team enters bid prices with confidence. Reviewer chain, audit log, and bilingual export. Nothing priced by AI. Ever.",
    bodyAr: "فريقك يُدخل الأسعار بثقة. سلسلة مراجعين، سجل تدقيق، وتصدير ثنائي اللغة. لا تسعير بالذكاء الاصطناعي. أبداً.",
    icon: PenLine,
    accent: "from-emerald-300/20 to-teal-300/10",
    iconBg: "bg-emerald-300/10 text-emerald-200 ring-1 ring-emerald-300/20",
  },
] as const;

const FEATURES = [
  {
    titleEn: "Account knowledge base",
    titleAr: "قاعدة معرفة تنمو معك",
    bodyEn: "Certificates, CVs, methodologies, past bids — instantly reused. RAG that respects your standards.",
    bodyAr: "شهادات، سير ذاتية، منهجيات، عطاءات سابقة — تُستعاد فوراً. ذاكرة تحترم معاييرك.",
    icon: Building2,
    statEn: "3x faster re-use",
    statAr: "إعادة استخدام أسرع ٣x",
  },
  {
    titleEn: "Live requirements matrix",
    titleAr: "مصفوفة متطلبات حيّة",
    bodyEn: "Every clause tracked: covered, in progress, or missing. Zero blind spots before submission.",
    bodyAr: "كل فقرة متتبعة: مغطاة، قيد العمل، أو مفقودة. بلا ثغرات قبل التسليم.",
    icon: Layers,
    statEn: "100% coverage trace",
    statAr: "تتبع تغطية ١٠٠٪",
  },
  {
    titleEn: "Bilingual, branded exports",
    titleAr: "تصدير بهويتك، بلغتين",
    bodyEn: "PDF, Excel, full package — Arabic & English with your logo, fonts, and layout.",
    bodyAr: "PDF وExcel وحزمة كاملة — عربي وإنجليزي بشعارك وخطوطك وتنسيقك.",
    icon: FileText,
    statEn: "Etimad-ready format",
    statAr: "صيغة جاهزة لاعتماد",
  },
  {
    titleEn: "Approvals & audit trail",
    titleAr: "اعتماد وتدقيق لا يُمس",
    bodyEn: "Reviewer chain, immutable log, PDPL & NCA aligned. Confidence that stands up to scrutiny.",
    bodyAr: "سلسلة مراجعين وسجل غير قابل للتغيير، متوافق مع PDPL و NCA. ثقة تصمد أمام التدقيق.",
    icon: Award,
    statEn: "Audit-proof",
    statAr: "مُحصّن للتدقيق",
  },
] as const;

const TRUST_PILLS = [
  { en: "Etimad Ready", ar: "جاهز لاعتماد" },
  { en: "PDPL Aligned", ar: "متوافق مع PDPL" },
  { en: "NCA Essentials", ar: "أساسيات NCA" },
  { en: "ZATCA E-Invoicing", ar: "فوترة ZATCA" },
  { en: "Vision 2030", ar: "رؤية ٢٠٣٠" },
];

/* ---------------------------------------------
   Visual Components
--------------------------------------------- */
function HeroBackground() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Base */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 85% 65% at 75% 10%, oklch(0.28 0.06 220 / 0.55) 0%, transparent 58%),
            radial-gradient(ellipse 70% 60% at 15% 75%, oklch(0.32 0.05 200 / 0.32) 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 50% 0%, oklch(0.55 0.09 70 / 0.12) 0%, transparent 60%),
            linear-gradient(180deg, oklch(0.12 0.025 250) 0%, oklch(0.13 0.02 255) 35%, oklch(0.11 0.02 260) 100%)
          `,
        }}
      />
      {/* Warm gold glow - welcoming touch */}
      <div className="absolute -top-24 -right-24 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.72_0.14_75/_0.18),transparent_68%)] blur-[20px] max-md:h-[420px] max-md:w-[420px]" />
      <div className="absolute -bottom-32 -left-24 h-[640px] w-[640px] rounded-full bg-[radial-gradient(circle_at_center,oklch(0.72_0.12_195/_0.16),transparent_70%)] blur-[24px]" />
      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.18] [mask-image:linear-gradient(to_bottom,black_20%,transparent_90%)]">
        <div className="h-full w-full bg-[linear-gradient(to_right,oklch(1_0_0/_0.08)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/_0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>
      {/* Soft vignette bottom */}
      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.11_0.02_260)] via-transparent to-transparent" />
    </div>
  );
}

function ProductMock() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  return (
    <div className="relative w-full">
      {/* Glow behind */}
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-cyan-400/15 via-teal-300/10 to-amber-200/10 blur-2xl" />
      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
        className="relative overflow-hidden rounded-[22px] border border-white/[0.09] bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-[1px] shadow-[0_20px_80px_-20px_oklch(0.3_0.08_220/.6),0_0_0_1px_oklch(1_0_0/.04)_inset] backdrop-blur-xl"
      >
        <div className="rounded-[21px] bg-[oklch(0.16_0.02_260)]/90 overflow-hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
              </div>
              <span className="ml-2 hidden sm:inline text-[11px] font-medium tracking-wide text-white/50">
                {ar ? "مشروع: مناقصة صيانة مدارس — اعتماد ١٢٣٤٥" : "Project: Schools Maintenance — Etimad #12345"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-emerald-200 ring-1 ring-emerald-300/20">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                {ar ? "مباشر" : "Live"}
              </span>
            </div>
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 sm:grid-cols-[1.25fr_0.9fr] gap-0">
            {/* Left: matrix */}
            <div className="p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-[12px] font-bold uppercase tracking-[0.16em] text-white/40">
                  {ar ? "مصفوفة المتطلبات" : "Requirements Matrix"}
                </h4>
                <span className="text-[11px] text-white/30 font-mono">24 / 27 covered</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { labelEn: "Technical staff CVs", labelAr: "سير الطاقم الفني", status: "done", ar: "مغطى" },
                  { labelEn: "Methodology & workplan", labelAr: "المنهجية وخطة العمل", status: "done", ar: "مغطى" },
                  { labelEn: "Safety & quality plans", labelAr: "خطط السلامة والجودة", status: "progress", ar: "قيد المراجعة" },
                  { labelEn: "Financial forms ", labelAr: "النماذج المالية", status: "structure", ar: "هيكل فقط" },
                  { labelEn: "ZATCA compliance annex", labelAr: "ملحق امتثال ZATCA", status: "missing", ar: "مفقود" },
                ].map((row) => (
                  <div key={row.labelEn} className="group flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-colors hover:bg-white/[0.06]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={
                          row.status === "done"
                            ? "h-7 w-7 rounded-full bg-emerald-400/15 text-emerald-200 flex items-center justify-center ring-1 ring-emerald-300/20"
                            : row.status === "progress"
                              ? "h-7 w-7 rounded-full bg-amber-300/10 text-amber-200 flex items-center justify-center ring-1 ring-amber-300/15"
                              : row.status === "structure"
                                ? "h-7 w-7 rounded-full bg-cyan-300/10 text-cyan-200 flex items-center justify-center ring-1 ring-cyan-300/15"
                                : "h-7 w-7 rounded-full bg-white/5 text-white/30 flex items-center justify-center"
                        }
                      >
                        {row.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === "progress" ? <Clock3 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                      </div>
                      <span className="truncate text-[13px] font-medium text-white/75">{ar ? row.labelAr : row.labelEn}</span>
                    </div>
                    <span
                      className={
                        row.status === "done"
                          ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200"
                          : row.status === "progress"
                            ? "rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200"
                            : row.status === "structure"
                              ? "rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                              : "rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40"
                      }
                    >
                      {ar ? row.ar : row.status === "done" ? "Covered" : row.status === "progress" ? "Review" : row.status === "structure" ? "Structure" : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
              {/* Progress */}
              <div className="mt-5 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                  <span className="font-medium text-white/50">{ar ? "جاهزية العطاء" : "Bid readiness"}</span>
                  <span className="font-mono font-semibold text-cyan-200">88%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <motion.div initial={{ width: 0 }} animate={{ width: "88%" }} transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }} className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-teal-300" />
                </div>
              </div>
            </div>

            {/* Right: agents */}
            <div className="border-t sm:border-l sm:border-t-0 border-white/10 bg-white/[0.02] p-4 sm:p-5 flex flex-col">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35 mb-3">{ar ? "الوكلاء النشطون" : "Active agents"}</h4>
              <div className="space-y-3">
                {[
                  { nameEn: "Compliance agent", nameAr: "وكيل الامتثال", time: "2m ago", icon: ShieldCheck, color: "text-cyan-300" },
                  { nameEn: "Drafting agent", nameAr: "وكيل الصياغة", time: "now", icon: Sparkles, color: "text-amber-200" },
                  { nameEn: "Estimator guard", nameAr: "حارس التسعير", time: "standby", icon: Ban, color: "text-emerald-200" },
                ].map((a, i) => (
                  <motion.div key={a.nameEn} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.12 }} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08] ${a.color}`}>
                      <a.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-white/80">{ar ? a.nameAr : a.nameEn}</p>
                      <p className="text-[10px] text-white/35 font-mono">{a.time}</p>
                    </div>
                    <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_oklch(0.7_0.15_160)] animate-pulse" />
                  </motion.div>
                ))}
              </div>
              <div className="mt-auto pt-5">
                <div className="rounded-xl bg-gradient-to-br from-amber-200/10 to-cyan-200/10 p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-semibold leading-relaxed text-white/60">
                    {ar ? "🛡️ حارس التسعير نشط — لا توجد أسعار مقترحة من الذكاء الاصطناعي." : "🛡️ Pricing guard active — no AI-suggested prices."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating stats */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9 }}
        className="absolute -bottom-6 -left-3 sm:-left-6 z-10 hidden max-w-[220px] rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_260)]/90 px-4 py-3 shadow-2xl backdrop-blur-xl md:flex items-center gap-3"
      >
        <div className="flex -space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-[11px] font-bold text-white ring-2 ring-[oklch(0.16_0.02_260)]">N</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-teal-400 text-[11px] font-bold text-black ring-2 ring-[oklch(0.16_0.02_260)]">A</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-[11px] font-bold text-black ring-2 ring-[oklch(0.16_0.02_260)]">S</div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/80">{ar ? "فريق العطاء نشط الآن" : "Bid team active now"}</p>
          <p className="text-[10px] text-white/40 mt-0.5">{ar ? "٣ مراجعين • سجل كامل" : "3 reviewers • full audit"}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.1 }}
        className="absolute -top-6 -right-2 sm:-right-5 z-10 hidden rounded-2xl border border-amber-200/20 bg-[oklch(0.18_0.02_80)]/90 px-3.5 py-2.5 shadow-xl backdrop-blur-md md:flex items-center gap-2.5"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200/15 text-amber-200 ring-1 ring-amber-200/20">
          <Award className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] font-bold text-white/80">{ar ? "مصدّر ثنائي اللغة" : "Bilingual export"}</p>
          <p className="text-[10px] text-white/45">{ar ? "بهويتك • جاهز لاعتماد" : "Your brand • Etimad ready"}</p>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------
   Main
--------------------------------------------- */
function LandingContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const CtaIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <div className="w-full overflow-clip">
      {/* HERO */}
      <section className="relative flex min-h-[92dvh] md:min-h-[88dvh] flex-col justify-center overflow-hidden border-b border-white/10">
        <HeroBackground />
        <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 2xl:max-w-[1440px] py-10 sm:py-14 lg:py-16 xl:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-12 xl:gap-16 items-center">
            {/* Left copy */}
            <div className="min-w-0">
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 backdrop-blur-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-300" />
                </span>
                <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-white/70">
                  {ar ? "مبني لمناقصات المملكة • PDPL و NCA جاهز" : "Built for KSA procurement • PDPL & NCA Ready"}
                </span>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08 }} className="mt-6 sm:mt-8">
                <h1 className="text-balance font-[650] leading-[0.95] tracking-[-0.03em] text-white text-[2.5rem] sm:text-[3.25rem] md:text-[3.75rem] lg:text-[3.6rem] xl:text-[4.1rem] 2xl:text-[4.6rem]">
                  <span className="block font-[family-name:var(--font-ibm-arabic)] font-bold">
                    {ar ? "عطاءات حكومية" : "Government bids"}
                  </span>
                  <span className="block bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">
                    {ar ? "جاهزة للمراجعة" : "ready for review"}
                  </span>
                  <span className="block mt-1 bg-gradient-to-r from-cyan-200 via-teal-200 to-amber-200 bg-clip-text text-transparent">
                    {ar ? "في ساعات، لا أسابيع." : "in hours, not weeks."}
                  </span>
                </h1>
              </motion.div>

              <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.18 }} className="mt-5 sm:mt-6 max-w-[52ch] text-[15px] sm:text-[16.5px] leading-[1.7] tracking-[-0.01em] text-white/70 text-pretty">
                {ar
                  ? "مساعد ذكاء اصطناعي لمناقصات اعتماد: يستوعب الكراسة ثنائية اللغة، يصيغ العرض الفني المتوافق، ويبني هيكل المالي مع حماية تسعير صارمة — وفريقك يبقى صاحب القرار الأخير."
                  : "AI teammate for Etimad tenders: it ingests bilingual RFPs, drafts compliant technical proposals, and builds financial structure with strict pricing guardrails — your team stays in full control."}
              </motion.p>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.28 }} className="mt-8 sm:mt-9 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-[48px] rounded-full bg-[oklch(0.72_0.12_195)] px-7 text-[14px] font-semibold text-[oklch(0.14_0.02_240)] shadow-[0_0_0_1px_oklch(0.72_0.12_195)_inset,0_8px_24px_-8px_oklch(0.72_0.12_195/.7)] hover:bg-[oklch(0.78_0.12_195)] transition-all hover:shadow-[0_0_0_1px_oklch(0.78_0.12_195)_inset,0_12px_32px_-8px_oklch(0.72_0.12_195/.8)]">
                  <Link href="/login" className="inline-flex items-center gap-2.5">
                    {ar ? "ادخل مساحة العمل" : "Enter workspace"}
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10">
                      <CtaIcon className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-[48px] rounded-full border-white/15 bg-white/[0.04] px-7 text-[14px] font-medium text-white/80 backdrop-blur hover:bg-white/[0.08] hover:text-white hover:border-white/20 transition-all">
                  <Link href="/#packages">{ar ? "عرض الباقات" : "View packages"}</Link>
                </Button>
                <div className="hidden lg:flex items-center gap-2 pl-3">
                  <div className="h-5 w-px bg-white/10" />
                  <div className="flex items-center gap-1.5 text-[12px] text-white/45">
                    <Shield className="h-3.5 w-3.5" />
                    <span>{ar ? "آمن ومحلّي" : "Private & local-first"}</span>
                  </div>
                </div>
              </motion.div>

              {/* Social proof micro */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-8 sm:mt-10 flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-8 w-8 rounded-full border-2 border-[oklch(0.13_0.02_260)] bg-gradient-to-br from-white/20 to-white/5 backdrop-blur flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white/60">{["م", "A", "K"][i]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 3, 4].map((s) => (
                        <Star key={s} className="h-3 w-3 fill-amber-300 text-amber-300" />
                      ))}
                      <span className="ml-1 text-[12px] font-semibold text-white/70">4.9/5</span>
                    </div>
                    <p className="text-[11px] text-white/40 leading-none mt-0.5">{ar ? "يثق به مقدّمو العطاءات في الرياض وجدة" : "Trusted by bid teams in Riyadh & Jeddah"}</p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <HeartHandshake className="h-3.5 w-3.5 text-cyan-200" />
                  <span className="text-[11px] font-medium text-white/60">{ar ? "مصمم مع فرق عطاءات حقيقية" : "Designed with real bid teams"}</span>
                </div>
              </motion.div>

              {/* Trust pills mobile */}
              <div className="mt-8 flex flex-wrap gap-2 lg:hidden">
                {TRUST_PILLS.slice(0, 3).map((p) => (
                  <span key={p.en} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-white/50">
                    {ar ? p.ar : p.en}
                  </span>
                ))}
              </div>
            </div>

            {/* Right visual */}
            <div className="relative min-w-0 lg:pl-2 xl:pl-6 mt-2 lg:mt-0">
              <ProductMock />
              {/* Sub-copy under mock on mobile */}
              <div className="mt-8 grid grid-cols-3 gap-3 md:hidden">
                {[
                  { k: "88%", vEn: "Readiness", vAr: "جاهزية" },
                  { k: "27", vEn: "Clauses", vAr: "بنداً" },
                  { k: "0 SAR", vEn: "AI prices", vAr: "تسعير AI" },
                ].map((s) => (
                  <div key={s.k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
                    <p className="text-[16px] font-bold text-white">{s.k}</p>
                    <p className="mt-0.5 text-[10px] text-white/40">{ar ? s.vAr : s.vEn}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Bottom fade */}
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[oklch(0.13_0.02_260)] to-transparent" />
      </section>

      {/* TRUST STRIP */}
      <section className="relative border-y border-white/[0.06] bg-[oklch(0.12_0.02_260)]">
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/30 whitespace-nowrap">
              {ar ? "متوافق ومبني للسعودية" : "Compliant & built for KSA"}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {TRUST_PILLS.map((pill) => (
                <span key={pill.en} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/60">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                  {ar ? pill.ar : pill.en}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-200/15 to-cyan-200/15 px-3.5 py-1.5 text-[11px] font-semibold text-amber-100/80 ring-1 ring-amber-200/15">
                <Globe2 className="h-3.5 w-3.5" />
                {ar ? "ثنائي اللغة • عربي وإنجليزي" : "Bilingual • Arabic & English"}
              </span>
            </div>
            <div className="hidden xl:flex items-center gap-2 text-[11px] text-white/30">
              <span className="h-px w-8 bg-white/10" />
              <span className="font-mono">{ar ? "مستضاف في المملكة • PDPL" : "Hosted in KSA • PDPL aligned"}</span>
            </div>
          </div>
        </div>
      </section>

      {/* STATS / SOCIAL PROOF */}
      <section className="relative border-b border-white/[0.06] bg-[oklch(0.13_0.02_260)]">
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { value: "70%", labelEn: "Faster first draft", labelAr: "أسرع مسودة أولى", subEn: "Avg. bid prep time saved", subAr: "متوسط وقت الإعداد الموفر" },
              { value: "100%", labelEn: "Pricing by humans", labelAr: "التسعير بيد البشر", subEn: "No AI price suggestions", subAr: "بلا أسعار مقترحة من AI" },
              { value: "Bilingual", labelEn: "AR / EN native", labelAr: "ثنائي اللغة أصيل", subEn: "With your brand system", subAr: "بهوية علامتك" },
              { value: "PDPL", labelEn: "KSA data residency", labelAr: "إقامة بيانات سعودية", subEn: "Audit log & RBAC", subAr: "سجل تدقيق وصلاحيات" },
            ].map((stat, i) => (
              <motion.div
                key={stat.labelEn}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5 sm:p-6 backdrop-blur-sm hover:bg-white/[0.05] transition-colors group"
              >
                <p className="text-[22px] sm:text-[24px] font-bold tracking-tight text-white group-hover:text-cyan-100 transition-colors">{stat.value}</p>
                <p className="mt-1 text-[13px] font-semibold text-white/75">{ar ? stat.labelAr : stat.labelEn}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">{ar ? stat.subAr : stat.subEn}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="scroll-mt-24 relative border-b border-white/10 py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-[oklch(0.14_0.03_240/.4)] to-transparent" />
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mx-auto max-w-[720px] text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">{ar ? "كيف يعمل" : "How it works"}</span>
            </div>
            <h2 className="mt-5 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance">
              {ar ? "ثلاث خطوات. هدف واحد: عطاء يمكنك الاعتماد عليه." : "Three steps. One goal: a bid you can stand behind."}
            </h2>
            <p className="mt-4 text-[14px] sm:text-[15px] leading-relaxed text-white/60 max-w-[56ch] mx-auto text-pretty">
              {ar
                ? "نظام تشغيل مصمم مع فرق المناقصات — ليس ديمو. كل خطوة تحترم وقتك، وخبرتك، ومسؤوليتك."
                : "An operating system designed with bid teams — not a demo. Every step respects your time, expertise, and accountability."}
            </p>
          </motion.div>

          <div className="mt-12 lg:mt-16 grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-stretch">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12, duration: 0.5 }}
                  className="group relative flex flex-col rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-[1px] hover:from-white/[0.10] hover:to-white/[0.04] transition-all"
                >
                  <div className="relative flex h-full flex-col rounded-[23px] bg-[oklch(0.15_0.02_260)]/80 p-6 sm:p-7 backdrop-blur-xl overflow-hidden">
                    {/* Accent glow */}
                    <div className={`pointer-events-none absolute -top-20 -right-20 h-[200px] w-[200px] rounded-full bg-gradient-to-br ${s.accent} opacity-60 blur-2xl group-hover:opacity-80 transition-opacity`} />
                    <div className="flex items-start justify-between gap-4 relative">
                      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${s.iconBg}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="font-mono text-[11px] font-semibold tracking-widest text-white/25 border border-white/10 rounded-full px-2.5 py-1 bg-white/[0.03]">{s.n}</span>
                    </div>
                    <h3 className="mt-6 text-[17px] font-semibold leading-tight text-white tracking-tight">{ar ? s.titleAr : s.titleEn}</h3>
                    <p className="mt-2.5 text-[13.5px] leading-[1.6] text-white/60 flex-1 text-pretty">{ar ? s.bodyAr : s.bodyEn}</p>
                    <div className="mt-6 flex items-center gap-2 text-[11px] font-medium text-white/35">
                      <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                      <span className="flex items-center gap-1.5">
                        <Zap className="h-3 w-3" />
                        {ar ? "جاهز في دقائق" : "Ready in minutes"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Human-centric micro */}
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mt-10 lg:mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 w-fit mx-auto backdrop-blur">
            <div className="flex items-center gap-2 text-[12px] text-white/60">
              <Users className="h-4 w-4 text-cyan-200" />
              <span>{ar ? "مصمم لفرق من ٢ إلى ٢٠ شخصاً" : "Designed for teams of 2 to 20"}</span>
            </div>
            <span className="hidden sm:block h-3 w-px bg-white/15" />
            <div className="flex items-center gap-2 text-[12px] text-white/60">
              <HeartHandshake className="h-4 w-4 text-amber-200" />
              <span>{ar ? "دعم مباشر من فريق يفهم المناقصات" : "Human support from bid specialists"}</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PLATFORM BENTO */}
      <section id="features" className="scroll-mt-24 relative border-b border-white/10 py-16 sm:py-20 lg:py-28 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.08_200/.12),transparent_70%)] blur-2xl" />
        </div>
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8 lg:gap-12 items-start">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="lg:sticky lg:top-28">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{ar ? "المنصة" : "Platform"}</span>
              </div>
              <h2 className="mt-5 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold leading-[1.08] tracking-[-0.02em] text-white text-balance">
                {ar ? "من الاستيعاب إلى التصدير — نظام تشغيل عطاءاتك." : "From intake to export — your bid operating system."}
              </h2>
              <p className="mt-4 max-w-[46ch] text-[14px] sm:text-[15px] leading-relaxed text-white/60 text-pretty">
                {ar
                  ? "أراب كلاو لا يستبدل خبرتك. ينظّمها، يوّثقها، ويحوّلها إلى حزمة جاهزة تفتح الأبواب — بكل اللغتين وبصمتك الخاصة."
                  : "Arabclue doesn't replace expertise. It organizes it, cites it, and turns it into a submission-ready pack — bilingual and unmistakably yours."}
              </p>
              <div className="mt-8 hidden lg:flex items-center gap-3">
                <Button asChild size="sm" className="rounded-full bg-white text-black hover:bg-white/90 font-semibold">
                  <Link href="/#how">{ar ? "شاهد كيف يعمل" : "See how it works →"}</Link>
                </Button>
                <p className="text-[11px] text-white/30">{ar ? "بدون بطاقة • تجربة سريعة" : "No card • quick trial"}</p>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.titleEn}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.07 }}
                    className="group relative rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-[1px] hover:from-white/[0.09] hover:to-white/[0.03] transition-all"
                  >
                    <div className="rounded-[21px] bg-[oklch(0.14_0.02_260)]/80 p-5 sm:p-6 backdrop-blur-xl h-full flex flex-col">
                      <div className="flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-white/10 group-hover:bg-white/[0.08] group-hover:text-white transition-colors">
                          <Icon className="h-5 w-5" />
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/40">{ar ? f.statAr : f.statEn}</span>
                      </div>
                      <h3 className="mt-5 text-[15px] font-semibold text-white tracking-tight">{ar ? f.titleAr : f.titleEn}</h3>
                      <p className="mt-2 text-[13px] leading-[1.6] text-white/55 flex-1">{ar ? f.bodyAr : f.bodyEn}</p>
                      <div className="mt-5 flex items-center gap-1.5 text-[11px] font-medium text-cyan-200/70 group-hover:text-cyan-200 transition-colors">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{ar ? "جاهز للاستخدام" : "Ready to use"}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              {/* Extra wide card */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="sm:col-span-2 group relative rounded-[22px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.08] via-white/[0.04] to-cyan-200/[0.06] p-[1px] overflow-hidden"
              >
                <div className="rounded-[21px] bg-[oklch(0.16_0.02_260)]/80 p-5 sm:p-6 backdrop-blur-xl flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200/20 to-cyan-200/20 text-amber-100 ring-1 ring-amber-200/20">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-white">
                      {ar ? "مبني مع فرق العطاءات — وليس فوقهم" : "Built with bid teams — not over them"}
                    </h3>
                    <p className="mt-1 text-[13px] leading-[1.6] text-white/55">
                      {ar
                        ? "كل ميزة صُممت مع مقاولين ومكاتب هندسية من الرياض وجدة والدمام. لغة تحترم خبرتك، لا تستبدلها."
                        : "Every feature was co-designed with contractors and engineering offices in Riyadh, Jeddah, Dammam. Language that respects expertise — never replaces it."}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] text-white/60">
                    <HeartHandshake className="h-3.5 w-3.5" />
                    {ar ? "فريق دعم حقيقي" : "Real support team"}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST / NO PRICING */}
      <section className="relative py-16 sm:py-20 lg:py-24 border-b border-white/10 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[oklch(0.14_0.025_220)]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-200/[0.06] via-transparent to-cyan-200/[0.06]" />
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3 py-1">
                <Ban className="h-3.5 w-3.5 text-amber-200" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">{ar ? "قاعدة ثقة" : "Trust foundation"}</span>
              </div>
              <h2 className="mt-5 text-[24px] sm:text-[30px] lg:text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-white text-balance">
                {ar ? "الذكاء الاصطناعي لا يسعّر عطاءك. أبداً." : "AI never prices your bid. Ever."}
              </h2>
              <p className="mt-4 max-w-[52ch] text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">
                {ar
                  ? "لا أسعار مقترحة، لا هوامش، لا خصومات. الوكلاء يبنون هيكل الكميات والنماذج فقط — الأسعار يدخلها البشر ويعتمدها المراجعون. هذا أساس الثقة في المناقصات الحكومية. حماية لا يمكن تعطيلها."
                  : "No suggested prices, margins, or discounts. Agents build BoQ structure and forms only — humans enter amounts and reviewers approve. That's the trust foundation for government tenders. A guardrail you can't disable."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {[
                  { en: "Structure only", ar: "هيكل فقط" },
                  { en: "Human pricing", ar: "تسعير بشري" },
                  { en: "Reviewer chain", ar: "سلسلة مراجعين" },
                  { en: "Audit log", ar: "سجل تدقيق" },
                ].map((b) => (
                  <span key={b.en} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1 text-[11px] font-medium text-white/60">
                    <CheckCircle2 className="h-3 w-3 text-emerald-300/80" />
                    {ar ? b.ar : b.en}
                  </span>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.12 }} className="relative">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl shadow-2xl">
                <div className="rounded-[20px] bg-[oklch(0.12_0.02_260)] p-6 sm:p-7">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/20">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-white/80">{ar ? "حارس التسعير — نشط دائماً" : "Pricing guard — always on"}</p>
                      <p className="text-[11px] text-white/40 mt-0.5 font-mono">cannot be disabled • audited</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                      ON
                    </span>
                  </div>
                  <div className="mt-6 space-y-3">
                    {[
                      { labelEn: "BoQ amount fields", labelAr: "حقول الكميات", valEn: "Human only", valAr: "للبشر فقط", locked: true },
                      { labelEn: "Margin / discount", labelAr: "هامش / خصم", valEn: "Blocked", valAr: "محظور", locked: true },
                      { labelEn: "AI suggestions", labelAr: "اقتراحات AI", valEn: "Structure only", valAr: "هيكل فقط", locked: false },
                    ].map((row) => (
                      <div key={row.labelEn} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                        <span className="text-[12px] font-medium text-white/60">{ar ? row.labelAr : row.labelEn}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${row.locked ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/15" : "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/15"}`}>
                          {row.locked && <ShieldCheck className="h-3 w-3" />}
                          {ar ? row.valAr : row.valEn}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-center text-[11px] leading-relaxed text-white/30">
                    {ar ? "نصمّم الثقة كما نصمّم الأمان — طبقات، تدقيق، وضوح كامل." : "We design trust like we design security — layered, audited, fully transparent."}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PACKAGES - wrapped in consistent section styling via component */}
      <div className="relative">
        <PackagesSection />
      </div>

      {/* FINAL CTA - welcoming, warm */}
      <section className="relative overflow-hidden border-t border-white/10 py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[oklch(0.12_0.02_260)]" />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/[0.10] via-transparent to-amber-200/[0.08]" />
          <div className="absolute -top-24 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.68_0.12_200/.18),transparent_70%)] blur-2xl" />
        </div>
        <div className="mx-auto max-w-[1280px] 2xl:max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-[28px] sm:rounded-[32px] border border-white/[0.08] bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-[1px] overflow-hidden">
            <div className="relative rounded-[27px] sm:rounded-[31px] bg-[oklch(0.15_0.02_260)]/90 backdrop-blur-xl overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-32 -right-32 h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,oklch(0.72_0.14_75/.12),transparent_70%)] blur-xl" />
                <div className="absolute -bottom-24 -left-24 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,oklch(0.72_0.12_195/.12),transparent_70%)] blur-xl" />
              </div>
              <div className="relative grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 p-6 sm:p-10 lg:p-14 items-center">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1">
                    <HeartHandshake className="h-3.5 w-3.5 text-amber-200" />
                    <span className="text-[11px] font-semibold tracking-wide text-white/60">{ar ? "فريقك يستحق أدوات تحترمه" : "Your team deserves tools that respect it"}</span>
                  </div>
                  <h2 className="mt-5 text-[26px] sm:text-[32px] lg:text-[38px] font-semibold leading-[1.08] tracking-[-0.02em] text-white text-balance">
                    {ar ? "جاهز لعطاءك القادم على اعتماد؟" : "Ready for your next Etimad tender?"}
                  </h2>
                  <p className="mt-4 max-w-[48ch] text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">
                    {ar
                      ? "ادخل مساحة العمل، ارفع الحزمة، ودع الوكلاء ينظمون العمل بينما يراجع فريقك بثقة. بلا surprises في منتصف الطريق — حصص واضحة، تصدير يحمل هويتك."
                      : "Enter the workspace, upload the pack, and let agents organize the work while your team reviews with confidence. No mid-tender surprises — clear quotas, your-brand exports."}
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button asChild size="lg" className="h-12 rounded-full bg-white px-7 text-[14px] font-semibold text-black shadow hover:bg-white/90">
                      <Link href="/login" className="inline-flex items-center gap-2">
                        {ar ? "ابدأ تجربتك الآن" : "Start your trial"}
                        <CtaIcon className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/15 bg-white/[0.04] px-7 text-[14px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white backdrop-blur">
                      <Link href="/compliance">{ar ? "الامتثال والأمان" : "Compliance & security"}</Link>
                    </Button>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] text-white/35">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/70" />
                      {ar ? "بدون بطاقة" : "No credit card"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/70" />
                      {ar ? "إعداد في دقيقتين" : "2-minute setup"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/70" />
                      {ar ? "دعم عربي/إنجليزي" : "AR/EN support"}
                    </span>
                  </div>
                </div>

                {/* Visual: friendly quote / team */}
                <div className="relative min-w-0">
                  <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-white font-bold text-[13px]">S</div>
                      <div>
                        <p className="text-[13px] font-semibold text-white/80">{ar ? "سارة — مديرة عطاءات" : "Sarah — Bid Manager"}</p>
                        <p className="text-[11px] text-white/40">{ar ? "شركة مقاولات، الرياض" : "Contracting, Riyadh"}</p>
                      </div>
                      <div className="ml-auto flex">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-amber-200 text-amber-200" />
                        ))}
                      </div>
                    </div>
                    <p className="mt-4 text-[13.5px] leading-[1.65] text-white/65 italic text-pretty">
                      {ar
                        ? "“أراب كلاو لم يسرّع العطاء فقط — جعل الفريق كله يرى نفس المصفوفة، نفس النواقص، نفس القرار. أول مرة نشعر أننا نسيطر حقاً.”"
                        : "“Arabclue didn't just speed up the bid — it made the whole team see the same matrix, same gaps, same decisions. First time we truly felt in control.”"}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[11px] text-white/30">
                      <Clock3 className="h-3 w-3" />
                      <span>{ar ? "تم التصدير قبل الموعد بـ ٤ أيام" : "Exported 4 days early"}</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/30">{ar ? "متوسط التوفير" : "Avg saved"}</p>
                      <p className="mt-1 text-[18px] font-bold text-white">38h</p>
                      <p className="text-[11px] text-white/40">{ar ? "لكل مناقصة" : "per tender"}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/30">{ar ? "رضا المراجعين" : "Reviewers"}</p>
                      <p className="mt-1 text-[18px] font-bold text-white">+92%</p>
                      <p className="text-[11px] text-white/40">{ar ? "ثقة أعلى" : "more confidence"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom loving note */}
          <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25 max-w-2xl mx-auto px-4 text-pretty">
            {ar
              ? "أراب كلاو مبني بعناية لفرق المناقصات الحكومية في المملكة. نحن نحترم مسؤوليتك — الذكاء الاصطناعي ينظّم، وأنت تقرر."
              : "Arabclue is crafted with care for KSA government bid teams. We respect your accountability — AI organizes, you decide."}
          </p>
        </div>
      </section>
    </div>
  );
}

export function LandingPage() {
  return (
    <PublicShell variant="dark">
      <LandingContent />
    </PublicShell>
  );
}
