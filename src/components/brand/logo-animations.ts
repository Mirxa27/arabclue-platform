/**
 * Arabclue logo animation choreography.
 *
 * Keyframes and transitions are derived from design-token-backed constants in
 * [`logo-variants.ts`](./logo-variants.ts). Easing matches `FADE_UP` from
 * [`src/lib/animation.ts`](../../lib/animation.ts).
 *
 * CRITICAL: never apply CSS `transform: none` to arbitrary SVG descendants —
 * that overrides SVG presentation attributes like `transform="translate(...)"`
 * and collapses the icon mark into the top-left corner.
 */

import type { CSSProperties } from "react";
import {
  LOGO_COLORS,
  LOGO_EASING,
  LOGO_ENTRANCE_DURATION_MS,
  LOGO_HOVER,
  LOGO_ICON_ARCH_PATH_LENGTH,
  LOGO_ICON_HANDLE_PATH_LENGTH,
  LOGO_LOADING_PULSE,
  LOGO_TRANSITIONS,
} from "./logo-variants";

export interface LogoAnimationConfig {
  reducedMotion: boolean;
  entrance: boolean;
  hover: boolean;
  cycle: boolean;
  pulse: boolean;
}

export interface LogoAnimationResult {
  css: string;
  iconGroupStyle: CSSProperties;
  wordmarkStyle: CSSProperties;
  entranceClassName: string;
}

const ENTRANCE_ICON_MS = LOGO_ENTRANCE_DURATION_MS.min;
const ENTRANCE_WORDMARK_MS = LOGO_ENTRANCE_DURATION_MS.max;
const ENTRANCE_WORDMARK_DELAY_MS = 200;

/**
 * Generate scoped animation CSS for `.arabclue-logo`.
 * When `reducedMotion` is true, CSS animations/transitions are disabled
 * without touching SVG geometry transforms.
 */
export function getLogoAnimations(
  config: LogoAnimationConfig,
): LogoAnimationResult {
  const { reducedMotion } = config;
  const keyframes: string[] = [];
  const rules: string[] = [];

  const needsEntrance = config.entrance && !reducedMotion;
  const needsCycle = config.cycle && !reducedMotion;
  const needsPulse = config.pulse && !reducedMotion;
  const needsHover = config.hover && !reducedMotion;

  if (needsEntrance) {
    keyframes.push(`
@keyframes arabclue-logo-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}`);
    keyframes.push(`
@keyframes arabclue-logo-draw-arch {
  from { stroke-dashoffset: ${LOGO_ICON_ARCH_PATH_LENGTH}; }
  to { stroke-dashoffset: 0; }
}`);
    keyframes.push(`
@keyframes arabclue-logo-draw-handle {
  from { stroke-dashoffset: ${LOGO_ICON_HANDLE_PATH_LENGTH}; }
  to { stroke-dashoffset: 0; }
}`);
  }

  if (needsCycle) {
    keyframes.push(`
@keyframes arabclue-logo-cycle-in {
  from { opacity: 0; transform: translateY(6px); filter: blur(2px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}`);
  }

  if (needsPulse) {
    keyframes.push(`
@keyframes arabclue-logo-pulse {
  0%, 100% { transform: scale(${LOGO_LOADING_PULSE.minScale}); opacity: 0.85; }
  50% { transform: scale(${LOGO_LOADING_PULSE.maxScale}); opacity: 1; }
}`);
  }

  if (needsEntrance) {
    rules.push(`
.arabclue-logo--entrance-icon {
  animation: arabclue-logo-fade-up ${ENTRANCE_ICON_MS}ms ${LOGO_EASING} both;
}`);
    rules.push(`
.arabclue-logo--draw-arch {
  stroke-dasharray: ${LOGO_ICON_ARCH_PATH_LENGTH};
  stroke-dashoffset: ${LOGO_ICON_ARCH_PATH_LENGTH};
  animation: arabclue-logo-draw-arch ${ENTRANCE_ICON_MS}ms ${LOGO_EASING} both;
}`);
    rules.push(`
.arabclue-logo--draw-handle {
  stroke-dasharray: ${LOGO_ICON_HANDLE_PATH_LENGTH};
  stroke-dashoffset: ${LOGO_ICON_HANDLE_PATH_LENGTH};
  animation: arabclue-logo-draw-handle ${ENTRANCE_ICON_MS}ms ${LOGO_EASING} both;
}`);
    rules.push(`
.arabclue-logo--entrance-wordmark {
  opacity: 0;
  animation: arabclue-logo-fade-up ${ENTRANCE_WORDMARK_MS}ms ${LOGO_EASING} ${ENTRANCE_WORDMARK_DELAY_MS}ms both;
}`);
  }

  if (needsCycle) {
    rules.push(`
.arabclue-logo--cycle-active {
  animation: arabclue-logo-cycle-in ${LOGO_TRANSITIONS.slower} ${LOGO_EASING} both;
}`);
  }

  if (needsPulse) {
    rules.push(`
.arabclue-logo--pulse {
  animation: arabclue-logo-pulse ${LOGO_LOADING_PULSE.durationMs}ms ease-in-out infinite;
}`);
  }

  if (needsHover) {
    rules.push(`
.arabclue-logo--interactive {
  transition: transform ${LOGO_TRANSITIONS.slow} ${LOGO_EASING};
}`);
    rules.push(`
.arabclue-logo--interactive:hover {
  transform: scale(${LOGO_HOVER.scale});
}`);
    // Hover rotate targets a wrapper — never the SVG geometry <g>.
    rules.push(`
.arabclue-logo__icon-motion {
  transition: transform ${LOGO_TRANSITIONS.slow} ${LOGO_EASING};
  display: inline-flex;
  line-height: 0;
}`);
    rules.push(`
.arabclue-logo--interactive:hover .arabclue-logo__icon-motion {
  transform: rotate(${LOGO_HOVER.rotationDeg}deg);
}`);
    rules.push(`
.arabclue-logo__wordmark {
  transition: letter-spacing ${LOGO_TRANSITIONS.slow} ${LOGO_EASING}, color ${LOGO_TRANSITIONS.slow} ${LOGO_EASING};
}`);
    rules.push(`
.arabclue-logo--interactive:hover .arabclue-logo__wordmark {
  letter-spacing: ${LOGO_HOVER.letterSpacing};
}`);
    rules.push(`
.arabclue-logo--interactive:hover .arabclue-logo__icon-stroke {
  stroke: ${LOGO_COLORS.primary};
  transition: stroke ${LOGO_TRANSITIONS.slow} ${LOGO_EASING};
}`);
    rules.push(`
.arabclue-logo--interactive:hover .arabclue-logo__icon-fill {
  fill: ${LOGO_COLORS.primary};
  transition: fill ${LOGO_TRANSITIONS.slow} ${LOGO_EASING};
}`);
  }

  if (reducedMotion) {
    // Disable CSS motion only — do NOT set transform:none on SVG subtree.
    rules.push(`
.arabclue-logo--reduced-motion .arabclue-logo--entrance-icon,
.arabclue-logo--reduced-motion .arabclue-logo--entrance-wordmark,
.arabclue-logo--reduced-motion .arabclue-logo--draw-arch,
.arabclue-logo--reduced-motion .arabclue-logo--draw-handle,
.arabclue-logo--reduced-motion .arabclue-logo--cycle-active,
.arabclue-logo--reduced-motion .arabclue-logo--pulse,
.arabclue-logo--reduced-motion.arabclue-logo--interactive,
.arabclue-logo--reduced-motion .arabclue-logo__icon-motion,
.arabclue-logo--reduced-motion .arabclue-logo__wordmark {
  animation: none !important;
  transition: none !important;
  filter: none !important;
}`);
    rules.push(`
.arabclue-logo--reduced-motion .arabclue-logo--draw-arch,
.arabclue-logo--reduced-motion .arabclue-logo--draw-handle {
  stroke-dasharray: none !important;
  stroke-dashoffset: 0 !important;
}`);
    rules.push(`
.arabclue-logo--reduced-motion .arabclue-logo--entrance-wordmark {
  opacity: 1 !important;
}`);
    // Kill CSS hover transforms on the motion wrapper only (not SVG <g>).
    rules.push(`
.arabclue-logo--reduced-motion.arabclue-logo--interactive:hover,
.arabclue-logo--reduced-motion.arabclue-logo--interactive:hover .arabclue-logo__icon-motion {
  transform: none !important;
}`);
  }

  rules.push(`
@media print {
  .arabclue-logo--print .arabclue-logo--entrance-icon,
  .arabclue-logo--print .arabclue-logo--entrance-wordmark,
  .arabclue-logo--print .arabclue-logo--draw-arch,
  .arabclue-logo--print .arabclue-logo--draw-handle,
  .arabclue-logo--print .arabclue-logo--pulse,
  .arabclue-logo--print .arabclue-logo--cycle-active {
    animation: none !important;
    transition: none !important;
    filter: none !important;
    stroke-dashoffset: 0 !important;
    opacity: 1 !important;
  }
}`);

  const css = `${keyframes.join("\n")}\n${rules.join("\n")}`;

  const iconGroupStyle: CSSProperties =
    config.entrance && !reducedMotion
      ? {
          strokeDasharray: LOGO_ICON_ARCH_PATH_LENGTH,
          strokeDashoffset: LOGO_ICON_ARCH_PATH_LENGTH,
        }
      : {};

  const wordmarkStyle: CSSProperties =
    config.entrance && !reducedMotion ? { opacity: 0 } : {};

  const entranceClassName =
    config.entrance && !reducedMotion ? "arabclue-logo--entrance-icon" : "";

  return { css, iconGroupStyle, wordmarkStyle, entranceClassName };
}

/** SSR-safe reduced-motion probe. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
