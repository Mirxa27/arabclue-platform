/** Bilingual labels for the clarification vocabulary. Pure, shared by the UI and exports. */

import type { Locale } from "../types";
import type { ClarificationKind, ClarificationProvenance, ClarificationSeverity, ClarificationStatus } from "./types";

type L = Readonly<Record<Locale, string>>;

export const KIND_LABEL: Readonly<Record<ClarificationKind, L>> = {
  CONTRADICTION: { ar: "تعارض", en: "Contradiction" },
  AMBIGUITY: { ar: "غموض", en: "Ambiguity" },
  MISSING_INFO: { ar: "معلومة ناقصة", en: "Missing information" },
  RISK_CLAUSE: { ar: "بند عالي المخاطر", en: "Risk clause" },
  PLACEHOLDER: { ar: "حقل غير مكتمل", en: "Placeholder" },
};

export const SEVERITY_LABEL: Readonly<Record<ClarificationSeverity, L>> = {
  CRITICAL: { ar: "حرج", en: "Critical" },
  MAJOR: { ar: "جوهري", en: "Major" },
  MINOR: { ar: "ثانوي", en: "Minor" },
};

export const STATUS_LABEL: Readonly<Record<ClarificationStatus, L>> = {
  PROPOSED: { ar: "مقترح", en: "Proposed" },
  KEPT: { ar: "معتمد للخطاب", en: "Kept" },
  DROPPED: { ar: "مستبعد", en: "Dropped" },
  SUBMITTED: { ar: "مُقدَّم للجهة", en: "Submitted" },
  ANSWERED: { ar: "أجابت الجهة", en: "Answered" },
};

export const PROVENANCE_LABEL: Readonly<Record<ClarificationProvenance, L>> = {
  DETERMINISTIC: { ar: "قاعدة تحقق", en: "Rule" },
  AI_GENERATED: { ar: "ذكاء اصطناعي", en: "AI" },
  USER_AUTHORED: { ar: "الفريق", en: "Team" },
};

export function label<T extends string>(table: Readonly<Record<T, L>>, key: T, locale: Locale): string {
  return table[key]?.[locale] ?? key;
}
