"use client";

import { useState } from "react";
import { useLocale } from "@/lib/store";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Loader2,
  Check,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Panel, EmptyState, QueryState } from "@/components/patterns";
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
};

export function BillingPanel() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiJson<BillingPayload>("/api/billing"),
  });

  const checkout = useMutation({
    mutationFn: async ({ planId, billingCycle }: CheckoutInput) => {
      return apiJson<{ paymentUrl: string }>("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, billingCycle, locale }),
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

  const plans = data?.plans ?? [];
  const sub = data?.subscription;
  const records = data?.records ?? [];
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
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      disabled={
                        isCurrent ||
                        price <= 0 ||
                        checkout.isPending ||
                        !data?.myfatoorahConfigured
                      }
                      onClick={() =>
                        checkout.mutate({ planId: plan.id, billingCycle: cycle })
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
                        : price <= 0
                          ? locale === "ar"
                            ? "عبر المسؤول"
                            : "Via admin"
                          : locale === "ar"
                            ? "ادفع عبر مي فاتورة"
                            : "Pay with MyFatoorah"}
                    </Button>
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
