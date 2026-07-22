"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Activity, PieChart as PieIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChartSkeleton } from "./loading-skeletons";
import type { StatsResponse } from "@/lib/api-types";

const COLORS = ["#1E3A8A", "#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

type ChartDatum = { name: string; value: number; status?: string };

export function ChartsPanel() {
  const { locale } = useLocale();
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("stats failed");
      return res.json() as Promise<StatsResponse>;
    },
    refetchInterval: 10000,
  });

  const statusData: ChartDatum[] = (data?.charts?.statusBreakdown ?? []).map(
    (s) => ({
      name: tr(`status_${s.status}` as Parameters<typeof tr>[0], locale),
      value: s.count,
      status: s.status,
    })
  );

  const catData: ChartDatum[] = (data?.charts?.docCategoryBreakdown ?? []).map(
    (d) => ({
      name: tr(`cat_${d.category}` as Parameters<typeof tr>[0], locale),
      value: d.count,
    })
  );

  const statusTotal = statusData.reduce((a, b) => a + b.value, 0);
  const catTotal = catData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-0 overflow-hidden border-border/50 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-gradient-to-b from-muted/40 to-transparent">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-chart-1/10 flex items-center justify-center ring-1 ring-chart-1/15">
              <Activity className="size-3.5 text-chart-1" />
            </div>
            <span className="text-xs font-semibold tracking-tight">
              {locale === "ar"
                ? "توزيع حالات المشاريع"
                : "Project Status Distribution"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
            {statusTotal} {locale === "ar" ? "مشروع" : "projects"}
          </Badge>
        </div>
        <div className="p-4 h-56">
          {isLoading ? (
            <ChartSkeleton className="p-0 h-full" />
          ) : statusData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              {tr("no_data", locale)}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusData}
                margin={{ top: 4, right: 8, bottom: 4, left: -16 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={36}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden border-border/50 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-gradient-to-b from-muted/40 to-transparent">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-chart-2/10 flex items-center justify-center ring-1 ring-chart-2/15">
              <PieIcon className="size-3.5 text-chart-2" />
            </div>
            <span className="text-xs font-semibold tracking-tight">
              {locale === "ar" ? "فئات المستندات" : "Document Categories"}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono tabular-nums">
            {catTotal} {locale === "ar" ? "ملف" : "files"}
          </Badge>
        </div>
        <div className="p-4 h-56">
          {isLoading ? (
            <ChartSkeleton className="p-0 h-full" />
          ) : catData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              {tr("no_data", locale)}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={catData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {catData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 9 }}
                  iconSize={8}
                  iconType="circle"
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}
