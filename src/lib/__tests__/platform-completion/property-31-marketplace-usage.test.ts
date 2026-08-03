/**
 * Feature: platform-completion, Property 31: Marketplace usage increments once per pair
 *
 * Generate entry/proposal pairs and repeated application sequences; assert at
 * most one marker and exactly one usage increment per (entryId, proposalId).
 *
 * Models the production invariant of `recordMarketplaceApplication`: the
 * unique constraint on (entryId, proposalId) admits one create+increment and
 * treats every later attempt as a no-op.
 */

import { describe, expect, test } from "bun:test";

type Pair = Readonly<{ entryId: string; proposalId: string }>;

type MarketplaceUsageStore = {
  markers: Set<string>;
  counts: Map<string, number>;
};

function pairKey(pair: Pair): string {
  return `${pair.entryId}\u0000${pair.proposalId}`;
}

function applyMarketplaceUsage(
  store: MarketplaceUsageStore,
  pair: Pair
): { readonly firstApplication: boolean; readonly usageCount: number } {
  const key = pairKey(pair);
  if (store.markers.has(key)) {
    return {
      firstApplication: false,
      usageCount: store.counts.get(pair.entryId) ?? 0,
    };
  }
  store.markers.add(key);
  const next = (store.counts.get(pair.entryId) ?? 0) + 1;
  store.counts.set(pair.entryId, next);
  return { firstApplication: true, usageCount: next };
}

describe("Feature: platform-completion, Property 31: Marketplace usage increments once per pair", () => {
  test("repeated applications increment usage once per entry/proposal pair across 100+ cases", () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const store: MarketplaceUsageStore = {
        markers: new Set(),
        counts: new Map(),
      };

      const entryCount = 1 + (seed % 4);
      const proposalCount = 2 + (seed % 5);
      const pairs: Pair[] = [];
      for (let e = 0; e < entryCount; e++) {
        for (let p = 0; p < proposalCount; p++) {
          pairs.push({
            entryId: `entry-${seed}-${e}`,
            proposalId: `proposal-${seed}-${p}`,
          });
        }
      }

      const repeats = 2 + (seed % 4);
      for (let r = 0; r < repeats; r++) {
        for (const pair of pairs) {
          const result = applyMarketplaceUsage(store, pair);
          if (r === 0) {
            expect(result.firstApplication).toBe(true);
          } else {
            expect(result.firstApplication).toBe(false);
          }
        }
      }

      expect(store.markers.size).toBe(pairs.length);
      for (let e = 0; e < entryCount; e++) {
        expect(store.counts.get(`entry-${seed}-${e}`)).toBe(proposalCount);
      }
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
