/**
 * Words for the enum-like strings the billing and library screens receive from
 * the API (`Plan.name`, `Subscription.status`, `BillingRecord.status`,
 * `legalReviewStatus`). Storage keys such as `PAY_AS_YOU_GO` or `PAST_DUE` are
 * for the database; a customer reads "Pay as you go" and "Past due".
 *
 * Known values come from the app-wide vocabulary in `i18n.ts` so every surface
 * calls a state the same thing. An unknown value is made readable rather than
 * hidden — a new API value is better shown as "Some new state" than as a blank.
 */

import { DYNAMIC_TRANSLATION_KEY_MANIFEST, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/** `SOME_NEW_STATE` → `Some new state`. */
export function humanizeKey(value: string): string {
  const words = value.trim().toLowerCase().split(/[_\s-]+/).filter(Boolean);
  if (words.length === 0) return "";
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

function labelFrom(map: Record<string, string>, value: string | null | undefined, locale: Locale): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const key = map[raw.toUpperCase()];
  return key ? tr(key, locale) : humanizeKey(raw);
}

export function planDisplayName(plan: { name: string; nameAr?: string | null }, locale: Locale): string {
  const key = DYNAMIC_TRANSLATION_KEY_MANIFEST.planName[plan.name as keyof typeof DYNAMIC_TRANSLATION_KEY_MANIFEST.planName];
  if (key) return tr(key, locale);
  if (locale === "ar" && plan.nameAr?.trim()) return plan.nameAr.trim();
  return humanizeKey(plan.name);
}

export function billingCycleLabel(cycle: string | null | undefined, locale: Locale): string {
  return labelFrom(DYNAMIC_TRANSLATION_KEY_MANIFEST.billingCycle, cycle, locale);
}

export function subscriptionStatusLabel(status: string | null | undefined, locale: Locale): string {
  return labelFrom(DYNAMIC_TRANSLATION_KEY_MANIFEST.subscriptionStatus, status, locale);
}

export function paymentStatusLabel(status: string | null | undefined, locale: Locale): string {
  return labelFrom(DYNAMIC_TRANSLATION_KEY_MANIFEST.paymentStatus, status, locale);
}

export function legalReviewStatusLabel(status: string | null | undefined, locale: Locale): string {
  return labelFrom(DYNAMIC_TRANSLATION_KEY_MANIFEST.legalReviewStatus, status, locale);
}
