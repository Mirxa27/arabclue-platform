"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EnvSetting {
  id: string;
  key: string;
  value: string;
  category: string;
  description: string | null;
  isSecret: boolean;
  isMasked: boolean;
  lastRotatedAt: string | null;
  updatedAt: string;
}

interface CatalogEntry {
  key: string;
  category: string;
  description: string;
  isRequired: boolean;
}

interface EnvPayload {
  key: string;
  value: string;
  category: string;
  description: string;
  isSecret: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  "AI_PROVIDER",
  "DATABASE",
  "INTEGRATION",
  "SECURITY",
  "BILLING",
  "GENERAL",
] as const;

const CATEGORY_META: Record<string, { ar: string; en: string; color: string }> = {
  AI_PROVIDER: { ar: "مزودو الذكاء الاصطناعي", en: "AI Providers", color: "text-chart-1" },
  DATABASE: { ar: "قواعد البيانات", en: "Database", color: "text-chart-2" },
  INTEGRATION: { ar: "التكاملات", en: "Integration", color: "text-chart-3" },
  SECURITY: { ar: "الأمن", en: "Security", color: "text-chart-5" },
  BILLING: { ar: "الفوترة", en: "Billing", color: "text-chart-4" },
  GENERAL: { ar: "عام", en: "General", color: "text-muted-foreground" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isLikelySecret(key: string): boolean {
  const k = key.toUpperCase();
  return (
    k.includes("KEY") ||
    k.includes("SECRET") ||
    k.includes("PASSWORD") ||
    k.includes("TOKEN")
  );
}

function formatDate(iso: string | null, locale: "ar" | "en"): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminEnvSettings() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EnvSetting | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, true]))
  );

  const { data, isLoading } = useQuery({
    queryKey: ["admin-env"],
    queryFn: async () => {
      const res = await fetch("/api/admin/env");
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as {
        settings: EnvSetting[];
        catalog: CatalogEntry[];
      };
    },
  });

  // Lazily fetch the revealed (unmasked) view only when at least one row is
  // toggled. Cached for 30s so toggling multiple rows is instant.
  const revealedQuery = useQuery({
    queryKey: ["admin-env", "revealed"],
    queryFn: async () => {
      const res = await fetch("/api/admin/env?reveal=1");
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as { settings: EnvSetting[] };
    },
    enabled: revealed.size > 0,
    staleTime: 30_000,
  });

  const revealedMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of revealedQuery.data?.settings ?? []) {
      m[s.key] = s.value;
    }
    return m;
  }, [revealedQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: EnvPayload) => {
      const res = await fetch("/api/admin/env", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("save failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-env"] });
      qc.invalidateQueries({ queryKey: ["admin-env", "revealed"] });
      setEditing(null);
      setShowAdd(false);
      toast({ title: locale === "ar" ? "تم حفظ المتغير" : "Variable saved" });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل الحفظ" : "Save failed",
        variant: "destructive",
      });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`/api/admin/env/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      if (!res.ok) throw new Error("rotate failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-env"] });
      qc.invalidateQueries({ queryKey: ["admin-env", "revealed"] });
      toast({ title: locale === "ar" ? "تم تدوير المفتاح" : "Encryption rotated" });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل التدوير" : "Rotation failed",
        variant: "destructive",
      });
    },
  });

  const settings = data?.settings ?? [];
  const catalog = data?.catalog ?? [];

  const filtered = settings.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.key.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

  const grouped = useMemo(() => {
    const g: Record<string, EnvSetting[]> = {};
    for (const c of CATEGORIES) g[c] = [];
    for (const s of filtered) {
      if (!g[s.category]) g[s.category] = [];
      g[s.category].push(s);
    }
    return g;
  }, [filtered]);

  const totalCount = settings.length;
  const secretCount = settings.filter((s) => s.isSecret).length;

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-chart-5/10 flex items-center justify-center">
            <KeyRound className="size-4 text-chart-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{tr("admin_env", locale)}</h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar"
                ? `${totalCount} متغير · ${secretCount} مشفر`
                : `${totalCount} variables · ${secretCount} encrypted`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
          >
            <Shield className="size-2.5" />
            {tr("admin_encrypted", locale)}
          </Badge>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-[11px]">
                <Plus className="size-3" />
                {locale === "ar" ? "إضافة متغير" : "Add Variable"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {locale === "ar" ? "إضافة متغير بيئة" : "Add Environment Variable"}
                </DialogTitle>
              </DialogHeader>
              <AddEnvForm
                catalog={catalog}
                onSave={(payload) => saveMutation.mutate(payload)}
                saving={saveMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-5 py-2.5 border-b border-border/60 bg-background">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground start-2.5 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={locale === "ar" ? "بحث في المتغيرات..." : "Search variables..."}
            className="h-8 text-xs ps-8"
          />
        </div>
      </div>

      {/* Body — grouped, collapsible */}
      <div className="p-3 space-y-2 max-h-[32rem] overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-10 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : totalCount === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            {tr("no_data", locale)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-xs text-muted-foreground">
            {locale === "ar" ? "لا نتائج مطابقة" : "No matching variables"}
          </div>
        ) : (
          CATEGORIES.map((cat) => {
            const list = grouped[cat] ?? [];
            if (list.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const isOpen = openCats[cat];
            return (
              <Collapsible
                key={cat}
                open={isOpen}
                onOpenChange={(o) => setOpenCats((p) => ({ ...p, [cat]: o }))}
                className="rounded-lg border border-border/60 overflow-hidden"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        className={cn(
                          "size-3.5 text-muted-foreground transition-transform",
                          isOpen ? "" : "-rotate-90 rtl:rotate-90"
                        )}
                      />
                      <span className="text-xs font-semibold">{meta[locale]}</span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5 tabular-nums">
                        {list.length}
                      </Badge>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[9px] font-mono", meta.color)}
                    >
                      {cat}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y divide-border/60 border-t border-border/60">
                    {list.map((s) => (
                      <EnvRow
                        key={s.id}
                        setting={s}
                        locale={locale}
                        revealed={revealed.has(s.key)}
                        revealedValue={revealedMap[s.key]}
                        revealing={revealed.has(s.key) && revealedQuery.isLoading}
                        onToggleReveal={() => toggleReveal(s.key)}
                        onEdit={() => setEditing(s)}
                        onRotate={() => rotateMutation.mutate(s.key)}
                        rotating={
                          rotateMutation.isPending &&
                          rotateMutation.variables === s.key
                        }
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "تعديل المتغير" : "Edit Variable"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <EditEnvForm
              setting={editing}
              onSave={(value, isSecret) =>
                saveMutation.mutate({
                  key: editing.key,
                  value,
                  category: editing.category,
                  description: editing.description ?? "",
                  isSecret,
                })
              }
              saving={saveMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Env Row ─────────────────────────────────────────────────────────────────

function EnvRow({
  setting,
  locale,
  revealed,
  revealedValue,
  revealing,
  onToggleReveal,
  onEdit,
  onRotate,
  rotating,
}: {
  setting: EnvSetting;
  locale: "ar" | "en";
  revealed: boolean;
  revealedValue: string | undefined;
  revealing: boolean;
  onToggleReveal: () => void;
  onEdit: () => void;
  onRotate: () => void;
  rotating: boolean;
}) {
  const displayValue =
    setting.isSecret && revealed && revealedValue !== undefined
      ? revealedValue
      : setting.value;

  return (
    <div className="px-3 py-2.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <div className="mt-0.5 size-6 rounded-md bg-muted flex items-center justify-center shrink-0">
            {setting.isSecret ? (
              <Lock className="size-3 text-chart-5" />
            ) : (
              <KeyRound className="size-3 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs font-semibold truncate">{setting.key}</span>
              {setting.isSecret && (
                <Badge
                  variant="outline"
                  className="text-[8px] h-3.5 px-1 bg-chart-5/10 text-chart-5 border-chart-5/20 gap-0.5"
                >
                  <Lock className="size-2" />
                  {tr("admin_masked", locale)}
                </Badge>
              )}
            </div>
            {setting.description && (
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                {setting.description}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1 min-w-0">
              <code className="text-[10px] font-mono text-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-full">
                {revealing
                  ? locale === "ar"
                    ? "جاري الكشف..."
                    : "revealing..."
                  : displayValue || (locale === "ar" ? "غير مضبوط" : "not set")}
              </code>
              {setting.isSecret && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-5 shrink-0"
                  onClick={onToggleReveal}
                  title={tr("admin_reveal", locale)}
                  aria-label={tr("admin_reveal", locale)}
                >
                  {revealed ? (
                    <EyeOff className="size-3" />
                  ) : (
                    <Eye className="size-3" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1"
              onClick={onRotate}
              disabled={rotating}
              title={tr("admin_rotate", locale)}
            >
              {rotating ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <RefreshCw className="size-2.5" />
              )}
              <span className="hidden sm:inline">{tr("admin_rotate", locale)}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={onEdit}
            >
              {locale === "ar" ? "تعديل" : "Edit"}
            </Button>
          </div>
          <span className="text-[9px] text-muted-foreground font-mono whitespace-nowrap">
            {setting.lastRotatedAt
              ? `${locale === "ar" ? "آخر تدوير" : "rotated"} ${formatDate(setting.lastRotatedAt, locale)}`
              : locale === "ar"
              ? "لم يُدوَّر"
              : "never rotated"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Form ───────────────────────────────────────────────────────────────

function EditEnvForm({
  setting,
  onSave,
  saving,
}: {
  setting: EnvSetting;
  onSave: (value: string, isSecret: boolean) => void;
  saving: boolean;
}) {
  const { locale } = useLocale();
  const [value, setValue] = useState("");
  const [isSecret, setIsSecret] = useState(setting.isSecret);

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/40 p-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <KeyRound className="size-3 text-muted-foreground" />
          <span className="font-mono text-xs font-semibold">{setting.key}</span>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {setting.description ?? (locale === "ar" ? "بدون وصف" : "No description")}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {locale === "ar" ? "الفئة" : "Category"}:{" "}
          <span className="font-mono">{setting.category}</span>
        </p>
      </div>
      <div>
        <Label className="text-[11px] flex items-center gap-1">
          {setting.isSecret ? (
            <Lock className="size-2.5" />
          ) : (
            <KeyRound className="size-2.5" />
          )}
          {locale === "ar" ? "القيمة الجديدة" : "New Value"}
        </Label>
        <Input
          type={setting.isSecret ? "password" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={
            setting.isSecret
              ? locale === "ar"
                ? "أدخل القيمة السرية الجديدة"
                : "Enter new secret value"
              : setting.value || (locale === "ar" ? "أدخل القيمة" : "Enter value")
          }
          className="h-9 text-xs mt-1 font-mono"
          autoFocus
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          {locale === "ar"
            ? "اتركها فارغة للاحتفاظ بالقيمة الحالية."
            : "Leave empty to keep the current value."}
        </p>
      </div>
      <label className="flex items-center gap-2 text-[11px] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isSecret}
          onChange={(e) => setIsSecret(e.target.checked)}
          className="size-3.5 rounded border-input"
        />
        {locale === "ar" ? "متغير سري (يُخفى في الواجهة)" : "Secret variable (masked in UI)"}
      </label>
      <Separator />
      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={() => value && onSave(value, isSecret)}
        disabled={saving || !value}
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

// ─── Add Form ────────────────────────────────────────────────────────────────

function AddEnvForm({
  catalog,
  onSave,
  saving,
}: {
  catalog: CatalogEntry[];
  onSave: (payload: EnvPayload) => void;
  saving: boolean;
}) {
  const { locale } = useLocale();
  const [customMode, setCustomMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [form, setForm] = useState({
    key: "",
    value: "",
    category: "GENERAL",
    description: "",
  });

  const isSecret = isLikelySecret(form.key);

  const reset = (custom: boolean) => {
    setCustomMode(custom);
    setSelectedKey("");
    setForm({ key: "", value: "", category: "GENERAL", description: "" });
  };

  const pickCatalog = (entry: CatalogEntry) => {
    setSelectedKey(entry.key);
    setCustomMode(false);
    setForm({
      key: entry.key,
      value: "",
      category: entry.category,
      description: entry.description,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => reset(false)}
          className={cn(
            "text-[10px] px-2 py-1 rounded-md border transition-colors",
            !customMode
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/40"
          )}
        >
          {locale === "ar" ? "من الكتالوج" : "From Catalog"}
        </button>
        <button
          type="button"
          onClick={() => reset(true)}
          className={cn(
            "text-[10px] px-2 py-1 rounded-md border transition-colors",
            customMode
              ? "border-primary bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/40"
          )}
        >
          {locale === "ar" ? "مفتاح مخصص" : "Custom Key"}
        </button>
      </div>

      {!customMode ? (
        <div className="max-h-44 overflow-y-auto scrollbar-thin space-y-1 rounded-md border border-border/60 p-1.5">
          {catalog.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-3">
              {tr("no_data", locale)}
            </p>
          ) : (
            catalog.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => pickCatalog(entry)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 p-2 rounded-md border text-start text-xs transition-colors",
                  selectedKey === entry.key
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-primary/30 hover:bg-muted/40"
                )}
              >
                <div className="min-w-0">
                  <div className="font-mono font-medium truncate">{entry.key}</div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    {entry.description}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {entry.isRequired && (
                    <Badge
                      variant="outline"
                      className="text-[8px] h-3.5 px-1 text-chart-5 border-chart-5/30"
                    >
                      {locale === "ar" ? "مطلوب" : "required"}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[8px] h-3.5 px-1 font-mono">
                    {entry.category}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "اسم المفتاح" : "Key Name"}
          </Label>
          <Input
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
            placeholder="MY_CUSTOM_KEY"
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">{locale === "ar" ? "الفئة" : "Category"}</Label>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="h-8 text-xs mt-1 w-full rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_META[c][locale]} ({c})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] flex items-center gap-1">
            {isSecret ? <Lock className="size-2.5" /> : <KeyRound className="size-2.5" />}
            {locale === "ar" ? "القيمة" : "Value"}
          </Label>
          <Input
            type={isSecret ? "password" : "text"}
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder={locale === "ar" ? "أدخل القيمة" : "Enter value"}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px]">{locale === "ar" ? "الوصف" : "Description"}</Label>
        <Input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={locale === "ar" ? "وصف مختصر" : "Short description"}
          className="h-8 text-xs mt-1"
        />
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Shield className="size-2.5 text-emerald-600" />
        {locale === "ar"
          ? "ستُشفّر القيمة بـ AES-256-GCM قبل التخزين"
          : "Value will be AES-256-GCM encrypted before storage"}
      </div>

      <Separator />

      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={() => onSave({ ...form, isSecret })}
        disabled={saving || !form.key || !form.value}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        {locale === "ar" ? "إضافة المتغير" : "Add Variable"}
      </Button>
    </div>
  );
}
