"use client";

import { startTransition } from "react";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Award,
  Building2,
  Download,
  Handshake,
  Loader2,
  Sparkles,
  Target,
  Users,
  BookOpen,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { useLocale, useUI } from "@/lib/store";
import { PageHeader } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { saveBlob } from "@/lib/download-artifact";
import {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  normalizeDocumentBrandColor,
  safeBrandLogoUrlForDocument,
} from "@/lib/brand-policy";

type BilingualExportReadiness = {
  strict: {
    canExport: boolean;
    diagnosticCount: number;
    blocking: Array<{
      code: string;
      path?: string;
      message?: { ar?: string; en?: string };
      severity?: string;
    }>;
  };
  draft: {
    canExport: boolean;
    diagnosticCount: number;
    warningCount: number;
  };
};

type BusinessProfileSnapshot = {
  workspace: {
    id: string;
    name: string;
    nameAr: string | null;
    crNumber: string | null;
    vatNumber: string | null;
  };
  brand: {
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    tagline: string | null;
    taglineAr: string | null;
    vision2030Alignment: string | null;
  } | null;
  readiness: { readyForProposals: boolean; score: number };
  stats: {
    pastProjects: number;
    staff: number;
    certificates: number;
    partnerships: number;
    sectors: number;
    methodologies: number;
  };
  highlights: {
    pastProjects: Array<{
      title: string;
      titleAr: string | null;
      clientName: string | null;
      sector: string | null;
      outcome: string | null;
      summary: string;
    }>;
    staff: Array<{
      name: string;
      nameAr: string | null;
      title: string | null;
      titleAr: string | null;
    }>;
    certificates: Array<{ name: string; issuer: string | null }>;
    partnerships: Array<{ name: string; kind: string | null }>;
    sectors: Array<{ name: string }>;
    methodologies: Array<{ title: string; titleAr: string | null }>;
  };
};

export function BusinessProfileView() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { setView } = useUI();
  const { toast } = useToast();
  const [exporting, setExporting] = useState<
    "pdf" | "html" | "bilingual-pdf" | "bilingual-html" | null
  >(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["business-profile"],
    queryFn: async () => {
      const res = await fetch("/api/business-profile");
      if (!res.ok) throw new Error(`profile ${res.status}`);
      return (await res.json()) as {
        profile: BusinessProfileSnapshot;
        bilingualExport?: BilingualExportReadiness;
      };
    },
  });

  const profile = data?.profile;
  const bilingualExport = data?.bilingualExport;
  const primary = normalizeDocumentBrandColor(
    profile?.brand?.primaryColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
  );
  const accent = normalizeDocumentBrandColor(
    profile?.brand?.accentColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
  );
  const safeLogoUrl = profile
    ? safeBrandLogoUrlForDocument(
        profile.brand?.logoUrl,
        profile.workspace.id
      )
    : null;

  const name = useMemo(() => {
    if (!profile) return "";
    return ar
      ? profile.workspace.nameAr || profile.workspace.name
      : profile.workspace.name;
  }, [profile, ar]);

  const tagline = ar
    ? profile?.brand?.taglineAr || profile?.brand?.tagline
    : profile?.brand?.tagline || profile?.brand?.taglineAr;

  async function exportProfile(
    format: "pdf" | "html",
    exportLocale: "ar" | "en" | "bilingual" = locale
  ) {
    const exportKey =
      exportLocale === "bilingual"
        ? format === "pdf"
          ? "bilingual-pdf"
          : "bilingual-html"
        : format;
    setExporting(exportKey);

    const formatDiagnostic = (d: {
      code?: string;
      message?: { ar?: string; en?: string };
    }) => {
      const msg = ar ? d.message?.ar : d.message?.en;
      return msg || d.code || "diagnostic";
    };

    try {
      // Incomplete profiles cannot pass the strict final gate — export as an
      // explicit draft so users still get a printable bilingual package.
      const bilingualQuality =
        exportLocale === "bilingual"
          ? profile?.readiness.readyForProposals
            ? "strict"
            : "draft"
          : null;

      const runExport = async (quality: "strict" | "draft" | null) => {
        const qualityQuery =
          quality != null ? `&quality=${quality}` : "";
        const res = await fetch(
          `/api/business-profile/export?format=${format}&locale=${exportLocale}${qualityQuery}`,
          { credentials: "include" }
        );
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) {
          const body = contentType.includes("application/json")
            ? ((await res.json().catch(() => ({}))) as {
                error?: string;
                code?: string;
                diagnostics?: Array<{
                  code?: string;
                  message?: { ar?: string; en?: string };
                }>;
              })
            : {};
          const diagnosticLines = (body.diagnostics ?? [])
            .slice(0, 4)
            .map(formatDiagnostic);
          const detail =
            diagnosticLines.length > 0
              ? diagnosticLines.join(" · ")
              : body.error || `Export failed (${res.status})`;
          const err = new Error(detail) as Error & {
            code?: string;
            diagnostics?: typeof body.diagnostics;
          };
          err.code = body.code;
          err.diagnostics = body.diagnostics;
          throw err;
        }
        return { res, quality };
      };

      let result: { res: Response; quality: "strict" | "draft" | null };
      try {
        result = await runExport(bilingualQuality);
      } catch (firstErr) {
        // Strict failed after user became "ready" but still has translation gaps —
        // fall back once to draft with a clear notice.
        const code =
          firstErr instanceof Error && "code" in firstErr
            ? (firstErr as { code?: string }).code
            : undefined;
        if (
          exportLocale === "bilingual" &&
          bilingualQuality === "strict" &&
          code === "BILINGUAL_CAPABILITY_EXPORT_BLOCKED"
        ) {
          result = await runExport("draft");
          toast({
            title: ar ? "تصدير مسودة" : "Draft export",
            description: ar
              ? "التصدير النهائي محظور بسبب نواقص — تم إنشاء مسودة ثنائية اللغة بدلاً منه."
              : "Final export is blocked by gaps — generated a bilingual draft instead.",
          });
        } else {
          throw firstErr;
        }
      }

      const blob = await result.res.blob();
      const cd = result.res.headers.get("content-disposition");
      const match = cd?.match(/filename="?([^";]+)"?/);
      const filename =
        match?.[1] ||
        `business-profile.${format === "pdf" ? "pdf" : "html"}`;
      saveBlob(blob, filename);
      toast({
        title:
          result.quality === "draft"
            ? ar
              ? "تم تصدير المسودة"
              : "Draft exported"
            : ar
              ? "تم التصدير"
              : "Exported",
        description:
          result.quality === "draft"
            ? ar
              ? `${filename} · مسودة — أكمل الإعداد للتصدير النهائي`
              : `${filename} · draft — finish setup for final export`
            : filename,
      });
    } catch (err) {
      toast({
        title: ar ? "فشل التصدير" : "Export failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" />
        {ar ? "جاري تجهيز ملف الشركة…" : "Building business profile…"}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm">
        {ar ? "تعذّر تحميل ملف الشركة." : "Could not load business profile."}
        <Button variant="outline" size="sm" className="ms-3" onClick={() => refetch()}>
          {ar ? "إعادة المحاولة" : "Retry"}
        </Button>
      </div>
    );
  }

  const stats = [
    { icon: Target, label: ar ? "مشاريع" : "Projects", value: profile.stats.pastProjects },
    { icon: Users, label: ar ? "فريق" : "Team", value: profile.stats.staff },
    { icon: Award, label: ar ? "شهادات" : "Certificates", value: profile.stats.certificates },
    { icon: Handshake, label: ar ? "شركاء" : "Partners", value: profile.stats.partnerships },
    { icon: Building2, label: ar ? "قطاعات" : "Sectors", value: profile.stats.sectors },
    { icon: BookOpen, label: ar ? "منهجيات" : "Methods", value: profile.stats.methodologies },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar ? "ملف الشركة" : "Business Profile"}
        subtitle={
          ar
            ? "بيان قدرات جذاب يُبنى تلقائياً من إعداد الحساب — جاهز للتصدير PDF/HTML."
            : "An attractive capability statement auto-built from account setup — export as PDF/HTML."
        }
        locale={locale}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => startTransition(() => setView("account"))}
            >
              {ar ? "إعداد الحساب" : "Account setup"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={exporting != null}
              onClick={() => exportProfile("html")}
            >
              {exporting === "html" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              HTML
            </Button>
            <Button
              size="sm"
              disabled={exporting != null}
              onClick={() => exportProfile("pdf")}
            >
              {exporting === "pdf" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={exporting != null}
              onClick={() => exportProfile("html", "bilingual")}
              title={
                profile.readiness.readyForProposals
                  ? undefined
                  : ar
                    ? "سيُصدَّر كمسودة لأن الملف غير مكتمل"
                    : "Exports as draft while setup is incomplete"
              }
            >
              {exporting === "bilingual-html" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {ar
                ? profile.readiness.readyForProposals
                  ? "HTML ثنائي اللغة"
                  : "مسودة HTML ثنائية"
                : profile.readiness.readyForProposals
                  ? "Bilingual HTML"
                  : "Draft bilingual HTML"}
            </Button>
            <Button
              size="sm"
              disabled={exporting != null}
              onClick={() => exportProfile("pdf", "bilingual")}
              title={
                profile.readiness.readyForProposals
                  ? undefined
                  : ar
                    ? "سيُصدَّر كمسودة لأن الملف غير مكتمل"
                    : "Exports as draft while setup is incomplete"
              }
            >
              {exporting === "bilingual-pdf" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {ar
                ? profile.readiness.readyForProposals
                  ? "PDF ثنائي اللغة"
                  : "مسودة PDF ثنائية"
                : profile.readiness.readyForProposals
                  ? "Bilingual PDF"
                  : "Draft bilingual PDF"}
            </Button>
          </div>
        }
      />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl text-white"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${accent})`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,.35), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,255,255,.2), transparent 35%)",
          }}
        />
        <div className="relative p-6 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
              <Sparkles className="size-3.5" />
              {ar ? "ملف تشغيلي · رؤية 2030" : "Live profile · Vision 2030"}
            </div>
            <div className="flex items-start gap-4">
              {safeLogoUrl ? (
                 
                <img
                  src={safeLogoUrl}
                  alt=""
                  className="h-14 w-auto max-w-[160px] rounded-xl bg-white/15 p-2 object-contain"
                />
              ) : null}
              <div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
                  {name}
                </h2>
                <p className="mt-2 text-sm sm:text-base text-white/85 max-w-2xl">
                  {tagline ||
                    (ar
                      ? "مسودة بيان قدرات مبنية من السجلات المؤسسية المعتمدة."
                      : "Draft capability statement built from approved institutional records.")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge className="bg-white/20 hover:bg-white/25 text-white border-0">
                {profile.readiness.readyForProposals ? (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" />
                    {ar ? "جاهز للعروض" : "Proposal-ready"}
                  </span>
                ) : (
                  ar ? "أكمل الإعداد" : "Finish setup"
                )}
              </Badge>
              <Badge className="bg-white/20 hover:bg-white/25 text-white border-0">
                {ar ? "اكتمال" : "Completeness"} {profile.readiness.score}%
              </Badge>
              {profile.workspace.crNumber ? (
                <Badge className="bg-white/20 hover:bg-white/25 text-white border-0">
                  CR {profile.workspace.crNumber}
                </Badge>
              ) : null}
              {profile.workspace.vatNumber ? (
                <Badge className="bg-white/20 hover:bg-white/25 text-white border-0">
                  VAT {profile.workspace.vatNumber}
                </Badge>
              ) : null}
            </div>
          </div>
          {!profile.readiness.readyForProposals ? (
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => startTransition(() => setView("account"))}
            >
              {ar ? "أكمل الإعداد" : "Complete setup"}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </motion.section>

      {bilingualExport && !bilingualExport.strict.canExport ? (
        <section
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5"
          role="status"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {ar
                    ? "التصدير النهائي الثنائي محظور"
                    : "Final bilingual export blocked"}
                </h3>
                <Badge variant="outline" className="text-[10px]">
                  {bilingualExport.strict.blocking.length}{" "}
                  {ar ? "تشخيص" : "diagnostics"}
                </Badge>
                {bilingualExport.draft.canExport ? (
                  <Badge className="bg-emerald-600/90 text-[10px] hover:bg-emerald-600">
                    {ar ? "المسودة متاحة" : "Draft available"}
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {ar
                  ? "أكمل الإعداد أو صدّر مسودة ثنائية اللغة الآن. التصدير النهائي يتطلب معالجة التشخيصات أدناه."
                  : "Finish setup or export a bilingual draft now. Final export needs the diagnostics below resolved."}
              </p>
              <ul className="space-y-1.5">
                {bilingualExport.strict.blocking.slice(0, 6).map((d, i) => (
                  <li
                    key={`${d.code}-${i}`}
                    className="rounded-lg border border-border/50 bg-background/60 px-3 py-2 text-xs"
                  >
                    <span className="font-medium">
                      {ar ? d.message?.ar : d.message?.en || d.code}
                    </span>
                    {d.path ? (
                      <span className="ms-2 text-muted-foreground">{d.path}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => startTransition(() => setView("account"))}
                >
                  {ar ? "إكمال الإعداد" : "Complete setup"}
                </Button>
                <Button
                  size="sm"
                  disabled={exporting != null}
                  onClick={() => exportProfile("pdf", "bilingual")}
                >
                  {exporting === "bilingual-pdf" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  {ar ? "تصدير مسودة PDF" : "Export draft PDF"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
      >
        {stats.map((s, i) => {
          const Icon = s.icon;
          const isZero = s.value === 0;
          const CardTag = isZero ? "button" : "div";
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <CardTag
                type={isZero ? "button" : undefined}
                onClick={
                  isZero
                    ? () => startTransition(() => setView("account"))
                    : undefined
                }
                className={
                  isZero
                    ? "w-full rounded-2xl border border-dashed border-border/70 bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-muted/30"
                    : "rounded-2xl border border-border/70 bg-card p-4"
                }
                title={
                  isZero
                    ? ar
                      ? "افتح إعداد الحساب لإضافة سجلات"
                      : "Open Account Setup to add records"
                    : undefined
                }
              >
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Icon className="size-3.5" style={{ color: accent }} />
                  {s.label}
                </div>
                <div className="text-2xl font-bold" style={{ color: primary }}>
                  {s.value}
                </div>
                {isZero ? (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {ar ? "أضف من الإعداد ←" : "Add in setup →"}
                  </p>
                ) : null}
              </CardTag>
            </motion.div>
          );
        })}
      </motion.div>

      {profile.brand?.vision2030Alignment ? (
        <section className="rounded-2xl border border-border/70 bg-card p-5">
          <h3 className="text-sm font-semibold mb-2">
            {ar ? "مواءمة رؤية 2030" : "Vision 2030 alignment"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {profile.brand.vision2030Alignment}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">
          {ar ? "أبرز المشاريع" : "Flagship projects"}
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          {profile.highlights.pastProjects.length === 0 ? (
            <EmptyHint ar={ar} onSetup={() => startTransition(() => setView("account"))} />
          ) : (
            profile.highlights.pastProjects.map((p) => (
              <article
                key={p.title}
                className="rounded-2xl border border-border/70 bg-card p-4 hover:border-primary/30 transition-colors"
              >
                <h4 className="font-semibold text-sm">
                  {ar ? p.titleAr || p.title : p.title}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {[p.clientName, p.sector, p.outcome].filter(Boolean).join(" · ")}
                </p>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {p.summary}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <ListPanel
          title={ar ? "الفريق" : "Team"}
          empty={profile.highlights.staff.length === 0}
          ar={ar}
          onSetup={() => startTransition(() => setView("account"))}
          items={profile.highlights.staff.map((s) => {
            const n = ar ? s.nameAr || s.name : s.name;
            const role = ar ? s.titleAr || s.title : s.title;
            return role ? `${n} — ${role}` : n;
          })}
        />
        <ListPanel
          title={ar ? "الشهادات" : "Certificates"}
          empty={profile.highlights.certificates.length === 0}
          ar={ar}
          onSetup={() => startTransition(() => setView("account"))}
          items={profile.highlights.certificates.map((c) =>
            c.issuer ? `${c.name} (${c.issuer})` : c.name
          )}
        />
        <ListPanel
          title={ar ? "الشراكات" : "Partnerships"}
          empty={profile.highlights.partnerships.length === 0}
          ar={ar}
          onSetup={() => startTransition(() => setView("account"))}
          items={profile.highlights.partnerships.map((p) =>
            p.kind ? `${p.name} · ${p.kind}` : p.name
          )}
        />
        <ListPanel
          title={ar ? "القطاعات والمنهجيات" : "Sectors & methods"}
          empty={
            profile.highlights.sectors.length +
              profile.highlights.methodologies.length ===
            0
          }
          ar={ar}
          onSetup={() => startTransition(() => setView("account"))}
          items={[
            ...profile.highlights.sectors.map((s) => s.name),
            ...profile.highlights.methodologies.map((m) =>
              ar ? m.titleAr || m.title : m.title
            ),
          ]}
        />
      </div>
    </div>
  );
}

function EmptyHint({ ar, onSetup }: { ar: boolean; onSetup: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground col-span-full">
      {ar
        ? "أضف مشاريع وسجلات من إعداد الحساب ليظهر بيان قدرات غني هنا."
        : "Add projects and records in Account Setup to enrich this capability statement."}
      <Button variant="link" className="px-2" onClick={onSetup}>
        {ar ? "افتح الإعداد" : "Open setup"}
      </Button>
    </div>
  );
}

function ListPanel({
  title,
  items,
  empty,
  ar,
  onSetup,
}: {
  title: string;
  items: string[];
  empty: boolean;
  ar: boolean;
  onSetup: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {empty ? (
        <EmptyHint ar={ar} onSetup={onSetup} />
      ) : (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 size-1.5 rounded-full bg-primary/70 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
