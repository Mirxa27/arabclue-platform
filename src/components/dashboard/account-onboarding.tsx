"use client";

import { useState } from "react";
import { useLocale, useUI } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
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
import { Panel } from "@/components/patterns";

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
  const [certType, setCertType] = useState("ISO");
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
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      toast({ title: locale === "ar" ? "تم الحفظ" : "Saved" });
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
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      setCertName("");
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  const delCert = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/certificates?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificates"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Panel icon={Shield} title={locale === "ar" ? "السجل التجاري والضريبة" : "CR & VAT"}>
        <div className="space-y-3 p-4">
          <div>
            <Label>CR</Label>
            <Input value={cr} onChange={(e) => setCr(e.target.value)} />
          </div>
          <div>
            <Label>VAT</Label>
            <Input value={vat} onChange={(e) => setVat(e.target.value)} />
          </div>
          <Button onClick={() => saveLegal.mutate()} disabled={saveLegal.isPending}>
            {locale === "ar" ? "حفظ" : "Save"}
          </Button>
        </div>
      </Panel>
      <Panel icon={Shield} title={locale === "ar" ? "الشهادات والتراخيص" : "Certificates & licenses"}>
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Name" value={certName} onChange={(e) => setCertName(e.target.value)} />
            <select
              className="border rounded-md h-9 px-2 text-sm bg-background"
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
            >
              {["ISO", "GOSI", "VAT", "ZAKAT", "LICENSE", "OTHER"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            <Button onClick={() => addCert.mutate()} disabled={!certName || addCert.isPending}>
              <Plus className="size-4" />
            </Button>
          </div>
          <Separator />
          <ul className="space-y-2">
            {(data?.items ?? []).map((c: { id: string; name: string; certType: string; expiresAt?: string }) => (
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
                <Button size="icon" variant="ghost" onClick={() => delCert.mutate(c.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}

function StaffPanel() {
  const { locale } = useLocale();
  const qc = useQueryClient();
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
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      setName("");
      setRoleTitle("");
      setTags("");
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/staff?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

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
        <ul className="space-y-2">
          {(data?.items ?? []).map((s: { id: string; name: string; roleTitle: string }) => (
            <li key={s.id} className="flex justify-between text-sm">
              <span>{s.name} — {s.roleTitle}</span>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(s.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
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
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      setForm({});
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });

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
        <ul className="space-y-2">
          {(data?.items ?? []).map((item: { id: string; title?: string; name?: string }) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span>{item.title ?? item.name}</span>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(item.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
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
  const { data } = useQuery({
    queryKey: ["approval-policy"],
    queryFn: async () => (await fetch("/api/approval-policy")).json(),
  });
  const [reviewerId, setReviewerId] = useState("");

  const members = data?.members ?? [];
  const steps = data?.policy?.steps ?? [];

  return (
    <Panel icon={GitBranch} title={locale === "ar" ? "سلسلة الاعتماد" : "Approval chain"}>
      <div className="p-4 space-y-3">
        <ol className="space-y-2 text-sm">
          {steps.map((s: { id: string; stepIndex: number; stepRole: string; reviewer: { name: string; email: string } }) => (
            <li key={s.id}>
              {s.stepIndex + 1}. {s.reviewer.name} ({s.stepRole}) — {s.reviewer.email}
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <select
            className="border rounded-md h-9 px-2 text-sm bg-background flex-1"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
          >
            <option value="">{locale === "ar" ? "اختر مراجعاً" : "Select reviewer"}</option>
            {members.map((m: { userId: string; user: { name: string; email: string } }) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name} ({m.user.email})
              </option>
            ))}
          </select>
          <Button
            onClick={async () => {
              if (!reviewerId) return;
              const payload = {
                steps: [
                  ...steps.map((s: { reviewer: { id: string } }) => ({
                    reviewerId: s.reviewer.id,
                    stepRole: "TECHNICAL" as const,
                  })),
                  { reviewerId, stepRole: "FINAL" as const },
                ].map((s, i, arr) => ({
                  ...s,
                  stepRole: (i === arr.length - 1 ? "FINAL" : "TECHNICAL") as
                    | "FINAL"
                    | "TECHNICAL",
                })),
              };
              await fetch("/api/approval-policy", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              setReviewerId("");
              qc.invalidateQueries({ queryKey: ["approval-policy"] });
              qc.invalidateQueries({ queryKey: ["onboarding"] });
            }}
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
