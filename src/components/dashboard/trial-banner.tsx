"use client";

import { startTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock3 } from "lucide-react";
import { apiJson } from "@/lib/api-client";
import { tr } from "@/lib/i18n";
import { useLocale, useUI } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Days left at which the whole app, not just Billing, starts saying so. */
export const TRIAL_BANNER_DAYS = 7;

type BillingSummary = {
  entitlement?: string;
  trial?: { active: boolean; endsAt: string | null; daysLeft: number | null };
  billingOwner?: { isSelf: boolean };
};

/**
 * Decides what the shell-level banner shows. Pure so the thresholds are
 * testable: nothing for paid or early-trial workspaces, a countdown in the
 * last week, and the wall once the trial has ended. Teammates never see it —
 * the person who can act on it is the workspace owner.
 */
export function resolveTrialBanner(
  data: BillingSummary | undefined
): { kind: "ending"; daysLeft: number; endsAt: string } | { kind: "ended" } | null {
  if (!data || data.billingOwner?.isSelf === false) return null;
  if (data.entitlement === "TRIAL_ENDED") return { kind: "ended" };
  const trial = data.trial;
  if (
    data.entitlement === "TRIAL" &&
    trial?.active &&
    typeof trial.daysLeft === "number" &&
    trial.daysLeft <= TRIAL_BANNER_DAYS &&
    trial.endsAt
  ) {
    return { kind: "ending", daysLeft: trial.daysLeft, endsAt: trial.endsAt };
  }
  return null;
}

export function TrialBanner() {
  const { locale } = useLocale();
  const { view, setView } = useUI();
  const { data } = useQuery({
    queryKey: ["billing"],
    queryFn: () => apiJson<BillingSummary>("/api/billing"),
    staleTime: 60_000,
  });
  const banner = resolveTrialBanner(data);
  // Billing already carries the full alert; do not stack two.
  if (!banner || view === "billing") return null;

  const ended = banner.kind === "ended";
  return (
    <div
      role="status"
      className={cn(
        "mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
        ended
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10"
      )}
    >
      <span className="flex items-center gap-2">
        {ended ? (
          <AlertTriangle className="size-4 shrink-0" />
        ) : (
          <Clock3 className="size-4 shrink-0" />
        )}
        <span>
          <strong className="font-semibold">
            {ended
              ? tr("billing_trial_ended_title", locale)
              : tr("billing_trial_ends_in", locale, { days: String(banner.daysLeft) })}
          </strong>{" "}
          {ended
            ? tr("billing_trial_ended_body", locale)
            : tr("billing_trial_banner_body", locale, {
                date: banner.endsAt.slice(0, 10),
              })}
        </span>
      </span>
      <button
        type="button"
        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90"
        onClick={() => startTransition(() => setView("billing"))}
      >
        {tr("billing_choose_plan", locale)}
      </button>
    </div>
  );
}
