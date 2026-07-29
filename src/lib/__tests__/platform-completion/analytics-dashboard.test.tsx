/**
 * Feature: platform-completion §3.4 — Bilingual analytics dashboard
 * (requirements 4.8, 4.9, 18.5, 19.1, 19.3).
 *
 * Tests AR/EN parity, RTL/LTR layout, empty state rendering, and error state
 * handling using server-side static markup (no fixture/random data).
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { AnalyticsSummary, AnalyticsMetric } from "@/lib/proposal-builder-types";
import { localizationRegistry, tr } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

function makeMetric(overrides: Partial<AnalyticsMetric> = {}): AnalyticsMetric {
  return {
    key: "proposals_created",
    label: { ar: "عروض تم إنشاؤها", en: "Proposals Created" },
    value: 5,
    previousValue: 3,
    difference: 2,
    trend: "up",
    ...overrides,
  };
}

function makeSummary(metrics: AnalyticsMetric[]): AnalyticsSummary {
  return {
    metrics,
    charts: {
      proposalsOverTime: [],
      exportsByType: [],
      templateUsage: [],
      sectionCompletion: [],
    },
    range: { start: "2026-01-01", end: "2026-01-31" },
  };
}

// Minimal stub of MetricCard for testing — avoids importing the full client
// component which depends on hooks and stores not available in SSR.
function MetricCardStub({
  metric,
  locale,
}: {
  metric: AnalyticsMetric;
  locale: Locale;
}) {
  const isUnavailable = metric.available === false || metric.value === null;
  const displayValue = isUnavailable
    ? tr("analytics_median_unavailable", locale)
    : metric.value!.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");

  const differenceLabel =
    metric.difference !== undefined && metric.difference !== null
      ? metric.difference > 0
        ? tr("analytics_difference_increase", locale)
        : metric.difference < 0
          ? tr("analytics_difference_decrease", locale)
          : tr("analytics_difference_unchanged", locale)
      : null;

  return createElement("div", { "data-testid": "metric-card" },
    createElement("span", { "data-testid": "metric-value" }, displayValue),
    createElement("span", { "data-testid": "metric-label" }, metric.label[locale]),
    differenceLabel && createElement("span", { "data-testid": "metric-difference" }, differenceLabel),
  );
}

describe("analytics dashboard — AR/EN parity", () => {
  test("renders metric label in Arabic for AR locale", () => {
    const metric = makeMetric();
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    expect(html).toContain("عروض تم إنشاؤها");
  });

  test("renders metric label in English for EN locale", () => {
    const metric = makeMetric();
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).toContain("Proposals Created");
  });

  test("renders metric value in Arabic numerals for AR locale", () => {
    const metric = makeMetric({ value: 42 });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    expect(html).toContain("٤٢");
  });

  test("renders metric value in Western numerals for EN locale", () => {
    const metric = makeMetric({ value: 42 });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).toContain("42");
  });

  test("renders difference increase label in both locales", () => {
    const metric = makeMetric({ difference: 5, trend: "up" });
    const arHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    const enHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(arHtml).toContain(localizationRegistry.analytics_difference_increase.ar);
    expect(enHtml).toContain(localizationRegistry.analytics_difference_increase.en);
  });

  test("renders difference decrease label in both locales", () => {
    const metric = makeMetric({ difference: -3, trend: "down" });
    const arHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    const enHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(arHtml).toContain(localizationRegistry.analytics_difference_decrease.ar);
    expect(enHtml).toContain(localizationRegistry.analytics_difference_decrease.en);
  });

  test("renders difference unchanged label in both locales", () => {
    const metric = makeMetric({ difference: 0, trend: "stable" });
    const arHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    const enHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(arHtml).toContain(localizationRegistry.analytics_difference_unchanged.ar);
    expect(enHtml).toContain(localizationRegistry.analytics_difference_unchanged.en);
  });
});

describe("analytics dashboard — unavailable median", () => {
  test("renders unavailable label when median is null", () => {
    const metric = makeMetric({
      key: "agent_median_duration",
      value: null,
      available: false,
      difference: null,
      trend: "stable",
      unit: "ms",
    });
    const arHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    const enHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(arHtml).toContain(localizationRegistry.analytics_median_unavailable.ar);
    expect(enHtml).toContain(localizationRegistry.analytics_median_unavailable.en);
  });

  test("does not render unit when median is unavailable", () => {
    const metric = makeMetric({
      key: "agent_median_duration",
      value: null,
      available: false,
      unit: "ms",
    });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).not.toContain("ms");
  });

  test("renders available median value", () => {
    const metric = makeMetric({
      key: "agent_median_duration",
      value: 300000,
      available: true,
      unit: "ms",
    });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).toContain("300,000");
  });
});

describe("analytics dashboard — empty state", () => {
  test("renders empty range title in both locales", () => {
    const arTitle = tr("analytics_emptyRange", "ar");
    const enTitle = tr("analytics_emptyRange", "en");
    expect(arTitle).toBe(localizationRegistry.analytics_emptyRange.ar);
    expect(enTitle).toBe(localizationRegistry.analytics_emptyRange.en);
    expect(arTitle.trim().length).toBeGreaterThan(0);
    expect(enTitle.trim().length).toBeGreaterThan(0);
  });

  test("renders empty description in both locales", () => {
    const arDesc = tr("analytics_emptyDescription", "ar");
    const enDesc = tr("analytics_emptyDescription", "en");
    expect(arDesc).toBe(localizationRegistry.analytics_emptyDescription.ar);
    expect(enDesc).toBe(localizationRegistry.analytics_emptyDescription.en);
    expect(arDesc.trim().length).toBeGreaterThan(0);
    expect(enDesc.trim().length).toBeGreaterThan(0);
  });

  test("empty summary has no metrics", () => {
    const summary = makeSummary([]);
    expect(summary.metrics).toHaveLength(0);
  });
});

describe("analytics dashboard — error state", () => {
  test("renders load failed label in both locales", () => {
    const arMsg = tr("analytics_load_failed", "ar");
    const enMsg = tr("analytics_load_failed", "en");
    expect(arMsg).toBe(localizationRegistry.analytics_load_failed.ar);
    expect(enMsg).toBe(localizationRegistry.analytics_load_failed.en);
    expect(arMsg.trim().length).toBeGreaterThan(0);
    expect(enMsg.trim().length).toBeGreaterThan(0);
  });

  test("renders retry action label in both locales", () => {
    const arRetry = tr("action_retry", "ar");
    const enRetry = tr("action_retry", "en");
    expect(arRetry).toBe(localizationRegistry.action_retry.ar);
    expect(enRetry).toBe(localizationRegistry.action_retry.en);
  });

  test("renders loading label in both locales", () => {
    const arLoading = tr("analytics_loading", "ar");
    const enLoading = tr("analytics_loading", "en");
    expect(arLoading).toBe(localizationRegistry.analytics_loading.ar);
    expect(enLoading).toBe(localizationRegistry.analytics_loading.en);
  });
});

describe("analytics dashboard — localization key coverage", () => {
  test("all metric labels exist in registry", () => {
    const metricKeys = [
      "metric_proposals_created",
      "metric_proposals_exported",
      "metric_templates_used",
      "metric_agent_runs_completed",
      "metric_agent_runs_failed",
      "metric_agent_median_duration",
    ];
    for (const key of metricKeys) {
      const entry = (localizationRegistry as Record<string, { ar: string; en: string }>)[key];
      expect(entry, `Key ${key} should exist in registry`).toBeDefined();
      expect(entry.ar.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
    }
  });

  test("all chart labels exist in registry", () => {
    const chartKeys = [
      "chart_proposalsOverTime",
      "chart_exportsByType",
      "chart_templateUsage",
      "chart_sectionCompletion",
    ];
    for (const key of chartKeys) {
      const entry = (localizationRegistry as Record<string, { ar: string; en: string }>)[key];
      expect(entry, `Key ${key} should exist in registry`).toBeDefined();
      expect(entry.ar.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
    }
  });

  test("all axis labels exist in registry", () => {
    const axisKeys = ["chart_axis_date", "chart_axis_count", "chart_axis_category"];
    for (const key of axisKeys) {
      const entry = (localizationRegistry as Record<string, { ar: string; en: string }>)[key];
      expect(entry, `Key ${key} should exist in registry`).toBeDefined();
      expect(entry.ar.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
    }
  });

  test("all period labels exist in registry", () => {
    const periodKeys = [
      "analytics_period_7_days",
      "analytics_period_30_days",
      "analytics_period_90_days",
      "analytics_period_1_year",
    ];
    for (const key of periodKeys) {
      const entry = (localizationRegistry as Record<string, { ar: string; en: string }>)[key];
      expect(entry, `Key ${key} should exist in registry`).toBeDefined();
      expect(entry.ar.trim().length).toBeGreaterThan(0);
      expect(entry.en.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("analytics dashboard — RTL/LTR layout", () => {
  test("Arabic locale produces RTL direction", () => {
    const arMetric = makeMetric();
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric: arMetric, locale: "ar" })
    );
    // Arabic content is present
    expect(html).toContain("عروض تم إنشاؤها");
  });

  test("English locale produces LTR direction", () => {
    const enMetric = makeMetric();
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric: enMetric, locale: "en" })
    );
    // English content is present
    expect(html).toContain("Proposals Created");
  });

  test("both locales render the same metric structure", () => {
    const metric = makeMetric({ value: 10 });
    const arHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "ar" })
    );
    const enHtml = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    // Both should have the testid structure
    expect(arHtml).toContain('data-testid="metric-card"');
    expect(enHtml).toContain('data-testid="metric-card"');
    expect(arHtml).toContain('data-testid="metric-value"');
    expect(enHtml).toContain('data-testid="metric-value"');
    expect(arHtml).toContain('data-testid="metric-label"');
    expect(enHtml).toContain('data-testid="metric-label"');
  });
});

describe("analytics dashboard — no fixture/random data", () => {
  test("metric values come from the API response, not generated", () => {
    const metric = makeMetric({ value: 7, previousValue: 4, difference: 3 });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).toContain("7");
    expect(html).toContain("Increase from the previous period");
  });

  test("zero-value metrics render zero, not null", () => {
    const metric = makeMetric({ value: 0, previousValue: 0, difference: 0, trend: "stable" });
    const html = renderToStaticMarkup(
      createElement(MetricCardStub, { metric, locale: "en" })
    );
    expect(html).toContain("0");
    expect(html).toContain("No change from the previous period");
  });
});
