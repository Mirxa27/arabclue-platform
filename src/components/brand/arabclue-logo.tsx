import { cn } from "@/lib/utils";

type ArabclueLogoProps = {
  className?: string;
  title?: string;
};

/** Platform mark — navy→sky “A” with clue dot (not tenant brand logos). */
export function ArabclueLogo({ className, title = "ArabClue" }: ArabclueLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id="ac-logo-bg" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E3A8A" />
          <stop offset="1" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#ac-logo-bg)" />
      <path
        d="M32 14L18 50h7.2l2.6-7.2h8.4L32.8 50H40L32 14zm0 12.4l3.1 8.6h-6.2L32 26.4z"
        fill="#FFFFFF"
      />
      <circle cx="46" cy="20" r="4.5" fill="#FFFFFF" fillOpacity="0.95" />
      <path d="M46 24.5v7.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
