/**
 * Reusable Document Components
 * 
 * Professional, print-ready components for document generation.
 * All components support:
 * - Bilingual rendering (Arabic RTL / English LTR)
 * - Print optimization
 * - Design token integration
 * - Brand customization
 * - Accessibility (ARIA attributes)
 * 
 * @see plans/2026-07-24-document-generation-architecture-design-part2.md Section 5.5
 */

import React from "react";
import type { BrandProfile } from "@prisma/client";
import { cn } from "@/lib/utils";
import { getTextDirection, type Locale } from "@/lib/typography";

// ============================================================================
// Type Definitions
// ============================================================================

export interface DocumentContainerProps {
  children: React.ReactNode;
  locale: Locale;
  className?: string;
  brand?: BrandProfile | null;
}

export interface DocumentSectionProps {
  titleEn: string;
  titleAr: string;
  children: React.ReactNode;
  locale: Locale;
  level?: 1 | 2 | 3 | 4;
  className?: string;
}

export interface DocumentTableProps {
  headers: Array<{ en: string; ar: string }>;
  rows: Array<Array<string | number | React.ReactNode>>;
  locale: Locale;
  striped?: boolean;
  bordered?: boolean;
  caption?: string;
  className?: string;
}

export interface StatCardProps {
  label: string;
  labelAr?: string;
  value: string | number;
  unit?: string;
  trend?: {
    value: number;
    direction: "up" | "down";
  };
  icon?: React.ReactNode;
  locale: Locale;
  className?: string;
}

export interface StatusBadgeProps {
  status: "success" | "warning" | "error" | "info" | "neutral";
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export interface InfoBoxProps {
  type: "info" | "warning" | "success" | "error";
  title?: string;
  content: string | React.ReactNode;
  icon?: React.ReactNode;
  locale: Locale;
  className?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  titleAr?: string;
  date: Date | string;
  description?: string;
  status?: "completed" | "in-progress" | "pending";
}

export interface TimelineProps {
  events: TimelineEvent[];
  locale: Locale;
  orientation?: "vertical" | "horizontal";
  className?: string;
}

export interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  labelAr?: string;
  showPercentage?: boolean;
  locale: Locale;
  color?: string;
  className?: string;
}

// ============================================================================
// Document Container
// ============================================================================

/**
 * Main document container with consistent styling
 * 
 * Provides proper structure, direction, and spacing for documents
 */
export function DocumentContainer({
  children,
  locale,
  className,
  brand,
}: DocumentContainerProps) {
  const dir = getTextDirection(locale);
  
  const brandStyles = brand
    ? {
        "--brand-primary": brand.primaryColor || undefined,
        "--brand-secondary": brand.secondaryColor || undefined,
        "--brand-accent": brand.accentColor || undefined,
      }
    : {};

  return (
    <div
      className={cn(
        "document-container",
        "max-w-[210mm] mx-auto p-8",
        "bg-white text-secondary-900",
        className
      )}
      dir={dir}
      lang={locale}
      style={brandStyles as React.CSSProperties}
      data-brand-theme={brand ? "custom" : undefined}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Document Section
// ============================================================================

/**
 * Section with bilingual header
 * 
 * Creates hierarchical document structure with proper styling
 */
export function DocumentSection({
  titleEn,
  titleAr,
  children,
  locale,
  level = 2,
  className,
}: DocumentSectionProps) {
  const HeadingTag: "h1" | "h2" | "h3" | "h4" =
    level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4";
  const displayTitle = locale === "ar" ? titleAr : titleEn;
  const secondaryTitle = locale === "ar" ? titleEn : titleAr;

  return (
    <section
      className={cn("document-section mb-12 avoid-break", className)}
      aria-labelledby={`section-${titleEn.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <header className="section-header mb-6">
        <HeadingTag
          id={`section-${titleEn.replace(/\s+/g, "-").toLowerCase()}`}
          className={cn(
            "font-bold text-primary-700 mb-2",
            level === 1 && "text-4xl",
            level === 2 && "text-3xl",
            level === 3 && "text-2xl",
            level === 4 && "text-xl"
          )}
          lang={locale}
        >
          {displayTitle}
        </HeadingTag>
        {secondaryTitle && (
          <p
            className="text-sm text-secondary-500 font-medium"
            lang={locale === "ar" ? "en" : "ar"}
          >
            {secondaryTitle}
          </p>
        )}
        <div
          className="h-0.5 w-20 bg-accent-600 mt-3"
          aria-hidden="true"
        />
      </header>
      <div className="section-content">{children}</div>
    </section>
  );
}

// ============================================================================
// Document Table
// ============================================================================

/**
 * Professional table component with bilingual headers
 */
export function DocumentTable({
  headers,
  rows,
  locale,
  striped = true,
  bordered = true,
  caption,
  className,
}: DocumentTableProps) {
  return (
    <div className={cn("table-wrapper overflow-x-auto mb-6", className)}>
      <table
        className={cn(
          "w-full border-collapse text-sm",
          bordered && "border border-secondary-200"
        )}
        role="table"
      >
        {caption && (
          <caption className="text-base font-semibold mb-3 text-start" lang={locale}>
            {caption}
          </caption>
        )}
        <thead className="bg-secondary-50">
          <tr>
            {headers.map((header, index) => (
              <th
                key={index}
                className={cn(
                  "px-4 py-3 text-start font-semibold text-secondary-900",
                  "border-b-2 border-secondary-300"
                )}
                scope="col"
              >
                <div className="space-y-1">
                  <div lang={locale}>
                    {locale === "ar" ? header.ar : header.en}
                  </div>
                  <div
                    className="text-xs text-secondary-500 font-normal"
                    lang={locale === "ar" ? "en" : "ar"}
                  >
                    {locale === "ar" ? header.en : header.ar}
                  </div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={cn(
                striped && rowIndex % 2 === 1 && "bg-secondary-50/50",
                "hover:bg-secondary-100/50 transition-colors"
              )}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "px-4 py-3 text-secondary-700",
                    bordered && "border-b border-secondary-200"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Stat Card
// ============================================================================

/**
 * Metric card for displaying key statistics
 */
export function StatCard({
  label,
  labelAr,
  value,
  unit,
  trend,
  icon,
  locale,
  className,
}: StatCardProps) {
  const displayLabel = locale === "ar" && labelAr ? labelAr : label;

  return (
    <div
      className={cn(
        "stat-card",
        "p-6 rounded-lg border border-secondary-200",
        "bg-white shadow-sm",
        "avoid-break",
        className
      )}
      role="region"
      aria-label={displayLabel}
    >
      <div className="flex items-start justify-between mb-4">
        {icon && (
          <div className="stat-icon text-primary-600" aria-hidden="true">
            {icon}
          </div>
        )}
        {trend && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded",
              trend.direction === "up"
                ? "text-success bg-success/10"
                : "text-error bg-error/10"
            )}
            aria-label={`Trend: ${trend.direction === "up" ? "up" : "down"} ${trend.value}%`}
          >
            <span aria-hidden="true">
              {trend.direction === "up" ? "↑" : "↓"}
            </span>
            <span>{trend.value}%</span>
          </div>
        )}
      </div>

      <div className="stat-value text-3xl font-bold text-secondary-900 mb-1">
        {value}
        {unit && <span className="text-xl text-secondary-600 ms-1">{unit}</span>}
      </div>

      <div className="stat-label text-sm text-secondary-600" lang={locale}>
        {displayLabel}
      </div>
    </div>
  );
}

// ============================================================================
// Status Badge
// ============================================================================

/**
 * Colored badge for status indicators
 */
export function StatusBadge({
  status,
  label,
  size = "md",
  className,
}: StatusBadgeProps) {
  const statusColors = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    error: "bg-error/10 text-error border-error/20",
    info: "bg-info/10 text-info border-info/20",
    neutral: "bg-secondary-100 text-secondary-700 border-secondary-200",
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-3 py-1",
    lg: "text-base px-4 py-1.5",
  };

  return (
    <span
      className={cn(
        "status-badge inline-flex items-center",
        "font-semibold rounded-full border",
        statusColors[status],
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label={`Status: ${label}`}
    >
      {label}
    </span>
  );
}

// ============================================================================
// Info Box
// ============================================================================

/**
 * Callout box for important information
 */
export function InfoBox({
  type,
  title,
  content,
  icon,
  locale,
  className,
}: InfoBoxProps) {
  const typeStyles = {
    info: {
      bg: "bg-info/10",
      border: "border-info/30",
      icon: "text-info",
      defaultIcon: "ℹ️",
    },
    warning: {
      bg: "bg-warning/10",
      border: "border-warning/30",
      icon: "text-warning",
      defaultIcon: "⚠️",
    },
    success: {
      bg: "bg-success/10",
      border: "border-success/30",
      icon: "text-success",
      defaultIcon: "✅",
    },
    error: {
      bg: "bg-error/10",
      border: "border-error/30",
      icon: "text-error",
      defaultIcon: "❌",
    },
  };

  const style = typeStyles[type];

  return (
    <div
      className={cn(
        "info-box p-4 rounded-lg border-l-4",
        style.bg,
        style.border,
        "avoid-break mb-4",
        className
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <div className={cn("info-icon flex-shrink-0 text-xl", style.icon)} aria-hidden="true">
          {icon || style.defaultIcon}
        </div>
        <div className="info-content flex-1">
          {title && (
            <div className="info-title font-semibold mb-1 text-secondary-900" lang={locale}>
              {title}
            </div>
          )}
          <div className="info-text text-sm text-secondary-700" lang={locale}>
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Timeline
// ============================================================================

/**
 * Timeline visualization for events or milestones
 */
export function Timeline({
  events,
  locale,
  orientation = "vertical",
  className,
}: TimelineProps) {
  const isRtl = locale === "ar";

  return (
    <div
      className={cn(
        "timeline",
        orientation === "vertical" ? "space-y-6" : "flex gap-6 overflow-x-auto",
        className
      )}
      role="list"
    >
      {events.map((event, index) => {
        const displayTitle =
          locale === "ar" && event.titleAr ? event.titleAr : event.title;
        const statusColors = {
          completed: "bg-success border-success",
          "in-progress": "bg-info border-info",
          pending: "bg-secondary-300 border-secondary-400",
        };
        const statusColor = statusColors[event.status || "pending"];

        return (
          <div
            key={event.id}
            className={cn(
              "timeline-event flex gap-4",
              orientation === "vertical" ? "items-start" : "flex-col items-center min-w-[200px]"
            )}
            role="listitem"
          >
            {/* Timeline marker */}
            <div className="timeline-marker flex-shrink-0 relative">
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2",
                  statusColor
                )}
                aria-hidden="true"
              />
              {orientation === "vertical" && index < events.length - 1 && (
                <div
                  className="absolute top-4 start-1/2 w-0.5 h-[calc(100%+1.5rem)] bg-secondary-300 -translate-x-1/2"
                  aria-hidden="true"
                />
              )}
            </div>

            {/* Event content */}
            <div className={cn("timeline-content flex-1", orientation === "horizontal" && "text-center")}>
              <div className="font-semibold text-secondary-900 mb-1" lang={locale}>
                {displayTitle}
              </div>
              <div className="text-sm text-secondary-600">
                {typeof event.date === "string"
                  ? event.date
                  : event.date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US")}
              </div>
              {event.description && (
                <div className="text-sm text-secondary-700 mt-2" lang={locale}>
                  {event.description}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Progress Bar
// ============================================================================

/**
 * Progress indicator with optional label and percentage
 */
export function ProgressBar({
  value,
  max,
  label,
  labelAr,
  showPercentage = true,
  locale,
  color,
  className,
}: ProgressBarProps) {
  const percentage = Math.round((value / max) * 100);
  const displayLabel = locale === "ar" && labelAr ? labelAr : label;
  const progressColor = color || "var(--color-primary-600)";

  return (
    <div className={cn("progress-bar-container mb-4", className)} role="group">
      {(displayLabel || showPercentage) && (
        <div className="flex items-center justify-between mb-2 text-sm">
          {displayLabel && (
            <span className="progress-label text-secondary-700" lang={locale}>
              {displayLabel}
            </span>
          )}
          {showPercentage && (
            <span
              className="progress-percentage font-semibold text-secondary-900"
              aria-label={`${percentage}% complete`}
            >
              {percentage}%
            </span>
          )}
        </div>
      )}

      <div
        className="progress-track h-2 bg-secondary-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={displayLabel}
      >
        <div
          className="progress-fill h-full rounded-full transition-all duration-300"
          style={{
            width: `${percentage}%`,
            backgroundColor: progressColor,
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Additional Helper Components
// ============================================================================

/**
 * Bilingual text block
 */
export function BilingualText({
  textEn,
  textAr,
  locale,
  className,
}: {
  textEn: string;
  textAr: string;
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={cn("bilingual-text space-y-2", className)}>
      <p className="font-medium" lang={locale}>
        {locale === "ar" ? textAr : textEn}
      </p>
      <p className="text-sm text-secondary-600" lang={locale === "ar" ? "en" : "ar"}>
        {locale === "ar" ? textEn : textAr}
      </p>
    </div>
  );
}

/**
 * Page break marker for print
 */
export function PageBreak() {
  return <div className="page-break" aria-hidden="true" />;
}

/**
 * Section divider
 */
export function SectionDivider({ className }: { className?: string }) {
  return (
    <hr
      className={cn(
        "section-divider border-0 border-t-2 border-secondary-200 my-8",
        className
      )}
      aria-hidden="true"
    />
  );
}
