"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Loader2, LogIn, Wallet } from "lucide-react";
import { usePublicLocale } from "@/components/marketing/public-shell";
import {
  formatBudgetCompact,
  type TenderInsights,
} from "@/lib/tender-insights";

type ApiResponse = {
  insights: TenderInsights;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "unauth" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; insights: TenderInsights };

function TooltipCard({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  locale: "ar" | "en";
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const ar = locale === "ar";
  return (
    <div className="rounded-lg border border-white/15 bg-[oklch(0.16_0.02_240)]/95 px-3 py-2 text-xs text-white shadow-xl backdrop-blur">
      <p className="font-semibold">{row.name}</p>
      <p className="mt-1 text-white/70">
        {formatBudgetCompact(row.value, locale)}
      </p>
      <p className="text-white/50">
        {row.count} {ar ? "مناقصة" : "tenders"} · {row.share}%
      </p>
    </div>
  );
}

type ChartRow = {
  name: string;
  value: number;
  count: number;
  share: number;
  color: string;
};

/**
 * Owner Portal "Tender Insights" — total budget distribution across all active
 * tenders by category, rendered with Recharts. Reads live tenant data when the
 * viewer is signed in; otherwise shows a sign-in call-to-action.
 */
export function TenderInsightsChart() {
  const locale = usePublicLocale();
  const ar = locale === "ar";
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/stats/tender-insights", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        // Unauthenticated: either a 401/403, or middleware redirected us to /login.
        if (
          res.status === 401 ||
          res.status === 403 ||
          (res.redirected && /\/login/i.test(res.url))
        ) {
          setState({ kind: "unauth" });
          return;
        }
        if (!res.ok) {
          setState({
            kind: "error",
            message: `HTTP ${res.status}`,
          });
          return;
        }
        // Non-JSON (e.g. a login HTML page) also means unauthenticated.
        if (
          !(res.headers.get("content-type") || "").includes("application/json")
        ) {
          setState({ kind: "unauth" });
          return;
        }
        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!data.insights || data.insights.rows.length === 0) {
          setState({ kind: "empty" });
          return;
        }
        setState({ kind: "ready", insights: data.insights });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Network error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: ChartRow[] =
    state.kind === "ready"
      ? state.insights.rows.map((r) => ({
          name: ar ? r.labelAr : r.label,
          value: r.totalBudget,
          count: r.count,
          share: r.share,
          color: r.color,
        }))
      : [];

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="overflow-hidden rounded-2xl border border-white/12 bg-white/[0.03] backdrop-blur-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[oklch(0.72_0.12_195)]/15 text-[oklch(0.82_0.12_195)] ring-1 ring-[oklch(0.72_0.12_195)]/25">
              <BarChart3 className="size-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {ar ? "رؤى المناقصات" : "Tender Insights"}
              </h2>
              <p className="text-xs text-white/50">
                {ar
                  ? "توزيع إجمالي الميزانية على المناقصات النشطة حسب الفئة"
                  : "Total budget distribution across active tenders by category"}
              </p>
            </div>
          </div>
          {state.kind === "ready" ? (
            <div className="text-right">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-[oklch(0.82_0.12_195)]">
                <Wallet className="size-3.5" />
                {formatBudgetCompact(state.insights.totalBudget, locale)}
              </p>
              <p className="text-[11px] text-white/40">
                {state.insights.activeCount}{" "}
                {ar ? "مناقصة نشطة" : "active tenders"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="p-5 sm:p-6">
          {state.kind === "loading" ? (
            <div className="flex h-72 items-center justify-center text-white/40">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : state.kind === "unauth" ? (
            <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/5 text-white/60">
                <LogIn className="size-5" />
              </span>
              <p className="max-w-md text-sm text-white/60">
                {ar
                  ? "سجّل الدخول لعرض توزيع ميزانيات مناقصاتك النشطة مباشرةً."
                  : "Sign in to see the live budget distribution of your active tenders."}
              </p>
              <Link
                href="/login"
                className="rounded-none bg-[oklch(0.72_0.12_195)] px-4 py-2 text-sm font-semibold text-[oklch(0.14_0.02_240)] transition-colors hover:bg-[oklch(0.78_0.12_195)]"
              >
                {ar ? "ادخل مساحة العمل" : "Enter workspace"}
              </Link>
            </div>
          ) : state.kind === "error" ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-white/60">
                {ar
                  ? "تعذّر تحميل رؤى المناقصات."
                  : "Could not load tender insights."}
              </p>
              <p className="font-mono text-[11px] text-white/30">
                {state.message}
              </p>
            </div>
          ) : state.kind === "empty" ? (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-white/5 text-white/50">
                <BarChart3 className="size-5" />
              </span>
              <p className="max-w-md text-sm text-white/60">
                {ar
                  ? "لا توجد مناقصات نشطة بعد. أنشئ مناقصة وشغّل الوكلاء لرؤية الرؤى هنا."
                  : "No active tenders yet. Create a tender and run the agents to see insights here."}
              </p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  layout="vertical"
                  margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
                    tickFormatter={(v: number) => formatBudgetCompact(v, locale)}
                    axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={ar ? 150 : 130}
                    tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={<TooltipCard locale={locale} />}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={30}>
                    {rows.map((r) => (
                      <Cell key={r.name} fill={r.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}
