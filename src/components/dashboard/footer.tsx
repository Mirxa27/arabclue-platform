"use client";

import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { ShieldCheck, Server, Globe } from "lucide-react";

export function DashboardFooter() {
  const { locale } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 mt-auto border-t border-border bg-card/80 backdrop-blur-sm">
      <div className="px-4 lg:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <span className="font-semibold text-foreground">
            {tr("appName", locale)}
          </span>
          <span className="text-muted-foreground">© {year} {tr("footer_rights", locale)}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Server className="size-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>{locale === "ar" ? "مستضاف في الرياض" : "Hosted in Riyadh"}</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>{tr("footer_pdpl_note", locale)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Globe className="size-3.5 text-chart-2" />
            <span className="font-mono">v1.0.0</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
