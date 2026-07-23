"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SVG radial progress gauge with a high-contrast track so idle/pending
 * states stay visible (not washed out against light backgrounds).
 */
export function RadialGauge({
  value,
  size = 52,
  strokeWidth = 5,
  className,
  trackClassName = "text-slate-300 dark:text-slate-600",
  children,
  ariaLabel,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  trackClassName?: string;
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped)}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
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
            "transition-[stroke-dashoffset] duration-500 ease-out",
            className
          )}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
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
