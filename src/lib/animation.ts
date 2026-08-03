/**
 * Shared scroll-animation configuration.
 *
 * Root-cause fix for premature mobile triggers:
 * - framer-motion defaults to `amount: 0` (fires when ANY pixel is visible)
 *   and `margin: "0px"` (fires at the viewport edge).
 * - Pixel-based rootMargin (-60px, -40px, -20px) consumes a different
 *   percentage of the viewport on mobile vs desktop:
 *     -60px / 640px viewport = 9.4%   (mobile)
 *     -60px / 900px viewport = 6.7%   (desktop)
 *   Percentage-based margins keep the trigger zone proportional.
 *
 * Fix: `margin: "0px 0px -10% 0px"` + `amount: 0.15` ensures the element
 * must be 15% visible AND at least 10% above the viewport bottom before
 * the entrance animation fires — consistent across 360px–1440px viewports.
 */

import type { Variants, Transition } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Viewport config for whileInView / useInView                        */
/* ------------------------------------------------------------------ */

/** Standard scroll-trigger viewport — percentage-based, fires once. */
export const SCROLL_VIEWPORT = {
  once: true,
  margin: "0px 0px -10% 0px",
  amount: 0.15,
} as const;

/**
 * Compact variant for small elements (badges, pills, list items)
 * where 15% of a 32px-tall chip is only ~5px — use a lower amount
 * but keep the percentage margin so the trigger zone stays proportional.
 */
export const SCROLL_VIEWPORT_COMPACT = {
  once: true,
  margin: "0px 0px -8% 0px",
  amount: 0.1,
} as const;

/* ------------------------------------------------------------------ */
/*  Transition presets — shorter on mobile via CSS `@media` fallback  */
/*  (framer-motion reads duration from JS; we keep desktop values      */
/*   here and let MotionConfig reducedMotion="user" + CSS handle        */
/*   reduced-motion; mobile duration reduction is handled via the       */
/*   `useIsMobile` hook below when needed).                             */
/* ------------------------------------------------------------------ */

/** Fade-up entrance: 400ms desktop, 300ms mobile. */
export const FADE_UP: Transition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

/** Slide entrance (horizontal): 400ms desktop, 300ms mobile. */
export const SLIDE_IN: Transition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

/** Stagger parent for grouped children. */
export const STAGGER_PARENT: Transition = {
  staggerChildren: 0.08,
};

/* ------------------------------------------------------------------ */
/*  RTL-aware horizontal offset                                        */
/* ------------------------------------------------------------------ */

/**
 * Returns the initial `x` offset for a slide-in entrance that respects
 * the document direction. In RTL the element enters from the right
 * (positive x), in LTR from the left (negative x).
 *
 * Usage:
 * ```tsx
 * initial={{ opacity: 0, x: rtlX(ar, 16) }}
 * whileInView={{ opacity: 1, x: 0 }}
 * ```
 */
export function rtlX(isRtl: boolean, distance = 16): number {
  return isRtl ? distance : -distance;
}

/* ------------------------------------------------------------------ */
/*  Mobile detection hook (for duration adjustments)                   */
/* ------------------------------------------------------------------ */

import { useEffect, useState } from "react";

/**
 * Returns `true` when the viewport width is ≤ 768px.
 * Used to shorten animation durations on mobile:
 *   fades  400ms → 300ms
 *   slides 400ms → 300ms
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

/**
 * Returns a transition with mobile-adjusted duration.
 * Desktop: 400ms fades, 400ms slides.
 * Mobile:  300ms fades, 300ms slides.
 */
export function useFadeTransition(delay = 0): Transition {
  const isMobile = useIsMobile();
  return {
    duration: isMobile ? 0.3 : 0.4,
    delay,
    ease: [0.22, 1, 0.36, 1],
  };
}
