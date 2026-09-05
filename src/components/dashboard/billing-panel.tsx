"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "@/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { getDynamicTranslationKey, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";
import { clearIntendedPlan, readIntendedPlan } from "@/lib/intended-plan";
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
import { ApiClientError, apiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  billingCycleLabel,
  paymentStatusLabel,
  planDisplayName,
  subscriptionStatusLabel,
} from "@/lib/status-labels";

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
  trialEndsAt?: string | null;
  proposalsUsed: number;
  documentsUsed: number;
  tokensUsed: number;
  plan: Plan;
} | null;

/** Read-time classification the server derives; see resolveEntitlementState. */
type Entitlement = "ACTIVE" | "TRIAL" | "TRIAL_ENDED" | "INACTIVE";

type TrialInfo = {
  active: boolean;
  endsAt: string | null;
  daysLeft: number | null;
};

type RecurringState = "DRAFT" | "ACTIVE" | "SUSPENDED" | "CANCELLED";

type RecurringProfile = {
  id: string;
  recurringId: string;
  status: string;
  /** Normalized state; the server maps legacy spellings such as CANCELED. */
  state: RecurringState | null;
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
  entitlement?: Entitlement;
  trial?: TrialInfo;
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

type CheckoutResponse = { paymentUrl: string; billingMode?: string };

/**
 * Failures that mean "the merchant account cannot set up renewal right now",
 * not "this payment is wrong". Each is retried once as a one-cycle checkout so
 * the customer can still pay; the toast tells them renewal will be manual.
 */
const RECURRING_FALLBACK_CODES = new Set([
  "RECURRING_UNAVAILABLE",
  "RECURRING_PROFILE_EXISTS",
  "NO_PAYMENT_METHODS",
]);

/** Days left at which the trial notice becomes a banner, not just a header line. */
const TRIAL_BANNER_DAYS = 7;

function postCheckout(input: Required<CheckoutInput>, locale: Locale) {
  return apiJson<CheckoutResponse>("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, locale }),
  });
}

export function BillingPanel() {
  const { locale } = useLocale();
  const { data: session } = useSession();
  const isPlatformAdmin =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  /** Plan card the marketing site asked us to bring into view, if any. */
  const [highlightedPlanId, setHighlightedPlanId] = useState<string | null>(null);
  const planCardRefs = useRef(new Map<string, HTMLDivElement>());
  const plansSectionRef = useRef<HTMLDivElement | null>(null);

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
      try {
        return await postCheckout({ planId, billingCycle, billingMode }, locale);
      } catch (err) {
        const code = err instanceof ApiClientError ? err.code : undefined;
        if (billingMode !== "recurring" || !code || !RECURRING_FALLBACK_CODES.has(code)) {
          throw err;
        }
        // Renewal cannot be set up; take the payment for one cycle instead of
        // sending the customer away with a 503.
        toast({
          title: tr("billing_recurring_fallback_title", locale),
          description: tr("billing_recurring_fallback_body", locale),
        });
        return await postCheckout(
          { planId, billingCycle, billingMode: "single" },
          locale
        );
      }
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

  // A zero-priced plan (pay-as-you-go until per-proposal metering ships) is
  // not something a customer can buy here; showing it as "Free · unlimited"
  // beside the paid tiers misled trial users. It stays visible only while the
  // user is actually on it, so the row is never orphaned.
  const plans = (data?.plans ?? []).filter(
    (plan) =>
      Number(plan.priceMonthly) > 0 || data?.subscription?.plan?.id === plan.id
  );
  const sub = data?.subscription;
  const records = data?.records ?? [];
  const recurringProfiles = recurringData?.profiles ?? [];
  const entitlement: Entitlement = data?.entitlement ?? (sub ? "ACTIVE" : "INACTIVE");
  const trial = data?.trial ?? null;
  const trialDaysLeft = trial?.active ? trial.daysLeft : null;
  const latestFailedRecord = records[0]?.status === "FAILED" ? records[0] : null;
  const failedCheckout = parseCheckoutMetadata(latestFailedRecord?.metadata);
  // Retry the purchase that failed, not whatever plan the row currently holds:
  // a trial user whose Pro checkout failed was being offered Starter again.
  const retryCheckout: CheckoutInput | null =
    failedCheckout ??
    (sub
      ? {
          planId: sub.plan.id,
          billingCycle: sub.billingCycle === "YEARLY" ? "YEARLY" : "MONTHLY",
        }
      : null);
  const hasBillingFailure = sub?.status === "PAST_DUE" || Boolean(latestFailedRecord);
  const dateLocale = locale === "ar" ? "ar-SA" : "en-US";

  // The marketing site records the plan a visitor picked before signing up.
  // Once the plans have loaded, honour it once: select the cycle, bring the
  // card into view, and forget the key so a later visit is not steered again.
  useEffect(() => {
    if (plans.length === 0) return;
    const intended = readIntendedPlan();
    if (!intended) return;
    clearIntendedPlan();
    const target = plans.find((plan) => plan.name === intended.plan);
    if (!target) return;
    setCycle(intended.cycle === "yearly" ? "YEARLY" : "MONTHLY");
    setHighlightedPlanId(target.id);
    planCardRefs.current
      .get(target.id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [plans]);

  return (
    <div className="space-y-4">
      <Panel
        icon={CreditCard}
        tone="primary"
        title={locale === "ar" ? "الاشتراك والاستخدام" : "Subscription & usage"}
        subtitle={
          trialDaysLeft !== null
            ? tr("billing_trial_ends_in", locale, { days: trialDaysLeft })
            : locale === "ar"
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
            {entitlement === "TRIAL_ENDED" && (
              <Alert variant="destructive" className="items-center">
                <AlertCircle className="size-4" />
                <AlertTitle>{tr("billing_trial_ended_title", locale)}</AlertTitle>
                <AlertDescription className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <span>{tr("billing_trial_ended_body", locale)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="mt-2 sm:mt-0"
                    onClick={() =>
                      plansSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    {tr("billing_choose_plan", locale)}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {trialDaysLeft !== null && trialDaysLeft <= TRIAL_BANNER_DAYS && trial?.endsAt && (
              <Alert className="items-center border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200">
                <CalendarClock className="size-4" />
                <AlertTitle>{tr("billing_trial_banner_title", locale)}</AlertTitle>
                <AlertDescription className="sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <span>
                    {tr("billing_trial_banner_body", locale, {
                      date: new Date(trial.endsAt).toLocaleDateString(dateLocale),
                    })}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 sm:mt-0 border-amber-500/40"
                    onClick={() =>
                      plansSectionRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    {tr("billing_choose_plan", locale)}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

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
                      {planDisplayName(sub.plan, locale)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {billingCycleLabel(sub.billingCycle, locale)} ·{" "}
                      {subscriptionStatusLabel(sub.status, locale)}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      subscriptionBadgeClass(sub.status, entitlement)
                    )}
                  >
                    {entitlement === "TRIAL" && trialDaysLeft !== null
                      ? tr("billing_trial_days_left_badge", locale, { days: trialDaysLeft })
                      : subscriptionStatusLabel(sub.status, locale)}
                  </Badge>
                </div>
                <UsageBar
                  label={locale === "ar" ? "العطاءات" : "Proposals"}
                  used={sub.proposalsUsed}
                  max={sub.plan.maxProposals}
                  locale={locale}
                  onUpgrade={() =>
                    plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
                <UsageBar
                  label={locale === "ar" ? "المستندات" : "Documents"}
                  used={sub.documentsUsed}
                  max={sub.plan.maxDocuments}
                  locale={locale}
                  onUpgrade={() =>
                    plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
                <UsageBar
                  label={locale === "ar" ? "الرموز" : "Tokens"}
                  used={sub.tokensUsed}
                  max={sub.plan.maxTokensPerMonth}
                  locale={locale}
                  onUpgrade={() =>
                    plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  {entitlement === "TRIAL" || entitlement === "TRIAL_ENDED"
                    ? locale === "ar"
                      ? "تنتهي الفترة التجريبية"
                      : "Trial ends"
                    : locale === "ar"
                      ? "ينتهي"
                      : "Renews"}{" "}
                  {new Date(
                    (entitlement === "TRIAL" || entitlement === "TRIAL_ENDED") && trial?.endsAt
                      ? trial.endsAt
                      : sub.currentPeriodEnd
                  ).toLocaleDateString(dateLocale)}
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
                {isPlatformAdmin
                  ? locale === "ar"
                    ? "لم يُضبط مفتاح مي فاتورة بعد — أضفه من لوحة المسؤول ← البيئة."
                    : "MyFatoorah API key is not configured — add it in Admin → Environment."
                  : locale === "ar"
                    ? "الدفع الإلكتروني قيد التفعيل — تواصل مع الدعم لإتمام الاشتراك."
                    : "Online payment is being set up — contact support to complete your subscription."}
              </p>
            )}

            <div
              ref={plansSectionRef}
              id="billing-plans"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {plans.map((plan) => {
                const price =
                  cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
                const isCurrent = sub?.plan.id === plan.id;
                // Only a paid, active subscription makes a plan "current" in the
                // sense of "nothing to buy". A trial on Starter still needs to
                // be paid for, so its card must stay purchasable.
                const isPaidCurrent = isCurrent && entitlement === "ACTIVE";
                const isHighlighted = highlightedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    ref={(node) => {
                      if (node) planCardRefs.current.set(plan.id, node);
                      else planCardRefs.current.delete(plan.id);
                    }}
                    className={cn(
                      "rounded-xl border p-4 space-y-3",
                      isCurrent
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/50",
                      isHighlighted && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold">
                        {planDisplayName(plan, locale)}
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
                          isPaidCurrent ||
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
                        {isPaidCurrent
                          ? locale === "ar"
                            ? "الباقة الحالية"
                            : "Current plan"
                          : isCurrent
                            ? tr("billing_plan_activate", locale)
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
                    {paymentStatusLabel(r.status, locale)}
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
  // Decide from the normalized state the server derives, never from the raw
  // column: the server writes "CANCELLED" while older rows carry "CANCELED",
  // and Resume used to test the one spelling that never occurs.
  const state = profile.state;
  const isActive = state === "ACTIVE";
  const canResume = state === "SUSPENDED";
  const canCancel = state === "ACTIVE" || state === "DRAFT" || state === "SUSPENDED";
  const stateLabel = state
    ? tr(getDynamicTranslationKey("recurringProfileState", state), locale as Locale)
    : profile.status;
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
                : state === "CANCELLED"
                  ? "bg-muted text-muted-foreground"
                  : state === "SUSPENDED"
                    ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                    : "bg-sky-500/10 text-sky-700 border-sky-500/20"
            )}
          >
            {stateLabel}
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
        {canCancel && (
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
        {canResume && (
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
        description={tr("billing_cancel_renewal_body", locale as Locale)}
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

/** Share of an allowance at which the bar turns amber and offers an upgrade. */
const USAGE_WARN_PCT = 80;

function UsageBar({
  label,
  used,
  max,
  locale,
  onUpgrade,
}: {
  label: string;
  used: number;
  max: number;
  locale: Locale;
  onUpgrade: () => void;
}) {
  const unlimited = max < 0;
  // Unclamped for the tone: 100 % and 140 % are both "over", and both must
  // read red rather than looking like a bar that is merely full.
  const ratio = unlimited ? 0 : (used / Math.max(max, 1)) * 100;
  const pct = Math.min(100, Math.round(ratio));
  const tone = unlimited
    ? "ok"
    : ratio >= 100
      ? "over"
      : ratio >= USAGE_WARN_PCT
        ? "warn"
        : "ok";
  return (
    <div>
      <div className="flex justify-between gap-2 text-[10px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-2">
          {tone !== "ok" && (
            <button
              type="button"
              onClick={onUpgrade}
              className={cn(
                "font-medium underline-offset-2 hover:underline",
                tone === "over" ? "text-destructive" : "text-amber-700 dark:text-amber-300"
              )}
            >
              {tr("billing_usage_upgrade", locale)}
            </button>
          )}
          <span
            className={cn(
              "font-mono",
              tone === "over" && "text-destructive font-semibold",
              tone === "warn" && "text-amber-700 dark:text-amber-300"
            )}
          >
            {used}
            {unlimited ? "" : ` / ${max}`}
          </span>
        </span>
      </div>
      {!unlimited && (
        <Progress
          value={pct}
          className={cn(
            "h-1.5",
            tone === "over" && "[&>[data-slot=progress-indicator]]:bg-destructive",
            tone === "warn" && "[&>[data-slot=progress-indicator]]:bg-amber-500"
          )}
        />
      )}
    </div>
  );
}

/**
 * Badge tone for the subscription status. `entitlement` wins for a trial so a
 * legacy `ACTIVE` Starter row that is really a trial reads as one.
 */
function subscriptionBadgeClass(status: string, entitlement: Entitlement): string {
  if (entitlement === "TRIAL" || status === "TRIALING") {
    return "bg-sky-500/10 text-sky-700 border-sky-500/20";
  }
  if (entitlement === "TRIAL_ENDED" || status === "CANCELLED" || status === "EXPIRED") {
    return "bg-muted text-muted-foreground";
  }
  if (status === "PAST_DUE") {
    return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  }
  if (status === "ACTIVE") {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  }
  // PENDING and anything unknown: neutral outline only.
  return "";
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
