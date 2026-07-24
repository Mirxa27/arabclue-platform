"use client";

import { useState, useRef } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Palette,
  Upload,
  Plus,
  Building2,
  CheckCircle2,
  Loader2,
  Save,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { VISION_2030_PILLARS } from "@/lib/constants";
import type { ApiPastProject } from "@/lib/api-types";

const SECTORS = ["GOV", "HEALTH", "FINANCE", "ENERGY", "TELECOM", "OTHER"];

interface BrandData {
  id: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily?: string | null;
  tagline: string | null;
  taglineAr: string | null;
  vision2030Alignment: string | null;
  logoUrl: string | null;
}

const FONT_OPTIONS = [
  "IBM Plex Sans Arabic",
  "IBM Plex Sans",
  "Space Grotesk",
  "Cairo",
  "Tajawal",
  "Inter",
];

export function BrandSetup() {
  const { locale } = useLocale();

  const { data, isLoading } = useQuery({
    queryKey: ["brand"],
    queryFn: async () => {
      const res = await fetch("/api/brand");
      return res.json();
    },
  });

  const brand = data?.brandProfile as BrandData | undefined;
  const pastProjects = data?.pastProjects ?? [];

  if (isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {brand && <BrandForm key={brand.id} brand={brand} />}
      {brand && <LetterheadPreview brand={brand} locale={locale} />}
      <div className="lg:col-span-3">
        <PastProjectsPanel pastProjects={pastProjects} />
      </div>
    </div>
  );
}

function BrandForm({ brand }: { brand: BrandData }) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    accentColor: brand.accentColor,
    fontFamily: brand.fontFamily ?? "IBM Plex Sans Arabic",
    tagline: brand.tagline ?? "",
    taglineAr: brand.taglineAr ?? "",
    vision2030Alignment: brand.vision2030Alignment ?? "thriving-economy",
    logoUrl: brand.logoUrl ?? "",
  });

  const saveBrand = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch("/api/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      qc.invalidateQueries({ queryKey: ["business-profile"] });
      toast({ title: locale === "ar" ? "تم حفظ الهوية" : "Brand saved" });
    },
  });

  return (
    <Card className="p-0 overflow-hidden border-border/60 lg:col-span-1">
      <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-5/10 flex items-center justify-center">
            <Palette className="size-4 text-chart-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("section_brand", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "تكوين هوية الشركة" : "Configure company identity"}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {/* Logo upload */}
        <div>
          <Label className="text-xs">{tr("brand_logo", locale)}</Label>
          <div
            className="mt-1.5 rounded-lg border-2 border-dashed border-border p-4 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => logoInputRef.current?.click()}
          >
            {form.logoUrl ? (
              <img
                src={form.logoUrl}
                alt="logo"
                className="mx-auto size-12 rounded-lg object-contain mb-2 bg-muted"
              />
            ) : (
              <div
                className="mx-auto size-12 rounded-lg flex items-center justify-center mb-2"
                style={{
                  background: `linear-gradient(135deg, ${form.primaryColor}, ${form.accentColor})`,
                }}
              >
                <Building2 className="size-5 text-white" />
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append("file", file);
                const res = await fetch("/api/brand/logo", { method: "POST", body: fd });
                const data = await res.json();
                if (res.ok) {
                  setForm((f) => ({ ...f, logoUrl: data.logoUrl }));
                  qc.invalidateQueries({ queryKey: ["brand"] });
                  toast({
                    title: locale === "ar" ? "تم رفع الشعار" : "Logo uploaded",
                  });
                } else {
                  toast({
                    title: locale === "ar" ? "فشل رفع الشعار" : "Logo upload failed",
                    description: data.error,
                    variant: "destructive",
                  });
                }
              }}
            />
            <Button size="sm" variant="outline" className="gap-1.5 text-[11px]" type="button">
              <Upload className="size-3" />
              {tr("action_upload", locale)}
            </Button>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-3 gap-2">
          <ColorField label={tr("brand_primary_color", locale)} value={form.primaryColor} onChange={(v) => setForm({ ...form, primaryColor: v })} />
          <ColorField label={tr("brand_secondary_color", locale)} value={form.secondaryColor} onChange={(v) => setForm({ ...form, secondaryColor: v })} />
          <ColorField label={tr("brand_accent_color", locale)} value={form.accentColor} onChange={(v) => setForm({ ...form, accentColor: v })} />
        </div>

        <div>
          <Label className="text-xs">
            {locale === "ar" ? "خط الهوية" : "Brand typeface"}
          </Label>
          <select
            className="mt-1.5 w-full h-9 rounded-md border border-input bg-background px-2 text-xs"
            value={form.fontFamily}
            onChange={(e) => setForm({ ...form, fontFamily: e.target.value })}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        {/* Tagline */}
        <div>
          <Label className="text-xs">{tr("brand_tagline", locale)}</Label>
          <Input
            value={form.tagline}
            onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            placeholder="Engineering Saudi Arabia's Digital Future"
            className="mt-1 h-9 text-xs"
          />
          <Input
            value={form.taglineAr}
            onChange={(e) => setForm({ ...form, taglineAr: e.target.value })}
            placeholder="نبني المستقبل الرقمي للمملكة"
            className="mt-1 h-9 text-xs"
            dir="rtl"
          />
        </div>

        {/* Vision 2030 alignment */}
        <div>
          <Label className="text-xs">{tr("vision2030", locale)}</Label>
          <div className="mt-1.5 space-y-1">
            {VISION_2030_PILLARS.map((p) => (
              <button
                key={p.id}
                onClick={() => setForm({ ...form, vision2030Alignment: p.id })}
                className={`w-full flex items-center gap-2 p-2 rounded-md border text-xs transition-colors ${
                  form.vision2030Alignment === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div className="size-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-start">{locale === "ar" ? p.nameAr : p.name}</span>
                {form.vision2030Alignment === p.id && <CheckCircle2 className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full gap-1.5"
          onClick={() => saveBrand.mutate(form)}
          disabled={saveBrand.isPending}
        >
          {saveBrand.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {tr("action_save", locale)}
        </Button>
      </div>
    </Card>
  );
}

function LetterheadPreview({
  brand,
  locale,
}: {
  brand: BrandData;
  locale: "ar" | "en";
}) {
  const ar = locale === "ar";
  const name = ar
    ? brand.taglineAr || brand.tagline || "أراب كلاو"
    : brand.tagline || "ArabClue";
  return (
    <Card className="p-0 overflow-hidden border-border/60 lg:col-span-1">
      <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
        <h3 className="text-sm font-semibold">
          {ar ? "معاينة الورق الرسمي" : "Letterhead preview"}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          {ar
            ? "يُطبَّق على عروض PDF والعقود لكل عميل في مساحة العمل"
            : "Applied to proposal PDFs and contracts for this workspace client"}
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div
          className="rounded-lg p-3 text-white flex items-center gap-3"
          style={{
            background: `linear-gradient(90deg, ${brand.primaryColor}, ${brand.secondaryColor})`,
            borderBottom: `3px solid ${brand.accentColor}`,
            fontFamily: brand.fontFamily || "IBM Plex Sans Arabic",
          }}
        >
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl}
              alt=""
              className="h-8 max-w-[100px] object-contain rounded bg-white/15 p-1"
            />
          ) : (
            <div className="size-8 rounded bg-white/20" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{name}</div>
            <div className="text-[10px] opacity-90">
              {ar ? "ورق رسمي" : "Official letterhead"}
            </div>
          </div>
        </div>
        <div
          className="rounded-md border p-3 text-xs space-y-2"
          style={{ fontFamily: brand.fontFamily || undefined }}
        >
          <p
            className="font-semibold"
            style={{ color: brand.primaryColor }}
          >
            {ar ? "عنوان القسم" : "Section heading"}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {ar
              ? "نص تجريبي يظهر كيف تبدو ألوان وخط هوية العميل على المستندات المُصدَّرة."
              : "Sample body copy showing how this client’s colors and typeface render on exported documents."}
          </p>
          <div
            className="h-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${brand.accentColor}, transparent)`,
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function PastProjectsPanel({ pastProjects }: { pastProjects: ApiPastProject[] }) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newProject, setNewProject] = useState({
    title: "",
    titleAr: "",
    clientName: "",
    sector: "GOV",
    contractValue: "",
    summary: "",
    tags: "",
  });

  const addProject = useMutation({
    mutationFn: async (payload: typeof newProject) => {
      const res = await fetch("/api/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, contractValue: Number(payload.contractValue) || 0 }),
      });
      if (!res.ok) throw new Error("add failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand"] });
      setNewProject({ title: "", titleAr: "", clientName: "", sector: "GOV", contractValue: "", summary: "", tags: "" });
      toast({ title: locale === "ar" ? "تمت إضافة المشروع" : "Past project added" });
    },
  });

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-chart-3/10 flex items-center justify-center">
              <Building2 className="size-4 text-chart-3" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{tr("brand_past_projects", locale)}</h3>
              <p className="text-[11px] text-muted-foreground">
                {locale === "ar" ? "تُستخدم لاسترجاع RAG في صياغة العطاءات" : "Vectorized for RAG-based proposal drafting"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {pastProjects.length} {locale === "ar" ? "مشروع" : "projects"}
          </Badge>
        </div>
      </div>

      <div className="p-4 max-h-[24rem] overflow-y-auto scrollbar-thin space-y-2">
        {pastProjects.map((p) => (
          <div key={p.id} className="rounded-lg border border-border/60 p-3 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{locale === "ar" ? p.titleAr ?? p.title : p.title}</div>
                <div className="text-[10px] text-muted-foreground">
                  {locale === "ar" ? p.clientNameAr ?? p.clientName : p.clientName} · {p.sector}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-[9px] font-mono">
                  {p.currency} {Number(p.contractValue ?? 0).toLocaleString()}
                </Badge>
                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  {p.outcome}
                </Badge>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
              {locale === "ar" ? p.summaryAr ?? p.summary : p.summary}
            </p>
            {p.tags && (
              <div className="flex flex-wrap gap-1 mt-2">
                {p.tags.split(",").map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[9px] h-4">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Separator />
      <div className="p-4 bg-muted/20">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Plus className="size-3" />
          {tr("action_add_project", locale)}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Input
            placeholder={locale === "ar" ? "عنوان المشروع" : "Project title"}
            value={newProject.title}
            onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            placeholder={locale === "ar" ? "اسم العميل" : "Client name"}
            value={newProject.clientName}
            onChange={(e) => setNewProject({ ...newProject, clientName: e.target.value })}
            className="h-8 text-xs"
          />
          <select
            value={newProject.sector}
            onChange={(e) => setNewProject({ ...newProject, sector: e.target.value })}
            className="h-8 text-xs rounded-md border border-input bg-background px-2"
          >
            {SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Input
            placeholder={locale === "ar" ? "قيمة العقد (SAR)" : "Contract value (SAR)"}
            type="number"
            value={newProject.contractValue}
            onChange={(e) => setNewProject({ ...newProject, contractValue: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <textarea
          placeholder={locale === "ar" ? "ملخص المشروع..." : "Project summary..."}
          value={newProject.summary}
          onChange={(e) => setNewProject({ ...newProject, summary: e.target.value })}
          className="mt-2 w-full text-xs rounded-md border border-input bg-background px-2 py-1.5 min-h-[60px] resize-y"
        />
        <Button
          size="sm"
          className="mt-2 gap-1.5 w-full"
          onClick={() => addProject.mutate(newProject)}
          disabled={!newProject.title || addProject.isPending}
        >
          {addProject.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {tr("action_add_project", locale)}
        </Button>
      </div>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] block truncate">{label}</Label>
      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-input bg-background p-1">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 rounded cursor-pointer border-0 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 text-[10px] font-mono bg-transparent outline-none"
        />
      </div>
    </div>
  );
}
