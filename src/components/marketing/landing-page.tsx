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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";
import { PackagesSection } from "@/components/marketing/packages-section";

const STEPS = [
  {
    n: "01",
    titleEn: "Upload the tender pack",
    titleAr: "ارفع حزمة المناقصة",
    bodyEn: "Ingest RFP, BoQ, and annexes into one project matrix.",
    bodyAr: "استوعب كراسة الشروط والكميات والملاحق في مصفوفة مشروع واحدة.",
    icon: FileSearch,
  },
  {
    n: "02",
    titleEn: "Agents draft & check",
    titleAr: "الوكلاء يصيغون ويفحصون",
    bodyEn: "Technical narrative, compliance map, structure-only financial forms.",
    bodyAr: "سرد فني، خريطة امتثال، نماذج مالية هيكلية فقط — بلا أسعار.",
    icon: ShieldCheck,
  },
  {
    n: "03",
    titleEn: "Humans price & approve",
    titleAr: "البشر يسعرون ويعتمدون",
    bodyEn: "Your team enters bid prices. Reviewers approve before export.",
    bodyAr: "فريقك يدخل أسعار العطاء. المراجعون يعتمدون قبل التصدير.",
    icon: PenLine,
  },
] as const;

const FEATURES = [
  {
    titleEn: "Account knowledge base",
    titleAr: "قاعدة معرفة الحساب",
    bodyEn: "Certificates, staff, methodologies, partners — RAG for every bid.",
    bodyAr: "شهادات، طاقم، منهجيات، شراكات — تُستدعى في كل عطاء.",
  },
  {
    titleEn: "Live requirements matrix",
    titleAr: "مصفوفة متطلبات حية",
    bodyEn: "Each RFP clause: covered, in progress, or missing.",
    bodyAr: "كل فقرة: مغطى، قيد العمل، أو مفقود.",
  },
  {
    titleEn: "Bilingual branded export",
    titleAr: "تصدير ثنائي اللغة بهويتك",
    bodyEn: "PDF, Excel, full package — Arabic & English.",
    bodyAr: "PDF وExcel وحزمة كاملة — عربي وإنجليزي.",
  },
  {
    titleEn: "Approvals & audit",
    titleAr: "اعتماد وتدقيق",
    bodyEn: "Reviewer chain and immutable action log.",
    bodyAr: "سلسلة مراجعين وسجل إجراءات غير قابل للتغيير.",
  },
] as const;

function HeroPlane() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Full-bleed atmospheric field */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 90% 70% at 70% 20%, oklch(0.28 0.06 220 / 0.55), transparent 55%),
            radial-gradient(ellipse 60% 50% at 10% 80%, oklch(0.22 0.05 195 / 0.4), transparent 50%),
            linear-gradient(180deg, oklch(0.11 0.025 240), oklch(0.13 0.02 230) 45%, oklch(0.1 0.02 245))
          `,
        }}
      />
      {/* Perspective grid */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.35]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="ac-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="oklch(0.72 0.12 195 / 0.18)"
              strokeWidth="0.6"
            />
          </pattern>
          <linearGradient id="ac-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="ac-mask">
            <rect width="100%" height="100%" fill="url(#ac-fade)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#ac-grid)" mask="url(#ac-mask)" />
      </svg>

      {/* Animated agent nodes — product visual plane */}
      <motion.div
        className="absolute inset-x-0 bottom-0 top-[18%] mx-auto max-w-5xl px-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.1, delay: 0.2 }}
      >
        <svg
          viewBox="0 0 900 320"
          className="h-full w-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="oklch(0.72 0.12 195)" stopOpacity="0" />
              <stop offset="40%" stopColor="oklch(0.72 0.12 195)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="oklch(0.65 0.1 230)" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <motion.path
            d="M80 200 C 200 80, 320 80, 450 160 S 700 260, 820 120"
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="1.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
          />
          {[
            { cx: 80, cy: 200, d: 0 },
            { cx: 280, cy: 110, d: 0.25 },
            { cx: 450, cy: 160, d: 0.45 },
            { cx: 620, cy: 210, d: 0.65 },
            { cx: 820, cy: 120, d: 0.85 },
          ].map((n) => (
            <motion.g key={n.cx}>
              <motion.circle
                cx={n.cx}
                cy={n.cy}
                r="18"
                fill="oklch(0.16 0.03 220)"
                stroke="oklch(0.72 0.12 195)"
                strokeWidth="1.2"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.4 + n.d, duration: 0.45 }}
              />
              <motion.circle
                cx={n.cx}
                cy={n.cy}
                r="4"
                fill="oklch(0.78 0.12 195)"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{
                  delay: 1 + n.d,
                  duration: 2.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.g>
          ))}
        </svg>
      </motion.div>

      {/* Soft vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.12_0.02_240)] via-transparent to-[oklch(0.12_0.02_240)/0.4]" />
    </div>
  );
}

function LandingContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const CtaIcon = ar ? ArrowLeft : ArrowRight;

  return (
    <div>
      {/* HERO — brand, one headline, one line, CTAs, full-bleed visual */}
      <section className="relative min-h-[min(100dvh,820px)] flex flex-col justify-end overflow-hidden">
        <HeroPlane />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6 pb-16 sm:pb-20 pt-24">
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="font-[family-name:var(--font-ibm-arabic)] text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight text-white leading-[1.05]"
          >
            أراب كلاو
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="mt-2 text-lg sm:text-xl font-semibold tracking-[0.28em] uppercase text-[oklch(0.72_0.12_195)]"
          >
            ArabClue
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-8 max-w-2xl text-xl sm:text-2xl md:text-3xl font-medium tracking-tight text-white/95 leading-snug"
          >
            {ar
              ? "عطاءات حكومية جاهزة للمراجعة — في ساعات لا أسابيع."
              : "Government bids ready for review — in hours, not weeks."}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-4 max-w-lg text-sm sm:text-base text-white/55 leading-relaxed"
          >
            {ar
              ? "مساعد ذكاء اصطناعي لمناقصات اعتماد: يستوعب الكراسة، يصيغ العرض الفني، ويبني هيكل المالي — وأنتم تدخلون الأسعار."
              : "AI assistant for Etimad tenders: ingests the RFP, drafts the technical proposal, builds financial structure — you enter the prices."}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.34 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button
              asChild
              size="lg"
              className="h-12 px-7 rounded-none bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] font-semibold text-sm"
            >
              <Link href="/login" className="inline-flex items-center gap-2">
                {ar ? "ادخل مساحة العمل" : "Enter workspace"}
                <CtaIcon className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 px-7 rounded-none border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white font-medium text-sm"
            >
              <Link href="/#packages">
                {ar ? "عرض الباقات" : "View packages"}
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* One job: what it is in 3 steps */}
      <section id="how" className="scroll-mt-20 border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[oklch(0.72_0.12_195)]">
              {ar ? "كيف يعمل" : "How it works"}
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              {ar
                ? "ثلاث خطوات. هدف واحد: عطاء يمكن اعتماده."
                : "Three steps. One goal: a bid you can stand behind."}
            </h2>
          </motion.div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="border-t border-white/15 pt-6"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs tracking-widest text-white/35">
                      {s.n}
                    </span>
                    <Icon className="size-5 text-[oklch(0.72_0.12_195)]" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-white">
                    {ar ? s.titleAr : s.titleEn}
                  </h3>
                  <p className="mt-2 text-sm text-white/50 leading-relaxed">
                    {ar ? s.bodyAr : s.bodyEn}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* One job: what you get */}
      <section id="features" className="scroll-mt-20 border-t border-white/10 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <p className="text-[11px] font-semibold tracking-[0.22em] uppercase text-[oklch(0.72_0.12_195)]">
              {ar ? "المنصة" : "Platform"}
            </p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              {ar
                ? "من الاستيعاب إلى التصدير — نظام تشغيل عطاءات."
                : "From intake to export — an operating system for bids."}
            </h2>
          </motion.div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.titleEn}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="border-t border-white/15 pt-5"
              >
                <h3 className="text-base font-semibold text-white">
                  {ar ? f.titleAr : f.titleEn}
                </h3>
                <p className="mt-2 text-sm text-white/50 leading-relaxed">
                  {ar ? f.bodyAr : f.bodyEn}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* One job: non-negotiable no-pricing rule — attention grabber */}
      <section className="border-y border-white/10 bg-[oklch(0.14_0.025_220)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 sm:py-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col sm:flex-row gap-6 sm:items-start"
          >
            <div className="size-12 shrink-0 flex items-center justify-center border border-[oklch(0.72_0.12_195)]/40 text-[oklch(0.72_0.12_195)]">
              <Ban className="size-5" />
            </div>
            <div className="max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                {ar
                  ? "الذكاء الاصطناعي لا يسعر عطاءك. أبداً."
                  : "AI never prices your bid. Ever."}
              </h2>
              <p className="mt-3 text-sm sm:text-base text-white/55 leading-relaxed">
                {ar
                  ? "لا أسعار مقترحة، لا هوامش، لا خصومات. الوكلاء يبنون هيكل الكميات والنماذج فقط — الأسعار يدخلها البشر. هذا أساس الثقة في المناقصات الحكومية."
                  : "No suggested prices, margins, or discounts. Agents build BoQ structure and forms only — humans enter amounts. That is the trust foundation for government tenders."}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <PackagesSection />

      {/* Closing CTA */}
      <section className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-xl"
          >
            <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              {ar
                ? "جاهز لعطاءك القادم على اعتماد؟"
                : "Ready for your next Etimad tender?"}
            </h2>
            <p className="mt-3 text-sm text-white/50">
              {ar
                ? "ادخل مساحة العمل، ارفع الحزمة، واترك الوكلاء يعملون بينما يراجع فريقك."
                : "Enter the workspace, upload the pack, and let agents work while your team reviews."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="h-11 px-6 rounded-none bg-[oklch(0.72_0.12_195)] text-[oklch(0.14_0.02_240)] hover:bg-[oklch(0.78_0.12_195)] font-semibold"
              >
                <Link href="/login">
                  {ar ? "ابدأ مجاناً للتجربة" : "Start your trial"}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-11 px-6 rounded-none border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
              >
                <Link href="/compliance">
                  {ar ? "الامتثال والأمان" : "Compliance & security"}
                </Link>
              </Button>
            </div>
          </motion.div>
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
