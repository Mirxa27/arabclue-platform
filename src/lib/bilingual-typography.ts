/**
 * Production typography primitives for Arabic-English document rendering.
 *
 * This module intentionally does not shape Arabic text in JavaScript. Arabic
 * joining, contextual glyph selection, ligatures, and kerning are performed by
 * the browser's Unicode text-shaping engine using the selected OpenType font.
 * The application is responsible for supplying a font with the required glyphs,
 * declaring the correct language/direction, and isolating mixed-direction runs.
 */

import type { Locale } from "./typography";

export type BilingualLocale = Locale;
/** Canonical language name shared with the document-layout blueprint. */
export type DocumentLanguage = Locale;
export type StrongDirection = "arabic" | "latin" | "mixed" | "neutral";
export type HtmlDirection = "rtl" | "ltr";
export type NumeralSystem = "latn" | "arab";

export interface StrongDirectionAnalysis {
  readonly direction: StrongDirection;
  readonly arabicLetterCount: number;
  readonly latinLetterCount: number;
}

const LETTER_PATTERN = /^\p{Letter}$/u;
const MARK_PATTERN = /^\p{Mark}$/u;
const NUMBER_PATTERN = /^\p{Number}$/u;
const ARABIC_SCRIPT_PATTERN = /^\p{Script_Extensions=Arabic}$/u;
const LATIN_SCRIPT_PATTERN = /^\p{Script_Extensions=Latin}$/u;

function isArabicLetter(character: string): boolean {
  return LETTER_PATTERN.test(character) && ARABIC_SCRIPT_PATTERN.test(character);
}

function isLatinLetter(character: string): boolean {
  return LETTER_PATTERN.test(character) && LATIN_SCRIPT_PATTERN.test(character);
}

/**
 * Count strong Arabic and Latin letters. Numbers, punctuation, combining marks,
 * emoji, and whitespace are directionally neutral for this classification.
 */
export function analyzeStrongDirection(text: string): StrongDirectionAnalysis {
  let arabicLetterCount = 0;
  let latinLetterCount = 0;

  for (const character of text) {
    if (isArabicLetter(character)) {
      arabicLetterCount += 1;
    } else if (isLatinLetter(character)) {
      latinLetterCount += 1;
    }
  }

  const direction: StrongDirection =
    arabicLetterCount > 0 && latinLetterCount > 0
      ? "mixed"
      : arabicLetterCount > 0
        ? "arabic"
        : latinLetterCount > 0
          ? "latin"
          : "neutral";

  return {
    direction,
    arabicLetterCount,
    latinLetterCount,
  };
}

/** Detect whether text contains Arabic, Latin, both, or no supported strong text. */
export function detectStrongDirection(text: string): StrongDirection {
  return analyzeStrongDirection(text).direction;
}

export interface UnsafeBidiControlDefinition {
  readonly codePoint: number;
  readonly unicode: string;
  readonly name: string;
}

/**
 * Explicit Unicode bidi controls are unsafe in untrusted document text because
 * they can reorder filenames, identifiers, and source-like content invisibly.
 * Use semantic `dir` attributes and `<bdi>` isolation instead.
 */
export const UNSAFE_BIDI_CONTROLS = [
  { codePoint: 0x061c, unicode: "U+061C", name: "ARABIC LETTER MARK" },
  { codePoint: 0x200e, unicode: "U+200E", name: "LEFT-TO-RIGHT MARK" },
  { codePoint: 0x200f, unicode: "U+200F", name: "RIGHT-TO-LEFT MARK" },
  { codePoint: 0x202a, unicode: "U+202A", name: "LEFT-TO-RIGHT EMBEDDING" },
  { codePoint: 0x202b, unicode: "U+202B", name: "RIGHT-TO-LEFT EMBEDDING" },
  { codePoint: 0x202c, unicode: "U+202C", name: "POP DIRECTIONAL FORMATTING" },
  { codePoint: 0x202d, unicode: "U+202D", name: "LEFT-TO-RIGHT OVERRIDE" },
  { codePoint: 0x202e, unicode: "U+202E", name: "RIGHT-TO-LEFT OVERRIDE" },
  { codePoint: 0x2066, unicode: "U+2066", name: "LEFT-TO-RIGHT ISOLATE" },
  { codePoint: 0x2067, unicode: "U+2067", name: "RIGHT-TO-LEFT ISOLATE" },
  { codePoint: 0x2068, unicode: "U+2068", name: "FIRST STRONG ISOLATE" },
  { codePoint: 0x2069, unicode: "U+2069", name: "POP DIRECTIONAL ISOLATE" },
  {
    codePoint: 0x206a,
    unicode: "U+206A",
    name: "INHIBIT SYMMETRIC SWAPPING",
  },
  { codePoint: 0x206b, unicode: "U+206B", name: "ACTIVATE SYMMETRIC SWAPPING" },
  {
    codePoint: 0x206c,
    unicode: "U+206C",
    name: "INHIBIT ARABIC FORM SHAPING",
  },
  {
    codePoint: 0x206d,
    unicode: "U+206D",
    name: "ACTIVATE ARABIC FORM SHAPING",
  },
  {
    codePoint: 0x206e,
    unicode: "U+206E",
    name: "NATIONAL DIGIT SHAPES",
  },
  { codePoint: 0x206f, unicode: "U+206F", name: "NOMINAL DIGIT SHAPES" },
] as const satisfies readonly UnsafeBidiControlDefinition[];

const BIDI_CONTROL_BY_CODE_POINT = new Map<number, UnsafeBidiControlDefinition>(
  UNSAFE_BIDI_CONTROLS.map((control) => [control.codePoint, control])
);

export interface RemovedBidiControl {
  /** UTF-16 code-unit offset in the original string. */
  readonly index: number;
  readonly codePoint: number;
  readonly unicode: string;
  readonly name: string;
}

export interface BidiSanitizationResult {
  readonly sanitizedText: string;
  readonly removedControls: readonly RemovedBidiControl[];
  readonly hadUnsafeControls: boolean;
}

/**
 * Remove and report every explicit bidi formatting control.
 *
 * The report deliberately contains metadata rather than the invisible control
 * character itself, so it is safe to show in diagnostics and audit logs.
 */
export function sanitizeBidiControls(text: string): BidiSanitizationResult {
  const safeCharacters: string[] = [];
  const removedControls: RemovedBidiControl[] = [];
  let codeUnitIndex = 0;

  for (const character of text) {
    const codePoint = character.codePointAt(0);
    const definition =
      codePoint === undefined
        ? undefined
        : BIDI_CONTROL_BY_CODE_POINT.get(codePoint);

    if (definition) {
      removedControls.push({
        index: codeUnitIndex,
        codePoint: definition.codePoint,
        unicode: definition.unicode,
        name: definition.name,
      });
    } else {
      safeCharacters.push(character);
    }

    codeUnitIndex += character.length;
  }

  return {
    sanitizedText: safeCharacters.join(""),
    removedControls,
    hadUnsafeControls: removedControls.length > 0,
  };
}

/** Blueprint-compatible diagnostic API for callers that only need findings. */
export function findUnsafeBidiControls(
  text: string
): readonly RemovedBidiControl[] {
  return sanitizeBidiControls(text).removedControls;
}

/**
 * Blueprint-compatible sanitization API. The structured result keeps removal
 * evidence available instead of silently discarding security diagnostics.
 */
export function sanitizeBidiText(text: string): BidiSanitizationResult {
  return sanitizeBidiControls(text);
}

/** Convenience helper when the caller does not need the diagnostic report. */
export function removeUnsafeBidiControls(text: string): string {
  return sanitizeBidiControls(text).sanitizedText;
}

export const DIGIT_POLICIES = [
  "preserve",
  "locale",
  "western",
  "arabic-indic",
] as const;

export type DigitPolicy = (typeof DIGIT_POLICIES)[number];
export type ResolvedDigitPolicy = Exclude<DigitPolicy, "locale">;

export const DEFAULT_DIGIT_POLICY_BY_LOCALE = {
  ar: "arabic-indic",
  en: "western",
} as const satisfies Readonly<Record<Locale, ResolvedDigitPolicy>>;

const WESTERN_DIGITS = "0123456789";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ANY_SUPPORTED_DIGIT_PATTERN = /[0-9٠-٩۰-۹]/g;

function digitValue(character: string): number | null {
  const westernIndex = WESTERN_DIGITS.indexOf(character);
  if (westernIndex >= 0) return westernIndex;

  const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(character);
  if (arabicIndex >= 0) return arabicIndex;

  const easternIndex = EASTERN_ARABIC_INDIC_DIGITS.indexOf(character);
  return easternIndex >= 0 ? easternIndex : null;
}

export function resolveDigitPolicy(
  policy: DigitPolicy,
  locale: Locale
): ResolvedDigitPolicy {
  return policy === "locale" ? DEFAULT_DIGIT_POLICY_BY_LOCALE[locale] : policy;
}

/**
 * Apply an explicit digit policy. `preserve` is the safe default because IDs,
 * URLs, and legal references should not be rewritten without caller intent.
 */
export function applyDigitPolicy(
  text: string,
  policy: DigitPolicy = "preserve",
  locale: Locale = "ar"
): string {
  const resolvedPolicy = resolveDigitPolicy(policy, locale);
  if (resolvedPolicy === "preserve") return text;

  const targetDigits =
    resolvedPolicy === "arabic-indic"
      ? ARABIC_INDIC_DIGITS
      : WESTERN_DIGITS;

  return text.replace(ANY_SUPPORTED_DIGIT_PATTERN, (character) => {
    const value = digitValue(character);
    return value === null ? character : (targetDigits[value] ?? character);
  });
}

type UnitKind = "arabic" | "latin" | "number" | "mixed" | "neutral";

interface TextUnit {
  readonly text: string;
  readonly kind: UnitKind;
  readonly directDirection: HtmlDirection | null;
}

function splitTextUnits(text: string): string[] {
  const units: string[] = [];

  for (const character of text) {
    const previousIndex = units.length - 1;
    const joinsPrevious =
      MARK_PATTERN.test(character) ||
      character === "\u200c" ||
      character === "\u200d" ||
      character === "\ufe0f";

    if (joinsPrevious && previousIndex >= 0) {
      units[previousIndex] = `${units[previousIndex]}${character}`;
    } else {
      units.push(character);
    }
  }

  return units;
}

function classifyTextUnit(text: string): UnitKind {
  const direction = detectStrongDirection(text);
  if (direction !== "neutral") return direction;

  for (const character of text) {
    if (NUMBER_PATTERN.test(character)) return "number";
  }

  return "neutral";
}

function directDirectionForKind(
  kind: UnitKind,
  baseDirection: HtmlDirection
): HtmlDirection | null {
  switch (kind) {
    case "arabic":
      return "rtl";
    case "latin":
    case "number":
      return "ltr";
    case "mixed":
      return baseDirection;
    case "neutral":
      return null;
  }
}

function nearestDirection(
  units: readonly TextUnit[],
  start: number,
  step: -1 | 1
): HtmlDirection | null {
  for (
    let index = start;
    index >= 0 && index < units.length;
    index += step
  ) {
    const direction = units[index]?.directDirection;
    if (direction) return direction;
  }
  return null;
}

function resolveNeutralDirection(
  units: readonly TextUnit[],
  index: number,
  baseDirection: HtmlDirection
): HtmlDirection {
  const previous = nearestDirection(units, index - 1, -1);
  const next = nearestDirection(units, index + 1, 1);

  if (previous && next && previous === next) return previous;
  if (previous && !next) return previous;
  if (!previous && next) return next;
  return baseDirection;
}

export interface SafeTextRun {
  readonly text: string;
  readonly direction: HtmlDirection;
  readonly strongDirection: StrongDirection;
  readonly language: Locale | null;
}

export interface SafeTextRunOptions {
  readonly baseLocale?: Locale;
  readonly digitPolicy?: DigitPolicy;
}

export interface SafeTextRunsResult {
  readonly sanitizedText: string;
  readonly direction: StrongDirection;
  readonly baseDirection: HtmlDirection;
  readonly digitPolicy: ResolvedDigitPolicy;
  readonly removedControls: readonly RemovedBidiControl[];
  readonly runs: readonly SafeTextRun[];
}

/**
 * Convert untrusted Arabic-English text into explicit, isolated direction runs.
 * Numbers resolve LTR so dates, amounts, URLs, and clause IDs keep their order.
 */
export function createSafeTextRuns(
  text: string,
  options: SafeTextRunOptions = {}
): SafeTextRunsResult {
  const baseLocale = options.baseLocale ?? "ar";
  const baseDirection: HtmlDirection =
    baseLocale === "ar" ? "rtl" : "ltr";
  const requestedDigitPolicy = options.digitPolicy ?? "preserve";
  const digitPolicy = resolveDigitPolicy(requestedDigitPolicy, baseLocale);
  const sanitized = sanitizeBidiControls(text);
  const normalizedText = applyDigitPolicy(
    sanitized.sanitizedText,
    digitPolicy,
    baseLocale
  );

  const units = splitTextUnits(normalizedText).map((unitText): TextUnit => {
    const kind = classifyTextUnit(unitText);
    return {
      text: unitText,
      kind,
      directDirection: directDirectionForKind(kind, baseDirection),
    };
  });

  const resolvedUnits = units.map((unit, index) => ({
    text: unit.text,
    direction:
      unit.directDirection ??
      resolveNeutralDirection(units, index, baseDirection),
  }));

  const runBuffers: Array<{ text: string; direction: HtmlDirection }> = [];
  for (const unit of resolvedUnits) {
    const current = runBuffers[runBuffers.length - 1];
    if (current?.direction === unit.direction) {
      current.text += unit.text;
    } else {
      runBuffers.push({ text: unit.text, direction: unit.direction });
    }
  }

  const runs: SafeTextRun[] = runBuffers.map((run) => {
    const strongDirection = detectStrongDirection(run.text);
    const language: Locale | null =
      strongDirection === "arabic"
        ? "ar"
        : strongDirection === "latin"
          ? "en"
          : null;

    return {
      text: run.text,
      direction: run.direction,
      strongDirection,
      language,
    };
  });

  return {
    sanitizedText: normalizedText,
    direction: detectStrongDirection(normalizedText),
    baseDirection,
    digitPolicy,
    removedControls: sanitized.removedControls,
    runs,
  };
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SafeBdiHtmlResult extends SafeTextRunsResult {
  readonly html: string;
}

/**
 * Render escaped text runs as semantic `<bdi>` elements.
 *
 * No input is interpreted as HTML. Unsafe controls are removed before escaping,
 * and every run receives an explicit direction.
 */
export function renderSafeBdiHtml(
  text: string,
  options: SafeTextRunOptions = {}
): SafeBdiHtmlResult {
  const result = createSafeTextRuns(text, options);
  const html = result.runs
    .map((run) => {
      const languageAttribute = run.language
        ? ` lang="${run.language}"`
        : "";
      return `<bdi dir="${run.direction}"${languageAttribute}>${escapeHtmlText(run.text)}</bdi>`;
    })
    .join("");

  return { ...result, html };
}

/** Convenience helper for templates that only need the safe HTML string. */
export function renderBdiHtml(
  text: string,
  options: SafeTextRunOptions = {}
): string {
  return renderSafeBdiHtml(text, options).html;
}

export interface BidiValue extends SafeTextRunsResult {
  /** Sanitized and digit-normalized plain text. */
  readonly text: string;
  /** Blueprint name for the detected strong-direction category. */
  readonly kind: StrongDirection;
  /** Resolved direction for an enclosing element. */
  readonly dir: HtmlDirection;
  /** Intl-compatible numeral-system hint when digits were normalized. */
  readonly numeralSystem?: NumeralSystem;
  /** Escaped `<bdi>` run markup safe for direct template interpolation. */
  readonly html: string;
}

/**
 * Build the complete safe value consumed by document layout components.
 *
 * Mixed and neutral values use the declared base direction for their enclosing
 * element; individual runs always retain their explicit resolved direction.
 */
export function createBidiValue(
  text: string,
  language?: DocumentLanguage
): BidiValue;
export function createBidiValue(
  text: string,
  options?: SafeTextRunOptions
): BidiValue;
export function createBidiValue(
  text: string,
  optionsOrLanguage: SafeTextRunOptions | DocumentLanguage = {}
): BidiValue {
  const options: SafeTextRunOptions =
    typeof optionsOrLanguage === "string"
      ? { baseLocale: optionsOrLanguage }
      : optionsOrLanguage;
  const rendered = renderSafeBdiHtml(text, options);
  const dir: HtmlDirection =
    rendered.direction === "arabic"
      ? "rtl"
      : rendered.direction === "latin"
        ? "ltr"
        : rendered.baseDirection;
  const numeralSystem: NumeralSystem | undefined =
    rendered.digitPolicy === "western"
      ? "latn"
      : rendered.digitPolicy === "arabic-indic"
        ? "arab"
        : undefined;

  return {
    ...rendered,
    text: rendered.sanitizedText,
    kind: rendered.direction,
    dir,
    ...(numeralSystem ? { numeralSystem } : {}),
  };
}

export type SupportedFontWeight = 300 | 400 | 500 | 600 | 700;

export interface BilingualFontFace {
  readonly family: string;
  readonly fallbacks: readonly string[];
  readonly weights: readonly SupportedFontWeight[];
}

export interface BilingualFontPair {
  readonly id: string;
  readonly label: string;
  readonly arabic: BilingualFontFace;
  readonly latin: BilingualFontFace;
  /** Shared line box used to keep paired columns visually aligned. */
  readonly normalizedLineHeight: number;
}

export const BILINGUAL_FONT_PAIRS = {
  "noto-sans": {
    id: "noto-sans",
    label: "Noto Sans Arabic + Noto Sans",
    arabic: {
      family: "Noto Sans Arabic",
      fallbacks: ["Noto Sans", "Arial", "sans-serif"],
      weights: [300, 400, 500, 600, 700],
    },
    latin: {
      family: "Noto Sans",
      fallbacks: ["Arial", "sans-serif"],
      weights: [300, 400, 500, 600, 700],
    },
    normalizedLineHeight: 1.7,
  },
  "ibm-plex-sans": {
    id: "ibm-plex-sans",
    label: "IBM Plex Sans Arabic + IBM Plex Sans",
    arabic: {
      family: "IBM Plex Sans Arabic",
      fallbacks: ["IBM Plex Sans", "Arial", "sans-serif"],
      weights: [300, 400, 500, 600, 700],
    },
    latin: {
      family: "IBM Plex Sans",
      fallbacks: ["Arial", "sans-serif"],
      weights: [300, 400, 500, 600, 700],
    },
    normalizedLineHeight: 1.7,
  },
} as const satisfies Readonly<Record<string, BilingualFontPair>>;

/** Canonical blueprint name used by the document layout engine. */
export const DOCUMENT_FONT_PAIRS = BILINGUAL_FONT_PAIRS;

export type BilingualFontPairId = keyof typeof BILINGUAL_FONT_PAIRS;

export const DEFAULT_BILINGUAL_FONT_PAIR_ID: BilingualFontPairId =
  "ibm-plex-sans";

export const BROWSER_SHAPING_RESPONSIBILITY =
  "Arabic joining, contextual glyph selection, ligatures, and kerning are performed by the browser Unicode text-shaping engine; this module supplies fonts, language, direction, isolation, and safe CSS only.";

export function getBilingualFontPair(
  id: BilingualFontPairId = DEFAULT_BILINGUAL_FONT_PAIR_ID
): BilingualFontPair {
  return BILINGUAL_FONT_PAIRS[id];
}

/** Resolve an allow-listed font pair without accepting arbitrary CSS input. */
export function resolveFontPair(
  id: BilingualFontPairId = DEFAULT_BILINGUAL_FONT_PAIR_ID
): BilingualFontPair {
  return getBilingualFontPair(id);
}

const GENERIC_FONT_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
]);

function cssFontFamilyName(family: string): string {
  return GENERIC_FONT_FAMILIES.has(family)
    ? family
    : `"${family.replace(/["\\]/g, "")}"`;
}

export function getFontPairStack(
  pairId: BilingualFontPairId,
  locale: Locale
): string {
  const pair = getBilingualFontPair(pairId);
  const face = locale === "ar" ? pair.arabic : pair.latin;
  return [face.family, ...face.fallbacks]
    .map(cssFontFamilyName)
    .join(", ");
}

export type TextContentKind = "prose" | "technical";

export interface TextFlowPolicy {
  readonly hyphens: "auto" | "none";
  readonly overflowWrap: "break-word" | "anywhere";
  readonly wordBreak: "normal";
  readonly lineBreak: "auto";
}

export const TEXT_FLOW_POLICIES = {
  ar: {
    prose: {
      hyphens: "none",
      overflowWrap: "break-word",
      wordBreak: "normal",
      lineBreak: "auto",
    },
    technical: {
      hyphens: "none",
      overflowWrap: "anywhere",
      wordBreak: "normal",
      lineBreak: "auto",
    },
  },
  en: {
    prose: {
      hyphens: "auto",
      overflowWrap: "break-word",
      wordBreak: "normal",
      lineBreak: "auto",
    },
    technical: {
      hyphens: "none",
      overflowWrap: "anywhere",
      wordBreak: "normal",
      lineBreak: "auto",
    },
  },
} as const satisfies Readonly<
  Record<Locale, Readonly<Record<TextContentKind, TextFlowPolicy>>>
>;

export function getTextFlowPolicy(
  locale: Locale,
  contentKind: TextContentKind = "prose"
): TextFlowPolicy {
  return TEXT_FLOW_POLICIES[locale][contentKind];
}

export interface TypographyStyleOptions {
  readonly fontPair?: BilingualFontPairId;
  readonly contentKind?: TextContentKind;
  readonly normalizedLineHeight?: number;
}

/**
 * Framework-neutral style object suitable for React style props or adapters.
 * Arabic tracking remains `normal` so connected letterforms are not disrupted.
 */
export interface BilingualTypographyStyle {
  readonly direction: HtmlDirection;
  readonly fontFamily: string;
  readonly lineHeight: number;
  readonly letterSpacing: "normal";
  readonly wordSpacing: "normal";
  readonly fontKerning: "normal";
  readonly fontOpticalSizing: "auto";
  readonly fontSynthesis: "none";
  readonly fontVariantLigatures: "common-ligatures contextual";
  readonly fontVariantNumeric: "normal" | "lining-nums tabular-nums";
  readonly hyphens: TextFlowPolicy["hyphens"];
  readonly overflowWrap: TextFlowPolicy["overflowWrap"];
  readonly wordBreak: TextFlowPolicy["wordBreak"];
  readonly lineBreak: TextFlowPolicy["lineBreak"];
}

export function getTypographyStyle(
  locale: Locale,
  options: TypographyStyleOptions = {}
): BilingualTypographyStyle {
  const pairId = options.fontPair ?? DEFAULT_BILINGUAL_FONT_PAIR_ID;
  const pair = resolveFontPair(pairId);
  const lineHeight =
    options.normalizedLineHeight ?? pair.normalizedLineHeight;
  validateLineHeight(lineHeight);
  const contentKind = options.contentKind ?? "prose";
  const flow = getTextFlowPolicy(locale, contentKind);

  return {
    direction: locale === "ar" ? "rtl" : "ltr",
    fontFamily: getFontPairStack(pairId, locale),
    lineHeight,
    letterSpacing: "normal",
    wordSpacing: "normal",
    fontKerning: "normal",
    fontOpticalSizing: "auto",
    fontSynthesis: "none",
    fontVariantLigatures: "common-ligatures contextual",
    fontVariantNumeric:
      contentKind === "technical" ? "lining-nums tabular-nums" : "normal",
    hyphens: flow.hyphens,
    overflowWrap: flow.overflowWrap,
    wordBreak: flow.wordBreak,
    lineBreak: flow.lineBreak,
  };
}

function textFlowDeclarations(policy: TextFlowPolicy): string {
  return [
    `hyphens: ${policy.hyphens};`,
    `overflow-wrap: ${policy.overflowWrap};`,
    `word-break: ${policy.wordBreak};`,
    `line-break: ${policy.lineBreak};`,
  ].join("\n  ");
}

export interface BilingualTypographyCssOptions {
  readonly fontPair?: BilingualFontPairId;
  readonly normalizedLineHeight?: number;
}

function validateLineHeight(lineHeight: number): void {
  if (!Number.isFinite(lineHeight) || lineHeight < 1 || lineHeight > 3) {
    throw new RangeError(
      "normalizedLineHeight must be a finite number between 1 and 3"
    );
  }
}

/**
 * Generate deterministic typography CSS for HTML preview and Chromium PDF.
 *
 * OpenType Arabic shaping features are not forced manually: the browser applies
 * the required init/medi/fina/isol features from the font. Letter spacing stays
 * `normal` because arbitrary tracking can break connected Arabic letterforms.
 */
export function generateBilingualTypographyCss(
  options: BilingualTypographyCssOptions = {}
): string {
  const pairId = options.fontPair ?? DEFAULT_BILINGUAL_FONT_PAIR_ID;
  const pair = getBilingualFontPair(pairId);
  const lineHeight =
    options.normalizedLineHeight ?? pair.normalizedLineHeight;
  validateLineHeight(lineHeight);

  const arabicFlow = getTextFlowPolicy("ar");
  const englishFlow = getTextFlowPolicy("en");
  const technicalFlow = getTextFlowPolicy("en", "technical");

  return `.bilingual-typography {
  --bilingual-font-ar: ${getFontPairStack(pairId, "ar")};
  --bilingual-font-en: ${getFontPairStack(pairId, "en")};
  --bilingual-line-height: ${lineHeight};
  font-kerning: normal;
  font-optical-sizing: auto;
  font-synthesis: none;
  font-variant-ligatures: common-ligatures contextual;
  text-rendering: optimizeLegibility;
}

.bilingual-typography:lang(ar),
.bilingual-typography :lang(ar) {
  direction: rtl;
  font-family: var(--bilingual-font-ar);
  line-height: var(--bilingual-line-height);
  letter-spacing: normal;
  word-spacing: normal;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
  ${textFlowDeclarations(arabicFlow)}
}

.bilingual-typography:lang(en),
.bilingual-typography :lang(en) {
  direction: ltr;
  font-family: var(--bilingual-font-en);
  line-height: var(--bilingual-line-height);
  letter-spacing: normal;
  word-spacing: normal;
  font-kerning: normal;
  font-variant-ligatures: common-ligatures contextual;
  ${textFlowDeclarations(englishFlow)}
}

.bilingual-typography bdi {
  unicode-bidi: isolate;
}

.bilingual-typography .bilingual-technical {
  font-variant-numeric: lining-nums tabular-nums;
  ${textFlowDeclarations(technicalFlow)}
}

@media print {
  .bilingual-typography {
    font-synthesis: none;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}`;
}
