"use client";

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
} from "lucide-react";
import { useLocale, useUI } from "@/lib/store";
import { PageHeader } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { saveBlob } from "@/lib/download-artifact";

type BusinessProfileSnapshot = {
  workspace: {
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
  const [exporting, setExporting] = useState<"pdf" | "html" | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["business-profile"],
    queryFn: async () => {
      const res = await fetch("/api/business-profile");
      if (!res.ok) throw new Error(`profile ${res.status}`);
      return (await res.json()) as { profile: BusinessProfileSnapshot };
    },
  });

  const profile = data?.profile;
  const primary = profile?.brand?.primaryColor ?? "#1E3A8A";
  const accent = profile?.brand?.accentColor ?? "#0EA5E9";

  const name = useMemo(() => {
    if (!profile) return "";
    return ar
      ? profile.workspace.nameAr || profile.workspace.name
      : profile.workspace.name;
  }, [profile, ar]);

  const tagline = ar
    ? profile?.brand?.taglineAr || profile?.brand?.tagline
    : profile?.brand?.tagline || profile?.brand?.taglineAr;

  async function exportProfile(format: "pdf" | "html") {
    setExporting(format);
    try {
      const res = await fetch(
        `/api/business-profile/export?format=${format}&locale=${locale}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition");
      const match = cd?.match(/filename="?([^";]+)"?/);
      const filename =
        match?.[1] ||
        `business-profile.${format === "pdf" ? "pdf" : "html"}`;
      saveBlob(blob, filename);
      toast({
        title: ar ? "تم التصدير" : "Exported",
        description: filename,
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
              onClick={() => setView("account")}
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
              {profile.brand?.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.brand.logoUrl}
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
                      ? "بيان قدرات لمنافسات اعتماد — مبني من معرفتك المؤسسية."
                      : "Etimad-ready capability statement built from your institutional knowledge.")}
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
              onClick={() => setView("account")}
            >
              {ar ? "أكمل الإعداد" : "Complete setup"}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.4 }}
        className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
      >
        {stats.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="rounded-2xl border border-border/70 bg-card p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                <Icon className="size-3.5" style={{ color: accent }} />
                {s.label}
              </div>
              <div className="text-2xl font-bold" style={{ color: primary }}>
                {s.value}
              </div>
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
            <EmptyHint ar={ar} onSetup={() => setView("account")} />
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
          onSetup={() => setView("account")}
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
          onSetup={() => setView("account")}
          items={profile.highlights.certificates.map((c) =>
            c.issuer ? `${c.name} (${c.issuer})` : c.name
          )}
        />
        <ListPanel
          title={ar ? "الشراكات" : "Partnerships"}
          empty={profile.highlights.partnerships.length === 0}
          ar={ar}
          onSetup={() => setView("account")}
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
          onSetup={() => setView("account")}
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
