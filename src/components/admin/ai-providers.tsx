"use client";

import { useEffect, useMemo, useState } from "react";
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
  Eye,
  RefreshCw,
  Layers,
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ApiAIProvider, ProviderPatch } from "@/lib/api-types";

type EngineMeta = { id: string; label: { en: string; ar: string } };
type Preset = Record<string, string | number | boolean | null>;
type RemoteModel = {
  id: string;
  contextWindow: number;
  maxTokens: number;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsTools: boolean;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
};

export function AdminAIProviders() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [engineFilter, setEngineFilter] = useState<string>("ALL");
  const [refreshingAll, setRefreshingAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-ai-providers"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai-providers");
      if (!res.ok) throw new Error("failed");
      return res.json() as Promise<{
        providers: ApiAIProvider[];
        presets: Preset[];
        engines: EngineMeta[];
        providerTypes: string[];
        activeByEngine: Record<string, string | null>;
      }>;
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai-providers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "failed");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      toast({
        title:
          locale === "ar"
            ? "تم تفعيل المزود لهذا المحرك"
            : "Provider activated for engine",
      });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل" : "Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProviderPatch }) => {
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
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الحفظ" : "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai-providers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "failed");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      toast({ title: locale === "ar" ? "تم الحذف" : "Deleted" });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الحذف" : "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const providers: ApiAIProvider[] = data?.providers ?? [];
  const presets = data?.presets ?? [];
  const engines = data?.engines ?? [];
  const activeByEngine = data?.activeByEngine ?? {};

  const filtered = useMemo(() => {
    if (engineFilter === "ALL") return providers;
    return providers.filter((p) => (p.engine || "DEFAULT") === engineFilter);
  }, [providers, engineFilter]);

  const activeCount = Object.values(activeByEngine).filter(Boolean).length;

  const refreshAllModels = async () => {
    setRefreshingAll(true);
    try {
      const res = await fetch("/api/admin/ai-providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshAll: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "refresh failed");
      qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
      toast({
        title:
          locale === "ar"
            ? `تم تحديث ${data.okCount} اتصال`
            : `Refreshed ${data.okCount} connection(s)`,
        description:
          data.failCount > 0
            ? locale === "ar"
              ? `${data.failCount} فشل — تحقق من المفاتيح و API Base`
              : `${data.failCount} failed — check API keys and base URLs`
            : undefined,
        variant: data.failCount > 0 ? "destructive" : "default",
      });
    } catch (err) {
      toast({
        title: locale === "ar" ? "فشل التحديث" : "Refresh failed",
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setRefreshingAll(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-1/10 flex items-center justify-center">
            <Cpu className="size-4 text-chart-1" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {tr("admin_ai_providers", locale)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar"
                ? "مزودات متعددة لكل محرك · OpenAI-compatible · جلب النماذج تلقائياً"
                : "Multiple providers per engine · OpenAI-compatible · auto-fetch models"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 text-[10px]"
          >
            <Layers className="size-3" />
            {activeCount}{" "}
            {locale === "ar" ? "محركات مفعّلة" : "engines active"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[11px]"
            onClick={refreshAllModels}
            disabled={refreshingAll || providers.length === 0}
          >
            {refreshingAll ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {locale === "ar" ? "تحديث كل النماذج" : "Refresh all models"}
          </Button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-[11px]"
              >
                <Plus className="size-3" />
                {tr("admin_add_provider", locale)}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{tr("admin_add_provider", locale)}</DialogTitle>
                <DialogDescription>
                  {locale === "ar"
                    ? "أضف اتصال مزود ذكاء اصطناعي. للمكالمات الصوتية المباشرة اختر محرك «الصوت المباشر»."
                    : "Add an AI provider connection. For speech-to-speech, choose the Voice live engine."}
                </DialogDescription>
              </DialogHeader>
              <AddProviderForm
                presets={presets}
                engines={engines}
                defaultEngine={
                  engineFilter === "ALL" ? "DEFAULT" : engineFilter
                }
                onAdded={() => {
                  setShowAdd(false);
                  qc.invalidateQueries({ queryKey: ["admin-ai-providers"] });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Engine filter tabs */}
      <div className="flex flex-wrap gap-1.5 px-4 py-3 border-b border-border/40 bg-muted/10">
        <EngineChip
          active={engineFilter === "ALL"}
          onClick={() => setEngineFilter("ALL")}
          label={locale === "ar" ? "الكل" : "All"}
        />
        {engines.map((e) => (
          <EngineChip
            key={e.id}
            active={engineFilter === e.id}
            onClick={() => setEngineFilter(e.id)}
            label={locale === "ar" ? e.label.ar : e.label.en}
            activeProvider={Boolean(activeByEngine[e.id])}
          />
        ))}
      </div>

      <div className="p-4 space-y-3 max-h-[36rem] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            {locale === "ar"
              ? "لا توجد مزودات لهذا المحرك — أضف مزوداً"
              : "No providers for this engine — add one"}
          </div>
        ) : (
          filtered.map((p) => (
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
                    <Cpu
                      className={cn(
                        "size-5",
                        p.isActive
                          ? "text-emerald-600"
                          : "text-muted-foreground"
                      )}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">
                        {p.name}
                      </span>
                      {p.isActive && (
                        <Badge
                          variant="outline"
                          className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-0.5"
                        >
                          <Check className="size-2.5" /> ACTIVE
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[9px]">
                        {p.engine || "DEFAULT"}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {p.provider} · {p.modelId || (locale === "ar" ? "بدون نموذج" : "no model")}
                      {p.apiBase ? ` · ${p.apiBase}` : ""}
                      {p.modelsFetchedAt
                        ? ` · fetched ${new Date(p.modelsFetchedAt).toLocaleString()}`
                        : ""}
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
                      disabled={
                        activateMutation.isPending || !p.modelId?.trim()
                      }
                      title={
                        !p.modelId?.trim()
                          ? locale === "ar"
                            ? "اختر نموذجاً أولاً"
                            : "Select a model first"
                          : undefined
                      }
                    >
                      <Zap className="size-2.5" />
                      {tr("admin_activate", locale)}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[10px]"
                    onClick={() =>
                      setEditing(editing === p.id ? null : p.id)
                    }
                  >
                    {editing === p.id
                      ? locale === "ar"
                        ? "إغلاق"
                        : "Close"
                      : locale === "ar"
                        ? "تعديل"
                        : "Edit"}
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
                <Stat
                  icon={Hash}
                  label={locale === "ar" ? "سياق" : "Context"}
                  value={formatTokens(p.contextWindow ?? 128000)}
                  color="text-chart-1"
                />
                <Stat
                  icon={Thermometer}
                  label={tr("admin_temperature", locale)}
                  value={p.temperature}
                  color="text-chart-4"
                />
                <Stat
                  icon={Hash}
                  label={tr("admin_max_tokens", locale)}
                  value={p.maxTokens}
                  color="text-chart-2"
                />
                <Stat
                  icon={Eye}
                  label={locale === "ar" ? "رؤية" : "Vision"}
                  value={p.supportsVision ? "Yes" : "No"}
                  color="text-chart-3"
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-mono">
                  {locale === "ar" ? "تكلفة:" : "Cost:"}{" "}
                  {(p.inputCostPer1k ?? 0).toFixed(3)}/
                  {(p.outputCostPer1k ?? 0).toFixed(3)} SAR/1k
                </span>
                {p.supportsJsonMode && (
                  <Badge variant="outline" className="text-[9px]">
                    JSON
                  </Badge>
                )}
                {p.supportsTools && (
                  <Badge variant="outline" className="text-[9px]">
                    Tools
                  </Badge>
                )}
                <Stat
                  icon={ShieldAlert}
                  label={locale === "ar" ? "حواجز" : "Guardrails"}
                  value={`${[p.toxicityFilter, p.piiFilter, p.hallucinationGuard].filter(Boolean).length}/3`}
                  color="text-chart-5"
                />
              </div>

              {editing === p.id && (
                <ProviderEditForm
                  provider={p}
                  engines={engines}
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

function EngineChip({
  active,
  onClick,
  label,
  activeProvider,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeProvider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md text-[10px] border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background border-border/60 hover:border-primary/40 text-muted-foreground"
      )}
    >
      {label}
      {activeProvider && !active && (
        <span className="ms-1 inline-block size-1.5 rounded-full bg-emerald-500" />
      )}
    </button>
  );
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Cpu;
  label: string;
  value: string | number | boolean | null | undefined;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/30">
      <Icon className={cn("size-3 shrink-0", color)} />
      <div className="min-w-0">
        <div className="text-[11px] font-bold tabular-nums leading-none">
          {value}
        </div>
        <div className="text-[8px] text-muted-foreground leading-none mt-0.5 truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

function ProviderEditForm({
  provider,
  engines,
  onSave,
  saving,
}: {
  provider: ApiAIProvider;
  engines: EngineMeta[];
  onSave: (data: ProviderPatch) => void;
  saving: boolean;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [form, setForm] = useState({
    name: provider.name,
    modelId: provider.modelId ?? "",
    apiBase: provider.apiBase ?? "",
    apiKeyEnvKey: provider.apiKeyEnvKey ?? "",
    engine: provider.engine ?? "DEFAULT",
    priority: provider.priority ?? 0,
    contextWindow: provider.contextWindow ?? 128000,
    supportsVision: provider.supportsVision ?? false,
    supportsJsonMode: provider.supportsJsonMode ?? true,
    supportsTools: provider.supportsTools ?? false,
    temperature: provider.temperature ?? 0.2,
    maxTokens: provider.maxTokens ?? 4096,
    topP: provider.topP ?? 0.9,
    confidenceThreshold: provider.confidenceThreshold ?? 0.85,
    toxicityFilter: provider.toxicityFilter ?? true,
    piiFilter: provider.piiFilter ?? true,
    hallucinationGuard: provider.hallucinationGuard ?? true,
    maxRetries: provider.maxRetries ?? 2,
    timeoutMs: provider.timeoutMs ?? 60000,
    inputCostPer1k: provider.inputCostPer1k ?? 0,
    outputCostPer1k: provider.outputCostPer1k ?? 0,
  });

  const applyModelCaps = (m: RemoteModel) => {
    setForm((f) => ({
      ...f,
      modelId: m.id,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      supportsVision: m.supportsVision,
      supportsJsonMode: m.supportsJsonMode,
      supportsTools: m.supportsTools,
      inputCostPer1k: m.inputCostPer1k ?? f.inputCostPer1k,
      outputCostPer1k: m.outputCostPer1k ?? f.outputCostPer1k,
    }));
  };

  const [fetchedAt, setFetchedAt] = useState<string | null>(
    provider.modelsFetchedAt ?? null
  );

  const fetchModels = async (opts?: { preferCache?: boolean }) => {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/admin/ai-providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: provider.id,
          provider: provider.provider,
          apiBase: form.apiBase,
          apiKeyEnvKey: form.apiKeyEnvKey,
          cachedOnly: opts?.preferCache === true,
        }),
      });
      const data = await res.json();
      if (!res.ok && !(data.models?.length > 0)) {
        throw new Error(data.error || "fetch failed");
      }
      setModels(data.models ?? []);
      if (data.fetchedAt) setFetchedAt(data.fetchedAt);
      if (data.warning) {
        toast({
          title: locale === "ar" ? "قائمة مخزّنة" : "Using cached list",
          description: data.warning,
        });
      } else if (!opts?.preferCache) {
        toast({
          title:
            locale === "ar"
              ? `تم جلب ${data.models?.length ?? 0} نموذج`
              : `Fetched ${data.models?.length ?? 0} models`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: locale === "ar" ? "فشل جلب النماذج" : "Model fetch failed",
        description:
          msg ||
          (locale === "ar"
            ? "تحقق من مفتاح API في إعدادات البيئة"
            : "Check the API key in Environment settings"),
        variant: "destructive",
      });
    } finally {
      setFetchingModels(false);
    }
  };

  // Load cached models only — live fetch is explicit (avoids console noise on expand)
  useEffect(() => {
    if (provider.modelsCache?.length) {
      setModels(provider.modelsCache as RemoteModel[]);
    }
    if (provider.modelsFetchedAt) {
      setFetchedAt(provider.modelsFetchedAt);
    }
    void fetchModels({ preferCache: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "الاسم" : "Name"}
          </Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "المحرك" : "Engine"}
          </Label>
          <Select
            value={form.engine}
            onValueChange={(v) => setForm({ ...form, engine: v })}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {engines.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {locale === "ar" ? e.label.ar : e.label.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">API Base URL</Label>
          <Input
            value={form.apiBase}
            onChange={(e) => setForm({ ...form, apiBase: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px]">API Key Env Key</Label>
          <Input
            value={form.apiKeyEnvKey}
            onChange={(e) =>
              setForm({ ...form, apiKeyEnvKey: e.target.value })
            }
            placeholder="OPENAI_API_KEY"
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-[10px]">
            Model ID{" "}
            {fetchedAt && (
              <span className="text-muted-foreground font-normal">
                · {locale === "ar" ? "آخر جلب" : "last fetch"}{" "}
                {new Date(fetchedAt).toLocaleString()}
              </span>
            )}
          </Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] gap-1"
            onClick={() => fetchModels({ preferCache: false })}
            disabled={fetchingModels}
          >
            {fetchingModels ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {locale === "ar" ? "تحديث النماذج" : "Refresh models"}
          </Button>
        </div>
        {models.length > 0 ? (
          <Select
            value={form.modelId.trim() ? form.modelId : "__none__"}
            onValueChange={(id) => {
              if (id === "__none__") return;
              const m = models.find((x) => x.id === id);
              if (m) applyModelCaps(m);
              else setForm({ ...form, modelId: id });
            }}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue
                placeholder={
                  locale === "ar" ? "اختر نموذجاً من القائمة" : "Select from live list"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="__none__" disabled className="hidden">
                {locale === "ar" ? "اختر نموذجاً" : "Select a model"}
              </SelectItem>
              {form.modelId && !models.some((m) => m.id === form.modelId) ? (
                <SelectItem
                  value={form.modelId}
                  className="text-xs font-mono"
                >
                  {form.modelId}{" "}
                  <span className="text-muted-foreground">
                    ({locale === "ar" ? "محدد سابقاً" : "previously selected"})
                  </span>
                </SelectItem>
              ) : null}
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                  {m.id}
                  {m.supportsVision ? " · vision" : ""}
                  {/embed/i.test(m.id) ? " · embed" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-2 space-y-1">
            {form.modelId ? (
              <p className="text-[10px] font-mono text-muted-foreground">
                {locale === "ar" ? "المحدد سابقاً:" : "Previously selected:"}{" "}
                {form.modelId}
              </p>
            ) : null}
            <p className="text-[10px] text-muted-foreground">
              {locale === "ar"
                ? "لا توجد قائمة ثابتة — اضبط المفتاح و API Base ثم اضغط «تحديث النماذج»."
                : "No static catalog — set API key and base URL, then Refresh models."}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "نافذة السياق" : "Context window"}
          </Label>
          <Input
            type="number"
            value={form.contextWindow}
            onChange={(e) =>
              setForm({ ...form, contextWindow: Number(e.target.value) })
            }
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">Priority</Label>
          <Input
            type="number"
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: Number(e.target.value) })
            }
            className="h-8 text-xs mt-1"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <GuardrailToggle
          label={locale === "ar" ? "رؤية" : "Vision"}
          checked={form.supportsVision}
          onChange={(v) => setForm({ ...form, supportsVision: v })}
        />
        <GuardrailToggle
          label="JSON mode"
          checked={form.supportsJsonMode}
          onChange={(v) => setForm({ ...form, supportsJsonMode: v })}
        />
        <GuardrailToggle
          label="Tools"
          checked={form.supportsTools}
          onChange={(v) => setForm({ ...form, supportsTools: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] flex items-center gap-1">
            <Thermometer className="size-2.5" />{" "}
            {tr("admin_temperature", locale)}:{" "}
            <span className="font-mono">{form.temperature.toFixed(2)}</span>
          </Label>
          <Slider
            value={[form.temperature]}
            min={0}
            max={2}
            step={0.05}
            onValueChange={([v]) => setForm({ ...form, temperature: v })}
            className="mt-2"
          />
        </div>
        <div>
          <Label className="text-[10px] flex items-center gap-1">
            <Activity className="size-2.5" /> {tr("admin_confidence", locale)}:{" "}
            <span className="font-mono">
              {(form.confidenceThreshold * 100).toFixed(0)}%
            </span>
          </Label>
          <Slider
            value={[form.confidenceThreshold]}
            min={0.5}
            max={1}
            step={0.01}
            onValueChange={([v]) =>
              setForm({ ...form, confidenceThreshold: v })
            }
            className="mt-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">{tr("admin_max_tokens", locale)}</Label>
          <Input
            type="number"
            value={form.maxTokens}
            onChange={(e) =>
              setForm({ ...form, maxTokens: Number(e.target.value) })
            }
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
          <GuardrailToggle
            label={tr("admin_toxicity", locale)}
            checked={form.toxicityFilter}
            onChange={(v) => setForm({ ...form, toxicityFilter: v })}
          />
          <GuardrailToggle
            label={tr("admin_pii", locale)}
            checked={form.piiFilter}
            onChange={(v) => setForm({ ...form, piiFilter: v })}
          />
          <GuardrailToggle
            label={tr("admin_hallucination", locale)}
            checked={form.hallucinationGuard}
            onChange={(v) => setForm({ ...form, hallucinationGuard: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "تكلفة الإدخال/1k" : "Input Cost / 1k (SAR)"}
          </Label>
          <Input
            type="number"
            step="0.001"
            value={form.inputCostPer1k}
            onChange={(e) =>
              setForm({ ...form, inputCostPer1k: Number(e.target.value) })
            }
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "تكلفة الإخراج/1k" : "Output Cost / 1k (SAR)"}
          </Label>
          <Input
            type="number"
            step="0.001"
            value={form.outputCostPer1k}
            onChange={(e) =>
              setForm({ ...form, outputCostPer1k: Number(e.target.value) })
            }
            className="h-8 text-xs mt-1"
          />
        </div>
      </div>

      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={() => onSave(form)}
        disabled={saving}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Save className="size-3.5" />
        )}
        {tr("action_save", locale)}
      </Button>
    </div>
  );
}

function GuardrailToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-2 rounded-md border border-border/60 bg-background">
      <span className="text-[10px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}

function AddProviderForm({
  presets,
  engines,
  defaultEngine,
  onAdded,
}: {
  presets: Preset[];
  engines: EngineMeta[];
  defaultEngine: string;
  onAdded: () => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [modelsFetchedAt, setModelsFetchedAt] = useState<string | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  const applyPreset = (p: Preset, engineOverride?: string) => ({
    name: String(p.name ?? ""),
    provider: String(p.provider ?? "openai_compatible"),
    modelId: "",
    apiBase: String(p.apiBase ?? ""),
    apiKeyEnvKey: String(p.apiKeyEnvKey ?? ""),
    engine: engineOverride ?? String(p.engine ?? defaultEngine),
    temperature: 0.2,
    maxTokens: 4096,
    contextWindow: 128000,
    supportsVision: false,
    supportsJsonMode: true,
    supportsTools: false,
    inputCostPer1k: 0,
    outputCostPer1k: 0,
    isActive: false,
  });

  const [form, setForm] = useState(() =>
    applyPreset(presets[0] ?? {}, defaultEngine)
  );

  const applyModelCaps = (m: RemoteModel) => {
    setForm((f) => ({
      ...f,
      modelId: m.id,
      contextWindow: m.contextWindow,
      maxTokens: m.maxTokens,
      supportsVision: m.supportsVision,
      supportsJsonMode: m.supportsJsonMode,
      supportsTools: m.supportsTools,
      inputCostPer1k: m.inputCostPer1k ?? f.inputCostPer1k,
      outputCostPer1k: m.outputCostPer1k ?? f.outputCostPer1k,
    }));
  };

  const fetchModels = async () => {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/admin/ai-providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          apiBase: form.apiBase,
          apiKeyEnvKey: form.apiKeyEnvKey,
          engine: form.engine,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "fetch failed");
      setModels(data.models ?? []);
      setModelsFetchedAt(data.fetchedAt ?? new Date().toISOString());
      setForm((f) => ({ ...f, modelId: "" }));
      toast({
        title:
          locale === "ar"
            ? `تم جلب ${data.models?.length ?? 0} نموذج`
            : `Fetched ${data.models?.length ?? 0} models`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: locale === "ar" ? "فشل جلب النماذج" : "Model fetch failed",
        description:
          msg ||
          (locale === "ar"
            ? "تحقق من مفتاح API في إعدادات البيئة"
            : "Check the API key in Environment settings"),
        variant: "destructive",
      });
    } finally {
      setFetchingModels(false);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (form.isActive && !form.modelId.trim()) {
        throw new Error(
          locale === "ar"
            ? "جلب النماذج واختر نموذجاً قبل التفعيل"
            : "Fetch models and select one before activating"
        );
      }
      const res = await fetch("/api/admin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          modelsCache: models,
          modelsFetchedAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: locale === "ar" ? "تمت الإضافة" : "Provider added" });
      onAdded();
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل" : "Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs mb-1.5 block">
          {locale === "ar" ? "قالب اتصال (بدون نماذج ثابتة)" : "Connection template (no fixed models)"}
        </Label>
        <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto scrollbar-thin">
          {presets.map((p, i) => (
            <button
              key={String(p.name ?? i)}
              type="button"
              onClick={() => {
                setSelectedPreset(i);
                setModels([]);
                setModelsFetchedAt(null);
                setForm(applyPreset(p, defaultEngine));
              }}
              className={cn(
                "flex items-center justify-between p-2 rounded-md border text-xs text-start",
                selectedPreset === i
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <span className="font-medium">{String(p.name ?? "")}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {String(p.provider)}
                {p.apiBase ? ` · ${String(p.apiBase)}` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "الاسم" : "Name"}
          </Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "المحرك" : "Engine"}
          </Label>
          <Select
            value={form.engine}
            onValueChange={(v) => setForm({ ...form, engine: v })}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {engines.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {locale === "ar" ? e.label.ar : e.label.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Provider type</Label>
          <Select
            value={form.provider}
            onValueChange={(v) => setForm({ ...form, provider: v })}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "openai",
                "openai_compatible",
                "ollama",
                "azure_openai",
                "anthropic",
                "mistral",
                "zai",
              ].map((t) => (
                <SelectItem key={t} value={t} className="text-xs font-mono">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px]">API Key Env Key</Label>
          <Input
            value={form.apiKeyEnvKey}
            onChange={(e) =>
              setForm({ ...form, apiKeyEnvKey: e.target.value })
            }
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px]">API Base URL</Label>
        <Input
          value={form.apiBase}
          onChange={(e) => setForm({ ...form, apiBase: e.target.value })}
          placeholder="https://openrouter.ai/api/v1"
          className="h-8 text-xs mt-1 font-mono"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-[10px]">
            {locale === "ar" ? "النموذج (من المزود مباشرة)" : "Model (live from provider)"}
          </Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] gap-1"
            onClick={fetchModels}
            disabled={fetchingModels}
          >
            {fetchingModels ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {locale === "ar" ? "جلب النماذج" : "Fetch models"}
          </Button>
        </div>
        {models.length > 0 ? (
          <Select
            value={form.modelId.trim() ? form.modelId : "__none__"}
            onValueChange={(id) => {
              if (id === "__none__") return;
              const m = models.find((x) => x.id === id);
              if (m) applyModelCaps(m);
            }}
          >
            <SelectTrigger className="h-8 text-xs font-mono">
              <SelectValue
                placeholder={
                  locale === "ar" ? "اختر نموذجاً من القائمة" : "Select from live list"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="__none__" disabled className="hidden">
                {locale === "ar" ? "اختر نموذجاً" : "Select a model"}
              </SelectItem>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                  {m.id}
                  {m.supportsVision ? " · vision" : ""}
                  {/embed/i.test(m.id) ? " · embed" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              {locale === "ar"
                ? "لا قائمة ثابتة — اضبط المفتاح و API Base ثم اضغط «جلب النماذج»."
                : "No static catalog — set API key and base URL, then Fetch models."}
            </p>
          </div>
        )}
        {form.modelId ? (
          <p className="text-[9px] text-muted-foreground mt-1">
            {locale === "ar"
              ? `سياق ${form.contextWindow} · max ${form.maxTokens}${form.supportsVision ? " · رؤية" : ""}`
              : `Context ${form.contextWindow} · max ${form.maxTokens}${form.supportsVision ? " · vision" : ""}`}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between p-2 rounded-md border border-border/60">
        <span className="text-[10px]">
          {locale === "ar"
            ? "تفعيل فوراً لهذا المحرك"
            : "Activate immediately for this engine"}
        </span>
        <Switch
          checked={form.isActive}
          onCheckedChange={(v) => {
            if (v && !form.modelId.trim()) {
              toast({
                title:
                  locale === "ar"
                    ? "اختر نموذجاً أولاً"
                    : "Select a model first",
                variant: "destructive",
              });
              return;
            }
            setForm({ ...form, isActive: v });
          }}
          className="scale-75"
          disabled={!form.modelId.trim()}
        />
      </div>

      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={() => create.mutate()}
        disabled={
          create.isPending || (form.isActive && !form.modelId.trim())
        }
      >
        {create.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        {locale === "ar" ? "إضافة المزود" : "Add Provider"}
      </Button>
    </div>
  );
}
