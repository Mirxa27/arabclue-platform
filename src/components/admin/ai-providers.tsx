"use client";

import { useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Cpu,
  Plus,
  Trash2,
  Check,
  Loader2,
  Thermometer,
  Hash,
  ShieldAlert,
  Activity,
  Zap,
  Save,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function AdminAIProviders() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-providers");
      return res.json();
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      toast({ title: locale === "ar" ? "تم تفعيل المزود" : "Provider activated" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/admin/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      setEditing(null);
      toast({ title: locale === "ar" ? "تم الحفظ" : "Saved" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai-providers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      toast({ title: locale === "ar" ? "تم الحذف" : "Deleted" });
    },
  });

  const providers = data?.providers ?? [];
  const presets = data?.presets ?? [];
  const active = providers.find((p: any) => p.isActive);

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <Cpu className="size-4 text-chart-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("admin_ai_providers", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar" ? "تبديل وتكوين نماذج اللغة" : "Switch & configure language models"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 text-[10px]">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {active.name}
            </Badge>
          )}
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-[11px]">
                <Plus className="size-3" />
                {tr("admin_add_provider", locale)}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{tr("admin_add_provider", locale)}</DialogTitle>
              </DialogHeader>
              <AddProviderForm
                presets={presets}
                onAdded={() => {
                  setShowAdd(false);
                  qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Provider cards */}
      <div className="p-4 space-y-3 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : (
          providers.map((p: any) => (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border p-4 transition-all",
                p.isActive
                  ? "border-emerald-500/40 bg-emerald-500/5 shadow-sm"
                  : "border-border/60 hover:border-primary/30"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "size-10 rounded-lg flex items-center justify-center shrink-0",
                      p.isActive ? "bg-emerald-500/15" : "bg-muted"
                    )}
                  >
                    <Cpu className={cn("size-5", p.isActive ? "text-emerald-600" : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{p.name}</span>
                      {p.isActive && (
                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-0.5">
                          <Check className="size-2.5" /> ACTIVE
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {p.provider} · {p.modelId}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!p.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => activateMutation.mutate(p.id)}
                      disabled={activateMutation.isPending}
                    >
                      <Zap className="size-2.5" />
                      {tr("admin_activate", locale)}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px]"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                  >
                    {editing === p.id ? (locale === "ar" ? "إغلاق" : "Close") : (locale === "ar" ? "تعديل" : "Edit")}
                  </Button>
                  {!p.isActive && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 hover:text-destructive"
                      onClick={() => deleteMutation.mutate(p.id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <Stat icon={Thermometer} label={tr("admin_temperature", locale)} value={p.temperature} color="text-chart-4" />
                <Stat icon={Hash} label={tr("admin_max_tokens", locale)} value={p.maxTokens} color="text-chart-2" />
                <Stat icon={Activity} label={tr("admin_confidence", locale)} value={`${(p.confidenceThreshold * 100).toFixed(0)}%`} color="text-emerald-600" />
                <Stat icon={ShieldAlert} label={locale === "ar" ? "الحواجز" : "Guardrails"} value={`${[p.toxicityFilter, p.piiFilter, p.hallucinationGuard].filter(Boolean).length}/3`} color="text-chart-5" />
              </div>

              {/* Cost */}
              <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="font-mono">
                  {locale === "ar" ? "تكلفة:" : "Cost:"} {p.inputCostPer1k.toFixed(3)}/{p.outputCostPer1k.toFixed(3)} SAR/1k tok
                </span>
              </div>

              {/* Edit form */}
              {editing === p.id && (
                <ProviderEditForm
                  provider={p}
                  onSave={(data) => updateMutation.mutate({ id: p.id, data })}
                  saving={updateMutation.isPending}
                />
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof Cpu; label: string; value: any; color: string }) {
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/30">
      <Icon className={cn("size-3 shrink-0", color)} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[8px] text-muted-foreground leading-none mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

function ProviderEditForm({ provider, onSave, saving }: { provider: any; onSave: (data: any) => void; saving: boolean }) {
  const { locale } = useLocale();
  const [form, setForm] = useState({
    temperature: provider.temperature,
    maxTokens: provider.maxTokens,
    topP: provider.topP,
    confidenceThreshold: provider.confidenceThreshold,
    toxicityFilter: provider.toxicityFilter,
    piiFilter: provider.piiFilter,
    hallucinationGuard: provider.hallucinationGuard,
    maxRetries: provider.maxRetries,
    timeoutMs: provider.timeoutMs,
    inputCostPer1k: provider.inputCostPer1k,
    outputCostPer1k: provider.outputCostPer1k,
  });

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] flex items-center gap-1">
            <Thermometer className="size-2.5" /> {tr("admin_temperature", locale)}: <span className="font-mono">{form.temperature.toFixed(2)}</span>
          </Label>
          <Slider value={[form.temperature]} min={0} max={2} step={0.05} onValueChange={([v]) => setForm({ ...form, temperature: v })} className="mt-2" />
        </div>
        <div>
          <Label className="text-[10px] flex items-center gap-1">
            <Activity className="size-2.5" /> {tr("admin_confidence", locale)}: <span className="font-mono">{(form.confidenceThreshold * 100).toFixed(0)}%</span>
          </Label>
          <Slider value={[form.confidenceThreshold]} min={0.5} max={1} step={0.01} onValueChange={([v]) => setForm({ ...form, confidenceThreshold: v })} className="mt-2" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">{tr("admin_max_tokens", locale)}</Label>
          <Input
            type="number"
            value={form.maxTokens}
            onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) })}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">top_p</Label>
          <Input
            type="number"
            step="0.05"
            value={form.topP}
            onChange={(e) => setForm({ ...form, topP: Number(e.target.value) })}
            className="h-8 text-xs mt-1"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px] flex items-center gap-1 mb-2">
          <ShieldAlert className="size-2.5" /> {tr("admin_guardrails", locale)}
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <GuardrailToggle label={tr("admin_toxicity", locale)} checked={form.toxicityFilter} onChange={(v) => setForm({ ...form, toxicityFilter: v })} />
          <GuardrailToggle label={tr("admin_pii", locale)} checked={form.piiFilter} onChange={(v) => setForm({ ...form, piiFilter: v })} />
          <GuardrailToggle label={tr("admin_hallucination", locale)} checked={form.hallucinationGuard} onChange={(v) => setForm({ ...form, hallucinationGuard: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">{locale === "ar" ? "تكلفة الإدخال/1k" : "Input Cost / 1k (SAR)"}</Label>
          <Input type="number" step="0.001" value={form.inputCostPer1k} onChange={(e) => setForm({ ...form, inputCostPer1k: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-[10px]">{locale === "ar" ? "تكلفة الإخراج/1k" : "Output Cost / 1k (SAR)"}</Label>
          <Input type="number" step="0.001" value={form.outputCostPer1k} onChange={(e) => setForm({ ...form, outputCostPer1k: Number(e.target.value) })} className="h-8 text-xs mt-1" />
        </div>
      </div>

      <Button size="sm" className="w-full gap-1.5" onClick={() => onSave(form)} disabled={saving}>
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        {tr("action_save", locale)}
      </Button>
    </div>
  );
}

function GuardrailToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md border border-border/60 bg-background">
      <span className="text-[10px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}

function AddProviderForm({ presets, onAdded }: { presets: any[]; onAdded: () => void }) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [form, setForm] = useState({
    name: presets[0]?.name ?? "",
    provider: presets[0]?.provider ?? "zai",
    modelId: presets[0]?.modelId ?? "",
    apiBase: presets[0]?.apiBase ?? "",
    temperature: presets[0]?.temperature ?? 0.2,
    maxTokens: presets[0]?.maxTokens ?? 4096,
  });

  const create = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/admin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: locale === "ar" ? "تمت الإضافة" : "Provider added" });
      onAdded();
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs mb-1.5 block">{locale === "ar" ? "اختر قالباً" : "Choose a preset"}</Label>
        <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
          {presets.map((p, i) => (
            <button
              key={p.name}
              onClick={() => {
                setSelectedPreset(i);
                setForm({ name: p.name, provider: p.provider, modelId: p.modelId, apiBase: p.apiBase, temperature: p.temperature, maxTokens: p.maxTokens });
              }}
              className={cn(
                "flex items-center justify-between p-2 rounded-md border text-xs text-start",
                selectedPreset === i ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              )}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{p.modelId}</span>
            </button>
          ))}
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">{locale === "ar" ? "الاسم" : "Name"}</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <Label className="text-[10px]">Model ID</Label>
          <Input value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })} className="h-8 text-xs mt-1" />
        </div>
      </div>
      <Button size="sm" className="w-full gap-1.5" onClick={() => create.mutate(form)} disabled={create.isPending}>
        {create.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        {locale === "ar" ? "إضافة المزود" : "Add Provider"}
      </Button>
    </div>
  );
}
