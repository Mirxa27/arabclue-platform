/** Shared global namespace for IIFE content scripts (classic MV3 injection). */

export const ARABCLUE_NS = "__arabclueAgent";

export type ArabClueAgentGlobals = Record<string, unknown>;

export function exposeGlobals(fns: ArabClueAgentGlobals): void {
  const root = globalThis as unknown as Record<string, ArabClueAgentGlobals>;
  root[ARABCLUE_NS] = { ...(root[ARABCLUE_NS] || {}), ...fns };
}
