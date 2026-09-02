"use client";

import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AnalyticsSummary, TimeSeriesPoint, CategoryCount } from "@/lib/proposal-builder-types";
import { tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

const CHART_COLORS = [
  "oklch(0.62 0.2 258)",
  "oklch(0.7 0.16 195)",
  "oklch(0.75 0.18 160)",
  "oklch(0.8 0.18 70)",
  "oklch(0.72 0.22 305)",
  "oklch(0.65 0.15 220)",
];

export function AnalyticsCharts({
  summary,
  locale,
}: {
  summary: AnalyticsSummary;
  locale: string;
}) {
  const loc = locale as Locale;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title={tr("chart_proposalsOverTime", loc)}
        subtitle={tr("chart_axis_date", loc)}
        className="lg:col-span-2"
      >
        <TimeSeriesChart data={summary.charts.proposalsOverTime} locale={locale} />
      </ChartCard>

      <ChartCard
        title={tr("chart_exportsByType", loc)}
        subtitle={tr("chart_axis_category", loc)}
      >
        <CategoryBarChart data={summary.charts.exportsByType} locale={locale} />
      </ChartCard>

      <ChartCard
        title={tr("chart_templateUsage", loc)}
        subtitle={tr("chart_axis_count", loc)}
      >
        <CategoryPieChart data={summary.charts.templateUsage} locale={locale} />
      </ChartCard>

      <ChartCard
        title={tr("chart_sectionCompletion", loc)}
        subtitle={tr("chart_axis_category", loc)}
        className="lg:col-span-2"
      >
        <CategoryBarChart data={summary.charts.sectionCompletion} locale={locale} horizontal />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background/60 p-4 backdrop-blur-xl",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="h-[240px]">{children}</div>
    </div>
  );
}

function TimeSeriesChart({
  data,
  locale,
}: {
  data: TimeSeriesPoint[];
  locale: string;
}) {
  const loc = locale as Locale;
  const ar = locale === "ar";

  if (data.length === 0) {
    return <EmptyChartState message={tr("analytics_no_data", loc)} />;
  }

  const chartData = data.map((point) => ({
    date: new Date(point.date).toLocaleDateString(ar ? "ar-SA" : "en-US", {
      month: "short",
      day: "numeric",
    }),
    value: point.value,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="oklch(0.62 0.2 258)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="oklch(0.62 0.2 258)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.015 240)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "oklch(0.52 0.025 250)" }}
          axisLine={{ stroke: "oklch(0.88 0.015 240)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "oklch(0.52 0.025 250)" }}
          axisLine={{ stroke: "oklch(0.88 0.015 240)" }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.98 0.002 240)",
            border: "1px solid oklch(0.88 0.015 240)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="oklch(0.62 0.2 258)"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CategoryBarChart({
  data,
  locale,
  horizontal = false,
}: {
  data: CategoryCount[];
  locale: string;
  horizontal?: boolean;
}) {
  const loc = locale as Locale;

  if (data.length === 0) {
    return <EmptyChartState message={tr("analytics_no_data", loc)} />;
  }

  const chartData = data.map((item) => ({
    name: item.label?.[locale as "ar" | "en"] ?? item.category,
    value: item.count,
  }));

  if (horizontal) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.015 240)" />
          <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.52 0.025 250)" }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "oklch(0.52 0.025 250)" }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "oklch(0.98 0.002 240)",
              border: "1px solid oklch(0.88 0.015 240)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.015 240)" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "oklch(0.52 0.025 250)" }}
          axisLine={{ stroke: "oklch(0.88 0.015 240)" }}
        />
        <YAxis tick={{ fontSize: 11, fill: "oklch(0.52 0.025 250)" }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.98 0.002 240)",
            border: "1px solid oklch(0.88 0.015 240)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
      </ResponsiveContainer>
    );
}

function CategoryPieChart({
  data,
  locale,
}: {
  data: CategoryCount[];
  locale: string;
}) {
  const loc = locale as Locale;

  if (data.length === 0) {
    return <EmptyChartState message={tr("analytics_no_data", loc)} />;
  }

  const chartData = data.map((item) => ({
    name: item.label?.[locale as "ar" | "en"] ?? item.category,
    value: item.count,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "oklch(0.98 0.002 240)",
            border: "1px solid oklch(0.88 0.015 240)",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
