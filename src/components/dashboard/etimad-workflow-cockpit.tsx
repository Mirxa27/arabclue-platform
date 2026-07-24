"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  CalendarClock,
  FileStack,
  Landmark,
  Package,
  Shield,
} from "lucide-react";

type ChecklistKey =
  | "deadlineLogged"
  | "clarifications"
  | "bidBond"
  | "techEnvelope"
  | "finEnvelope"
  | "portalReady";

const KEYS: {
  id: ChecklistKey;
  icon: typeof CalendarClock;
  en: string;
  ar: string;
  hintEn: string;
  hintAr: string;
}[] = [
  {
    id: "deadlineLogged",
    icon: CalendarClock,
    en: "Submission deadline tracked",
    ar: "موعد التقديم مُتتبَّع",
    hintEn: "Confirm Etimad closing date/time (KSA).",
    hintAr: "أكد تاريخ ووقت الإغلاق في اعتماد (توقيت السعودية).",
  },
  {
    id: "clarifications",
    icon: FileStack,
    en: "Clarifications / Q&A closed",
    ar: "الاستفسارات مغلقة",
    hintEn: "Download Q&A addenda before final packaging.",
    hintAr: "نزّل ملحقات الأسئلة والأجوبة قبل الحزمة النهائية.",
  },
  {
    id: "bidBond",
    icon: Landmark,
    en: "Bid bond / guarantee ready",
    ar: "ضمان ابتدائي جاهز",
    hintEn: "Bank guarantee per tender % — outside ArabClue portal.",
    hintAr: "ضمان بنكي حسب نسبة الكراسة — خارج بوابة أراب كلو.",
  },
  {
    id: "techEnvelope",
    icon: Package,
    en: "Technical envelope packaged",
    ar: "المغلف الفني مجهّز",
    hintEn: "Technical proposal + compliance evidence ZIP.",
    hintAr: "العرض الفني + أدلة الامتثال في ZIP.",
  },
  {
    id: "finEnvelope",
    icon: Package,
    en: "Financial envelope priced",
    ar: "المغلف المالي مسعّر",
    hintEn: "Human-entered BoQ / forms only — no AI pricing.",
    hintAr: "أسعار بشرية فقط في جدول الكميات — بدون تسعير آلي.",
  },
  {
    id: "portalReady",
    icon: Shield,
    en: "Ready for manual Etimad upload",
    ar: "جاهز للرفع اليدوي على اعتماد",
    hintEn: "ArabClue does not submit to Etimad API.",
    hintAr: "أراب كلو لا يرسل عبر واجهة اعتماد.",
  },
];

function storageKey(projectId: string) {
  return `arabclue-etimad-cockpit:${projectId}`;
}

export function EtimadWorkflowCockpit({
  projectId,
  locale,
  deadline,
  etimadRef,
}: {
  projectId: string | null;
  locale: "ar" | "en";
  deadline?: string | null;
  etimadRef?: string | null;
}) {
  const ar = locale === "ar";
  const [checks, setChecks] = useState<Record<ChecklistKey, boolean>>({
    deadlineLogged: false,
    clarifications: false,
    bidBond: false,
    techEnvelope: false,
    finEnvelope: false,
    portalReady: false,
  });

  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ChecklistKey, boolean>>;
        setChecks((prev) => ({ ...prev, ...parsed }));
      } else {
        setChecks({
          deadlineLogged: Boolean(deadline),
          clarifications: false,
          bidBond: false,
          techEnvelope: false,
          finEnvelope: false,
          portalReady: false,
        });
      }
    } catch {
      /* ignore */
    }
  }, [projectId, deadline]);

  const doneCount = useMemo(
    () => KEYS.filter((k) => checks[k.id]).length,
    [checks]
  );

  function toggle(id: ChecklistKey, value: boolean) {
    setChecks((prev) => {
      const next = { ...prev, [id]: value };
      if (projectId) {
        try {
          localStorage.setItem(storageKey(projectId), JSON.stringify(next));
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  }

  if (!projectId) return null;

  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleString(ar ? "ar-SA" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : ar
      ? "غير محدد — حدّثه من إعداد المناقصة"
      : "Not set — update in tender setup";

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 border-b border-border/50 bg-muted/20">
        <div>
          <h3 className="text-sm font-semibold">
            {ar ? "لوحة اعتماد اليدوية" : "Etimad manual cockpit"}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
            {ar
              ? "تتبّع المواعيد والضمان والمغلفات قبل الرفع اليدوي على البوابة — بدون واجهة تقديم."
              : "Track deadlines, bonds, and envelopes before manual portal upload — no submission API."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {etimadRef ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {etimadRef}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {ar ? "بدون رقم اعتماد" : "No Etimad ref"}
            </Badge>
          )}
          <Badge
            variant={doneCount === KEYS.length ? "default" : "outline"}
            className="text-[10px] tabular-nums"
          >
            {doneCount}/{KEYS.length}
          </Badge>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2 text-xs">
        <CalendarClock className="size-3.5 text-teal-700 shrink-0" />
        <span className="text-muted-foreground">
          {ar ? "موعد التقديم:" : "Submission deadline:"}
        </span>
        <span
          className={cn(
            "font-medium",
            !deadline && "text-amber-700 dark:text-amber-400"
          )}
        >
          {deadlineLabel}
        </span>
      </div>

      <ul className="divide-y divide-border/40">
        {KEYS.map((item) => {
          const Icon = item.icon;
          const checked = checks[item.id];
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20"
            >
              <Checkbox
                id={`etimad-${item.id}`}
                checked={checked}
                onCheckedChange={(v) => toggle(item.id, v === true)}
                className="mt-0.5"
              />
              <label
                htmlFor={`etimad-${item.id}`}
                className="flex-1 min-w-0 cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Icon className="size-3.5 text-muted-foreground shrink-0" />
                  {ar ? item.ar : item.en}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {ar ? item.hintAr : item.hintEn}
                </p>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Fetch project meta for the cockpit when only id is known. */
export function useProjectEtimadMeta(projectId: string | null) {
  return useQuery({
    queryKey: ["project-etimad", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("project");
      return res.json() as Promise<{
        project?: {
          submissionDeadline?: string | null;
          etimadRef?: string | null;
        };
      }>;
    },
  });
}
