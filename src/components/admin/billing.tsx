"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Cpu,
  CreditCard,
  DollarSign,
  FileCheck2,
  Loader2,
  Plus,
  Save,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubscriptionPlan {
  id: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  maxProposals: number;
  maxDocuments: number;
  maxWorkspaces: number;
  maxTokensPerMonth: number;
  maxStorageGb: number;
  featuresJson: string | null;
  isActive: boolean;
  isPublic: boolean;
}

interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: string;
  billingCycle: string;
  proposalsUsed: number;
  documentsUsed: number;
  tokensUsed: number;
  currentPeriodEnd: string;
  user: { name: string; email: string; role: string };
  plan: SubscriptionPlan;
}

interface BillingRecord {
  id: string;
  type: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  createdAt: string;
  user: { name: string; email: string };
}

interface BillingStats {
  activeSubscriptions: number;
  totalSubscriptions: number;
  totalRevenue: number;
  mrr: number;
  totalProposalsUsed: number;
  totalTokensUsed: number;
  totalDocumentsUsed: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSAR(amount: number, locale: "ar" | "en"): string {
  try {
    return amount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US", {
      maximumFractionDigits: 0,
    });
  } catch {
    return String(amount);
  }
}

function sarSuffix(locale: "ar" | "en"): string {
  return locale === "ar" ? "ر.س" : "SAR";
}

function formatDate(iso: string, locale: "ar" | "en"): string {
  try {
    return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function quotaLabel(value: number, locale: "ar" | "en"): string {
  if (value === -1) return tr("admin_unlimited", locale);
  return value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
}

function progressColor(pct: number): string {
  if (pct > 90) return "[&>[data-slot=progress-indicator]]:bg-red-500!";
  if (pct > 70) return "[&>[data-slot=progress-indicator]]:bg-amber-500!";
  return "[&>[data-slot=progress-indicator]]:bg-emerald-500!";
}

const STATUS_COLORS: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PENDING: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  FAILED: "bg-red-500/10 text-red-600 border-red-500/20",
  REFUNDED: "bg-muted text-muted-foreground border-border",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  PAST_DUE: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  CANCELLED: "bg-red-500/10 text-red-600 border-red-500/20",
  TRIALING: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  EXPIRED: "bg-muted text-muted-foreground border-border",
};

const TYPE_COLORS: Record<string, string> = {
  SUBSCRIPTION: "bg-chart-1/10 text-chart-1 border-chart-1/20",
  USAGE: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  TOPUP: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  REFUND: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  OVERAGE: "bg-red-500/10 text-red-600 border-red-500/20",
};

const PAYMENT_LABEL: Record<string, { ar: string; en: string }> = {
  mada: { ar: "مدى", en: "mada" },
  visa: { ar: "فيزا", en: "Visa" },
  mastercard: { ar: "ماستركارد", en: "Mastercard" },
  stc_pay: { ar: "إس تي سي باي", en: "STC Pay" },
  bank_transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminBilling() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAddPlan, setShowAddPlan] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-billing"],
    queryFn: async () => {
      const res = await fetch("/api/admin/billing");
      if (!res.ok) throw new Error("fetch failed");
      return (await res.json()) as {
        records: BillingRecord[];
        subscriptions: Subscription[];
        plans: SubscriptionPlan[];
        stats: BillingStats;
      };
    },
  });

  const togglePlanMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      toast({ title: locale === "ar" ? "تم تحديث الباقة" : "Plan updated" });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل التحديث" : "Update failed",
        variant: "destructive",
      });
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-billing"] });
      setShowAddPlan(false);
      toast({ title: locale === "ar" ? "تم إنشاء الباقة" : "Plan created" });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل الإنشاء" : "Create failed",
        variant: "destructive",
      });
    },
  });

  const stats = data?.stats;
  const plans = data?.plans ?? [];
  const records = data?.records ?? [];
  const subscriptions = data?.subscriptions ?? [];
  const activeSubs = subscriptions.filter((s) => s.status === "ACTIVE");

  // Active-subscriber counts per plan (cheap O(n) — computed inline so the
  // React Compiler can preserve memoization automatically).
  const subscriberCount: Record<string, number> = {};
  for (const s of subscriptions) {
    if (s.status === "ACTIVE") {
      subscriberCount[s.planId] = (subscriberCount[s.planId] ?? 0) + 1;
    }
  }

  return (
    <div className="space-y-4">
      {/* Top: KPI stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          color="text-chart-1"
          bg="bg-chart-1/10"
          label={locale === "ar" ? "الإيراد الشهري (MRR)" : "Monthly Recurring (MRR)"}
          value={`${formatSAR(stats?.mrr ?? 0, locale)} ${sarSuffix(locale)}`}
          sub={locale === "ar" ? "متكرر شهرياً" : "recurring / month"}
        />
        <KpiCard
          icon={DollarSign}
          color="text-emerald-600"
          bg="bg-emerald-500/10"
          label={tr("admin_revenue", locale)}
          value={`${formatSAR(stats?.totalRevenue ?? 0, locale)} ${sarSuffix(locale)}`}
          sub={locale === "ar" ? "إجمالي المُحصَّل" : "total collected"}
        />
        <KpiCard
          icon={Users}
          color="text-chart-3"
          bg="bg-chart-3/10"
          label={tr("admin_users", locale)}
          value={`${stats?.activeSubscriptions ?? 0}`}
          sub={`${stats?.totalSubscriptions ?? 0} ${locale === "ar" ? "إجمالي الاشتراكات" : "total subs"}`}
        />
        <KpiCard
          icon={FileCheck2}
          color="text-chart-2"
          bg="bg-chart-2/10"
          label={locale === "ar" ? "العطاءات المستخدمة" : "Proposals Used"}
          value={`${formatSAR(stats?.totalProposalsUsed ?? 0, locale)}`}
          sub={`${formatSAR(stats?.totalTokensUsed ?? 0, locale)} ${locale === "ar" ? "رمز" : "tokens"}`}
        />
      </div>

      {/* Middle: subscription plans */}
      <Card className="p-0 overflow-hidden border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-chart-4/10 flex items-center justify-center">
              <CreditCard className="size-4 text-chart-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{tr("admin_plans", locale)}</h3>
              <p className="text-[11px] text-muted-foreground">
                {locale === "ar"
                  ? `${plans.length} باقة · ${activeSubs.length} مشترك نشط`
                  : `${plans.length} plans · ${activeSubs.length} active subs`}
              </p>
            </div>
          </div>
          <Dialog open={showAddPlan} onOpenChange={setShowAddPlan}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-[11px]">
                <Plus className="size-3" />
                {locale === "ar" ? "إضافة باقة" : "Add Plan"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {locale === "ar" ? "إنشاء باقة جديدة" : "Create New Plan"}
                </DialogTitle>
              </DialogHeader>
              <AddPlanForm
                onSave={(payload) => createPlanMutation.mutate(payload)}
                saving={createPlanMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>
        <div className="p-4 max-h-[32rem] overflow-y-auto scrollbar-thin">
          {isLoading ? (
            <div className="p-10 text-center flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {tr("loading", locale)}
            </div>
          ) : plans.length === 0 ? (
            <div className="p-10 text-center text-xs text-muted-foreground">
              {tr("no_data", locale)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  locale={locale}
                  subscribers={subscriberCount[plan.id] ?? 0}
                  onToggle={(isActive) =>
                    togglePlanMutation.mutate({ id: plan.id, isActive })
                  }
                  toggling={togglePlanMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Bottom: records + active subscriptions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recent billing records */}
        <Card className="p-0 overflow-hidden border-border/60">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-chart-2/10 flex items-center justify-center">
                <DollarSign className="size-3.5 text-chart-2" />
              </div>
              <h3 className="text-sm font-semibold">
                {locale === "ar" ? "سجل الفوترة الأخير" : "Recent Billing Records"}
              </h3>
            </div>
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {records.length}
            </Badge>
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {records.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {tr("no_data", locale)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">
                      {locale === "ar" ? "النوع" : "Type"}
                    </TableHead>
                    <TableHead className="text-[10px] h-8 text-end">
                      {locale === "ar" ? "المبلغ" : "Amount"}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {locale === "ar" ? "المستخدم" : "User"}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {locale === "ar" ? "الحالة" : "Status"}
                    </TableHead>
                    <TableHead className="text-[10px] h-8">
                      {locale === "ar" ? "الدفع" : "Payment"}
                    </TableHead>
                    <TableHead className="text-[10px] h-8 text-end">
                      {locale === "ar" ? "التاريخ" : "Date"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.slice(0, 25).map((r) => (
                    <TableRow key={r.id} className="text-[11px]">
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] gap-0.5 font-mono",
                            TYPE_COLORS[r.type] ??
                              "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {r.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end font-mono font-semibold tabular-nums">
                        {formatSAR(r.amount, locale)} {sarSuffix(locale)}
                      </TableCell>
                      <TableCell className="text-[10px] truncate max-w-[120px]">
                        {r.user?.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px]",
                            STATUS_COLORS[r.status] ??
                              "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">
                        {r.paymentMethod
                          ? PAYMENT_LABEL[r.paymentMethod]?.[locale] ?? r.paymentMethod
                          : "—"}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground text-end font-mono">
                        {formatDate(r.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* Active subscriptions with usage bars */}
        <Card className="p-0 overflow-hidden border-border/60">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-chart-3/10 flex items-center justify-center">
                <Users className="size-3.5 text-chart-3" />
              </div>
              <h3 className="text-sm font-semibold">
                {locale === "ar" ? "الاشتراكات النشطة" : "Active Subscriptions"}
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {activeSubs.length}
              </Badge>
              <Badge
                variant="outline"
                className="text-[9px] gap-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                <CheckCircle2 className="size-2" />
                {tr("admin_usage", locale)}
              </Badge>
            </div>
          </div>
          <div className="p-3 space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
            {activeSubs.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {tr("no_data", locale)}
              </div>
            ) : (
              activeSubs.map((sub) => (
                <SubscriptionRow key={sub.id} sub={sub} locale={locale} />
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  color,
  bg,
  label,
  value,
  sub,
}: {
  icon: typeof TrendingUp;
  color: string;
  bg: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-3.5 border-border/60 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold tabular-nums font-mono mt-1 truncate">{value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
        </div>
        <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
          <Icon className={cn("size-4", color)} />
        </div>
      </div>
    </Card>
  );
}

// ─── Plan Card ───────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  locale,
  subscribers,
  onToggle,
  toggling,
}: {
  plan: SubscriptionPlan;
  locale: "ar" | "en";
  subscribers: number;
  onToggle: (isActive: boolean) => void;
  toggling: boolean;
}) {
  const features = useMemo<string[]>(() => {
    try {
      const parsed = JSON.parse(plan.featuresJson ?? "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }, [plan.featuresJson]);

  const name = locale === "ar" && plan.nameAr ? plan.nameAr : plan.name;

  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 transition-all flex flex-col gap-2.5",
        plan.isActive
          ? "border-border/60 bg-background hover:border-primary/30"
          : "border-border/60 bg-muted/20 opacity-70"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="text-sm font-bold truncate">{name}</h4>
            {plan.isActive ? (
              <Badge
                variant="outline"
                className="text-[8px] h-3.5 px-1 gap-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              >
                <CheckCircle2 className="size-2" />
                {locale === "ar" ? "نشط" : "Active"}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[8px] h-3.5 px-1 bg-muted text-muted-foreground"
              >
                {locale === "ar" ? "متوقف" : "Disabled"}
              </Badge>
            )}
          </div>
          {plan.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
              {plan.description}
            </p>
          )}
        </div>
        <Switch
          checked={plan.isActive}
          onCheckedChange={onToggle}
          disabled={toggling}
          className="scale-75 shrink-0"
          aria-label={locale === "ar" ? "تفعيل الباقة" : "Toggle plan"}
        />
      </div>

      {/* Price */}
      <div className="flex items-end gap-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono tabular-nums">
              {formatSAR(plan.priceMonthly, locale)}
            </span>
            <span className="text-[10px] text-muted-foreground">{sarSuffix(locale)}</span>
            <span className="text-[9px] text-muted-foreground">
              {tr("admin_per_month", locale)}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {formatSAR(plan.priceYearly, locale)} {sarSuffix(locale)}{" "}
            {tr("admin_per_year", locale)}
          </div>
        </div>
      </div>

      <Separator />

      {/* Quotas */}
      <div>
        <p className="text-[9px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">
          {tr("admin_quota", locale)}
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <QuotaItem
            icon={FileCheck2}
            label={locale === "ar" ? "العطاءات" : "Proposals"}
            value={quotaLabel(plan.maxProposals, locale)}
          />
          <QuotaItem
            icon={FileCheck2}
            label={locale === "ar" ? "المستندات" : "Documents"}
            value={quotaLabel(plan.maxDocuments, locale)}
          />
          <QuotaItem
            icon={Cpu}
            label={locale === "ar" ? "الرموز/شهر" : "Tokens/mo"}
            value={quotaLabel(plan.maxTokensPerMonth, locale)}
          />
          <QuotaItem
            icon={CreditCard}
            label={locale === "ar" ? "التخزين" : "Storage"}
            value={
              plan.maxStorageGb === -1
                ? tr("admin_unlimited", locale)
                : `${plan.maxStorageGb} GB`
            }
          />
        </div>
      </div>

      {/* Features */}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {features.slice(0, 6).map((f, i) => (
            <Badge key={`${f}-${i}`} variant="secondary" className="text-[8px] h-3.5 px-1 font-mono">
              {f}
            </Badge>
          ))}
          {features.length > 6 && (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 tabular-nums">
              +{features.length - 6}
            </Badge>
          )}
        </div>
      )}

      <Separator />

      {/* Subscribers */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground flex items-center gap-1">
          <Users className="size-2.5" />
          {locale === "ar" ? "المشتركون النشطون" : "Active subscribers"}
        </span>
        <span className="font-mono font-semibold tabular-nums">{subscribers}</span>
      </div>
    </div>
  );
}

function QuotaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileCheck2;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-muted/30">
      <Icon className="size-2.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <div className="text-[10px] font-mono font-semibold leading-none truncate">
          {value}
        </div>
        <div className="text-[8px] text-muted-foreground leading-none mt-0.5 truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Subscription Row ────────────────────────────────────────────────────────

function SubscriptionRow({
  sub,
  locale,
}: {
  sub: Subscription;
  locale: "ar" | "en";
}) {
  const proposalsPct =
    sub.plan.maxProposals === -1
      ? 0
      : Math.min(100, (sub.proposalsUsed / Math.max(1, sub.plan.maxProposals)) * 100);
  const tokensPct =
    sub.plan.maxTokensPerMonth === -1
      ? 0
      : Math.min(100, (sub.tokensUsed / Math.max(1, sub.plan.maxTokensPerMonth)) * 100);

  const proposalsLabel =
    sub.plan.maxProposals === -1
      ? `${sub.proposalsUsed} / ∞`
      : `${sub.proposalsUsed} / ${sub.plan.maxProposals}`;
  const tokensLabel =
    sub.plan.maxTokensPerMonth === -1
      ? `${formatSAR(sub.tokensUsed, locale)} / ∞`
      : `${formatSAR(sub.tokensUsed, locale)} / ${formatSAR(sub.plan.maxTokensPerMonth, locale)}`;

  return (
    <div className="rounded-lg border border-border/60 p-2.5 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate">{sub.user?.email ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">
            {locale === "ar" && sub.plan.nameAr ? sub.plan.nameAr : sub.plan.name} ·{" "}
            {sub.billingCycle}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[8px] shrink-0",
            STATUS_COLORS[sub.status] ??
              "bg-muted text-muted-foreground border-border"
          )}
        >
          {sub.status}
        </Badge>
      </div>
      <div className="space-y-1.5">
        <UsageBar
          label={locale === "ar" ? "العطاءات" : "Proposals"}
          value={proposalsLabel}
          pct={proposalsPct}
          unlimited={sub.plan.maxProposals === -1}
        />
        <UsageBar
          label={locale === "ar" ? "الرموز" : "Tokens"}
          value={tokensLabel}
          pct={tokensPct}
          unlimited={sub.plan.maxTokensPerMonth === -1}
        />
      </div>
    </div>
  );
}

function UsageBar({
  label,
  value,
  pct,
  unlimited,
}: {
  label: string;
  value: string;
  pct: number;
  unlimited: boolean;
}) {
  const colorClass = unlimited
    ? "[&>[data-slot=progress-indicator]]:bg-muted-foreground!"
    : progressColor(pct);
  return (
    <div>
      <div className="flex items-center justify-between text-[9px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <Progress value={unlimited ? 100 : pct} className={cn("h-1.5", colorClass)} />
    </div>
  );
}

// ─── Add Plan Form ───────────────────────────────────────────────────────────

function AddPlanForm({
  onSave,
  saving,
}: {
  onSave: (payload: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { locale } = useLocale();
  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    description: "",
    priceMonthly: 299,
    priceYearly: 2990,
    maxProposals: 10,
    maxDocuments: 50,
    maxWorkspaces: 1,
    maxTokensPerMonth: 500000,
    maxStorageGb: 5,
  });

  const set = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "الاسم (EN)" : "Name (EN)"}
          </Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="PRO"
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "الاسم (AR)" : "Name (AR)"}
          </Label>
          <Input
            value={form.nameAr}
            onChange={(e) => set("nameAr", e.target.value)}
            placeholder="الاحترافي"
            className="h-8 text-xs mt-1"
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px]">{locale === "ar" ? "الوصف" : "Description"}</Label>
        <Input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder={locale === "ar" ? "وصف الباقة" : "Plan description"}
          className="h-8 text-xs mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "السعر شهرياً (ر.س)" : "Price Monthly (SAR)"}
          </Label>
          <Input
            type="number"
            value={form.priceMonthly}
            onChange={(e) => set("priceMonthly", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "السعر سنوياً (ر.س)" : "Price Yearly (SAR)"}
          </Label>
          <Input
            type="number"
            value={form.priceYearly}
            onChange={(e) => set("priceYearly", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "حد العطاءات (-1=∞)" : "Max Proposals (-1=∞)"}
          </Label>
          <Input
            type="number"
            value={form.maxProposals}
            onChange={(e) => set("maxProposals", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "حد المستندات" : "Max Documents"}
          </Label>
          <Input
            type="number"
            value={form.maxDocuments}
            onChange={(e) => set("maxDocuments", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "المساحات" : "Max Workspaces"}
          </Label>
          <Input
            type="number"
            value={form.maxWorkspaces}
            onChange={(e) => set("maxWorkspaces", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "حد الرموز/شهر" : "Max Tokens/mo"}
          </Label>
          <Input
            type="number"
            value={form.maxTokensPerMonth}
            onChange={(e) => set("maxTokensPerMonth", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px]">
            {locale === "ar" ? "التخزين (GB)" : "Storage (GB)"}
          </Label>
          <Input
            type="number"
            value={form.maxStorageGb}
            onChange={(e) => set("maxStorageGb", Number(e.target.value))}
            className="h-8 text-xs mt-1 font-mono"
          />
        </div>
      </div>
      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={() =>
          onSave({
            ...form,
            featuresJson: JSON.stringify([]),
            isActive: true,
            isPublic: true,
          })
        }
        disabled={saving || !form.name}
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
