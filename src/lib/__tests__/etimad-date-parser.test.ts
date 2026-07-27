import { describe, expect, test } from "bun:test";

// Inline the parser logic since extension source uses browser globals
function parseArabicDate(raw: string): string {
  if (!raw) return "";
  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const slashMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const arabicNums = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const arabicSlash = arabicNums.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (arabicSlash) {
    const [, day, month, year] = arabicSlash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function parseSARValue(raw: string): number | undefined {
  if (!raw) return undefined;
  const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const cleaned = western.replace(/[^0-9.]/g, "");
  const value = parseFloat(cleaned);
  return isNaN(value) ? undefined : value;
}

describe("parseArabicDate", () => {
  test("parses ISO dates", () => {
    expect(parseArabicDate("2026-08-15")).toBe("2026-08-15");
    expect(parseArabicDate("text 2026-07-01 more")).toBe("2026-07-01");
  });

  test("parses dd/mm/yyyy", () => {
    expect(parseArabicDate("15/08/2026")).toBe("2026-08-15");
    expect(parseArabicDate("1/3/2026")).toBe("2026-03-01");
  });

  test("parses Arabic-Indic numerals", () => {
    expect(parseArabicDate("١٥/٠٨/٢٠٢٦")).toBe("2026-08-15");
  });

  test("returns raw for unparseable input", () => {
    expect(parseArabicDate("someday")).toBe("someday");
    expect(parseArabicDate("")).toBe("");
  });
});

describe("parseSARValue", () => {
  test("parses comma-separated values", () => {
    expect(parseSARValue("1,500,000")).toBe(1500000);
    expect(parseSARValue("SAR 2,000,000")).toBe(2000000);
  });

  test("parses Arabic-Indic numerals", () => {
    expect(parseSARValue("١٥٠٠٠٠٠")).toBe(1500000);
  });

  test("returns undefined for empty/junk", () => {
    expect(parseSARValue("")).toBeUndefined();
    expect(parseSARValue("no number")).toBeUndefined();
  });
});
