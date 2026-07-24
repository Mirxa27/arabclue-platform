/**
 * Shared quality gates for tender text extraction and proposal drafting.
 * Rejects mid-sentence scraps, Q&A fragments, and placeholder identities.
 */

const PLATFORM_NAME_RE = /^(arabclue|arab\s*clue|أراب\s*كلاو)$/i;
const JUNK_TITLE_RE = /^(test|testing|ok\s*test|sample|dummy|asdf)\b/i;
const QUESTION_RE =
  /\?$|^(who|what|when|where|why|how|please|is |are |do |does |can |will |هل|ما |ماذا|كيف|متى|أين)/i;

export function isPlaceholderCompanyName(name?: string | null): boolean {
  if (!name?.trim()) return true;
  const n = name.trim();
  if (n.length < 2) return true;
  if (PLATFORM_NAME_RE.test(n)) return true;
  // Default NextAuth-style workspace labels — not bidder legal identity
  if (/^مساحة(\s|$)/u.test(n)) return true;
  if (/workspace$/i.test(n)) return true;
  return false;
}

/** Prefer legal/workspace identity that is not a placeholder or platform name. */
export function resolveBidderDisplayName(
  locale: "ar" | "en",
  brand: { tagline?: string | null; taglineAr?: string | null } | null | undefined,
  company?: { name?: string | null; nameAr?: string | null } | null
): string {
  const ordered =
    locale === "ar"
      ? [company?.nameAr, company?.name, brand?.taglineAr, brand?.tagline]
      : [company?.name, company?.nameAr, brand?.tagline, brand?.taglineAr];
  for (const c of ordered) {
    if (c && !isPlaceholderCompanyName(c)) return c.trim();
  }
  return locale === "ar" ? "الشركة المقدّمة للعطاء" : "Bidding Company";
}

export function looksLikeQuestion(text: string): boolean {
  return QUESTION_RE.test(text.trim());
}

export function isMidSentenceFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Starts with punctuation / connector (common OCR/Q&A scrap)
  if (/^[،,.;:)\-\u2013\u2014]/.test(t)) return true;
  // Starts mid-word Arabic connector patterns
  if (/^(لكن|إلا أن|حيث|ضمن|نحو|من بداية|لكل)\b/.test(t) && t.length < 120) {
    return true;
  }
  // Truncated single-token scraps
  if (t.length < 8) return true;
  if (/^[\u0600-\u06FF]{1,3}$/.test(t)) return true;
  return false;
}

export function isQualityScopeText(text?: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (t.length < 40) return false;
  if (isMidSentenceFragment(t)) return false;
  if (looksLikeQuestion(t)) return false;
  return true;
}

export function isQualityMilestoneName(name?: string | null): boolean {
  if (!name?.trim()) return false;
  const t = name.trim();
  if (t.length < 8 || t.length > 100) return false;
  if (isMidSentenceFragment(t)) return false;
  if (looksLikeQuestion(t)) return false;
  if (/\bpilot period\b/i.test(t)) return false;
  if (/\bsandboxed\b/i.test(t)) return false;
  // Reject pipe-delimited Q&A table scraps
  if ((t.match(/\|/g) ?? []).length >= 2) return false;
  // Prefer names that look like deliverables / phases
  const deliverableCue =
    /milestone|phase|مرحلة|تسليم|mobilization|discovery|design|build|uat|go-?live|تطوير|تنفيذ|اختبار|تشغيل/i.test(
      t
    );
  const hasLetters = /[A-Za-z\u0600-\u06FF]{4,}/.test(t);
  if (!hasLetters) return false;
  // Allow either deliverable cue OR clean short title without question marks
  if (!deliverableCue && /[,;|]/.test(t)) return false;
  return true;
}

export function isQualityRequirementText(text?: string | null): boolean {
  if (!text?.trim()) return false;
  const t = text.trim();
  if (t.length < 20 || t.length > 500) return false;
  if (isMidSentenceFragment(t)) return false;
  if (looksLikeQuestion(t)) return false;
  // Reject meta-evidence lines treated as requirements
  if (
    /^(extracted|evaluation|tender sla|scope of work section|milestones not|local-content|nora\/ea|statutory)/i.test(
      t
    )
  ) {
    return false;
  }
  if ((t.match(/\|/g) ?? []).length >= 2) return false;
  return true;
}

export function isQualityPastProjectTitle(title?: string | null): boolean {
  if (!title?.trim()) return false;
  if (JUNK_TITLE_RE.test(title.trim())) return false;
  if (title.trim().length < 3) return false;
  return true;
}

export const STANDARD_DELIVERY_MILESTONES = [
  { name: "Mobilization", nameAr: "التعبئة والبدء", weeks: 2 },
  { name: "Discovery", nameAr: "الاكتشاف والتحليل", weeks: 4 },
  { name: "Design", nameAr: "التصميم", weeks: 6 },
  { name: "Build", nameAr: "البناء والتطوير", weeks: 16 },
  { name: "UAT & Go-Live", nameAr: "الاختبار والتشغيل", weeks: 4 },
] as const;

export function sanitizeMilestonesForBoq(
  milestones: { name: string; weeks: number }[] | null | undefined,
  locale: "ar" | "en" = "en"
): { name: string; weeks: number }[] {
  const good = (milestones ?? []).filter((m) => isQualityMilestoneName(m.name));
  if (good.length > 0) return good.slice(0, 10);
  return STANDARD_DELIVERY_MILESTONES.map((m) => ({
    name: locale === "ar" ? m.nameAr : m.name,
    weeks: m.weeks,
  }));
}
