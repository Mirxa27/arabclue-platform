"use client";

import { Fragment, useMemo, useState } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Lock,
  KeyRound,
  Check,
  X,
  Trash2,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type AdminRole = "SUPER_ADMIN" | "ADMIN" | "BIDDER" | "REVIEWER" | "FINANCE";

const ROLES: AdminRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "BIDDER",
  "REVIEWER",
  "FINANCE",
];

const ROLE_STYLES: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-red-500/10 text-red-600 border-red-500/20",
  ADMIN: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  BIDDER: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  REVIEWER: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  FINANCE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

const ROLE_BAR: Record<AdminRole, string> = {
  SUPER_ADMIN: "bg-red-500",
  ADMIN: "bg-amber-500",
  BIDDER: "bg-blue-500",
  REVIEWER: "bg-violet-500",
  FINANCE: "bg-emerald-500",
};

function initials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function timeAgo(date: string | null | undefined, locale: "ar" | "en"): string {
  if (!date) return locale === "ar" ? "أبداً" : "never";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return locale === "ar" ? "الآن" : "just now";
  if (mins < 60) return locale === "ar" ? `قبل ${mins}د` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return locale === "ar" ? `قبل ${hrs}س` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return locale === "ar" ? `قبل ${days}ي` : `${days}d ago`;
  const months = Math.floor(days / 30);
  return locale === "ar" ? `قبل ${months}ش` : `${months}mo ago`;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  mfaEnabled: boolean;
  active: boolean;
  locale: string;
  lastLoginAt: string | null;
  createdAt: string;
  subscription?: {
    plan?: { id: string; name: string; nameAr?: string | null };
    status: string;
    billingCycle: string;
    proposalsUsed: number;
    tokensUsed: number;
  } | null;
  _count: {
    projects: number;
    documents: number;
    proposals: number;
    agentRuns: number;
    auditLogs: number;
  };
}

interface Plan {
  id: string;
  name: string;
  nameAr?: string | null;
  priceMonthly: number;
  priceYearly: number;
}

export function AdminSecurity() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<AdminRole>("BIDDER");
  const [editPlanId, setEditPlanId] = useState<string>("");
  const [editBilling, setEditBilling] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const { data: plansData } = useQuery<{ plans: Plan[] }>({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const res = await fetch("/api/admin/plans");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const users = data?.users ?? [];
  const plans = plansData?.plans ?? [];

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.active).length;
    const mfaOn = users.filter((u) => u.mfaEnabled).length;
    const byRole: Record<AdminRole, number> = {
      SUPER_ADMIN: 0,
      ADMIN: 0,
      BIDDER: 0,
      REVIEWER: 0,
      FINANCE: 0,
    };
    for (const u of users) byRole[u.role as AdminRole] = (byRole[u.role as AdminRole] ?? 0) + 1;
    return { total, active, mfaOn, byRole };
  }, [users]);

  const patchMutation = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setEditingId(null);
      toast({
        title: locale === "ar" ? "تم تحديث المستخدم" : "User updated",
      });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل التحديث" : "Update failed",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteTarget(null);
      toast({
        title: locale === "ar" ? "تم إلغاء تنشيط المستخدم" : "User deactivated",
      });
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل الإلغاء" : "Deactivation failed",
        variant: "destructive",
      });
    },
  });

  const startEdit = (u: AdminUser) => {
    setEditingId(editingId === u.id ? null : u.id);
    setEditRole(u.role);
    setEditPlanId(u.subscription?.plan?.id ?? "");
    setEditBilling(
      (u.subscription?.billingCycle as "MONTHLY" | "YEARLY") ?? "MONTHLY"
    );
  };

  const saveEdit = (id: string) => {
    const body: Record<string, unknown> = { role: editRole };
    if (editPlanId) {
      body.planId = editPlanId;
      body.billingCycle = editBilling;
    }
    patchMutation.mutate({ id, body });
  };

  const planLabel = (p?: { name: string; nameAr?: string | null }) =>
    p ? (locale === "ar" ? p.nameAr ?? p.name : p.name) : "—";

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="size-4 text-red-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">
              {tr("admin_security", locale)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === "ar"
                ? "إدارة المستخدمين والأدوار والتحكم في الوصول (RBAC)"
                : "Manage users, roles & role-based access control"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
          >
            <Lock className="size-2.5" />
            {locale === "ar" ? "RBAC + MFA" : "RBAC + MFA"}
          </Badge>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-[11px] h-8">
                <UserPlus className="size-3" />
                {locale === "ar" ? "مستخدم جديد" : "New User"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {locale === "ar" ? "إنشاء مستخدم" : "Create User"}
                </DialogTitle>
                <DialogDescription>
                  {locale === "ar"
                    ? "أضف مستخدماً جديداً وحدد دوره وإعدادات المصادقة."
                    : "Add a new user and assign role + auth settings."}
                </DialogDescription>
              </DialogHeader>
              <CreateUserForm
                plans={plans}
                onDone={() => setShowCreate(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-border/60 bg-card/40">
        <SummaryStat
          icon={Users}
          label={locale === "ar" ? "إجمالي المستخدمين" : "Total Users"}
          value={stats.total}
          color="text-chart-1"
        />
        <SummaryStat
          icon={Check}
          label={locale === "ar" ? "نشط" : "Active"}
          value={stats.active}
          color="text-emerald-600"
        />
        <SummaryStat
          icon={KeyRound}
          label={locale === "ar" ? "MFA مُفعّل" : "MFA Enabled"}
          value={stats.mfaOn}
          color="text-chart-5"
        />
        <SummaryStat
          icon={ShieldAlert}
          label={locale === "ar" ? "غير نشط" : "Inactive"}
          value={stats.total - stats.active}
          color="text-destructive"
        />
      </div>

      {/* Role breakdown */}
      <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-border/60">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground me-1">
          {tr("admin_roles", locale)}:
        </span>
        {ROLES.map((r) => {
          const count = stats.byRole[r] ?? 0;
          const max = Math.max(1, ...Object.values(stats.byRole));
          return (
            <div
              key={r}
              className="flex items-center gap-1.5 text-[10px]"
              title={tr(`admin_role_${r}`, locale)}
            >
              <span
                className={cn("h-1.5 rounded-full", ROLE_BAR[r])}
                style={{ width: `${Math.max(6, (count / max) * 28)}px` }}
              />
              <span className="font-mono tabular-nums text-muted-foreground">
                {count}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[9px] font-medium", ROLE_STYLES[r])}
              >
                {tr(`admin_role_${r}`, locale)}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Users table */}
      <div className="max-h-96 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="size-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{tr("no_data", locale)}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_users", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8">
                  {tr("admin_roles", locale)}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden md:table-cell">
                  MFA
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden sm:table-cell">
                  {locale === "ar" ? "الحالة" : "Status"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden lg:table-cell">
                  {locale === "ar" ? "الدخول الأخير" : "Last Login"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden xl:table-cell">
                  {locale === "ar" ? "العدّادات" : "Counts"}
                </TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider h-8 hidden lg:table-cell">
                  {tr("admin_plans", locale)}
                </TableHead>
                <TableHead className="h-8 w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isEditing = editingId === u.id;
                return (
                  <Fragment key={u.id}>
                    <TableRow className="group hover:bg-muted/40">
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={cn(
                              "size-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white",
                              u.active
                                ? "bg-gradient-to-br from-chart-1 to-chart-2"
                                : "bg-muted-foreground/40"
                            )}
                          >
                            {initials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate max-w-[180px]">
                              {u.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Select
                            value={editRole}
                            onValueChange={(v) => setEditRole(v as AdminRole)}
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-7 text-[10px] w-[140px]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {tr(`admin_role_${r}`, locale)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] font-medium",
                              ROLE_STYLES[u.role as AdminRole] ??
                                "bg-muted text-muted-foreground border-border"
                            )}
                          >
                            {tr(`admin_role_${u.role}`, locale)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.mfaEnabled ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] gap-0.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          >
                            <Check className="size-2.5" /> ON
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[9px] gap-0.5 bg-muted text-muted-foreground"
                          >
                            <X className="size-2.5" /> OFF
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium",
                            u.active ? "text-emerald-600" : "text-destructive"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              u.active ? "bg-emerald-500" : "bg-destructive"
                            )}
                          />
                          {u.active
                            ? locale === "ar"
                              ? "نشط"
                              : "Active"
                            : locale === "ar"
                              ? "موقوف"
                              : "Suspended"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-[10px] text-muted-foreground font-mono">
                        <span title={u.lastLoginAt ?? undefined}>
                          {timeAgo(u.lastLoginAt, locale)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                          <CountChip
                            label={locale === "ar" ? "مش" : "prj"}
                            value={u._count?.projects ?? 0}
                          />
                          <CountChip
                            label={locale === "ar" ? "مس" : "doc"}
                            value={u._count?.documents ?? 0}
                          />
                          <CountChip
                            label={locale === "ar" ? "عط" : "prop"}
                            value={u._count?.proposals ?? 0}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-[10px] font-mono">
                          {planLabel(u.subscription?.plan)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "size-7",
                              isEditing && "bg-accent text-accent-foreground"
                            )}
                            onClick={() => startEdit(u)}
                            title={locale === "ar" ? "تعديل" : "Edit"}
                          >
                            <KeyRound className="size-3" />
                          </Button>
                          {u.active && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 hover:text-destructive"
                              onClick={() => setDeleteTarget(u)}
                              title={tr("action_delete", locale)}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isEditing && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                              <Label className="text-[10px] text-muted-foreground">
                                {tr("admin_roles", locale)}
                              </Label>
                              <Select
                                value={editRole}
                                onValueChange={(v) => setEditRole(v as AdminRole)}
                              >
                                <SelectTrigger size="sm" className="h-8 text-xs w-[160px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLES.map((r) => (
                                    <SelectItem key={r} value={r} className="text-xs">
                                      {tr(`admin_role_${r}`, locale)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-[10px] text-muted-foreground">
                                {tr("admin_plans", locale)}
                              </Label>
                              <Select
                                value={editPlanId || "__none__"}
                                onValueChange={(v) =>
                                  setEditPlanId(v === "__none__" ? "" : v)
                                }
                              >
                                <SelectTrigger size="sm" className="h-8 text-xs w-[180px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-xs">
                                    {locale === "ar" ? "— بدون —" : "— None —"}
                                  </SelectItem>
                                  {plans.map((p) => (
                                    <SelectItem key={p.id} value={p.id} className="text-xs">
                                      {locale === "ar" ? p.nameAr ?? p.name : p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {editPlanId && (
                              <div className="flex flex-col gap-1">
                                <Label className="text-[10px] text-muted-foreground">
                                  {locale === "ar" ? "دورة الفوترة" : "Billing Cycle"}
                                </Label>
                                <Select
                                  value={editBilling}
                                  onValueChange={(v) =>
                                    setEditBilling(v as "MONTHLY" | "YEARLY")
                                  }
                                >
                                  <SelectTrigger size="sm" className="h-8 text-xs w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="MONTHLY" className="text-xs">
                                      {tr("admin_per_month", locale)}
                                    </SelectItem>
                                    <SelectItem value="YEARLY" className="text-xs">
                                      {tr("admin_per_year", locale)}
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <Button
                              size="sm"
                              className="h-8 text-[11px] gap-1.5"
                              onClick={() => saveEdit(u.id)}
                              disabled={patchMutation.isPending}
                            >
                              {patchMutation.isPending ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Check className="size-3" />
                              )}
                              {tr("action_save", locale)}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-[11px]"
                              onClick={() => setEditingId(null)}
                            >
                              {tr("action_cancel", locale)}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Deactivate confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {locale === "ar" ? "إلغاء تنشيط المستخدم" : "Deactivate User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {locale === "ar"
                ? `سيتم تعطيل "${deleteTarget?.name}" (${deleteTarget?.email}). يمكن إعادة التنشيط لاحقاً.`
                : `"${deleteTarget?.name}" (${deleteTarget?.email}) will be suspended. They can be reactivated later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("action_cancel", locale)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin me-1.5" />
              ) : (
                <Trash2 className="size-3.5 me-1.5" />
              )}
              {tr("action_delete", locale)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
      <Icon className={cn("size-3.5 shrink-0", color)} />
      <div className="min-w-0">
        <div className="text-sm font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[9px] text-muted-foreground leading-none mt-0.5 truncate uppercase tracking-wider">
          {label}
        </div>
      </div>
    </div>
  );
}

function CountChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/60"
      title={label}
    >
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

function CreateUserForm({
  plans,
  onDone,
}: {
  plans: Plan[];
  onDone: () => void;
}) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "BIDDER" as AdminRole,
    mfaEnabled: true,
    locale: "ar",
    password: "",
    planId: "",
    billingCycle: "MONTHLY" as "MONTHLY" | "YEARLY",
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        role: form.role,
        mfaEnabled: form.mfaEnabled,
        locale: form.locale,
        password: form.password || undefined,
      };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      // Assign plan if chosen
      if (form.planId && data.user?.id) {
        await fetch(`/api/admin/users/${data.user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: form.planId,
            billingCycle: form.billingCycle,
          }),
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: locale === "ar" ? "تم إنشاء المستخدم" : "User created" });
      onDone();
    },
    onError: () => {
      toast({
        title: locale === "ar" ? "فشل الإنشاء" : "Create failed",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "الاسم" : "Name"}
          </Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-8 text-xs mt-1"
            placeholder={locale === "ar" ? "محمد العتيبي" : "Mohammed Al-Otaibi"}
          />
        </div>
        <div>
          <Label className="text-[10px]">Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-8 text-xs mt-1"
            placeholder="user@arabclue.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">{tr("admin_roles", locale)}</Label>
          <Select
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as AdminRole })}
          >
            <SelectTrigger size="sm" className="h-8 text-xs w-full mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">
                  {tr(`admin_role_${r}`, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px]">
            {locale === "ar" ? "اللغة" : "Locale"}
          </Label>
          <Select
            value={form.locale}
            onValueChange={(v) => setForm({ ...form, locale: v })}
          >
            <SelectTrigger size="sm" className="h-8 text-xs w-full mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar" className="text-xs">
                {locale === "ar" ? "العربية" : "Arabic (RTL)"}
              </SelectItem>
              <SelectItem value="en" className="text-xs">
                {locale === "ar" ? "الإنجليزية" : "English (LTR)"}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px]">{tr("admin_plans", locale)}</Label>
          <Select
            value={form.planId || "__none__"}
            onValueChange={(v) =>
              setForm({ ...form, planId: v === "__none__" ? "" : v })
            }
          >
            <SelectTrigger size="sm" className="h-8 text-xs w-full mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">
                {locale === "ar" ? "— بدون —" : "— None —"}
              </SelectItem>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {locale === "ar" ? p.nameAr ?? p.name : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {form.planId && (
          <div>
            <Label className="text-[10px]">
              {locale === "ar" ? "دورة الفوترة" : "Billing"}
            </Label>
            <Select
              value={form.billingCycle}
              onValueChange={(v) =>
                setForm({ ...form, billingCycle: v as "MONTHLY" | "YEARLY" })
              }
            >
              <SelectTrigger size="sm" className="h-8 text-xs w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY" className="text-xs">
                  {tr("admin_per_month", locale)}
                </SelectItem>
                <SelectItem value="YEARLY" className="text-xs">
                  {tr("admin_per_year", locale)}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex items-center justify-between p-2 rounded-md border border-border/60 bg-background">
        <div className="flex items-center gap-2">
          <KeyRound className="size-3.5 text-chart-5" />
          <span className="text-[11px] font-medium">
            {locale === "ar" ? "المصادقة الثنائية (MFA)" : "MFA (2FA)"}
          </span>
        </div>
        <Switch
          checked={form.mfaEnabled}
          onCheckedChange={(v) => setForm({ ...form, mfaEnabled: v })}
          className="scale-75"
        />
      </div>

      <div>
        <Label className="text-[10px]">
          {locale === "ar" ? "كلمة المرور المؤقتة" : "Temp Password"}
        </Label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="h-8 text-xs mt-1"
          placeholder={locale === "ar" ? "اتركها فارغة للقيمة الافتراضية" : "Leave blank for default"}
        />
      </div>

      <DialogFooter>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.name || !form.email}
        >
          {create.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <UserPlus className="size-3.5" />
          )}
          {locale === "ar" ? "إنشاء المستخدم" : "Create User"}
        </Button>
      </DialogFooter>
    </div>
  );
}
