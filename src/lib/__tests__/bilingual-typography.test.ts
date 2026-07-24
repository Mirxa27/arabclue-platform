import { describe, expect, test } from "bun:test";
import {
  BILINGUAL_FONT_PAIRS,
  BROWSER_SHAPING_RESPONSIBILITY,
  DEFAULT_BILINGUAL_FONT_PAIR_ID,
  DOCUMENT_FONT_PAIRS,
  TEXT_FLOW_POLICIES,
  UNSAFE_BIDI_CONTROLS,
  analyzeStrongDirection,
  applyDigitPolicy,
  createBidiValue,
  createSafeTextRuns,
  detectStrongDirection,
  findUnsafeBidiControls,
  generateBilingualTypographyCss,
  getBilingualFontPair,
  getFontPairStack,
  getTextFlowPolicy,
  getTypographyStyle,
  removeUnsafeBidiControls,
  renderBdiHtml,
  renderSafeBdiHtml,
  resolveFontPair,
  resolveDigitPolicy,
  sanitizeBidiControls,
  sanitizeBidiText,
} from "../bilingual-typography";

describe("bilingual typography", () => {
  describe("strong-direction detection", () => {
    test("detects Arabic letters with marks and numbers", () => {
      const analysis = analyzeStrongDirection("مَرْحَبًا ١٢٣");

      expect(analysis.direction).toBe("arabic");
      expect(analysis.arabicLetterCount).toBeGreaterThan(0);
      expect(analysis.latinLetterCount).toBe(0);
    });

    test("detects Latin letters with punctuation and numbers", () => {
      expect(detectStrongDirection("Contract AC-2026/17")).toBe("latin");
      expect(detectStrongDirection("Crème brûlée")).toBe("latin");
    });

    test("detects mixed Arabic and Latin content", () => {
      const analysis = analyzeStrongDirection("العقد Contract");

      expect(analysis.direction).toBe("mixed");
      expect(analysis.arabicLetterCount).toBeGreaterThan(0);
      expect(analysis.latinLetterCount).toBeGreaterThan(0);
    });

    test("treats numbers, punctuation, emoji, and whitespace as neutral", () => {
      expect(detectStrongDirection("2026-07-24 / ١٢٣ ✅")).toBe("neutral");
      expect(detectStrongDirection("")).toBe("neutral");
    });

    test("supports Arabic presentation-form letters", () => {
      expect(detectStrongDirection("\ufdf2")).toBe("arabic");
    });
  });

  describe("unsafe bidi controls", () => {
    test("removes and reports every forbidden control", () => {
      const payload = UNSAFE_BIDI_CONTROLS.map((control) =>
        String.fromCodePoint(control.codePoint)
      ).join("");
      const result = sanitizeBidiControls(`safe${payload}text`);

      expect(result.sanitizedText).toBe("safetext");
      expect(result.hadUnsafeControls).toBe(true);
      expect(result.removedControls).toHaveLength(
        UNSAFE_BIDI_CONTROLS.length
      );
      expect(result.removedControls.map((control) => control.unicode)).toEqual(
        UNSAFE_BIDI_CONTROLS.map((control) => control.unicode)
      );
    });

    test("neutralizes an override-based filename spoof", () => {
      const payload = "invoice\u202Efdp.exe\u202C";
      const result = sanitizeBidiControls(payload);

      expect(result.sanitizedText).toBe("invoicefdp.exe");
      expect(result.removedControls).toEqual([
        {
          index: 7,
          codePoint: 0x202e,
          unicode: "U+202E",
          name: "RIGHT-TO-LEFT OVERRIDE",
        },
        {
          index: 15,
          codePoint: 0x202c,
          unicode: "U+202C",
          name: "POP DIRECTIONAL FORMATTING",
        },
      ]);
    });

    test("reports UTF-16 offsets without leaking invisible characters", () => {
      const result = sanitizeBidiControls("😀\u2066ABC\u2069");

      expect(result.removedControls[0]?.index).toBe(2);
      expect(result.removedControls[1]?.index).toBe(6);
      expect(result.removedControls[0]).not.toHaveProperty("character");
    });

    test("leaves safe text unchanged and returns an empty report", () => {
      const input = "رقم العقد AC-123";
      const result = sanitizeBidiControls(input);

      expect(result).toEqual({
        sanitizedText: input,
        removedControls: [],
        hadUnsafeControls: false,
      });
      expect(removeUnsafeBidiControls(input)).toBe(input);
    });

    test("exposes blueprint-compatible detection and sanitization APIs", () => {
      const input = "safe\u202Eevil\u202C";

      expect(findUnsafeBidiControls(input)).toHaveLength(2);
      expect(sanitizeBidiText(input)).toEqual(sanitizeBidiControls(input));
    });
  });

  describe("digit policy", () => {
    test("preserves digits by default", () => {
      expect(applyDigitPolicy("123 ١٢٣ ۱۲۳")).toBe("123 ١٢٣ ۱۲۳");
    });

    test("normalizes all supported forms to Western digits", () => {
      expect(applyDigitPolicy("123 ١٢٣ ۱۲۳", "western")).toBe("123 123 123");
    });

    test("normalizes all supported forms to Arabic-Indic digits", () => {
      expect(applyDigitPolicy("123 ١٢٣ ۱۲۳", "arabic-indic")).toBe(
        "١٢٣ ١٢٣ ١٢٣"
      );
    });

    test("resolves locale policy explicitly", () => {
      expect(resolveDigitPolicy("locale", "ar")).toBe("arabic-indic");
      expect(resolveDigitPolicy("locale", "en")).toBe("western");
      expect(applyDigitPolicy("Ref 2026", "locale", "ar")).toBe("Ref ٢٠٢٦");
      expect(applyDigitPolicy("مرجع ٢٠٢٦", "locale", "en")).toBe("مرجع 2026");
    });

    test("does not alter letters or technical punctuation", () => {
      expect(applyDigitPolicy("AC-12/34@example.com", "arabic-indic")).toBe(
        "AC-١٢/٣٤@example.com"
      );
    });
  });

  describe("safe mixed-direction runs", () => {
    test("isolates a Latin contract identifier inside Arabic prose", () => {
      const result = createSafeTextRuns("رقم العقد AC-123", {
        baseLocale: "ar",
      });

      expect(result.direction).toBe("mixed");
      expect(result.runs).toEqual([
        {
          text: "رقم العقد ",
          direction: "rtl",
          strongDirection: "arabic",
          language: "ar",
        },
        {
          text: "AC-123",
          direction: "ltr",
          strongDirection: "latin",
          language: "en",
        },
      ]);
    });

    test("keeps URLs and dates in LTR order within Arabic prose", () => {
      const result = createSafeTextRuns(
        "راجع https://arabclue.com/rfp/2026 بتاريخ 2026-07-24",
        { baseLocale: "ar" }
      );
      const ltrText = result.runs
        .filter((run) => run.direction === "ltr")
        .map((run) => run.text)
        .join("");

      expect(ltrText).toContain("https://arabclue.com/rfp/2026");
      expect(ltrText).toContain("2026-07-24");
    });

    test("resolves numeric-only content LTR while retaining neutral analysis", () => {
      const result = createSafeTextRuns("2026-07-24", {
        baseLocale: "ar",
      });

      expect(result.direction).toBe("neutral");
      expect(result.runs).toEqual([
        {
          text: "2026-07-24",
          direction: "ltr",
          strongDirection: "neutral",
          language: null,
        },
      ]);
    });

    test("uses the base locale for neutral-only punctuation", () => {
      expect(
        createSafeTextRuns("— ✅ —", { baseLocale: "ar" }).runs[0]?.direction
      ).toBe("rtl");
      expect(
        createSafeTextRuns("— ✅ —", { baseLocale: "en" }).runs[0]?.direction
      ).toBe("ltr");
    });

    test("keeps Arabic combining marks in their Arabic run", () => {
      const result = createSafeTextRuns("مَرْحَبًا API");

      expect(result.runs[0]?.text).toBe("مَرْحَبًا ");
      expect(result.runs[0]?.direction).toBe("rtl");
    });

    test("removes controls before segmenting and preserves the report", () => {
      const result = createSafeTextRuns("العقد \u202EAC-123\u202C");

      expect(result.sanitizedText).toBe("العقد AC-123");
      expect(result.removedControls).toHaveLength(2);
      expect(result.runs.some((run) => run.text.includes("\u202e"))).toBe(false);
    });

    test("supports explicit locale digit conversion before segmentation", () => {
      const result = createSafeTextRuns("مرجع 2026", {
        baseLocale: "ar",
        digitPolicy: "locale",
      });

      expect(result.sanitizedText).toBe("مرجع ٢٠٢٦");
      expect(result.digitPolicy).toBe("arabic-indic");
      expect(result.runs.at(-1)?.direction).toBe("ltr");
    });

    test("returns no runs for empty input", () => {
      expect(createSafeTextRuns("").runs).toEqual([]);
    });

    test("creates a complete layout-ready bidi value", () => {
      const value = createBidiValue("العقد AC-123", { baseLocale: "ar" });

      expect(value.text).toBe("العقد AC-123");
      expect(value.direction).toBe("mixed");
      expect(value.kind).toBe("mixed");
      expect(value.dir).toBe("rtl");
      expect(value.numeralSystem).toBeUndefined();
      expect(value.html).toBe(renderBdiHtml("العقد AC-123"));
      expect(value.runs).toHaveLength(2);
    });

    test("accepts a blueprint language shorthand and reports numeral system", () => {
      const english = createBidiValue("مرجع ٢٠٢٦", "en");
      const arabicDigits = createBidiValue("Ref 2026", {
        baseLocale: "ar",
        digitPolicy: "locale",
      });

      expect(english.dir).toBe("rtl");
      expect(english.baseDirection).toBe("ltr");
      expect(arabicDigits.text).toBe("Ref ٢٠٢٦");
      expect(arabicDigits.numeralSystem).toBe("arab");
    });
  });

  describe("safe bdi HTML", () => {
    test("renders semantic direction and language attributes", () => {
      const result = renderSafeBdiHtml("العقد AC-123");

      expect(result.html).toContain(
        '<bdi dir="rtl" lang="ar">العقد </bdi>'
      );
      expect(result.html).toContain(
        '<bdi dir="ltr" lang="en">AC-123</bdi>'
      );
    });

    test("escapes every HTML-significant character", () => {
      const html = renderBdiHtml(`<script x="1">'&</script>`);

      expect(html).not.toContain("<script");
      expect(html).toContain("&lt;script");
      expect(html).toContain("&quot;");
      expect(html).toContain("&#39;");
      expect(html).toContain("&amp;");
      expect(html).toContain("&lt;/script&gt;");
    });

    test("removes bidi controls rather than encoding them invisibly", () => {
      const result = renderSafeBdiHtml("safe\u202Eevil\u202C");

      expect(result.html).not.toContain("\u202e");
      expect(result.html).not.toContain("\u202c");
      expect(result.removedControls).toHaveLength(2);
      expect(result.html).toContain("safeevil");
    });

    test("returns an empty string for empty input", () => {
      expect(renderBdiHtml("")).toBe("");
    });
  });

  describe("font pairs and flow policy", () => {
    test("defines Noto and IBM Arabic/Latin partners", () => {
      expect(BILINGUAL_FONT_PAIRS["noto-sans"].arabic.family).toBe(
        "Noto Sans Arabic"
      );
      expect(BILINGUAL_FONT_PAIRS["noto-sans"].latin.family).toBe("Noto Sans");
      expect(BILINGUAL_FONT_PAIRS["ibm-plex-sans"].arabic.family).toBe(
        "IBM Plex Sans Arabic"
      );
      expect(BILINGUAL_FONT_PAIRS["ibm-plex-sans"].latin.family).toBe(
        "IBM Plex Sans"
      );
      expect(DEFAULT_BILINGUAL_FONT_PAIR_ID).toBe("ibm-plex-sans");
      expect(DOCUMENT_FONT_PAIRS).toBe(BILINGUAL_FONT_PAIRS);
    });

    test("exposes supported weights and normalized metrics", () => {
      const pair = getBilingualFontPair("noto-sans");

      expect(pair.arabic.weights).toContain(400);
      expect(pair.arabic.weights).toContain(700);
      expect(pair.latin.weights).toEqual(pair.arabic.weights);
      expect(pair.normalizedLineHeight).toBeGreaterThanOrEqual(1.5);
      expect(resolveFontPair("noto-sans")).toBe(pair);
    });

    test("creates quoted CSS font stacks with generic fallbacks", () => {
      expect(getFontPairStack("noto-sans", "ar")).toBe(
        '"Noto Sans Arabic", "Noto Sans", "Arial", sans-serif'
      );
      expect(getFontPairStack("ibm-plex-sans", "en")).toBe(
        '"IBM Plex Sans", "Arial", sans-serif'
      );
    });

    test("uses locale-specific prose hyphenation", () => {
      expect(getTextFlowPolicy("ar")).toEqual(TEXT_FLOW_POLICIES.ar.prose);
      expect(getTextFlowPolicy("ar").hyphens).toBe("none");
      expect(getTextFlowPolicy("en").hyphens).toBe("auto");
    });

    test("uses safe overflow rules for technical content", () => {
      expect(getTextFlowPolicy("ar", "technical")).toEqual({
        hyphens: "none",
        overflowWrap: "anywhere",
        wordBreak: "normal",
        lineBreak: "auto",
      });
      expect(getTextFlowPolicy("en", "technical").hyphens).toBe("none");
    });

    test("returns framework-neutral normalized typography styles", () => {
      const arabic = getTypographyStyle("ar", {
        fontPair: "noto-sans",
      });
      const technicalEnglish = getTypographyStyle("en", {
        fontPair: "ibm-plex-sans",
        contentKind: "technical",
        normalizedLineHeight: 1.65,
      });

      expect(arabic.direction).toBe("rtl");
      expect(arabic.fontFamily).toContain('"Noto Sans Arabic"');
      expect(arabic.hyphens).toBe("none");
      expect(arabic.letterSpacing).toBe("normal");
      expect(technicalEnglish.direction).toBe("ltr");
      expect(technicalEnglish.lineHeight).toBe(1.65);
      expect(technicalEnglish.overflowWrap).toBe("anywhere");
      expect(technicalEnglish.fontVariantNumeric).toBe(
        "lining-nums tabular-nums"
      );
    });
  });

  describe("typography CSS", () => {
    test("documents browser-owned Arabic shaping", () => {
      expect(BROWSER_SHAPING_RESPONSIBILITY).toContain("browser");
      expect(BROWSER_SHAPING_RESPONSIBILITY).toContain("Arabic joining");
      expect(BROWSER_SHAPING_RESPONSIBILITY).not.toContain("JavaScript shapes");
    });

    test("generates normalized, shaping-safe CSS", () => {
      const css = generateBilingualTypographyCss({
        fontPair: "noto-sans",
        normalizedLineHeight: 1.75,
      });

      expect(css).toContain('"Noto Sans Arabic"');
      expect(css).toContain('"Noto Sans"');
      expect(css).toContain("--bilingual-line-height: 1.75");
      expect(css).toContain("font-kerning: normal");
      expect(css).toContain("font-synthesis: none");
      expect(css).toContain(
        "font-variant-ligatures: common-ligatures contextual"
      );
      expect(css).toContain("letter-spacing: normal");
      expect(css).toContain("unicode-bidi: isolate");
      expect(css).toContain("hyphens: auto");
      expect(css).toContain("hyphens: none");
      expect(css).toContain("overflow-wrap: anywhere");
      expect(css).toContain("@media print");
    });

    test("uses the IBM pair and normalized line height by default", () => {
      const css = generateBilingualTypographyCss();

      expect(css).toContain('"IBM Plex Sans Arabic"');
      expect(css).toContain("--bilingual-line-height: 1.7");
    });

    test("rejects invalid line heights instead of emitting unsafe CSS", () => {
      expect(() =>
        generateBilingualTypographyCss({ normalizedLineHeight: Number.NaN })
      ).toThrow(RangeError);
      expect(() =>
        generateBilingualTypographyCss({ normalizedLineHeight: 0.5 })
      ).toThrow("between 1 and 3");
      expect(() =>
        generateBilingualTypographyCss({ normalizedLineHeight: 4 })
      ).toThrow(RangeError);
    });
  });
});
