"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SVG radial progress gauge with a high-contrast track so idle/pending
 * states stay visible (not washed out against light backgrounds).
 *
 * `indeterminate` draws a short arc that circles the track instead of a
 * filled fraction: the caller has a running step and no measured progress,
 * and a gauge showing a number there would be inventing one. The arc stops
 * under `prefers-reduced-motion` (the `ops-spin` utility is guarded in
 * globals.css) and reads as "working" through its `aria-label`.
 */
export function RadialGauge({
  value,
  size = 52,
  strokeWidth = 5,
  className,
  trackClassName = "text-slate-300 dark:text-slate-600",
  children,
  ariaLabel,
  indeterminate = false,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
  children?: ReactNode;
  ariaLabel?: string;
  /** Running with no measured progress: an orbiting arc, no fraction, no percent in the label. */
  indeterminate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;
  const arc = circumference * 0.22;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? (indeterminate ? undefined : `${Math.round(clamped)}%`)}
      aria-busy={indeterminate || undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("-rotate-90", indeterminate && "ops-spin motion-reduce:animate-none")}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          className={cn(
            !indeterminate && "transition-[stroke-dashoffset] duration-500 ease-out",
            className
          )}
          strokeDasharray={indeterminate ? `${arc} ${circumference - arc}` : circumference}
          strokeDashoffset={indeterminate ? 0 : dashOffset}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      ) : null}
    </div>
  );
}
