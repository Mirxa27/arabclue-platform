"use client";

import { useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Trash2,
  Shield,
  Users,
  BookOpen,
  Library,
  Handshake,
  Target,
  GitBranch,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { BrandSetup } from "./brand-setup";
import { EmptyState, Panel } from "@/components/patterns";
import {
  CERTIFICATE_TYPES,
  assessQualificationDossier,
  type CertificateType,
  type QualificationDocKey,
} from "@/lib/qualification";

type StepKey =
  | "brand"
  | "legal"
  | "trackRecord"
  | "humanCapital"
  | "methodologies"
  | "contentLibrary"
  | "partnerships"
  | "sectors"
  | "approvalChain"
  | "restrictions";

const STEPS: { key: StepKey; icon: typeof Building2; en: string; ar: string }[] = [
  { key: "brand", icon: Building2, en: "Brand", ar: "الهوية" },
  { key: "legal", icon: Shield, en: "Legal", ar: "القانوني" },
  { key: "trackRecord", icon: Target, en: "Track record", ar: "المشاريع" },
  { key: "humanCapital", icon: Users, en: "Staff", ar: "الفريق" },
  { key: "methodologies", icon: BookOpen, en: "Methods", ar: "المنهجيات" },
  { key: "contentLibrary", icon: Library, en: "Library", ar: "المكتبة" },
  { key: "partnerships", icon: Handshake, en: "Partners", ar: "الشركاء" },
  { key: "sectors", icon: Target, en: "Sectors", ar: "القطاعات" },
  { key: "approvalChain", icon: GitBranch, en: "Approvals", ar: "الاعتماد" },
  { key: "restrictions", icon: AlertTriangle, en: "Restrictions", ar: "القيود" },
];

type GapAction = {
  viewHint: StepKey;
  certType?: CertificateType;
  scrollId: string;
  focusId: string;
  ctaEn: string;
  ctaAr: string;
};

const QUALIFICATION_GAP_ACTIONS: Record<QualificationDocKey, GapAction> = {
  cr: {
    viewHint: "legal",
    certType: "CR",
    scrollId: "legal-cr-number",
    focusId: "legal-cr-number",
    ctaEn: "Add CR",
    ctaAr: "إضافة السجل",
  },
  zatca_vat: {
    viewHint: "legal",
    certType: "ZATCA_VAT",
    scrollId: "legal-vat-number",
    focusId: "legal-vat-number",
    ctaEn: "Add VAT",
    ctaAr: "إضافة الضريبة",
  },
  gosi: {
    viewHint: "legal",
    certType: "GOSI",
    scrollId: "certificate-form",
    focusId: "certificate-name",
    ctaEn: "Add GOSI",
    ctaAr: "إضافة GOSI",
  },
  nca: {
    viewHint: "legal",
    certType: "NCA",
    scrollId: "certificate-form",
    focusId: "certificate-name",
    ctaEn: "Add NCA",
    ctaAr: "إضافة NCA",
  },
  lcgpa: {
    viewHint: "legal",
    certType: "LCGPA",
    scrollId: "certificate-form",
    focusId: "certificate-name",
    ctaEn: "Add LCGPA",
    ctaAr: "إضافة LCGPA",
  },
  iso: {
    viewHint: "legal",
    certType: "ISO",
    scrollId: "certificate-form",
    focusId: "certificate-name",
    ctaEn: "Add ISO",
    ctaAr: "إضافة ISO",
  },
};

function apiErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function assertOk(res: Response) {
  if (res.ok) return;
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  throw new Error(payload?.error ?? "Request failed");
}

function scrollAndFocus(scrollId: string, focusId: string) {
  window.setTimeout(() => {
    document.getElementById(scrollId)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    const focusEl = document.getElementById(focusId);
    if (focusEl instanceof HTMLElement) {
      focusEl.focus({ preventScroll: true });
    }
  }, 0);
}

export function AccountOnboarding() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const [step, setStep] = useState<StepKey>("brand");

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding"],
    queryFn: async () => {
      const res = await fetch("/api/onboarding");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card className="p-8 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const steps = (data?.steps ?? {}) as Record<string, boolean>;
  const ready = data?.readyForProposals === true;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {ready ? (
            <Badge className="bg-emerald-600">
              {locale === "ar" ? "جاهز لتوليد العروض" : "Ready for proposals"}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-amber-500 text-amber-700">
              {locale === "ar"
                ? `أكمل الخطوات المطلوبة: ${(data?.missing ?? []).join(", ")}`
                : `Complete required steps: ${(data?.missing ?? []).join(", ")}`}
            </Badge>
          )}
        </div>
        {ready ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setView("business-profile")}
          >
            {locale === "ar" ? "عرض ملف الشركة" : "View business profile"}
          </Button>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const Icon = s.icon;
          const done = steps[s.key];
          return (
            <Button
              key={s.key}
              size="sm"
              variant={step === s.key ? "default" : "outline"}
              onClick={() => setStep(s.key)}
              className="gap-1.5"
            >
              {done ? (
                <CheckCircle2 className="size-3.5 text-emerald-500" />
              ) : (
                <Circle className="size-3.5" />
              )}
              <Icon className="size-3.5" />
              {locale === "ar" ? s.ar : s.en}
            </Button>
          );
        })}
      </div>

      {step === "brand" || step === "trackRecord" ? (
        <BrandSetup />
      ) : step === "legal" ? (
        <LegalPanel workspace={data?.workspace} />
      ) : step === "humanCapital" ? (
        <StaffPanel />
      ) : step === "methodologies" ? (
        <SimpleCrudPanel
          endpoint="/api/methodologies"
          queryKey="methodologies"
          titleEn="Methodologies"
          titleAr="المنهجيات"
          fields={[
            { key: "category", label: "Category", options: ["IMPLEMENTATION", "QC", "RISK", "BCP", "OTHER"] },
            { key: "title", label: "Title" },
            { key: "bodyMd", label: "Body", multiline: true },
          ]}
        />
      ) : step === "contentLibrary" ? (
        <SimpleCrudPanel
          endpoint="/api/library"
          queryKey="library"
          titleEn="Content library"
          titleAr="مكتبة المحتوى"
          fields={[
            { key: "title", label: "Title" },
            { key: "category", label: "Category", options: ["BOILERPLATE", "DIAGRAM", "POLICY", "EXCERPT", "OTHER"] },
            { key: "bodyMd", label: "Body", multiline: true },
          ]}
        />
      ) : step === "partnerships" ? (
        <SimpleCrudPanel
          endpoint="/api/partnerships"
          queryKey="partnerships"
          titleEn="Partnerships"
          titleAr="الشراكات"
          fields={[
            { key: "name", label: "Name" },
            { key: "partnerType", label: "Type", options: ["JV", "SUBCONTRACTOR", "OTHER"] },
            { key: "scope", label: "Scope", multiline: true },
          ]}
        />
      ) : step === "sectors" ? (
        <SectorsPanel />
      ) : step === "approvalChain" ? (
        <ApprovalPanel />
      ) : (
        <RestrictionsPanel />
      )}
    </div>
  );
}

function LegalPanel({
  workspace,
}: {
  workspace?: { crNumber?: string | null; vatNumber?: string | null; name?: string };
}) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cr, setCr] = useState(workspace?.crNumber ?? "");
  const [vat, setVat] = useState(workspace?.vatNumber ?? "");
  const [certName, setCertName] = useState("");
  const [certType, setCertType] = useState("GOSI");
  const [expiresAt, setExpiresAt] = useState("");

  const { data } = useQuery({
    queryKey: ["certificates"],
    queryFn: async () => (await fetch("/api/certificates")).json(),
  });

  const saveLegal = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crNumber: cr || null, vatNumber: vat || null }),
      });
      await assertOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({ title: locale === "ar" ? "تم الحفظ" : "Saved" });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(err, locale === "ar" ? "تعذر الحفظ" : "Save failed"),
        variant: "destructive",
      });
    },
  });

  const addCert = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certType,
          name: certName,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      await assertOk(res);
    },
    onSuccess: () => {
      setCertName("");
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: locale === "ar" ? "تمت إضافة الشهادة" : "Certificate added",
      });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? "تعذرت إضافة الشهادة" : "Could not add certificate"
        ),
        variant: "destructive",
      });
    },
  });

  const delCert = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/certificates?id=${id}`, { method: "DELETE" });
      await assertOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: locale === "ar" ? "تم حذف الشهادة" : "Certificate deleted",
      });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? "تعذر حذف الشهادة" : "Could not delete certificate"
        ),
        variant: "destructive",
      });
    },
  });

  const dossier = assessQualificationDossier({
    workspace: { crNumber: cr, vatNumber: vat },
    certificates: (data?.items ?? []) as Array<{
      certType: string;
      expiresAt?: string;
      revokedAt?: string | null;
      approved?: boolean;
    }>,
  });

  const certificates = (data?.items ?? []) as Array<{
    id: string;
    name: string;
    certType: string;
    expiresAt?: string;
  }>;

  const handleGapAction = (key: QualificationDocKey) => {
    const action = QUALIFICATION_GAP_ACTIONS[key];
    if (action.viewHint !== "legal") return;
    if (action.certType) setCertType(action.certType);
    scrollAndFocus(action.scrollId, action.focusId);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel icon={Shield} title={locale === "ar" ? "السجل التجاري والضريبة" : "CR & VAT"}>
        <div className="space-y-3 p-4">
          <div>
            <Label>CR</Label>
            <Input id="legal-cr-number" value={cr} onChange={(e) => setCr(e.target.value)} />
          </div>
          <div>
            <Label>{locale === "ar" ? "ضريبة زاتكا / VAT" : "ZATCA VAT"}</Label>
            <Input id="legal-vat-number" value={vat} onChange={(e) => setVat(e.target.value)} />
          </div>
          <Button onClick={() => saveLegal.mutate()} disabled={saveLegal.isPending}>
            {locale === "ar" ? "حفظ" : "Save"}
          </Button>
        </div>
      </Panel>
      <Panel icon={Shield} title={locale === "ar" ? "الشهادات والتراخيص" : "Certificates & licenses"}>
        <div className="space-y-3 p-4">
          <div id="certificate-form" className="grid grid-cols-2 gap-2">
            <Input
              id="certificate-name"
              placeholder={locale === "ar" ? "اسم الشهادة" : "Name"}
              value={certName}
              onChange={(e) => setCertName(e.target.value)}
            />
            <select
              id="certificate-type"
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
            >
              {CERTIFICATE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <Button onClick={() => addCert.mutate()} disabled={!certName || addCert.isPending}>
              <Plus className="size-4" />
            </Button>
          </div>
          <Separator />
          {certificates.length === 0 ? (
            <EmptyState
              icon={Shield}
              title={locale === "ar" ? "لا توجد شهادات بعد" : "No certificates yet"}
              description={
                locale === "ar"
                  ? "أضف السجل أو شهادات GOSI وNCA وLCGPA عند توفرها."
                  : "Add CR or GOSI, NCA, and LCGPA certificates when available."
              }
              className="rounded-md border border-dashed"
            />
          ) : (
            <ul className="space-y-2">
              {certificates.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm gap-2">
                  <span>
                    <Badge variant="outline" className="me-2">{c.certType}</Badge>
                    {c.name}
                    {c.expiresAt && (
                      <span className="text-muted-foreground ms-2">
                        {new Date(c.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => delCert.mutate(c.id)}
                    disabled={delCert.isPending}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
      <Panel
        icon={AlertTriangle}
        title={
          locale === "ar"
            ? "ملف التأهيل السعودي (إرشادي)"
            : "Saudi qualification dossier (advisory)"
        }
      >
        <div className="space-y-2 p-4 text-sm">
          <p className="text-muted-foreground text-xs">
            {locale === "ar"
              ? "لا يمنع الإكمال — يساعد على جاهزية عطاء أقوى لاعتماد."
              : "Does not block setup — helps readiness for stronger Etimad bids."}
          </p>
          <Badge
            variant={dossier.strongBidReady ? "default" : "outline"}
            className={
              dossier.strongBidReady
                ? "bg-emerald-600 hover:bg-emerald-600"
                : undefined
            }
          >
            {dossier.strongBidReady
              ? locale === "ar"
                ? "الوثائق الأساسية مكتملة"
                : "Core docs present"
              : locale === "ar"
                ? "نواقص أساسية"
                : "Core gaps remain"}
          </Badge>
          {dossier.gaps.length === 0 ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {locale === "ar"
                ? "لا توجد فجوات ظاهرة في الملف."
                : "No dossier gaps detected."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {dossier.gaps.map((g) => {
                const action = QUALIFICATION_GAP_ACTIONS[g.key];
                return (
                  <li key={g.key} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {g.reason}
                    </Badge>
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block">
                        {locale === "ar" ? g.labelAr : g.labelEn}
                        {g.requiredForStrongBid
                          ? locale === "ar"
                            ? " · أساسي"
                            : " · core"
                          : ""}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => handleGapAction(g.key)}
                      >
                        {locale === "ar" ? action.ctaAr : action.ctaEn}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}

function StaffPanel() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [tags, setTags] = useState("");

  const { data } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await fetch("/api/staff")).json(),
  });

  const add = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          roleTitle,
          requirementTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      await assertOk(res);
    },
    onSuccess: () => {
      setName("");
      setRoleTitle("");
      setTags("");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({ title: locale === "ar" ? "تمت إضافة عضو الفريق" : "Staff member added" });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? "تعذرت إضافة عضو الفريق" : "Could not add staff member"
        ),
        variant: "destructive",
      });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/staff?id=${id}`, { method: "DELETE" });
      await assertOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({ title: locale === "ar" ? "تم حذف عضو الفريق" : "Staff member deleted" });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? "تعذر حذف عضو الفريق" : "Could not delete staff member"
        ),
        variant: "destructive",
      });
    },
  });

  const staff = (data?.items ?? []) as Array<{
    id: string;
    name: string;
    roleTitle: string;
  }>;

  return (
    <Panel icon={Users} title={locale === "ar" ? "رأس المال البشري" : "Human capital"}>
      <div className="space-y-3 p-4">
        <div className="grid md:grid-cols-3 gap-2">
          <Input placeholder={locale === "ar" ? "الاسم" : "Name"} value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder={locale === "ar" ? "المسمى" : "Role"} value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} />
          <Input placeholder="ISO_27001_LEAD, ..." value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <Button onClick={() => add.mutate()} disabled={!name || !roleTitle || add.isPending}>
          <Plus className="size-4 me-1" />
          {locale === "ar" ? "إضافة" : "Add"}
        </Button>
        {staff.length === 0 ? (
          <EmptyState
            icon={Users}
            title={locale === "ar" ? "لا يوجد أعضاء فريق بعد" : "No staff yet"}
            description={
              locale === "ar"
                ? "أضف الخبراء والأدوار لتقوية ملف التأهيل."
                : "Add experts and roles to strengthen the qualification profile."
            }
            className="rounded-md border border-dashed"
          />
        ) : (
          <ul className="space-y-2">
            {staff.map((s) => (
              <li key={s.id} className="flex justify-between text-sm">
                <span>{s.name} — {s.roleTitle}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => del.mutate(s.id)}
                  disabled={del.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function SimpleCrudPanel({
  endpoint,
  queryKey,
  titleEn,
  titleAr,
  fields,
}: {
  endpoint: string;
  queryKey: string;
  titleEn: string;
  titleAr: string;
  fields: { key: string; label: string; multiline?: boolean; options?: string[] }[];
}) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => (await fetch(endpoint)).json(),
  });

  const add = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      for (const f of fields) body[f.key] = form[f.key] ?? "";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await assertOk(res);
    },
    onSuccess: () => {
      setForm({});
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title:
          locale === "ar"
            ? `تمت إضافة ${titleAr}`
            : `${titleEn} item added`,
      });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? `تعذرت إضافة ${titleAr}` : `Could not add ${titleEn} item`
        ),
        variant: "destructive",
      });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
      await assertOk(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title:
          locale === "ar"
            ? `تم حذف ${titleAr}`
            : `${titleEn} item deleted`,
      });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? `تعذر حذف ${titleAr}` : `Could not delete ${titleEn} item`
        ),
        variant: "destructive",
      });
    },
  });

  const items = (data?.items ?? []) as Array<{
    id: string;
    title?: string;
    name?: string;
  }>;

  return (
    <Panel icon={Library} title={locale === "ar" ? titleAr : titleEn}>
      <div className="space-y-3 p-4">
        {fields.map((f) =>
          f.options ? (
            <select
              key={f.key}
              className="border rounded-md h-9 px-2 text-sm bg-background w-full"
              value={form[f.key] ?? f.options[0]}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : f.multiline ? (
            <Textarea
              key={f.key}
              placeholder={f.label}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          ) : (
            <Input
              key={f.key}
              placeholder={f.label}
              value={form[f.key] ?? ""}
              onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
            />
          )
        )}
        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4 me-1" />
          {locale === "ar" ? "إضافة" : "Add"}
        </Button>
        {items.length === 0 ? (
          <EmptyState
            icon={Library}
            title={
              locale === "ar"
                ? `لا توجد عناصر في ${titleAr}`
                : `No ${titleEn.toLowerCase()} items yet`
            }
            description={
              locale === "ar"
                ? "أضف أول عنصر لاستخدامه في تجهيز العطاءات."
                : "Add the first item so it can support proposal preparation."
            }
            className="rounded-md border border-dashed"
          />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span>{item.title ?? item.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => del.mutate(item.id)}
                  disabled={del.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function SectorsPanel() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [sector, setSector] = useState("GOV");
  const [entity, setEntity] = useState("");
  const [outcome, setOutcome] = useState("WIN");

  const sectors = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await fetch("/api/sectors")).json(),
  });
  const history = useQuery({
    queryKey: ["bid-history"],
    queryFn: async () => (await fetch("/api/bid-history")).json(),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel icon={Target} title={locale === "ar" ? "القطاعات المستهدفة" : "Target sectors"}>
        <div className="p-4 space-y-2">
          <div className="flex gap-2">
            <select
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              {["GOV", "HEALTH", "FINANCE", "ENERGY", "TELECOM", "OTHER"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button
              onClick={async () => {
                await fetch("/api/sectors", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sector }),
                });
                qc.invalidateQueries({ queryKey: ["sectors"] });
                qc.invalidateQueries({ queryKey: ["onboarding"] });
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <ul className="text-sm space-y-1">
            {(sectors.data?.items ?? []).map((s: { id: string; sector: string }) => (
              <li key={s.id}>{s.sector}</li>
            ))}
          </ul>
        </div>
      </Panel>
      <Panel icon={Target} title={locale === "ar" ? "سجل العطاءات" : "Bid history"}>
        <div className="p-4 space-y-2">
          <Input placeholder="Entity" value={entity} onChange={(e) => setEntity(e.target.value)} />
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background w-full"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          >
            {["WIN", "LOSS", "WITHDRAWN"].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <Button
            onClick={async () => {
              await fetch("/api/bid-history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entityName: entity, outcome }),
              });
              setEntity("");
              qc.invalidateQueries({ queryKey: ["bid-history"] });
              qc.invalidateQueries({ queryKey: ["onboarding"] });
            }}
            disabled={!entity}
          >
            <Plus className="size-4 me-1" />
            Add
          </Button>
          <ul className="text-sm space-y-1">
            {(history.data?.items ?? []).map((h: { id: string; entityName: string; outcome: string }) => (
              <li key={h.id}>{h.entityName} — {h.outcome}</li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

function ApprovalPanel() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery({
    queryKey: ["approval-policy"],
    queryFn: async () => (await fetch("/api/approval-policy")).json(),
  });
  const [reviewerId, setReviewerId] = useState("");

  const members = (data?.members ?? []) as Array<{
    userId: string;
    user: { name: string | null; email: string };
  }>;
  const steps = (data?.policy?.steps ?? []) as Array<{
    id: string;
    stepIndex: number;
    stepRole: "TECHNICAL" | "FINAL";
    reviewer: { id: string; name: string | null; email: string };
  }>;

  const savePolicy = useMutation({
    mutationFn: async (
      nextSteps: Array<{ reviewerId: string; stepRole: "TECHNICAL" | "FINAL" }>
    ) => {
      const res = await fetch("/api/approval-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: nextSteps }),
      });
      await assertOk(res);
    },
    onSuccess: () => {
      setReviewerId("");
      qc.invalidateQueries({ queryKey: ["approval-policy"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({
        title: locale === "ar" ? "تم تحديث سلسلة الاعتماد" : "Approval chain updated",
      });
    },
    onError: (err) => {
      toast({
        title: apiErrorMessage(
          err,
          locale === "ar" ? "تعذر تحديث سلسلة الاعتماد" : "Could not update approval chain"
        ),
        variant: "destructive",
      });
    },
  });

  const persistReviewerIds = (reviewerIds: string[]) => {
    savePolicy.mutate(
      reviewerIds.map((id, i, arr) => ({
        reviewerId: id,
        stepRole: i === arr.length - 1 ? "FINAL" : "TECHNICAL",
      }))
    );
  };

  return (
    <Panel icon={GitBranch} title={locale === "ar" ? "سلسلة الاعتماد" : "Approval chain"}>
      <div className="p-4 space-y-3">
        {steps.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title={locale === "ar" ? "لا توجد خطوات اعتماد" : "No approval steps"}
            description={
              locale === "ar"
                ? "اختر مراجعاً لإضافة أول خطوة في السلسلة."
                : "Select a reviewer to add the first step in the chain."
            }
            className="rounded-md border border-dashed"
          />
        ) : (
          <ol className="space-y-2 text-sm">
            {steps.map((s, index) => {
              const reviewerIds = steps.map((step) => step.reviewer.id);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                >
                  <span>
                    {index + 1}. {s.reviewer.name ?? s.reviewer.email} ({s.stepRole}) —{" "}
                    {s.reviewer.email}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const next = [...reviewerIds];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        persistReviewerIds(next);
                      }}
                      disabled={index === 0 || savePolicy.isPending}
                      aria-label={locale === "ar" ? "تحريك للأعلى" : "Move up"}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        const next = [...reviewerIds];
                        [next[index], next[index + 1]] = [next[index + 1], next[index]];
                        persistReviewerIds(next);
                      }}
                      disabled={index === steps.length - 1 || savePolicy.isPending}
                      aria-label={locale === "ar" ? "تحريك للأسفل" : "Move down"}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        persistReviewerIds(reviewerIds.filter((_, i) => i !== index))
                      }
                      disabled={savePolicy.isPending}
                      aria-label={locale === "ar" ? "حذف الخطوة" : "Delete step"}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex gap-2">
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background flex-1"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
          >
            <option value="">{locale === "ar" ? "اختر مراجعاً" : "Select reviewer"}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name ?? m.user.email} ({m.user.email})
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              if (!reviewerId) return;
              persistReviewerIds([...steps.map((s) => s.reviewer.id), reviewerId]);
            }}
            disabled={!reviewerId || savePolicy.isPending}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function RestrictionsPanel() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [type, setType] = useState("COMPETITOR_NAME");

  const { data } = useQuery({
    queryKey: ["restrictions"],
    queryFn: async () => (await fetch("/api/restrictions")).json(),
  });

  return (
    <Panel icon={AlertTriangle} title={locale === "ar" ? "القيود والحساسيات" : "Restrictions & sensitivities"}>
      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {["COMPETITOR_NAME", "CONFIDENTIAL_CLAUSE", "OTHER"].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text" />
          <Button
            onClick={async () => {
              await fetch("/api/restrictions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ restrictionType: type, text }),
              });
              setText("");
              qc.invalidateQueries({ queryKey: ["restrictions"] });
            }}
            disabled={!text}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        <ul className="text-sm space-y-1">
          {(data?.items ?? []).map((r: { id: string; restrictionType: string; text: string }) => (
            <li key={r.id}>
              <Badge variant="outline" className="me-2">{r.restrictionType}</Badge>
              {r.text}
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          onClick={async () => {
            await fetch("/api/onboarding", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ restrictionsReviewed: true }),
            });
            qc.invalidateQueries({ queryKey: ["onboarding"] });
          }}
        >
          <CheckCircle2 className="size-4 me-1" />
          {locale === "ar" ? "تم مراجعة القيود" : "Mark restrictions reviewed"}
        </Button>
      </div>
    </Panel>
  );
}
