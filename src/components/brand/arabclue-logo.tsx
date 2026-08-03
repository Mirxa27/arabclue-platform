"use client";

import { cn } from "@/lib/utils";
import { readPersistedLocale } from "@/lib/store";
import type { Locale } from "@/lib/types";
import {
  useId,
  useState,
  useEffect,
  useCallback,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  LOGO_COLORS,
  LOGO_CYCLE_INTERVAL_MS,
  LOGO_EASING,
  LOGO_FONT_FAMILIES,
  LOGO_ICON_HANDLE_LINE,
  LOGO_ICON_KEYHOLE_CIRCLE,
  LOGO_ICON_PATH_FILLED,
  LOGO_ICON_PATH_KEYHOLE_SLOT,
  LOGO_ICON_VIEWBOX,
  LOGO_LETTER_SPACING,
  LOGO_SIZES,
  LOGO_SQUIRCLE_RADIUS,
  LOGO_TRANSITIONS,
  LOGO_UNIFIED_LOCKUP,
  LOGO_VARIANT_DEFAULT_DISPLAY,
  LOGO_VARIANT_DEFAULT_SIZE,
  LOGO_WORDMARK,
  type LogoDisplayMode,
  type LogoSize,
  type LogoVariant,
} from "./logo-variants";
import {
  getLogoAnimations,
  type LogoAnimationConfig,
} from "./logo-animations";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ArabclueLogoProps {
  /** Usage context — controls default size, display mode, and animation. */
  variant?: LogoVariant;
  /** How the bilingual wordmark is displayed. */
  displayMode?: LogoDisplayMode;
  /** Size scale. Defaults are derived from the variant. */
  size?: LogoSize;
  /** Override the `animated` flag (defaults to variant-specific). */
  animated?: boolean;
  /** Override the detected locale. */
  locale?: Locale;
  /** Additional class names (icon-only: sizes the mark box). */
  className?: string;
  /** Click handler — makes the logo interactive. */
  onClick?: () => void;
  /**
   * Show the bilingual wordmark beside the icon.
   * Defaults to `false` so existing icon-only call sites keep working;
   * pass `true` for header/footer lockups.
   */
  showWordmark?: boolean;
  /** Render in monochrome (single color). */
  monochrome?: boolean;
  /** Wordmark / mono tone for light vs dark surfaces. */
  tone?: "default" | "inverse";
  /** Accessible label override. */
  title?: string;
}

export type {
  LogoDisplayMode,
  LogoSize,
  LogoVariant,
} from "./logo-variants";

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaEventLike) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

type MediaEventLike = MediaQueryListEvent;

function useCurrentLocale(override?: Locale): Locale {
  const [locale, setLocale] = useState<Locale>(override ?? "ar");

  useEffect(() => {
    if (override) {
      setLocale(override);
      return;
    }
    setLocale(readPersistedLocale());
  }, [override]);

  return locale;
}

/**
 * Cycle mode — alternates ar/en every interval. Pauses while hovered.
 */
function useCycleLanguage(
  enabled: boolean,
  initialLocale: Locale,
  reducedMotion: boolean,
): {
  currentLocale: Locale;
  setPaused: (paused: boolean) => void;
} {
  const [currentLocale, setCurrentLocale] = useState<Locale>(initialLocale);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setCurrentLocale(initialLocale);
  }, [initialLocale]);

  useEffect(() => {
    if (!enabled || reducedMotion || paused) return;
    const timer = window.setTimeout(() => {
      setCurrentLocale((prev) => (prev === "ar" ? "en" : "ar"));
    }, LOGO_CYCLE_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, reducedMotion, paused, currentLocale]);

  return { currentLocale, setPaused };
}

// ---------------------------------------------------------------------------
// Icon mark
// ---------------------------------------------------------------------------

interface IconMarkProps {
  size: number;
  /** When true, SVG fills the parent box (className-driven sizing). */
  fillParent: boolean;
  monochrome: boolean;
  reducedMotion: boolean;
  entrance: boolean;
  pulse: boolean;
  interactive: boolean;
  gradientId: string;
  className?: string;
  /** When set, this SVG is the accessible root (icon-only usage). */
  accessibleLabel?: string;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<SVGSVGElement>) => void;
  tabIndex?: number;
  dataVariant?: LogoVariant;
  dataDisplayMode?: LogoDisplayMode;
  dataLocale?: Locale;
}

function IconMark({
  size,
  fillParent,
  monochrome,
  reducedMotion,
  entrance,
  pulse,
  interactive,
  gradientId,
  className,
  accessibleLabel,
  onClick,
  onKeyDown,
  tabIndex,
  dataVariant,
  dataDisplayMode,
  dataLocale,
}: IconMarkProps) {
  const bgId = `arabclue-logo-bg-${gradientId}`;
  const goldId = `arabclue-logo-gold-${gradientId}`;
  const primaryId = `arabclue-logo-primary-${gradientId}`;
  const { x1, y1, x2, y2 } = LOGO_ICON_HANDLE_LINE;
  const { cx, cy, r } = LOGO_ICON_KEYHOLE_CIRCLE;

  const strokeColor = monochrome
    ? LOGO_COLORS.neutralDark
    : `url(#${primaryId})`;
  const fillColor = monochrome
    ? LOGO_COLORS.neutralDark
    : `url(#${goldId})`;
  const bgColor = monochrome
    ? LOGO_COLORS.neutralLight
    : `url(#${bgId})`;

  // Absolute path coordinates — no SVG <g transform>, so reduced-motion CSS
  // can never collapse the mark into the top-left corner.
  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOGO_ICON_VIEWBOX} ${LOGO_ICON_VIEWBOX}`}
      width={fillParent ? undefined : size}
      height={fillParent ? undefined : size}
      fill="none"
      role="img"
      aria-label={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      className={cn(
        "arabclue-logo__icon-mark shrink-0 select-none block",
        fillParent && "h-full w-full",
        entrance && !reducedMotion && "arabclue-logo--entrance-icon",
        pulse && !reducedMotion && "arabclue-logo--pulse",
        className,
      )}
      style={{
        isolation: "isolate",
        cursor: onClick ? "pointer" : undefined,
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      data-variant={dataVariant}
      data-display-mode={dataDisplayMode}
      data-locale={dataLocale}
    >
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          {monochrome ? (
            <>
              <stop offset="0%" stopColor={LOGO_COLORS.neutralLight} />
              <stop offset="100%" stopColor={LOGO_COLORS.neutral200} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={LOGO_COLORS.neutralMid} />
              <stop offset="100%" stopColor={LOGO_COLORS.neutralDark} />
            </>
          )}
        </linearGradient>
        <linearGradient id={goldId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={LOGO_COLORS.accentLight} />
          <stop offset="50%" stopColor={LOGO_COLORS.accent} />
          <stop offset="100%" stopColor={LOGO_COLORS.accentDark} />
        </linearGradient>
        <linearGradient id={primaryId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={LOGO_COLORS.primaryLight} />
          <stop offset="50%" stopColor={LOGO_COLORS.primary} />
          <stop offset="100%" stopColor={LOGO_COLORS.primaryDark} />
        </linearGradient>
      </defs>
      <rect
        width={LOGO_ICON_VIEWBOX}
        height={LOGO_ICON_VIEWBOX}
        rx={LOGO_SQUIRCLE_RADIUS}
        fill={bgColor}
        stroke={monochrome ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)"}
        strokeWidth={1.5}
      />
      <path
        d={LOGO_ICON_PATH_FILLED}
        fill="none"
        stroke={strokeColor}
        strokeWidth={7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          "arabclue-logo__icon-stroke",
          entrance && !reducedMotion && "arabclue-logo--draw-arch",
        )}
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeColor}
        strokeWidth={7.5}
        strokeLinecap="round"
        className={cn(
          "arabclue-logo__icon-stroke",
          entrance && !reducedMotion && "arabclue-logo--draw-handle",
        )}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fillColor}
        className="arabclue-logo__icon-fill"
      />
      <path
        d={LOGO_ICON_PATH_KEYHOLE_SLOT}
        fill={fillColor}
        className="arabclue-logo__icon-fill"
      />
    </svg>
  );

  if (!interactive) return svg;

  return <span className="arabclue-logo__icon-motion">{svg}</span>;
}

// ---------------------------------------------------------------------------
// Wordmark
// ---------------------------------------------------------------------------

interface WordmarkProps {
  locale: Locale;
  size: LogoSize;
  monochrome: boolean;
  reducedMotion: boolean;
  entrance: boolean;
  interactive: boolean;
  displayMode: LogoDisplayMode;
  variant: LogoVariant;
  cycle: boolean;
  tone: "default" | "inverse";
}

function Wordmark({
  locale,
  size,
  monochrome,
  reducedMotion,
  entrance,
  interactive,
  displayMode,
  variant,
  cycle,
  tone,
}: WordmarkProps) {
  const sizeConfig = LOGO_SIZES[size];
  const isArabic = locale === "ar";
  const fontFamily = isArabic
    ? LOGO_FONT_FAMILIES.arabic
    : LOGO_FONT_FAMILIES.english;
  const text = LOGO_WORDMARK[locale];
  const textColor = monochrome
    ? tone === "inverse"
      ? LOGO_COLORS.textInverse
      : LOGO_COLORS.neutralDark
    : tone === "inverse"
      ? LOGO_COLORS.textInverse
      : variant === "footer"
        ? LOGO_COLORS.neutral600
        : LOGO_COLORS.neutralDark;

  const wordmarkStyle: CSSProperties = {
    fontFamily,
    fontSize: `${sizeConfig.wordmarkFontSize}px`,
    fontWeight: 700,
    letterSpacing: LOGO_LETTER_SPACING.normal,
    color: textColor,
    lineHeight: 1.2,
    transition: `letter-spacing ${LOGO_TRANSITIONS.slow} ${LOGO_EASING}, opacity ${LOGO_TRANSITIONS.slow} ${LOGO_EASING}`,
  };

  const className = cn(
    "arabclue-logo__wordmark select-none whitespace-nowrap",
    entrance && !reducedMotion && "arabclue-logo--entrance-wordmark",
    cycle && !reducedMotion && "arabclue-logo--cycle-active",
    interactive && "arabclue-logo--interactive",
  );

  if (displayMode === "unified") {
    const { englishPart, arabicPart } = LOGO_UNIFIED_LOCKUP;
    return (
      <span className={className} style={wordmarkStyle} dir="ltr">
        <span style={{ fontFamily: LOGO_FONT_FAMILIES.english }}>
          {englishPart}
        </span>
        <span
          style={{
            fontFamily: LOGO_FONT_FAMILIES.arabic,
            fontSize: `${sizeConfig.wordmarkFontSize * 0.88}px`,
            marginInlineStart: "0.12em",
            color: monochrome ? textColor : LOGO_COLORS.primary,
            fontWeight: 700,
          }}
        >
          {arabicPart}
        </span>
      </span>
    );
  }

  return (
    <span
      key={`${displayMode}-${locale}`}
      className={className}
      style={wordmarkStyle}
      dir={isArabic ? "rtl" : "ltr"}
      lang={locale}
    >
      {text}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ArabclueLogo({
  variant = "header",
  displayMode,
  size,
  animated,
  locale: localeOverride,
  className,
  onClick,
  showWordmark = false,
  monochrome = false,
  tone = "default",
  title = "Arabclue",
}: ArabclueLogoProps) {
  const reactId = useId().replace(/:/g, "");
  const reducedMotion = useReducedMotion();
  const detectedLocale = useCurrentLocale(localeOverride);

  const resolvedSize = size ?? LOGO_VARIANT_DEFAULT_SIZE[variant];
  const resolvedDisplayMode =
    displayMode ?? LOGO_VARIANT_DEFAULT_DISPLAY[variant];

  const isFavicon = variant === "favicon";
  const isPrint = variant === "print";
  const isFooter = variant === "footer";
  const isLoading = variant === "loading";
  const iconOnly = isFavicon || !showWordmark;

  // Icon-only embeds stay static; lockups + loading get motion by default.
  const animatedEnabled =
    animated ??
    (!isFavicon && !isPrint && !isFooter && (showWordmark || isLoading));
  const entranceEnabled =
    animatedEnabled && !reducedMotion && showWordmark && !isLoading;
  const hoverEnabled =
    animatedEnabled &&
    !reducedMotion &&
    (variant === "header" || isLoading || Boolean(onClick));
  const cycleEnabled =
    resolvedDisplayMode === "cycle" &&
    showWordmark &&
    animatedEnabled &&
    !reducedMotion &&
    !isFavicon &&
    !isPrint;
  const pulseEnabled = isLoading && animatedEnabled && !reducedMotion;

  const { currentLocale, setPaused } = useCycleLanguage(
    cycleEnabled,
    detectedLocale,
    reducedMotion,
  );

  const activeLocale: Locale =
    resolvedDisplayMode === "static-ar"
      ? "ar"
      : resolvedDisplayMode === "static-en"
        ? "en"
        : resolvedDisplayMode === "unified"
          ? detectedLocale
          : cycleEnabled
            ? currentLocale
            : detectedLocale;

  const animConfig: LogoAnimationConfig = {
    reducedMotion,
    entrance: entranceEnabled,
    hover: hoverEnabled,
    cycle: cycleEnabled,
    pulse: pulseEnabled,
  };
  const { css } = getLogoAnimations(animConfig);

  const sizeConfig = LOGO_SIZES[resolvedSize];
  const isInteractive = Boolean(onClick) || (variant === "header" && !iconOnly);
  const effectiveMonochrome = monochrome || isPrint;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<Element>) => {
      if (!onClick) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const containerClassName = cn(
    "arabclue-logo",
    "shrink-0 select-none",
    hoverEnabled && "arabclue-logo--interactive",
    reducedMotion && "arabclue-logo--reduced-motion",
    isPrint && "arabclue-logo--print",
  );

  // Icon-only: put sizing classes on the SVG itself (matches the original API
  // used across login/sidebar/marketing: `className="size-10 rounded-xl"`).
  if (isFavicon || iconOnly) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <IconMark
          size={sizeConfig.iconHeight}
          fillParent={false}
          monochrome={effectiveMonochrome}
          reducedMotion={reducedMotion || isFavicon || isPrint}
          entrance={false}
          pulse={pulseEnabled}
          interactive={false}
          gradientId={reactId}
          className={cn(containerClassName, className)}
          accessibleLabel={title}
          onClick={onClick}
          onKeyDown={onClick ? handleKeyDown : undefined}
          tabIndex={onClick ? 0 : undefined}
          dataVariant={variant}
          dataDisplayMode={resolvedDisplayMode}
          dataLocale={activeLocale}
        />
      </>
    );
  }

  const containerStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: `${sizeConfig.gap}px`,
    direction: activeLocale === "ar" ? "rtl" : "ltr",
    cursor: isInteractive || onClick ? "pointer" : "default",
    ...(isPrint ? { color: LOGO_COLORS.neutralDark } : {}),
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <span
        className={cn(containerClassName, className)}
        role="img"
        aria-label={title}
        style={containerStyle}
        onClick={onClick}
        onKeyDown={onClick ? handleKeyDown : undefined}
        tabIndex={onClick ? 0 : undefined}
        onMouseEnter={cycleEnabled ? () => setPaused(true) : undefined}
        onMouseLeave={cycleEnabled ? () => setPaused(false) : undefined}
        data-variant={variant}
        data-display-mode={resolvedDisplayMode}
        data-locale={activeLocale}
      >
        <IconMark
          size={sizeConfig.iconHeight}
          fillParent={false}
          monochrome={effectiveMonochrome}
          reducedMotion={reducedMotion || isPrint}
          entrance={entranceEnabled}
          pulse={pulseEnabled}
          interactive={hoverEnabled}
          gradientId={reactId}
        />
        <Wordmark
          locale={activeLocale}
          size={resolvedSize}
          monochrome={effectiveMonochrome}
          reducedMotion={reducedMotion}
          entrance={entranceEnabled}
          interactive={hoverEnabled}
          displayMode={resolvedDisplayMode}
          variant={variant}
          cycle={cycleEnabled}
          tone={tone}
        />
      </span>
    </>
  );
}

export default ArabclueLogo;
