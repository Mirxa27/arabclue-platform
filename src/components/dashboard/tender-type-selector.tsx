"use client";

import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { TENDER_TYPES } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Cpu,
  Building2,
  Lightbulb,
  Settings,
  HeartPulse,
  Package,
  Zap,
} from "lucide-react";

const ICONS: Record<string, typeof Cpu> = {
  Cpu,
  Building2,
  Lightbulb,
  Settings,
  HeartPulse,
  Package,
};

export function TenderTypeSelector() {
  const { locale } = useLocale();
  const { tenderType, setTenderType, setView } = useUI();

  return (
    <Card className="p-0 overflow-hidden border-border/60">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{tr("tender_type", locale)}</span>
          <span className="text-[10px] text-muted-foreground">
            {locale === "ar" ? "اختر نوع المناقصة لتكييف سير عمل الوكلاء" : "Select tender type to tailor the agent workflow"}
          </span>
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {TENDER_TYPES.map((t) => {
          const Icon = ICONS[t.icon] ?? Package;
          const active = tenderType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTenderType(t.id)}
              className={cn(
                "relative rounded-lg border p-3 text-start transition-all group overflow-hidden",
                active
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border/60 hover:border-primary/30 hover:bg-muted/30"
              )}
            >
              {active && (
                <div
                  className="absolute inset-0 opacity-5"
                  style={{ background: `linear-gradient(135deg, ${t.color}, transparent)` }}
                />
              )}
              <div className="relative flex items-center gap-2 mb-1.5">
                <div
                  className={cn(
                    "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    active ? "text-white" : "bg-muted"
                  )}
                  style={active ? { backgroundColor: t.color } : {}}
                >
                  <Icon className="size-4" />
                </div>
                {active && (
                  <span className="text-[9px] font-bold text-primary uppercase tracking-wider">
                    {locale === "ar" ? "محدد" : "Selected"}
                  </span>
                )}
              </div>
              <div className="relative text-xs font-semibold truncate" style={{ color: active ? t.color : undefined }}>
                {locale === "ar" ? t.nameAr : t.name}
              </div>
              <div className="relative text-[9px] text-muted-foreground mt-0.5">
                {locale === "ar" ? "عقوبة قصوى" : "Max penalty"}: {t.slaMaxPenalty}%
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
