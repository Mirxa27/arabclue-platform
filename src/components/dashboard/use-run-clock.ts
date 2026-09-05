"use client";

import { useEffect, useState } from "react";

/**
 * A once-a-second `Date.now()` while `active`, frozen otherwise. Elapsed
 * readouts (a running agent, a live run) derive from the orchestrator's
 * `startedAt` stamps and this clock — never from a timer that guesses
 * progress. Frozen when inactive so a finished run shows its real duration
 * and nothing keeps re-rendering.
 */
export function useRunClock(active: boolean, intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
