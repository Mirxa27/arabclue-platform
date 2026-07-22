"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Scale,
  ShieldAlert,
  BookOpen,
  Columns2,
  AlignLeft,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import {
  parseContractArticles,
  type ContractArticle,
} from "@/lib/contract-format";
import type { SaudiLawResearchBrief } from "@/lib/saudi-law-research";

type Props = {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  research?: SaudiLawResearchBrief | null;
  articles?: ContractArticle[] | null;
  className?: string;
};

export function BilingualContractStudio({
  title,
  titleAr,
  contentMd,
  research,
  articles: articlesProp,
  className,
}: Props) {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const [mode, setMode] = useState<"split" | "en" | "ar">("split");
  const [showResearch, setShowResearch] = useState(true);

  const articles = useMemo(() => {
    if (articlesProp?.length) return articlesProp;
    return parseContractArticles(contentMd);
  }, [articlesProp, contentMd]);

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border border-[oklch(0.28_0.03_250/0.35)]",
        "bg-[linear-gradient(165deg,oklch(0.16_0.02_250)_0%,oklch(0.12_0.02_240)_45%,oklch(0.14_0.025_200)_100%)]",
        className
      )}
    >
      {/* Masthead */}
      <div className="relative px-6 sm:px-10 pt-8 pb-6 border-b border-white/10">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 10% 0%, oklch(0.35_0.06_195 / 0.35), transparent), radial-gradient(ellipse 50% 60% at 90% 20%, oklch(0.30_0.04_80 / 0.2), transparent)",
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[oklch(0.78_0.1_195)]">
              <Scale className="size-5" />
              <span className="text-[11px] font-bold tracking-[0.22em] uppercase">
                ArabClue · أراب كلاو
              </span>
            </div>
            <h2 className="mt-3 font-[family-name:var(--font-ibm-arabic)] text-2xl sm:text-3xl font-bold text-white leading-tight">
              {titleAr || title}
            </h2>
            <p className="mt-1 text-sm text-white/50 font-[family-name:var(--font-space-grotesk)]">
              {title}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/30 gap-1.5">
              <ShieldAlert className="size-3" />
              {ar ? "مسودة — ليست استشارة قانونية" : "Draft — not legal advice"}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/15 text-white/60"
            >
              {ar ? "عربي | English" : "EN | عربي"}
            </Badge>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2">
          {(
            [
              ["split", ar ? "متقابل" : "Front-to-front", Columns2],
              ["en", "English", AlignLeft],
              ["ar", "العربية", AlignLeft],
            ] as const
          ).map(([id, label, Icon]) => (
            <Button
              key={id}
              size="sm"
              variant="ghost"
              onClick={() => setMode(id)}
              className={cn(
                "h-8 rounded-full text-[11px] gap-1.5 border",
                mode === id
                  ? "bg-white text-black border-white"
                  : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowResearch((v) => !v)}
            className={cn(
              "h-8 rounded-full text-[11px] gap-1.5 border",
              showResearch
                ? "bg-[oklch(0.72_0.12_195)]/20 text-[oklch(0.85_0.1_195)] border-[oklch(0.72_0.12_195)]/30"
                : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
            )}
          >
            <BookOpen className="size-3.5" />
            {ar ? "البحث النظامي" : "Law research"}
          </Button>
        </div>
      </div>

      {/* Research brief */}
      {showResearch && research ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-6 sm:px-10 py-5 border-b border-white/10 bg-black/20"
        >
          <p className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-3">
            {ar ? "بحث قبل الصياغة" : "Pre-draft research"}
          </p>
          <p className="text-xs text-white/55 leading-relaxed max-w-4xl mb-4">
            {ar ? research.updatePostureAr : research.updatePostureEn}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {research.findings.slice(0, 6).map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">
                    {ar ? f.topicAr : f.topicEn}
                  </p>
                  <span className="text-[9px] font-mono text-white/40">
                    {f.certainty}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-white/50 leading-relaxed">
                  {ar ? f.statementAr : f.statementEn}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-amber-200/80 leading-relaxed max-w-4xl">
            {ar ? research.disclaimerAr : research.disclaimerEn}
          </p>
        </motion.div>
      ) : null}

      {/* Articles */}
      <ScrollArea className="h-[min(70vh,720px)]">
        <div className="px-4 sm:px-8 py-8 space-y-6">
          {articles.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {ar ? "لا بنود قابلة للعرض" : "No parseable articles"}
            </div>
          ) : (
            articles.map((article, i) => (
              <motion.article
                key={article.number}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20px" }}
                transition={{ delay: Math.min(i * 0.03, 0.2) }}
                className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden"
              >
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
                  <span className="flex size-8 items-center justify-center rounded-full bg-[oklch(0.72_0.12_195)]/15 text-[oklch(0.82_0.1_195)] text-xs font-bold font-mono">
                    {String(article.number).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {ar ? article.titleAr : article.titleEn}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      {ar ? article.titleEn : article.titleAr}
                    </p>
                  </div>
                </div>

                {mode === "split" ? (
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 rtl:md:divide-x-reverse">
                    <div
                      className="p-5 font-[family-name:var(--font-space-grotesk)]"
                      dir="ltr"
                      lang="en"
                    >
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/35 mb-2">
                        English
                      </p>
                      <p className="text-[13px] leading-[1.75] text-white/75 whitespace-pre-wrap">
                        {article.bodyEn}
                      </p>
                    </div>
                    <div
                      className="p-5 font-[family-name:var(--font-ibm-arabic)]"
                      dir="rtl"
                      lang="ar"
                    >
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/35 mb-2">
                        العربية
                      </p>
                      <p className="text-[13px] leading-[1.9] text-white/75 whitespace-pre-wrap">
                        {article.bodyAr}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "p-5",
                      mode === "ar"
                        ? "font-[family-name:var(--font-ibm-arabic)]"
                        : "font-[family-name:var(--font-space-grotesk)]"
                    )}
                    dir={mode === "ar" ? "rtl" : "ltr"}
                    lang={mode === "ar" ? "ar" : "en"}
                  >
                    <p className="text-[13px] leading-[1.85] text-white/75 whitespace-pre-wrap">
                      {mode === "ar" ? article.bodyAr : article.bodyEn}
                    </p>
                  </div>
                )}
              </motion.article>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="px-6 sm:px-10 py-4 border-t border-white/10 text-[10px] text-white/40 leading-relaxed">
        {ar
          ? "وكيل القانون يبحث سجل الأطر السعودية ومستخرج الكراسة قبل الصياغة. التحقق من النشرات الرسمية واجب على المستشار المعتمد — لا يقين قانوني بنسبة 100%."
          : "The Law agent researches the Saudi framework registry and tender extracts before drafting. Official publication verification is required by authorized counsel — no 100% legal certainty."}
      </div>
    </div>
  );
}
