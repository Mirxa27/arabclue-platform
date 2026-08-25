"use client";

import { useState } from "react";
import { useLocale } from "@/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Loader2,
  Check,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  CalendarClock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Panel,
  EmptyState,
  ErrorState,
  QueryState,
  ConfirmDialog,
} from "@/components/patterns";
import { apiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  maxProposals: number;
  maxDocuments: number;
  maxTokensPerMonth: number;
};

type Subscription = {
  status: string;
  billingCycle: string;
  currentPeriodEnd: string;
  proposalsUsed: number;
  documentsUsed: number;
  tokensUsed: number;
  plan: Plan;
} | null;

type RecurringProfile = {
  id: string;
  recurringId: string;
  status: string;
  recurringType: string | null;
  intervalDays: number | null;
  amount: number | null;
  currency: string;
  planId: string | null;
  subscriptionId: string | null;
  nextChargeAt: string | null;
  lastChargeAt: string | null;
  failedCharges: number;
  lastFailureReason: string | null;
  createdAt: string;
};

type BillingPayload = {
  plans: Plan[];
  subscription: Subscription;
  records: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    description: string;
    status: string;
    paymentMethod?: string | null;
    invoiceNumber?: string | null;
    metadata?: string | null;
    createdAt: string;
  }>;
  myfatoorahConfigured?: boolean;
};

type CheckoutInput = {
  planId: string;
  billingCycle: "MONTHLY" | "YEARLY";
  /** Defaults to recurring; pass `single` only for explicit one-cycle checkout. */
  billingMode?: "recurring" | "single";
};

export function BillingPanel() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiJson<BillingPayload>("/api/billing"),
  });

  const {
    data: recurringData,
    isLoading: recurringLoading,
    isError: recurringError,
    refetch: refetchRecurring,
  } = useQuery({
    queryKey: ["billing", "recurring"],
    queryFn: () =>
      apiJson<{ profiles: RecurringProfile[] }>("/api/billing/recurring"),
  });

  const checkout = useMutation({
    mutationFn: async ({
      planId,
      billingCycle,
      billingMode = "recurring",
    }: CheckoutInput) => {
      return apiJson<{ paymentUrl: string }>("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          billingCycle,
          billingMode,
          locale,
        }),
      });
    },
    onSuccess: (res) => {
      if (res.paymentUrl) {
        window.location.href = res.paymentUrl;
      }
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل الدفع" : "Checkout failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const cancelRecurring = useMutation({
    mutationFn: async (profileId: string) => {
      return apiJson<{ ok: boolean }>(`/api/billing/recurring/${profileId}/cancel`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: locale === "ar" ? "تم إلغاء الاشتراك المتكرر" : "Recurring subscription canceled",
      });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل إلغاء الاشتراك" : "Failed to cancel",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const resumeRecurring = useMutation({
    mutationFn: async (profileId: string) => {
      return apiJson<{ ok: boolean }>(`/api/billing/recurring/${profileId}/resume`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: locale === "ar" ? "تم استئناف الاشتراك المتكرر" : "Recurring subscription resumed",
      });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "فشل استئناف الاشتراك" : "Failed to resume",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const plans = data?.plans ?? [];
  const sub = data?.subscription;
  const records = data?.records ?? [];
  const recurringProfiles = recurringData?.profiles ?? [];
  const activeRecurringProfile = recurringProfiles.find((p) => p.status === "ACTIVE");
  const latestFailedRecord = records[0]?.status === "FAILED" ? records[0] : null;
  const failedCheckout = parseCheckoutMetadata(latestFailedRecord?.metadata);
  const retryCheckout: CheckoutInput | null = sub
    ? {
        planId: sub.plan.id,
        billingCycle: sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
      }
    : failedCheckout;
  const hasBillingFailure = sub?.status === "PAST_DUE" || Boolean(latestFailedRecord);

  return (
    <div className="space-y-4">
      <Panel
        icon={CreditCard}
        tone="primary"
        title={locale === "ar" ? "الاشتراك والاستخدام" : "Subscription & usage"}
        subtitle={
          locale === "ar"
            ? "ادفع عبر مي فاتورة (مدى، فيزا، STC Pay)"
            : "Pay via MyFatoorah (mada, Visa, STC Pay)"
        }
        actions={
          <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
            {(["MONTHLY", "YEARLY"] as const).map((c) => (
              <Button
                key={c}
                size="sm"
                variant={cycle === c ? "default" : "ghost"}
                className="h-7 text-[10px]"
                onClick={() => setCycle(c)}
              >
                {c === "MONTHLY"
                  ? locale === "ar"
                    ? "شهري"
                    : "Monthly"
                  : locale === "ar"
                    ? "سنوي"
                    : "Yearly"}
              </Button>
            ))}
          </div>
        }
      >
        <QueryState
          isLoading={isLoading}
          isError={isError}
          errorMessage={error instanceof Error ? error.message : undefined}
          isEmpty={false}
          onRetry={() => refetch()}
          locale={locale}
          empty={null}
        >
          <div className="p-4 space-y-4">
            {hasBillingFailure && (
              <Alert variant="destructive" className="items-center">
                <AlertCircle className="size-4" />
                <AlertTitle>
                  {locale === "ar" ? "تعذر إتمام الدفع" : "Billing payment failed"}
                </AlertTitle>
                <AlertDescription className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <span>
                    {locale === "ar"
                      ? "حدّث وسيلة الدفع أو أعد المحاولة لاستعادة الاشتراك والحصص."
                      : "Update the payment method or retry checkout to restore the subscription and quotas."}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="mt-2 sm:mt-0 gap-1.5"
                    disabled={
                      checkout.isPending ||
                      !data?.myfatoorahConfigured ||
                      !retryCheckout
                    }
                    onClick={() => {
                      if (retryCheckout) checkout.mutate(retryCheckout);
                    }}
                  >
                    {checkout.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="size-3.5" />
                    )}
                    {locale === "ar" ? "إعادة المحاولة" : "Retry payment"}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {sub ? (
              <div className="rounded-xl border border-border/50 p-4 bg-muted/20 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {locale === "ar"
                        ? sub.plan.nameAr ?? sub.plan.name
                        : sub.plan.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {sub.billingCycle} · {sub.status}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      sub.status === "PAST_DUE"
                        ? "bg-destructive/10 text-destructive border-destructive/20"
                        : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                    )}
                  >
                    {sub.status}
                  </Badge>
                </div>
                <UsageBar
                  label={locale === "ar" ? "العطاءات" : "Proposals"}
                  used={sub.proposalsUsed}
                  max={sub.plan.maxProposals}
                />
                <UsageBar
                  label={locale === "ar" ? "المستندات" : "Documents"}
                  used={sub.documentsUsed}
                  max={sub.plan.maxDocuments}
                />
                <UsageBar
                  label={locale === "ar" ? "الرموز" : "Tokens"}
                  used={sub.tokensUsed}
                  max={sub.plan.maxTokensPerMonth}
                />
                <p className="text-[10px] text-muted-foreground">
                  {locale === "ar" ? "ينتهي" : "Renews"}{" "}
                  {new Date(sub.currentPeriodEnd).toLocaleDateString(
                    locale === "ar" ? "ar-SA" : "en-US"
                  )}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
                <AlertCircle className="size-4 shrink-0" />
                {locale === "ar"
                  ? "لا يوجد اشتراك نشط — اختر باقة للمتابعة ضمن الحصص."
                  : "No active subscription — choose a plan to stay within quotas."}
              </div>
            )}

            {/* Recurring Profile Section */}
            {recurringError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5">
                <ErrorState
                  message={
                    locale === "ar"
                      ? "تعذر تحميل الاشتراكات المتكررة"
                      : "Could not load recurring billing profiles"
                  }
                  onRetry={() => void refetchRecurring()}
                  retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
                  className="py-4"
                />
              </div>
            ) : !recurringLoading && recurringProfiles.length > 0 ? (
              <div className="rounded-xl border border-border/50 p-4 bg-muted/10 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <RefreshCw className="size-4 text-primary" />
                  {locale === "ar" ? "الدفع المتكرر" : "Recurring Billing"}
                </div>
                {recurringProfiles.map((profile) => (
                  <RecurringProfileCard
                    key={profile.id}
                    profile={profile}
                    locale={locale}
                    onCancel={() => cancelRecurring.mutate(profile.id)}
                    onResume={() => resumeRecurring.mutate(profile.id)}
                    isCanceling={cancelRecurring.isPending}
                    isResuming={resumeRecurring.isPending}
                  />
                ))}
              </div>
            ) : null}

            {!data?.myfatoorahConfigured && (
              <p className="text-[11px] text-muted-foreground">
                {locale === "ar"
                  ? "لم يُضبط مفتاح مي فاتورة بعد — أضفه من لوحة المسؤول ← البيئة."
                  : "MyFatoorah API key is not configured — add it in Admin → Environment."}
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const price =
                  cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
                const isCurrent = sub?.plan.id === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "rounded-xl border p-4 space-y-3",
                      isCurrent
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/50"
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {locale === "ar" ? plan.nameAr ?? plan.name : plan.name}
                      </div>
                      <div className="text-lg font-bold tabular-nums mt-1">
                        {price > 0
                          ? `${plan.currency} ${price.toLocaleString()}`
                          : locale === "ar"
                            ? "مجاني"
                            : "Free"}
                        {price > 0 && (
                          <span className="text-[10px] font-normal text-muted-foreground ms-1">
                            /{cycle === "YEARLY" ? (locale === "ar" ? "سنة" : "yr") : locale === "ar" ? "شهر" : "mo"}
                          </span>
                        )}
                      </div>
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1">
                      <li className="flex gap-1.5">
                        <Check className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                        {plan.maxProposals < 0
                          ? locale === "ar"
                            ? "عطاءات غير محدودة"
                            : "Unlimited proposals"
                          : `${plan.maxProposals} ${locale === "ar" ? "عطاء" : "proposals"}`}
                      </li>
                      <li className="flex gap-1.5">
                        <Check className="size-3 text-emerald-600 shrink-0 mt-0.5" />
                        {plan.maxDocuments < 0
                          ? locale === "ar"
                            ? "مستندات غير محدودة"
                            : "Unlimited documents"
                          : `${plan.maxDocuments} ${locale === "ar" ? "مستند" : "documents"}`}
                      </li>
                    </ul>
                    {price <= 0 ? (
                      // Free plans are provisioned by an admin, not through
                      // the paid checkout flow. A dead disabled button that
                      // just said "Via admin" left users confused — replace
                      // it with an explicit note that names where to go.
                      <div
                        className={cn(
                          "rounded-md border border-dashed px-2 py-2 text-[10px]",
                          isCurrent
                            ? "border-primary/30 bg-primary/5 text-primary"
                            : "border-border/50 bg-muted/30 text-muted-foreground"
                        )}
                      >
                        {isCurrent
                          ? locale === "ar"
                            ? "الباقة الحالية — تُدار من قِبل المسؤول."
                            : "Current plan — managed by your workspace admin."
                          : locale === "ar"
                            ? "لا حاجة لدفع. اطلب من مسؤول المنطقة تفعيلها."
                            : "No payment needed. Ask a workspace admin to activate."}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        disabled={
                          isCurrent ||
                          checkout.isPending ||
                          !data?.myfatoorahConfigured
                        }
                        onClick={() =>
                          checkout.mutate({
                            planId: plan.id,
                            billingCycle: cycle,
                          })
                        }
                      >
                        {checkout.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="size-3.5" />
                        )}
                        {isCurrent
                          ? locale === "ar"
                            ? "الباقة الحالية"
                            : "Current plan"
                          : locale === "ar"
                            ? "ادفع عبر مي فاتورة"
                            : "Pay with MyFatoorah"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </QueryState>
      </Panel>

      <Panel
        icon={CreditCard}
        tone="muted"
        title={locale === "ar" ? "سجل المدفوعات" : "Payment history"}
        subtitle={locale === "ar" ? "فواتير مي فاتورة والسجلات" : "MyFatoorah invoices & ledger"}
      >
        {records.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={locale === "ar" ? "لا توجد مدفوعات بعد" : "No payments yet"}
          />
        ) : (
          <div className="divide-y divide-border/40">
            {records.map((r) => (
              <div
                key={r.id}
                className="px-4 py-3 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.description}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {r.invoiceNumber ?? r.id.slice(0, 8)} ·{" "}
                    {new Date(r.createdAt).toLocaleString(
                      locale === "ar" ? "ar-SA" : "en-US"
                    )}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-mono font-semibold">
                    {r.currency} {r.amount.toLocaleString()}
                  </div>
                  <Badge variant="outline" className="text-[9px]">
                    {r.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function RecurringProfileCard({
  profile,
  locale,
  onCancel,
  onResume,
  isCanceling,
  isResuming,
}: {
  profile: RecurringProfile;
  locale: string;
  onCancel: () => void;
  onResume: () => void;
  isCanceling: boolean;
  isResuming: boolean;
}) {
  // Cancel is destructive and irreversible without a fresh checkout flow.
  // A single stray click used to permanently cancel auto-renewal — gate it
  // behind an explicit confirmation.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const isActive = profile.status === "ACTIVE";
  const isCanceled = profile.status === "CANCELED";
  const intervalLabel =
    profile.intervalDays && profile.intervalDays >= 365
      ? locale === "ar"
        ? "سنوي"
        : "Yearly"
      : locale === "ar"
        ? "شهري"
        : "Monthly";

  return (
    <div className="rounded-lg border border-border/40 p-3 bg-background/50 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[9px]",
              isActive
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                : isCanceled
                  ? "bg-muted text-muted-foreground"
                  : "bg-amber-500/10 text-amber-700 border-amber-500/20"
            )}
          >
            {profile.status}
          </Badge>
          <span className="text-[11px] text-muted-foreground">{intervalLabel}</span>
        </div>
        <div className="text-[11px] font-mono font-semibold">
          {profile.currency} {profile.amount?.toLocaleString() ?? "—"}
        </div>
      </div>

      {profile.nextChargeAt && isActive && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CalendarClock className="size-3" />
          {locale === "ar" ? "الدفعة القادمة:" : "Next charge:"}{" "}
          {new Date(profile.nextChargeAt).toLocaleDateString(
            locale === "ar" ? "ar-SA" : "en-US"
          )}
        </div>
      )}

      {profile.failedCharges > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-destructive">
          <AlertCircle className="size-3" />
          {locale === "ar"
            ? `${profile.failedCharges} محاولة فاشلة`
            : `${profile.failedCharges} failed attempt(s)`}
          {profile.lastFailureReason && (
            <span className="text-muted-foreground">— {profile.lastFailureReason}</span>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {isActive && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1"
            disabled={isCanceling}
            onClick={() => setConfirmingCancel(true)}
          >
            {isCanceling ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <PauseCircle className="size-3" />
            )}
            {locale === "ar" ? "إلغاء التجديد" : "Cancel"}
          </Button>
        )}
        {isCanceled && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] gap-1"
            disabled={isResuming}
            onClick={onResume}
          >
            {isResuming ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <PlayCircle className="size-3" />
            )}
            {locale === "ar" ? "استئناف" : "Resume"}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={(open) => {
          if (!isCanceling) setConfirmingCancel(open);
        }}
        title={
          locale === "ar"
            ? "إلغاء التجديد التلقائي؟"
            : "Cancel automatic renewal?"
        }
        description={
          locale === "ar"
            ? "سيتوقف الاشتراك عن التجديد في نهاية دورة الفوترة الحالية. يمكنك الاستئناف لاحقًا، لكن قد تحتاج إلى إعادة عملية الدفع."
            : "The subscription will stop renewing at the end of the current billing cycle. You can resume later, but you may need to restart checkout."
        }
        confirmLabel={
          locale === "ar" ? "نعم، إلغاء التجديد" : "Yes, cancel renewal"
        }
        cancelLabel={locale === "ar" ? "الاحتفاظ بالاشتراك" : "Keep subscription"}
        destructive
        loading={isCanceling}
        onConfirm={() => {
          onCancel();
          setConfirmingCancel(false);
        }}
      />
    </div>
  );
}

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const unlimited = max < 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          {used}
          {unlimited ? "" : ` / ${max}`}
        </span>
      </div>
      {!unlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

function parseCheckoutMetadata(metadata?: string | null): CheckoutInput | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata) as {
      planId?: unknown;
      billingCycle?: unknown;
    };
    if (
      typeof parsed.planId !== "string" ||
      (parsed.billingCycle !== "MONTHLY" && parsed.billingCycle !== "YEARLY")
    ) {
      return null;
    }

    return {
      planId: parsed.planId,
      billingCycle: parsed.billingCycle,
    };
  } catch {
    return null;
  }
}
