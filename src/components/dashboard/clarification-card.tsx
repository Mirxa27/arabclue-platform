"use client";

import { useState } from "react";
import { Check, FileText, MessageSquareReply, Pencil, RotateCcw, Send, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ClarificationRecord, ClarificationPatch } from "@/lib/tender-interrogation/repository";
import { KIND_LABEL, PROVENANCE_LABEL, SEVERITY_LABEL, STATUS_LABEL, label } from "@/lib/tender-interrogation/labels";
import type { ClarificationStatus } from "@/lib/tender-interrogation/types";

type Locale = "ar" | "en";

const SEVERITY_STRIPE: Record<ClarificationRecord["severity"], string> = {
  CRITICAL: "bg-rose-500",
  MAJOR: "bg-amber-500",
  MINOR: "bg-sky-500",
};
const SEVERITY_TEXT: Record<ClarificationRecord["severity"], string> = {
  CRITICAL: "text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/30",
  MAJOR: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30",
  MINOR: "text-sky-700 dark:text-sky-300 bg-sky-500/10 border-sky-500/30",
};
const STATUS_TONE: Record<ClarificationStatus, string> = {
  PROPOSED: "bg-muted text-muted-foreground",
  KEPT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  DROPPED: "bg-muted text-muted-foreground line-through",
  SUBMITTED: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  ANSWERED: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
};

/** One finding: what the tender says, why it matters, and the question the team may send. */
export function ClarificationCard({
  item,
  locale,
  busy,
  canWrite,
  onPatch,
}: {
  item: ClarificationRecord;
  locale: Locale;
  busy: boolean;
  canWrite: boolean;
  onPatch: (id: string, patch: ClarificationPatch) => void;
}) {
  const ar = locale === "ar";
  const [editing, setEditing] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [draftEn, setDraftEn] = useState(item.questionEn);
  const [draftAr, setDraftAr] = useState(item.questionAr);
  const [answer, setAnswer] = useState(item.answerMd ?? "");
  const dropped = item.status === "DROPPED";

  const title = ar ? item.titleAr : item.titleEn;
  const rationale = ar ? item.rationaleAr : item.rationaleEn;
  const question = ar ? item.questionAr : item.questionEn;

  const move = (status: ClarificationStatus) => onPatch(item.id, { status });
  const saveEdit = () => {
    onPatch(item.id, { questionEn: draftEn.trim(), questionAr: draftAr.trim() });
    setEditing(false);
  };
  const saveAnswer = () => {
    onPatch(item.id, { answerMd: answer.trim() || null, ...(answer.trim() ? { status: "ANSWERED" as const } : {}) });
    setAnswering(false);
  };

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-shadow hover:shadow-md",
        dropped && "opacity-60"
      )}
      dir={ar ? "rtl" : "ltr"}
      aria-busy={busy || undefined}
    >
      <span className={cn("absolute inset-y-0 start-0 w-1", SEVERITY_STRIPE[item.severity])} aria-hidden />
      <div className="ps-5 pe-4 py-4 space-y-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={cn("rounded-full border px-2 py-0.5 font-semibold", SEVERITY_TEXT[item.severity])}>
                {label(SEVERITY_LABEL, item.severity, locale)}
              </span>
              <Badge variant="outline" className="rounded-full font-medium">
                {label(KIND_LABEL, item.kind, locale)}
              </Badge>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {label(PROVENANCE_LABEL, item.provenance, locale)}
              </span>
              {item.provenance === "AI_GENERATED" && item.provenanceDetail.model ? (
                <span className="text-muted-foreground/70" title={String(item.provenanceDetail.provider ?? "")}>
                  {String(item.provenanceDetail.model)}
                </span>
              ) : null}
            </div>
            <h3 className="text-sm font-semibold leading-snug tracking-tight">{title}</h3>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[item.status])}>
            {label(STATUS_LABEL, item.status, locale)}
          </span>
        </header>

        {item.quotes.length > 0 ? (
          <ul className="space-y-1.5">
            {item.quotes.map((q, i) => (
              <li
                key={`${item.id}-q${i}`}
                className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-[12.5px] leading-relaxed"
              >
                <blockquote dir="auto" className="text-foreground/90">“{q.text}”</blockquote>
                {q.documentName || q.pageRef ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <FileText className="size-3" aria-hidden />
                    <span dir="auto">{q.documentName}</span>
                    {q.pageRef ? <span>· {ar ? `ص ${q.pageRef}` : `p. ${q.pageRef}`}</span> : null}
                    {q.sectionHeading ? <span dir="auto" className="truncate max-w-[16rem]">· {q.sectionHeading}</span> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{rationale}</p>

        <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary">
            <span>{ar ? "الاستفسار المقترح" : "Proposed question"}</span>
            {canWrite && !editing && !dropped ? (
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setEditing(true)} disabled={busy}>
                <Pencil className="size-3" aria-hidden />
                {ar ? "تحرير" : "Edit"}
              </Button>
            ) : null}
          </div>
          {editing ? (
            <div className="space-y-2">
              <label className="block text-[11px] text-muted-foreground">
                {ar ? "النص العربي" : "Arabic"}
                <Textarea dir="rtl" value={draftAr} onChange={(e) => setDraftAr(e.target.value)} rows={3} className="mt-1 text-[13px]" />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                {ar ? "النص الإنجليزي" : "English"}
                <Textarea dir="ltr" value={draftEn} onChange={(e) => setDraftEn(e.target.value)} rows={3} className="mt-1 text-[13px]" />
              </label>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveEdit} disabled={busy || draftAr.trim().length < 10 || draftEn.trim().length < 10}>
                  <Check className="size-3.5" aria-hidden />
                  {ar ? "حفظ" : "Save"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setDraftAr(item.questionAr); setDraftEn(item.questionEn); }}>
                  <X className="size-3.5" aria-hidden />
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed">{question}</p>
          )}
          {item.editedAt ? (
            <p className="mt-1 text-[10.5px] text-muted-foreground">{ar ? "عُدِّل يدوياً" : "Edited by the team"}</p>
          ) : null}
        </div>

        {item.answerMd || answering ? (
          <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-3 py-2.5">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              {ar ? "إجابة الجهة" : "Entity's answer"}
              {item.answeredAt ? <span className="ms-2 font-normal normal-case text-muted-foreground">{item.answeredAt.slice(0, 10)}</span> : null}
            </div>
            {answering ? (
              <div className="space-y-2">
                <Textarea dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} className="text-[13px]" placeholder={ar ? "انسخ إجابة الجهة كما نُشرت" : "Paste the entity's answer as published"} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={saveAnswer} disabled={busy}>
                    <Check className="size-3.5" aria-hidden />
                    {ar ? "حفظ الإجابة" : "Save answer"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setAnswering(false); setAnswer(item.answerMd ?? ""); }}>
                    {ar ? "إلغاء" : "Cancel"}
                  </Button>
                </div>
              </div>
            ) : (
              <p dir="auto" className="whitespace-pre-wrap text-[13px] leading-relaxed">{item.answerMd}</p>
            )}
          </div>
        ) : null}

        {canWrite ? (
          <footer className="flex flex-wrap items-center gap-1.5 pt-1">
            {item.status === "PROPOSED" ? (
              <>
                <Button type="button" size="sm" onClick={() => move("KEPT")} disabled={busy}>
                  <Check className="size-3.5" aria-hidden />
                  {ar ? "اعتماد للخطاب" : "Keep for letter"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move("DROPPED")} disabled={busy}>
                  <X className="size-3.5" aria-hidden />
                  {ar ? "استبعاد" : "Drop"}
                </Button>
              </>
            ) : null}
            {item.status === "KEPT" ? (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={() => move("SUBMITTED")} disabled={busy}>
                  <Send className="size-3.5" aria-hidden />
                  {ar ? "تم تقديمه للجهة" : "Mark submitted"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move("PROPOSED")} disabled={busy}>
                  <Undo2 className="size-3.5" aria-hidden />
                  {ar ? "إلغاء الاعتماد" : "Unkeep"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move("DROPPED")} disabled={busy}>
                  <X className="size-3.5" aria-hidden />
                  {ar ? "استبعاد" : "Drop"}
                </Button>
              </>
            ) : null}
            {item.status === "DROPPED" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => move("PROPOSED")} disabled={busy}>
                <RotateCcw className="size-3.5" aria-hidden />
                {ar ? "استرجاع" : "Restore"}
              </Button>
            ) : null}
            {item.status === "SUBMITTED" ? (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={() => setAnswering(true)} disabled={busy || answering}>
                  <MessageSquareReply className="size-3.5" aria-hidden />
                  {ar ? "تسجيل الإجابة" : "Record answer"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move("KEPT")} disabled={busy}>
                  <Undo2 className="size-3.5" aria-hidden />
                  {ar ? "إرجاع إلى معتمد" : "Back to kept"}
                </Button>
              </>
            ) : null}
            {item.status === "ANSWERED" ? (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAnswering(true)} disabled={busy || answering}>
                  <Pencil className="size-3.5" aria-hidden />
                  {ar ? "تعديل الإجابة" : "Edit answer"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => move("SUBMITTED")} disabled={busy}>
                  <Undo2 className="size-3.5" aria-hidden />
                  {ar ? "إعادة الفتح" : "Reopen"}
                </Button>
              </>
            ) : null}
          </footer>
        ) : null}
      </div>
    </article>
  );
}
