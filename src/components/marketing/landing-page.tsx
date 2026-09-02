"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
  MotionConfig,
} from "framer-motion";
import { SCROLL_VIEWPORT, useFadeTransition, rtlX } from "@/lib/animation";
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
  Building2,
  Award,
  Zap,
  Globe2,
  HeartHandshake,
  Star,
  X,
  AlertTriangle,
  Play,
  ChevronDown,
  ExternalLink,
  Lock,
  Eye,
  FileStack,
  Timer,
  MousePointer2,
  BarChart3,
  Briefcase,
  MessageSquare,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicShell, usePublicLocale } from "@/components/marketing/public-shell";
import { PackagesSection } from "@/components/marketing/packages-section";

/* -------------------------------------------------
   Premium Data — editorial, benefit-driven
------------------------------------------------- */
const STEPS = [
  {
    n: "01",
    titleEn: "Drop the chaos",
    titleAr: "ألقِ الفوضى",
    kickerEn: "Upload",
    kickerAr: "الرفع",
    bodyEn: "RFP, BoQ, specs, drawings, annexes — AR, EN, scanned PDFs. Arabclue reads with layout awareness and maps to live matrix in minutes.",
    bodyAr: "كراسة، كميات، مواصفات، مخططات، ملاحق — عربي وإنجليزي وممسوح. يقرأ بوعي تخطيط ويهيكل لمصفوفة حيّة في دقائق.",
    icon: FileSearch,
    accent: "from-cyan-400/30 to-teal-400/20",
    iconBg: "bg-cyan-400/15 text-cyan-200 ring-cyan-400/25",
    timeEn: "Depends on pack size",
    timeAr: "حسب حجم الحزمة",
  },
  {
    n: "02",
    titleEn: "Agents draft with care",
    titleAr: "الوكلاء يصيغون بعناية",
    kickerEn: "Draft & check",
    kickerAr: "صياغة وتدقيق",
    bodyEn: "Technical narrative, methodologies, safety, compliance map, structure-only financial forms — cited, versioned, review-ready.",
    bodyAr: "سرد فني، منهجيات، سلامة، خريطة امتثال، نماذج مالية هيكلية فقط — موثقة ومُصدرة وجاهزة للمراجعة.",
    icon: ShieldCheck,
    accent: "from-amber-300/30 to-orange-300/20",
    iconBg: "bg-amber-300/15 text-amber-100 ring-amber-300/25",
    timeEn: "Depends on scope",
    timeAr: "حسب النطاق",
  },
  {
    n: "03",
    titleEn: "Your team decides",
    titleAr: "فريقك يقرر",
    kickerEn: "Price & approve",
    kickerAr: "تسعير واعتماد",
    bodyEn: "Humans enter prices. Reviewer chain, audit log, bilingual branded export. No AI pricing suggestions. Ever. Architectural guard.",
    bodyAr: "البشر يُدخلون الأسعار. سلسلة مراجعين، سجل تدقيق، تصدير ثنائي بهويتك. لا اقتراحات تسعير. أبداً. حماية معمارية.",
    icon: PenLine,
    accent: "from-emerald-300/30 to-teal-300/20",
    iconBg: "bg-emerald-300/15 text-emerald-100 ring-emerald-300/25",
    timeEn: "You control",
    timeAr: "أنت تتحكم",
  },
] as const;

const FEATURES = [
  {
    titleEn: "Knowledge that compounds",
    titleAr: "معرفة تتراكم",
    bodyEn: "Certificates, CVs, past bids, partners — reused intelligently. No more hunting in drives.",
    bodyAr: "شهادات، سير، عطاءات سابقة، شركاء — تُستعاد بذكاء. لا بحث في الأقراص بعد اليوم.",
    icon: Building2,
    badgeEn: "Reusable",
    badgeAr: "قابلة لإعادة الاستخدام",
    span: "bento-span-6",
  },
  {
    titleEn: "Live matrix, zero blind spots",
    titleAr: "مصفوفة حيّة بلا ثغرات",
    bodyEn: "Every clause: covered, in progress, missing. Everyone in your workspace sees the same live matrix.",
    bodyAr: "كل فقرة: مغطاة، قيد العمل، مفقودة. كل من في مساحة عملك يرى المصفوفة نفسها مباشرة.",
    icon: Layers,
    badgeEn: "Source-linked",
    badgeAr: "مرتبطة بالمصدر",
    span: "bento-span-6",
  },
  {
    titleEn: "Exports clients love",
    titleAr: "تصدير يحبه العميل",
    bodyEn: "PDF, XLSX, full package — AR & EN. Your colours and fonts throughout, your logo on the PDF. Technical and financial split into separate files.",
    bodyAr: "PDF، XLSX، حزمة كاملة — عربي وإنجليزي. ألوانك وخطوطك في كل مستند، وشعارك على ملف PDF. الفني والمالي في ملفين منفصلين.",
    icon: FileText,
    badgeEn: "Branded",
    badgeAr: "بهويتك",
    span: "bento-span-7",
  },
  {
    titleEn: "Trust you can prove",
    titleAr: "ثقة يمكنك إثباتها",
    bodyEn: "Reviewer chain, append-only log, and PDPL/NCA-aware workflow controls. Accountability amplified.",
    bodyAr: "سلسلة مراجعين، سجل بالإضافة فقط، وضوابط سير عمل تراعي PDPL وNCA. مسؤوليتك، مضاعفة.",
    icon: Award,
    badgeEn: "Review trail",
    badgeAr: "سجل مراجعة",
    span: "bento-span-5",
  },
] as const;

const COMPARISON = {
  oldEn: [
    { text: "72 hours scattered across drives & WhatsApp", icon: X },
    { text: "Missed annex, last-minute panic", icon: AlertTriangle },
    { text: "Copy-paste from old bids, formatting hell", icon: FileStack },
    { text: "One reviewer, no audit trail", icon: Eye },
  ],
  oldAr: [
    { text: "٧٢ ساعة مبعثرة بين الأقراص وواتساب", icon: X },
    { text: "ملحق مفقود وذعر آخر لحظة", icon: AlertTriangle },
    { text: "نسخ ولصق من عطاءات قديمة", icon: FileStack },
    { text: "مراجع واحد بلا سجل", icon: Eye },
  ],
  newEn: [
    { text: "Shared requirements matrix with source links", icon: CheckCircle2 },
    { text: "Every clause traced, gaps surfaced early", icon: ShieldCheck },
    { text: "Knowledge base reuses, brand-ready export", icon: Sparkles },
    { text: "Reviewer chain, append-only audit", icon: Award },
  ],
  newAr: [
    { text: "مصفوفة متطلبات مشتركة ومرتبطة بالمصادر", icon: CheckCircle2 },
    { text: "كل فقرة متتبعة، ثغرات مبكرة", icon: ShieldCheck },
    { text: "قاعدة معرفة تُعاد، تصدير بهويتك", icon: Sparkles },
    { text: "سلسلة مراجعين وسجل بالإضافة فقط", icon: Award },
  ],
};

const TESTIMONIALS = [
  {
    nameEn: "Illustrative bid-manager workflow",
    nameAr: "سير عمل توضيحي لمدير العطاء",
    roleEn: "Example — not a customer testimonial",
    roleAr: "مثال — ليس شهادة عميل",
    quoteEn:
      "A shared matrix lets reviewers work from the same requirements, gaps, and source references.",
    quoteAr: "تتيح المصفوفة المشتركة للمراجعين العمل على المتطلبات والنواقص ومراجع المصادر نفسها.",
    avatar: "S",
    color: "from-violet-400 to-indigo-400",
  },
  {
    nameEn: "Illustrative estimation workflow",
    nameAr: "سير عمل توضيحي للتسعير",
    roleEn: "Example — not a customer testimonial",
    roleAr: "مثال — ليس شهادة عميل",
    quoteEn: "Amount fields remain human-entered and review-gated; drafting agents do not propose bid prices.",
    quoteAr: "تبقى حقول المبالغ بإدخال بشري وخاضعة للمراجعة؛ ولا تقترح وكلاء الصياغة أسعار العطاء.",
    avatar: "A",
    color: "from-cyan-300 to-teal-400",
  },
  {
    nameEn: "Illustrative bilingual workflow",
    nameAr: "سير عمل ثنائي اللغة توضيحي",
    roleEn: "Example — not a customer testimonial",
    roleAr: "مثال — ليس شهادة عميل",
    quoteEn: "Arabic and English content can be reviewed together with synchronized typography and layout.",
    quoteAr: "يمكن مراجعة المحتوى العربي والإنجليزي معاً بطباعة وتخطيط متزامنين.",
    avatar: "N",
    color: "from-amber-200 to-orange-300",
  },
  {
    nameEn: "Illustrative owner review",
    nameAr: "مراجعة توضيحية للمالك",
    roleEn: "Example — not a customer testimonial",
    roleAr: "مثال — ليس شهادة عميل",
    quoteEn: "The reviewer decides what is complete, what needs evidence, and whether a draft is ready to submit.",
    quoteAr: "يقرر المراجع ما اكتمل وما يحتاج إلى دليل وما إذا كانت المسودة جاهزة للتقديم.",
    avatar: "K",
    color: "from-emerald-300 to-teal-400",
  },
];

const FAQS = [
  {
    qEn: "Does AI price my bid?",
    qAr: "هل الذكاء الاصطناعي يسعّر عطائي؟",
    aEn: "Never. Structure-only. Amount fields are human-only, reviewer-gated, audit-logged. Guard cannot be disabled. Architectural, not a toggle.",
    aAr: "أبداً. هيكل فقط. حقول المبالغ للبشر فقط، بمراجعة وسجل. الحارس لا يمكن تعطيله. معماري وليس خياراً.",
  },
  {
    qEn: "What about Arabic PDFs and scanned documents?",
    qAr: "ماذا عن ملفات PDF العربية والممسوحة؟",
    aEn: "Digital PDFs are read for text and layout, and image pages go through OCR. Tables, BoQ and drawings map to the matrix with source citations. A PDF that is purely a scan, with no text layer, is not read yet — upload those pages as images.",
    aAr: "ملفات PDF الرقمية تُقرأ نصاً وتخطيطاً، والصفحات المصوّرة تمر عبر OCR. الجداول والكميات والمخططات تُحوّل لمصفوفة مع استشهاد بالمصدر. أما ملف PDF الممسوح بالكامل بلا طبقة نص فلا يُقرأ بعد — ارفع صفحاته كصور.",
  },
  {
    qEn: "Where is data hosted?",
    qAr: "أين تتم استضافة البيانات؟",
    aEn: "Hosting region is deployment-specific and is disclosed in your service agreement. We do not claim KSA residency unless the contracted deployment and provider region have been verified.",
    aAr: "تعتمد منطقة الاستضافة على إعداد النشر وتُذكر في اتفاقية الخدمة. لا ندّعي إقامة البيانات داخل المملكة إلا بعد التحقق من النشر المتعاقد عليه ومنطقة المزوّد.",
  },
  {
    qEn: "How long does the first draft take?",
    qAr: "كم يستغرق إعداد المسودة الأولى؟",
    aEn: "Timing depends on pack size, document quality, selected sections, and provider availability. Your team still reviews, prices, and approves every submission.",
    aAr: "يعتمد الوقت على حجم الحزمة وجودة المستندات والأقسام المختارة وتوفر المزوّد. ويظل فريقك مسؤولاً عن المراجعة والتسعير والاعتماد.",
  },
];

const TRUST_PILLS = [
  { en: "Etimad Workflow", ar: "سير عمل اعتماد" },
  { en: "PDPL-Aware Controls", ar: "ضوابط تراعي PDPL" },
  { en: "NCA-Aware Workflow", ar: "سير عمل يراعي NCA" },
  { en: "Human Pricing", ar: "تسعير بشري" },
  { en: "Review Trail", ar: "سجل مراجعة" },
];

const LOGO_TYPES = [
  { en: "Construction", ar: "مقاولات", icon: Building2 },
  { en: "Engineering Offices", ar: "مكاتب هندسية", icon: Briefcase },
  { en: "Facilities", ar: "مرافق", icon: FileStack },
  { en: "Operation & Maintenance", ar: "تشغيل وصيانة", icon: Timer },
  { en: "Clean & Security", ar: "نظافة وحراسة", icon: ShieldCheck },
  { en: "IT & Consultancy", ar: "تقنية واستشارات", icon: BarChart3 },
];

/* -------------------------------------------------
   Premium Helpers — 2026 Trends
------------------------------------------------- */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = () => setReduced(mq.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);
  return reduced;
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.2 });
  return <motion.div className="pointer-events-none fixed top-0 inset-x-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-cyan-300 via-teal-300 to-amber-200" style={{ scaleX }} />;
}

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, SCROLL_VIEWPORT);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

function HeroBackground() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Base + mesh */}
      <div className="absolute inset-0 aurora-mesh opacity-90" />
      <div className="absolute inset-0 hero-radial-wash" />
      {/* Aurora blobs — Glassmorphism 2.0 + Aurora UI */}
      <motion.div
        className="absolute -top-[12%] -right-[14%] w-[clamp(420px,45vw,720px)] h-[clamp(420px,45vw,720px)] rounded-full blur-[32px]"
        style={{ background: "radial-gradient(circle at 30% 30%, oklch(0.72 0.14 75 / 0.20), transparent 68%)" }}
        animate={{ x: [0, 18, -10, 0], y: [0, 12, -8, 0], scale: [1, 1.05, 0.98, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[18%] -left-[14%] w-[clamp(420px,45vw,760px)] h-[clamp(420px,45vw,760px)] rounded-full blur-[36px]"
        style={{ background: "radial-gradient(circle at 50% 50%, oklch(0.72 0.12 195 / 0.18), transparent 70%)" }}
        animate={{ x: [0, -14, 10, 0], y: [0, -10, 14, 0], scale: [1, 1.06, 0.99, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Grid — subtle */}
      <div className="hero-grid-mask absolute inset-0 opacity-[0.16] [mask-image:linear-gradient(to_bottom,black_18%,transparent_92%)]">
        <div className="h-full w-full bg-[linear-gradient(to_right,oklch(1_0_0/_0.07)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/_0.05)_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>
      {/* Particles — spatial depth */}
      <div className="absolute inset-0">
        {Array.from({ length: 16 }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute h-1 w-1 rounded-full bg-white/30 dark:bg-white/30"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 57) % 100}%` }}
            animate={{ y: [0, -10 - (i % 5) * 3, 0], opacity: [0.15, 0.55, 0.15] }}
            transition={{ duration: 3.5 + (i % 5), delay: (i % 7) * 0.25, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--marketing-bg)] via-transparent to-transparent" />
    </div>
  );
}

function TiltCard({ children, className = "", intensity = 1 }: { children: React.ReactNode; className?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mx = useSpring(x, { stiffness: 160, damping: 20 });
  const my = useSpring(y, { stiffness: 160, damping: 20 });
  const rotateX = useTransform(my, [-0.5, 0.5], [`${6 * intensity}deg`, `${-6 * intensity}deg`]);
  const rotateY = useTransform(mx, [-0.5, 0.5], [`${-8 * intensity}deg`, `${8 * intensity}deg`]);

  const handleMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    x.set(px);
    y.set(py);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <motion.div ref={ref} onMouseMove={handleMove} onMouseLeave={handleLeave} style={{ rotateX, rotateY, transformStyle: "preserve-3d" }} className={className}>
      {children}
    </motion.div>
  );
}

function ProductMock() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const [liveRows, setLiveRows] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLiveRows((p) => (p + 1) % 5), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="marketing-dark-island relative w-full [perspective:1200px]">
      <div className="absolute -inset-7 -z-10 rounded-[34px] bg-gradient-to-br from-cyan-400/18 via-teal-300/12 to-amber-200/12 blur-2xl" />
      <TiltCard intensity={0.9} className="relative">
        <motion.div
          initial={{ opacity: 0, y: 28, rotate: -1.2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.8, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[22px] border border-white/[0.10] bg-gradient-to-b from-white/[0.10] to-white/[0.03] p-[1.2px] shadow-[0_24px_90px_-24px_oklch(0.3_0.08_220/.65),0_0_0_1px_oklch(1_0_0/.05)_inset] backdrop-blur-xl"
        >
          <div className="rounded-[20.8px] bg-[oklch(0.16_0.02_260)]/92 overflow-hidden grain relative">
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-4 sm:px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex gap-1.5 shrink-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                </div>
                <span className="ml-2 hidden sm:inline truncate text-[11px] font-medium tracking-wide text-white/50">
                  {ar ? "مشروع: صيانة مدارس — اعتماد #١٢٣٤٥" : "Project: Schools Maintenance — Etimad #12345"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <motion.span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-emerald-200 ring-1 ring-emerald-300/20" animate={{ scale: [1, 1.02, 1] }} transition={{ duration: 2, repeat: Infinity }}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                  {ar ? "مباشر" : "Live"}
                </motion.span>
                <span className="hidden sm:inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-white/40 ring-1 ring-white/10">
                  <ExternalLink className="h-3 w-3" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1.28fr_0.88fr] gap-0">
              <div className="p-4 sm:p-5">
                <div className="mb-3.5 flex items-center justify-between gap-3">
                  <h4 className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-white/40">{ar ? "مصفوفة المتطلبات" : "Requirements Matrix"}</h4>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-2.5 py-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                    <span className="text-[10px] font-mono text-white/45">24/27</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {[
                    { labelEn: "Technical staff CVs", labelAr: "سير الطاقم الفني", status: "done", badgeEn: "Covered", badgeAr: "مغطى" },
                    { labelEn: "Methodology & workplan", labelAr: "المنهجية وخطة العمل", status: "done", badgeEn: "Covered", badgeAr: "مغطى" },
                    { labelEn: "Safety & quality plans", labelAr: "خطط السلامة والجودة", status: "progress", badgeEn: "Review", badgeAr: "مراجعة" },
                    { labelEn: "Financial forms", labelAr: "النماذج المالية", status: "structure", badgeEn: "Structure", badgeAr: "هيكل فقط" },
                    { labelEn: "ZATCA annex", labelAr: "ملحق ZATCA", status: "missing", badgeEn: "Missing", badgeAr: "مفقود" },
                  ].map((row, idx) => {
                    const active = idx === liveRows;
                    return (
                      <motion.div
                        key={row.labelEn}
                        className="group flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-all"
                        animate={{
                          borderColor: active ? "oklch(0.72 0.12 195 / 0.35)" : "oklch(1 0 0 / 0.06)",
                          backgroundColor: active ? "oklch(1 0 0 / 0.06)" : "oklch(1 0 0 / 0.03)",
                          scale: active ? 1.015 : 1,
                        }}
                        transition={{ duration: 0.35 }}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={
                              row.status === "done"
                                ? "h-7 w-7 rounded-full bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20 flex items-center justify-center shrink-0"
                                : row.status === "progress"
                                  ? "h-7 w-7 rounded-full bg-amber-300/10 text-amber-200 ring-1 ring-amber-300/15 flex items-center justify-center shrink-0"
                                  : row.status === "structure"
                                    ? "h-7 w-7 rounded-full bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/15 flex items-center justify-center shrink-0"
                                    : "h-7 w-7 rounded-full bg-white/5 text-white/30 flex items-center justify-center shrink-0"
                            }
                          >
                            {row.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : row.status === "progress" ? <Clock3 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                          </div>
                          <span className="truncate text-[12.5px] font-medium text-white/70">{ar ? row.labelAr : row.labelEn}</span>
                        </div>
                        <span
                          className={
                            row.status === "done"
                              ? "rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200 shrink-0"
                              : row.status === "progress"
                                ? "rounded-full bg-amber-300/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200 shrink-0"
                                : row.status === "structure"
                                  ? "rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 shrink-0"
                                  : "rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/40 shrink-0"
                          }
                        >
                          {ar ? row.badgeAr : row.badgeEn}
                        </span>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="mt-5 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
                  <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-white/50">
                      {ar ? "مثال توضيحي للجاهزية" : "Illustrative readiness example"}
                    </span>
                    <span className="font-mono font-semibold text-cyan-200">
                      88% {ar ? "مثال" : "sample"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-teal-300" initial={{ width: 0 }} whileInView={{ width: "88%" }} viewport={SCROLL_VIEWPORT} transition={{ duration: 1.3, delay: 0.6, ease: "easeOut" }} />
                  </div>
                </div>
              </div>

              <div className="border-t sm:border-l sm:border-t-0 border-[var(--hairline)] bg-white/[0.02] p-4 sm:p-5 flex flex-col">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/35 mb-3">{ar ? "الوكلاء النشطون" : "Active agents"}</h4>
                <div className="space-y-3">
                  {[
                    { nameEn: "Compliance agent", nameAr: "وكيل الامتثال", time: "2m", icon: ShieldCheck, color: "text-cyan-300" },
                    { nameEn: "Drafting agent", nameAr: "وكيل الصياغة", time: "now", icon: Sparkles, color: "text-amber-200" },
                    { nameEn: "Estimator guard", nameAr: "حارس التسعير", time: "standby", icon: Lock, color: "text-emerald-200" },
                  ].map((a, i) => (
                    <motion.div key={a.nameEn} initial={false} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.12 }} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] transition-colors">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/[0.08] ${a.color} shrink-0`}>
                        <a.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-white/80">{ar ? a.nameAr : a.nameEn}</p>
                        <p className="text-[10px] text-white/35 font-mono">{a.time}</p>
                      </div>
                      <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_8px_oklch(0.7_0.15_160)] animate-pulse shrink-0" />
                    </motion.div>
                  ))}
                </div>
                <motion.div className="mt-auto pt-5" animate={{ y: [0, -2, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <div className="rounded-xl bg-gradient-to-br from-amber-200/10 to-cyan-200/10 p-3 ring-1 ring-white/10">
                    <p className="text-[11px] font-semibold leading-relaxed text-white/60">{ar ? "🛡️ حارس التسعير نشط — لا أسعار مقترحة من AI" : "🛡️ Pricing guard active — no AI-suggested prices."}</p>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </motion.div>
      </TiltCard>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="absolute -bottom-6 -left-3 sm:-left-5 z-10 hidden max-w-[228px] rounded-2xl border border-white/10 bg-[oklch(0.16_0.02_260)]/90 px-4 py-3 shadow-2xl backdrop-blur-xl md:flex items-center gap-3">
        <div className="flex -space-x-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-[11px] font-bold text-white ring-2 ring-[oklch(0.16_0.02_260)]">N</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-teal-400 text-[11px] font-bold text-black ring-2 ring-[oklch(0.16_0.02_260)]">A</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-200 to-orange-300 text-[11px] font-bold text-black ring-2 ring-[oklch(0.16_0.02_260)]">S</div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/80">{ar ? "فريق العطاء نشط الآن" : "Bid team active now"}</p>
          <p className="text-[10px] text-white/40 mt-0.5">{ar ? "٣ مراجعين • سجل كامل" : "3 reviewers • full audit"}</p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 1.05 }} className="absolute -top-5 -right-2 sm:-right-4 z-10 hidden rounded-2xl border border-amber-200/20 bg-[oklch(0.18_0.02_80)]/90 px-3.5 py-2.5 shadow-xl backdrop-blur-md md:flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-200/15 text-amber-200 ring-1 ring-amber-200/20 shrink-0">
          <Award className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-white/80 truncate">{ar ? "مصدّر ثنائي اللغة" : "Bilingual export"}</p>
          <p className="text-[10px] text-white/45 truncate">{ar ? "بهويتك • عينة للمراجعة" : "Your brand • review sample"}</p>
        </div>
      </motion.div>
    </div>
  );
}

function Marquee({ ar }: { ar: boolean }) {
  const items = useMemo(() => [...LOGO_TYPES, ...LOGO_TYPES, ...LOGO_TYPES], []);
  return (
    <div className="relative overflow-hidden border-y border-[var(--hairline)] bg-[var(--surface-0)] py-3">
      <div className="absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[var(--surface-0)] to-transparent" />
      <div className="absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[var(--surface-0)] to-transparent" />
      <motion.div className="flex gap-3 w-max" animate={{ x: ar ? [0, -800] : [-800, 0] }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={`${it.en}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/55 shrink-0">
              <Icon className="h-3.5 w-3.5 text-white/30" />
              {ar ? it.ar : it.en}
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

/* Landing Content — Ultimate Premium */
function LandingContent() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const CtaIcon = ar ? ArrowLeft : ArrowRight;
  const reducedMotion = usePrefersReducedMotion();

  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const yHero = useTransform(scrollY, [0, 600], [0, -80], { clamp: false });
  const opacityHero = useTransform(scrollY, [0, 400], [1, 0.22]);

  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const wordsEn = ["Government bids", "ready for review", "in hours, not weeks."];
  const wordsAr = ["عطاءات حكومية", "جاهزة للمراجعة", "في ساعات، لا أسابيع."];

  return (
    <div className="w-full overflow-clip bg-[var(--marketing-bg)] selection:bg-cyan-300/20">
      <ScrollProgress />

      {/* HERO — massive typography, spatial depth, glass 2.0 */}
      <section ref={heroRef} className="relative flex min-h-[94dvh] md:min-h-[92dvh] flex-col justify-center overflow-hidden border-b border-[var(--hairline)]">
        <HeroBackground />
        <motion.div style={{ y: reducedMotion ? 0 : yHero, opacity: reducedMotion ? 1 : opacityHero }} className="relative z-10">
          <div className="container-premium py-10 sm:py-14 lg:py-16 xl:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-12 xl:gap-16 items-center">
              <div className="min-w-0">
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="text-[12px] sm:text-[13px] font-semibold tracking-[0.18em] uppercase text-cyan-100/70"
                >
                  {ar ? "أراب كلاو · لمناقصات اعتماد" : "Arabclue · for Etimad tenders"}
                </motion.p>

                <div className="mt-6 sm:mt-8">
                  <h1 className="text-balance font-[800] leading-[0.9] tracking-[-0.05em] text-white fluid-h1">
                    {(ar ? wordsAr : wordsEn).map((w, i) => (
                      <motion.span
                        key={w}
                        className={i === 2 ? "block mt-1 bg-gradient-to-r from-cyan-200 via-teal-200 to-amber-200 bg-clip-text text-transparent" : i === 1 ? "block bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent" : "block font-[family-name:var(--font-ibm-arabic)] font-bold"}
                        initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.7, delay: 0.08 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                      >
                        {w}
                      </motion.span>
                    ))}
                  </h1>
                </div>

                <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.42 }} className="mt-5 sm:mt-6 max-w-[52ch] text-[15px] sm:text-[16.5px] leading-[1.72] tracking-[-0.01em] text-white/70 text-pretty">
                  {ar
                    ? "يستوعب الكراسة ثنائية اللغة، يساعد على صياغة عرض فني يراعي الامتثال، ويبني الهيكل المالي دون أن يلمس الأسعار — قرار التسعير والتقديم يبقى لفريقك."
                    : "Ingest bilingual RFPs, draft compliance-aware technical proposals, and build the financial structure without touching prices — your team keeps pricing and submission control."}
                </motion.p>

                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.52 }} className="mt-8 sm:mt-9 flex flex-wrap items-center gap-3">
                  <div className="relative group">
                    <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-amber-200 opacity-60 blur-[8px] group-hover:opacity-90 transition-opacity" />
                    <Button asChild size="lg" className="relative h-[48px] rounded-full bg-[var(--accent-cyan)] px-7 text-[14px] font-semibold text-[oklch(0.14_0.02_240)] shadow-[0_8px_24px_-8px_oklch(0.72_0.12_195/0.6)] hover:bg-[var(--accent-cyan-bright)] btn-premium">
                      <Link href="/login" className="inline-flex items-center gap-2.5">
                        {ar ? "ادخل مساحة العمل" : "Enter workspace"}
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10">
                          <CtaIcon className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </Button>
                  </div>
                  <Button asChild size="lg" variant="outline" className="h-[48px] rounded-full border-white/15 bg-white/[0.05] px-7 text-[14px] font-medium text-white/80 backdrop-blur hover:bg-white/[0.08] hover:text-white hover:border-white/20 btn-premium">
                    <Link href="/#how" className="inline-flex items-center gap-2">
                      <Play className="h-4 w-4" />
                      {ar ? "شاهد كيف يعمل" : "See how it works"}
                    </Link>
                  </Button>
                  <div className="hidden lg:flex items-center gap-2 pl-3">
                    <div className="h-5 w-px bg-white/10" />
                    <div className="flex items-center gap-1.5 text-[12px] text-white/45">
                      <Lock className="h-3.5 w-3.5" />
                      <span>{ar ? "مشفّر ومعزول لكل منشأة" : "Encrypted & tenant-isolated"}</span>
                    </div>
                  </div>
                </motion.div>

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-8 sm:mt-10 flex flex-wrap items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {[0, 1, 2].map((i) => (
                        <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.08, type: "spring", stiffness: 200 }} className="h-8 w-8 rounded-full border-2 border-[var(--marketing-bg)] bg-gradient-to-br from-white/20 to-white/5 backdrop-blur flex items-center justify-center">
                          <span className="text-[10px] font-bold text-white/60">{["م", "A", "K"][i]}</span>
                        </motion.div>
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <FileSearch className="h-3.5 w-3.5 text-cyan-200" />
                        <span className="ml-1 text-[12px] font-semibold text-white/70">
                          {ar ? "سير عمل توضيحي" : "Illustrative workflow"}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40 leading-none mt-0.5">
                        {ar ? "ليس نتيجة عميل مقاسة" : "Not a measured customer outcome"}
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                    <HeartHandshake className="h-3.5 w-3.5 text-cyan-200" />
                    <span className="text-[11px] font-medium text-white/60">{ar ? "الفريق يراجع ويقرر" : "Your team reviews and decides"}</span>
                  </div>
                </motion.div>
              </div>

              <div className="relative min-w-0 lg:pl-2 xl:pl-6 mt-2 lg:mt-0">
                <ProductMock />
                <div className="mt-8 grid grid-cols-3 gap-3 md:hidden">
                  {[
                    { k: "Sample", vEn: "Readiness", vAr: "جاهزية توضيحية" },
                    { k: "27", vEn: "Clauses", vAr: "بنود" },
                    { k: "0 SAR", vEn: "AI prices", vAr: "تسعير AI" },
                  ].map((s) => (
                    <div key={s.k} className="rounded-2xl border border-[var(--hairline)] bg-white/[0.04] p-3 text-center">
                      <p className="text-[16px] font-bold text-white">{s.k}</p>
                      <p className="mt-0.5 text-[10px] text-white/40">{ar ? s.vAr : s.vEn}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-[var(--marketing-bg)] to-transparent" />
      </section>

      <Marquee ar={ar} />

      {/* Trust pills */}
      <section className="relative border-y border-[var(--hairline)] bg-[var(--surface-0)]">
        <div className="container-premium py-6 sm:py-7">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/30 whitespace-nowrap">{ar ? "ضوابط سير عمل لمشتريات المملكة" : "Workflow controls for KSA procurement"}</p>
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              {TRUST_PILLS.map((pill) => (
                <span
                  key={pill.en}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-white/60 hover:bg-white/[0.06] transition-colors"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300/80" />
                  {ar ? pill.ar : pill.en}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500/15 to-cyan-500/15 px-3.5 py-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-100/80 ring-1 ring-amber-600/25 dark:ring-amber-200/15">
                <Globe2 className="h-3.5 w-3.5" />
                {ar ? "ثنائي اللغة • عربي وإنجليزي" : "Bilingual • AR & EN"}
              </span>
            </div>
            <div className="hidden xl:flex items-center gap-2 text-[11px] text-white/30">
              <span className="h-px w-8 bg-white/10" />
              <span className="font-mono">
                {ar ? "منطقة الاستضافة موضحة لكل نشر" : "Hosting region disclosed per deployment"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Before/After — bento comparison */}
      <section className="relative border-b border-[var(--hairline)] py-14 sm:py-18 lg:py-24 overflow-hidden">
        <div className="absolute inset-0 -z-10 marketing-band-wash" />
        <div className="container-premium">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
            <motion.div initial={{ opacity: 0, y: 16, x: ar ? 16 : -16 }} whileInView={{ opacity: 1, y: 0, x: 0 }} viewport={SCROLL_VIEWPORT} className="relative rounded-[24px] border border-[var(--hairline)] bg-white/[0.03] p-[1px] overflow-hidden">
              <div className="rounded-[23px] bg-[var(--surface-1)]/80 p-6 sm:p-8 h-full">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-red-400/10 text-red-300 flex items-center justify-center ring-1 ring-red-300/20">
                    <X className="h-4 w-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold uppercase tracking-[0.14em] text-white/40">{ar ? "الطريقة القديمة" : "Old way"}</h3>
                </div>
                <ul className="mt-6 space-y-3.5">
                  {(ar ? COMPARISON.oldAr : COMPARISON.oldEn).map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.text} className="flex items-start gap-3 text-[13.5px] leading-[1.6] text-white/55">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-400/10 text-red-300/70 ring-1 ring-red-300/15">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 break-words">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-6 rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2 text-[11px] text-white/30 font-mono">⏱️ {ar ? "جهد يدوي متغير حسب نطاق العطاء" : "Manual effort varies by tender scope"}</div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16, x: ar ? -16 : 16 }} whileInView={{ opacity: 1, y: 0, x: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: 0.08 }} className="relative rounded-[24px] bg-gradient-to-b from-cyan-400/20 via-teal-300/10 to-amber-200/10 p-[1px] overflow-hidden shadow-[0_20px_60px_-20px_oklch(0.72_0.12_195/.35)]">
              <div className="rounded-[23px] bg-[var(--surface-2)] p-6 sm:p-8 h-full relative overflow-hidden">
                <div className="absolute -top-24 -right-24 h-[240px] w-[240px] rounded-full bg-[radial-gradient(circle,oklch(0.72_0.12_195/.18),transparent_70%)] blur-xl" />
                <div className="flex items-center gap-2 relative">
                  <div className="h-8 w-8 rounded-full bg-emerald-400/15 text-emerald-200 flex items-center justify-center ring-1 ring-emerald-300/20">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <h3 className="text-[14px] font-semibold uppercase tracking-[0.14em] text-emerald-200/80">{ar ? "مع أراب كلاو" : "With Arabclue"}</h3>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold text-cyan-200 ring-1 ring-cyan-300/20">
                    <span className="h-1 w-1 rounded-full bg-cyan-300 animate-pulse" />
                    {ar ? "مباشر" : "Live"}
                  </span>
                </div>
                <ul className="mt-6 space-y-3.5 relative">
                  {(ar ? COMPARISON.newAr : COMPARISON.newEn).map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.text} className="flex items-start gap-3 text-[13.5px] leading-[1.6] text-white/75">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/20">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 break-words font-medium">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-6 flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300/10 to-amber-200/10 border border-cyan-200/15 px-3 py-2.5">
                  <Zap className="h-4 w-4 text-cyan-200 shrink-0" />
                  <span className="text-[11px] font-medium text-white/70">{ar ? "المدة تعتمد على حجم الحزمة والنطاق وتوفر المزوّد" : "Timing depends on pack size, scope, and provider availability"}</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats — bento with counters */}
      <section className="relative border-b border-[var(--hairline)] bg-[var(--marketing-bg)]">
        <div className="container-premium py-10 sm:py-14">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { value: 2, suffix: "", labelEn: "Document languages", labelAr: "لغات المستند", subEn: "Arabic and English", subAr: "العربية والإنجليزية" },
              { value: 3, suffix: "", labelEn: "Guided stages", labelAr: "مراحل موجهة", subEn: "Upload, draft, review", subAr: "رفع وصياغة ومراجعة" },
              { value: 1, suffix: "", labelEn: "Human pricing path", labelAr: "مسار تسعير بشري", subEn: "Reviewer-gated", subAr: "خاضع للمراجعة" },
              { value: 0, suffix: "", labelEn: "AI price suggestions", labelAr: "اقتراحات أسعار AI", subEn: "Architecturally blocked", subAr: "محظورة معمارياً" },
            ].map((stat) => (
              <div
                key={stat.labelEn}
                className="group rounded-[20px] border border-[var(--hairline)] bg-white/[0.03] p-5 sm:p-6 backdrop-blur-sm hover:bg-white/[0.05] hover:border-white/10 transition-all hover:-translate-y-0.5"
              >
                <p className="text-[26px] sm:text-[28px] font-bold tracking-tight text-white group-hover:text-cyan-100 transition-colors">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-1 text-[13px] font-semibold text-white/75">{ar ? stat.labelAr : stat.labelEn}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">{ar ? stat.subAr : stat.subEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — spatial UI with beam */}
      <section id="how" className="scroll-mt-24 relative border-b border-[var(--hairline)] py-16 sm:py-20 lg:py-28 overflow-hidden">
        <div className="pointer-events-none absolute left-0 right-0 top-[96px] hidden md:block h-[2px] z-0">
          <svg width="100%" height="120" className="absolute inset-0 h-[120px] w-full overflow-visible" viewBox="0 0 1200 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="beamGrad" x1="0" x2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.12 195)" stopOpacity="0" />
                <stop offset="20%" stopColor="oklch(0.72 0.12 195)" stopOpacity="0.9" />
                <stop offset="80%" stopColor="oklch(0.78 0.16 70)" stopOpacity="0.7" />
                <stop offset="100%" stopColor="oklch(0.78 0.16 70)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path d={ar ? "M 0 60 Q 300 0, 600 60 T 1200 60" : "M 0 60 Q 300 120, 600 60 T 1200 60"} stroke="url(#beamGrad)" strokeWidth="2" fill="none" initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 1 }} viewport={SCROLL_VIEWPORT} transition={{ duration: 1.8, ease: "easeInOut" }} />
          </svg>
        </div>
        <div className="absolute inset-0 -z-10 marketing-band-wash-soft" />
        <div className="container-premium relative z-10">
          <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} className="mx-auto max-w-[760px] text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3.5 py-1 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-200">{ar ? "كيف يعمل" : "How it works"}</span>
            </div>
            <h2 className="mt-5 text-[28px] sm:text-[36px] lg:text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-white text-balance">
              {ar ? "ثلاث خطوات. هدف واحد: عطاء يمكنك الاعتماد عليه." : "Three steps. One goal: a bid you can stand behind."}
            </h2>
            <p className="mt-4 text-[14px] sm:text-[15.5px] leading-relaxed text-white/60 max-w-[58ch] mx-auto text-pretty">
              {ar ? "سير عمل موجه يحترم وقت الفريق وخبرته ومسؤوليته؛ والنتيجة تبقى خاضعة للمراجعة البشرية." : "A guided workflow that respects team expertise and accountability; every output remains subject to human review."}
            </p>
          </motion.div>

          <div className="mt-12 lg:mt-20 grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-stretch relative">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={s.n} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: i * 0.14, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} whileHover={{ y: -4, transition: { duration: 0.2 } }} className="group relative flex flex-col">
                  <div className="absolute -top-3 left-7 z-10 hidden md:flex h-7 items-center gap-2 rounded-full bg-[var(--surface-2)] border border-[var(--hairline)] px-3 shadow">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
                    <span className="text-[10px] font-mono font-semibold text-white/40">{s.n}</span>
                    <span className="text-[10px] font-medium text-white/50">{ar ? s.kickerAr : s.kickerEn}</span>
                  </div>
                  <div className="relative flex h-full flex-col rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-[1px] hover:from-white/[0.11] hover:to-white/[0.05] transition-colors">
                    <div className="relative flex h-full flex-col rounded-[23px] bg-[var(--surface-1)]/90 p-6 sm:p-7 backdrop-blur-xl overflow-hidden">
                      <div className={`pointer-events-none absolute -top-20 -right-20 h-[220px] w-[220px] rounded-full bg-gradient-to-br ${s.accent} opacity-60 blur-2xl group-hover:opacity-90 transition-opacity`} />
                      <div className="flex items-start justify-between gap-4 relative">
                        <motion.div whileHover={{ rotate: 6, scale: 1.05 }} className={`flex h-[52px] w-[52px] items-center justify-center rounded-[16px] ring-1 ${s.iconBg} shadow-inner`}>
                          <Icon className="h-6 w-6" />
                        </motion.div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/40">{ar ? s.timeAr : s.timeEn}</span>
                      </div>
                      <h3 className="mt-6 text-[18px] font-semibold leading-tight text-white tracking-tight">{ar ? s.titleAr : s.titleEn}</h3>
                      <p className="mt-2.5 text-[13.5px] leading-[1.7] text-white/60 flex-1 text-pretty">{ar ? s.bodyAr : s.bodyEn}</p>
                      <div className="mt-7 flex items-center gap-2">
                        <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] border border-white/10 px-2.5 py-1 text-[11px] font-medium text-white/45">
                          <MousePointer2 className="h-3 w-3" />
                          {ar ? "مرّر للمعاينة" : "Hover to preview"}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features — true bento grid 12-col */}
      <section id="features" className="scroll-mt-24 relative border-b border-[var(--hairline)] py-16 sm:py-20 lg:py-28 overflow-hidden">
        <div className="absolute left-1/2 top-0 -z-10 h-[640px] w-[960px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,oklch(0.55_0.08_200/.12),transparent_70%)] blur-[30px]" />
        <div className="container-premium">
          <div className="grid grid-cols-1 lg:grid-cols-[0.92fr_1.15fr] gap-8 lg:gap-12 items-start">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} className="lg:sticky lg:top-28">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-200 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">{ar ? "المنصة" : "Platform"}</span>
              </div>
              <h2 className="mt-5 text-[28px] sm:text-[36px] lg:text-[42px] font-semibold leading-[1.06] tracking-[-0.03em] text-white text-balance">
                {ar ? "من الاستيعاب إلى التصدير — نظام تشغيل عطاءاتك." : "From intake to export — your bid operating system."}
              </h2>
              <p className="mt-4 max-w-[48ch] text-[14px] sm:text-[15.5px] leading-relaxed text-white/60 text-pretty">
                {ar ? "أراب كلاو لا يستبدل خبرتك. ينظّمها، يوّثقها، ويحوّلها إلى حزمة جاهزة تفتح الأبواب — بكل اللغتين وبصمتك الخاصة." : "Arabclue doesn't replace expertise. It organizes, cites, and turns it into submission-ready pack — bilingual and unmistakably yours."}
              </p>
            </motion.div>

            <div className="bento-grid">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div
                    key={f.titleEn}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={SCROLL_VIEWPORT}
                    transition={{ delay: i * 0.07 }}
                    className={`${f.span} group relative rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-[1px] hover:from-white/[0.10] hover:to-white/[0.04] transition-all`}
                  >
                    <div className="marketing-dark-island rounded-[21px] bg-[oklch(0.14_0.02_260)]/80 p-5 sm:p-6 backdrop-blur-xl h-full flex flex-col min-h-[180px]">
                      <div className="flex items-center justify-between">
                        <motion.div whileHover={{ rotate: 8 }} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-white/10 group-hover:bg-white/[0.09] group-hover:text-white transition-colors">
                          <Icon className="h-5 w-5" />
                        </motion.div>
                        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/40">{ar ? f.badgeAr : f.badgeEn}</span>
                      </div>
                      <h3 className="mt-5 text-[15.5px] font-semibold text-white tracking-tight">{ar ? f.titleAr : f.titleEn}</h3>
                      <p className="mt-2 text-[13px] leading-[1.65] text-white/55 flex-1">{ar ? f.bodyAr : f.bodyEn}</p>
                    </div>
                  </motion.div>
                );
              })}
              <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: 0.32 }} className="bento-span-12 group relative rounded-[22px] border border-amber-200/15 bg-gradient-to-br from-amber-200/[0.08] via-white/[0.04] to-cyan-200/[0.06] p-[1px] overflow-hidden">
                <div className="marketing-dark-island rounded-[21px] bg-[oklch(0.16_0.02_260)]/80 p-5 sm:p-6 backdrop-blur-xl flex flex-col sm:flex-row gap-5 items-start sm:items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200/20 to-cyan-200/20 text-amber-100 ring-1 ring-amber-200/20">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-white">{ar ? "مصمم لإبقاء فريق العطاء مسؤولاً" : "Designed to keep the bid team accountable"}</h3>
                    <p className="mt-1 text-[13px] leading-[1.6] text-white/55">{ar ? "الأدوات تنظم الأدلة والمسودات والمراجعات، ولا تستبدل خبرة الفريق أو قراره." : "The tools organize evidence, drafts, and reviews; they do not replace team expertise or decisions."}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[11px] text-white/60">
                    <HeartHandshake className="h-3.5 w-3.5" />
                    {ar ? "فريق دعم حقيقي" : "Real support"}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust guard */}
      <section className="marketing-dark-island relative py-16 sm:py-20 lg:py-24 border-b border-[var(--hairline)] overflow-hidden bg-[oklch(0.14_0.025_220)]">
        <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-br from-amber-200/[0.06] via-transparent to-cyan-200/[0.06]" />
        <div className="container-premium relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12 items-center">
            <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/10 px-3.5 py-1.5">
                <motion.div animate={{ rotate: [0, -8, 8, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}>
                  <Lock className="h-3.5 w-3.5 text-amber-200" />
                </motion.div>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-100/80">{ar ? "قاعدة ثقة" : "Trust foundation"}</span>
              </div>
              <h2 className="mt-5 text-[26px] sm:text-[32px] lg:text-[38px] font-semibold leading-[1.08] tracking-[-0.02em] text-white text-balance">{ar ? "الذكاء الاصطناعي لا يسعّر عطاءك. أبداً." : "AI never prices your bid. Ever."}</h2>
              <p className="mt-4 max-w-[52ch] text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">
                {ar ? "لا أسعار مقترحة، لا هوامش، لا خصومات. الوكلاء يبنون هيكل الكميات والنماذج فقط — الأسعار يدخلها البشر ويعتمدها المراجعون. حماية لا يمكن تعطيلها." : "No suggested prices, margins, discounts. Agents build BoQ structure only — humans enter amounts and reviewers approve. A guardrail you can't disable."}
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

            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: 0.12 }} className="relative">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-1 backdrop-blur-xl shadow-2xl">
                <div className="rounded-[20px] bg-[oklch(0.12_0.02_260)] p-6 sm:p-7 relative overflow-hidden">
                  <div className="flex items-center gap-3 relative">
                    <motion.div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/20" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity }}>
                      <ShieldCheck className="h-5 w-5" />
                    </motion.div>
                    <div>
                      <p className="text-[13px] font-semibold text-white/80">{ar ? "حارس التسعير — نشط دائماً" : "Pricing guard — always on"}</p>
                      <p className="text-[11px] text-white/40 mt-0.5 font-mono">cannot be disabled • audited</p>
                    </div>
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                      ON
                    </span>
                  </div>
                  <div className="mt-6 space-y-3 relative">
                    {[
                      { labelEn: "BoQ amount fields", labelAr: "حقول الكميات", valEn: "Human only", valAr: "للبشر فقط", locked: true },
                      { labelEn: "Margin / discount", labelAr: "هامش / خصم", valEn: "Blocked", valAr: "محظور", locked: true },
                      { labelEn: "AI suggestions", labelAr: "اقتراحات AI", valEn: "Structure only", valAr: "هيكل فقط", locked: false },
                    ].map((row, i) => (
                      <motion.div key={row.labelEn} initial={{ opacity: 0, x: rtlX(ar, 10) }} whileInView={{ opacity: 1, x: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: 0.2 + i * 0.08 }} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3">
                        <span className="text-[12px] font-medium text-white/60">{ar ? row.labelAr : row.labelEn}</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${row.locked ? "bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/15" : "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/15"}`}>
                          {row.locked && <ShieldCheck className="h-3 w-3" />}
                          {ar ? row.valAr : row.valEn}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials — infinite */}
      <section className="relative border-b border-[var(--hairline)] py-16 sm:py-20 lg:py-24 overflow-hidden">
        <div className="container-premium">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
                <HeartHandshake className="h-3.5 w-3.5 text-amber-200/70" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{ar ? "أمثلة توضيحية" : "Illustrative workflows"}</span>
              </div>
              <h2 className="mt-4 text-[24px] sm:text-[30px] font-semibold tracking-tight text-white">{ar ? "كيف تدعم الأدوات أدوار فريق العطاء" : "How the tools support each bid-team role"}</h2>
            </div>
            <p className="text-[13px] text-white/40 max-w-[36ch]">{ar ? "أمثلة على سير العمل وليست شهادات عملاء أو نتائج مقاسة." : "Workflow examples—not customer testimonials or measured outcomes."}</p>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-[var(--marketing-bg)] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-[var(--marketing-bg)] to-transparent" />
            <motion.div className="flex gap-4 w-max" animate={{ x: [-800, 0] }} transition={{ duration: 40, repeat: Infinity, ease: "linear" }}>
              {[...TESTIMONIALS, ...TESTIMONIALS].map((t, idx) => (
                <div key={`${t.nameEn}-${idx}`} className="w-[320px] sm:w-[360px] shrink-0 rounded-[20px] border border-[var(--hairline)] bg-white/[0.04] p-5 backdrop-blur hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${t.color} text-[12px] font-bold text-black ring-1 ring-white/10`}>{t.avatar}</div>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-white/80 truncate">{ar ? t.nameAr : t.nameEn}</p>
                      <p className="text-[11px] text-white/40 truncate">{ar ? t.roleAr : t.roleEn}</p>
                    </div>
                    <div className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/40">
                      {ar ? "مثال" : "Example"}
                    </div>
                  </div>
                  <p className="mt-4 text-[13px] leading-[1.6] text-white/60 italic">“{ar ? t.quoteAr : t.quoteEn}”</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <PackagesSection />

      {/* FAQ */}
      <section className="relative border-b border-[var(--hairline)] py-16 sm:py-20 lg:py-24">
        <div className="container-premium">
          <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16 items-start">
            <div className="lg:sticky lg:top-28">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1">
                <MessageSquare className="h-3.5 w-3.5 text-white/40" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">{ar ? "أسئلة شائعة" : "FAQ"}</span>
              </div>
              <h2 className="mt-4 text-[26px] sm:text-[32px] font-semibold leading-[1.1] tracking-tight text-white text-balance">{ar ? "أسئلة يطرحها كل فريق عطاءات" : "Questions every bid team asks"}</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-white/50 max-w-[40ch]">{ar ? "واضحة، مباشرة، بلا تسويق زائد. لأن الثقة تبدأ بالوضوح." : "Clear, direct, no fluff. Because trust starts with clarity."}</p>
            </div>
            <div className="space-y-3">
              {FAQS.map((f, i) => (
                <motion.div key={f.qEn} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={SCROLL_VIEWPORT} transition={{ delay: i * 0.06 }} className="rounded-[18px] border border-[var(--hairline)] bg-white/[0.04] overflow-hidden backdrop-blur">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                    <span className="text-[14px] font-medium text-white/80">{ar ? f.qAr : f.qEn}</span>
                    <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.22 }} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                      <ChevronDown className="h-4 w-4 text-white/50" />
                    </motion.span>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
                        <div className="px-5 pb-5 pt-1">
                          <p className="text-[13px] leading-[1.7] text-white/55">{ar ? f.aAr : f.aEn}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA — aurora mesh + spatial */}
      <section className="relative overflow-hidden py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[var(--surface-0)]" />
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/[0.10] via-transparent to-amber-200/[0.08]" />
          <motion.div className="absolute -top-24 left-1/2 h-[560px] w-[960px] -translate-x-1/2 rounded-full blur-[32px]" style={{ background: "radial-gradient(ellipse at center, oklch(0.68 0.12 200 / 0.18), transparent 70%)" }} animate={{ scale: [1, 1.08, 1], rotate: [0, 3, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        <div className="container-premium">
          <div className="relative rounded-[28px] sm:rounded-[32px] border border-white/[0.08] bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-[1px] overflow-hidden">
            <motion.div className="pointer-events-none absolute inset-0 rounded-[28px]" style={{ background: "conic-gradient(from 0deg at 50% 50%, transparent 0%, oklch(0.72 0.12 195 / 0.0) 20%, oklch(0.72 0.12 195 / 0.55) 35%, oklch(0.78 0.16 70 / 0.45) 50%, transparent 68%)" }} animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: "linear" }} />
            <div className="relative rounded-[27px] sm:rounded-[31px] bg-[var(--surface-1)]/90 backdrop-blur-xl overflow-hidden">
              <div className="relative grid lg:grid-cols-[1.15fr_0.85fr] gap-8 lg:gap-12 p-6 sm:p-10 lg:p-14 items-center">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 px-3 py-1">
                    <HeartHandshake className="h-3.5 w-3.5 text-amber-200" />
                    <span className="text-[11px] font-semibold tracking-wide text-white/60">{ar ? "فريقك يستحق أدوات تحترمه" : "Your team deserves tools that respect it"}</span>
                  </div>
                  <h2 className="mt-5 text-[28px] sm:text-[34px] lg:text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-white text-balance">{ar ? "جاهز لعطاءك القادم على اعتماد؟" : "Ready for your next Etimad tender?"}</h2>
                  <p className="mt-4 max-w-[48ch] text-[14px] sm:text-[15px] leading-[1.7] text-white/60 text-pretty">{ar ? "ادخل مساحة العمل، ارفع الحزمة، ودع الوكلاء ينظمون العمل بينما يراجع فريقك بثقة. بلا surprises — حصص واضحة، تصدير بهويتك." : "Enter the workspace, upload the pack, and let agents organize while your team reviews with confidence. No surprises — clear quotas, your-brand exports."}</p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <div className="relative group">
                      <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-amber-200 opacity-60 blur-[8px] group-hover:opacity-90 transition-opacity" />
                      <Button asChild size="lg" className="relative h-12 rounded-full bg-white px-7 text-[14px] font-semibold text-black shadow hover:bg-white/90 btn-premium">
                        <Link href="/login" className="inline-flex items-center gap-2">
                          {ar ? "ابدأ تجربتك الآن" : "Start your trial"}
                          <CtaIcon className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/15 bg-white/[0.04] px-7 text-[14px] font-medium text-white/80 hover:bg-white/[0.08] hover:text-white backdrop-blur btn-premium">
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
                      {ar ? "إعداد موجه" : "Guided setup"}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/70" />
                      {ar ? "دعم عربي/إنجليزي" : "AR/EN support"}
                    </span>
                  </div>
                </div>

                <div className="relative min-w-0">
                  <TiltCard intensity={0.8}>
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur shadow-[0_20px_50px_-15px_oklch(0_0_0/.5)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-400 text-white font-bold text-[13px]">S</div>
                        <div>
                          <p className="text-[13px] font-semibold text-white/80">{ar ? "مثال توضيحي لمدير العطاء" : "Illustrative bid-manager workflow"}</p>
                          <p className="text-[11px] text-white/40">{ar ? "ليس شهادة عميل" : "Not a customer testimonial"}</p>
                        </div>
                        <div className="ml-auto rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/40">
                          {ar ? "مثال" : "Example"}
                        </div>
                      </div>
                      <motion.p className="mt-4 text-[13.5px] leading-[1.65] text-white/65 italic text-pretty" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={SCROLL_VIEWPORT} transition={{ delay: 0.2 }}>
                        {ar ? "تتيح المصفوفة المشتركة للفريق مراجعة المتطلبات والنواقص ومراجع المصادر نفسها." : "A shared matrix lets the team review the same requirements, gaps, and source references."}
                      </motion.p>
                    </div>
                  </TiltCard>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <motion.div whileHover={{ y: -2 }} className="rounded-2xl border border-[var(--hairline)] bg-white/[0.03] p-3.5 backdrop-blur">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/30">{ar ? "لغات المستند" : "Languages"}</p>
                      <p className="mt-1 text-[18px] font-bold text-white">
                        <AnimatedCounter value={2} />
                      </p>
                      <p className="text-[11px] text-white/40">{ar ? "العربية والإنجليزية" : "Arabic and English"}</p>
                    </motion.div>
                    <motion.div whileHover={{ y: -2 }} className="rounded-2xl border border-[var(--hairline)] bg-white/[0.03] p-3.5 backdrop-blur">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/30">{ar ? "اقتراحات أسعار AI" : "AI price suggestions"}</p>
                      <p className="mt-1 text-[18px] font-bold text-white">
                        <AnimatedCounter value={0} />
                      </p>
                      <p className="text-[11px] text-white/40">{ar ? "محظورة معمارياً" : "architecturally blocked"}</p>
                    </motion.div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-8 text-center text-[11px] leading-relaxed text-white/25 max-w-2xl mx-auto px-4 text-pretty">
            {ar ? "أراب كلاو مبني بعناية لفرق المناقصات الحكومية في المملكة. نحن نحترم مسؤوليتك — الذكاء الاصطناعي ينظّم، وأنت تقرر." : "Arabclue is crafted with care for KSA bid teams. We respect accountability — AI organizes, you decide."}
          </p>
        </div>
      </section>
    </div>
  );
}

export function LandingPage({
  initialLocale = "ar",
}: {
  initialLocale?: "ar" | "en";
}) {
  return (
    <PublicShell variant="dark" initialLocale={initialLocale}>
      <LandingContent />
    </PublicShell>
  );
}
