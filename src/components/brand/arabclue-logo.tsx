import { cn } from "@/lib/utils";
import { useId } from "react";

type ArabclueLogoProps = {
  className?: string;
  title?: string;
  variant?: "default" | "mono";
};

export function ArabclueLogo({ className, title = "ArabClue", variant = "default" }: ArabclueLogoProps) {
  const id = useId();
  const gradId = `ac-logo-bg-${id.replace(/:/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("shrink-0 select-none", className)}
      style={{ isolation: "isolate" }}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          {variant === "mono" ? (
            <>
              <stop stopColor="#1a1a1a" />
              <stop offset="1" stopColor="#333333" />
            </>
          ) : (
            <>
              <stop stopColor="#1E3A8A" />
              <stop offset="1" stopColor="#0EA5E9" />
            </>
          )}
        </linearGradient>
        <filter id={`${gradId}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#1E3A8A" floodOpacity="0.24" />
        </filter>
      </defs>
      <g filter={`url(#${gradId}-shadow)`}>
        <rect x="2" y="2" width="60" height="60" rx="14" fill={`url(#${gradId})`} />
      </g>
      <path
        d="M32 14L18 50h7.2l2.6-7.2h8.4L32.8 50H40L32 14zm0 12.4l3.1 8.6h-6.2L32 26.4z"
        fill="#FFFFFF"
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}
      />
      <circle cx="46" cy="20" r="4.5" fill="#FFFFFF" fillOpacity="0.95" />
      <path d="M46 24.5v7.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
