/**
 * The pricing page may only sell what the product delivers.
 *
 * Two things are true of this codebase and neither is obvious from the copy:
 *
 *   1. Nothing reads SubscriptionPlan.featuresJson. All fifteen slugs are inert
 *      rows, so no feature is gated by plan and every tier ships the same
 *      capabilities. The levers that genuinely bind are the numeric quotas in
 *      quotas.ts:39-112, which throw QuotaExceededError.
 *   2. maxWorkspaces is never read, and there is no self-serve path to create a
 *      second workspace — workspace.create is called only on signup
 *      (account-service-prisma.ts:172) and on the no-membership auto-provision
 *      (workspace-context.ts:71). A customer cannot reach workspace two on any
 *      plan, so a workspace count is not a thing to sell.
 *
 * So this file pins the numbers to DEFAULT_PLANS, which is what quotas.ts
 * enforces, and refuses claims whose implementation was searched for and not
 * found. Capabilities that exist but are on the roadmap stay sellable through
 * an explicit "On request" label — that is a promise about the future, not a
 * claim about today, and the ON_REQUEST_PREFIX below is what distinguishes them.
 */

import { describe, expect, test } from "bun:test";
import { DEFAULT_PLANS } from "@/lib/constants";
import { MARKETING_PLANS } from "@/lib/marketing-plans";
import { pricingComparison, pricingPlans } from "@/lib/marketing-copy";

/** How a not-yet-built capability is allowed to appear in customer copy. */
const ON_REQUEST_PREFIX = { en: "On request:", ar: "عند الطلب:" };

/**
 * Claims with no implementation behind them. Each was searched for; the note
 * records what the search found so a future reader can re-check rather than
 * trust this list.
 */
const UNBACKED = [
  // maxWorkspaces is read nowhere; no route creates a second workspace.
  { pattern: /\bworkspaces?\b/i, why: "no self-serve workspace creation exists" },
  // Bare "مساحات" (as in "3 مساحات") is the same claim abbreviated, so match
  // the root rather than the full phrase; in this copy it only ever means
  // workspace.
  { pattern: /مساحة|مساحات/, why: "no self-serve workspace creation exists" },
  // No queue library in package.json; AgentRun has no priority field.
  { pattern: /priority agent runs/i, why: "no job queue; AgentRun has no priority" },
  // AIProviderConfig is withAdmin-gated and has no workspaceId.
  { pattern: /custom ai provider routing/i, why: "admin-only platform config, no tenant reach" },
  { pattern: /توجيه مخصص لمزودي الذكاء/, why: "admin-only platform config, no tenant reach" },
  // auth.ts has one CredentialsProvider, no adapter, no Account/Session models.
  { pattern: /\bSSO\b|single sign-?on/i, why: "NextAuth has no adapter and no Account model" },
  // AuditLog has no workspaceId and both read routes are withAdmin + unscoped,
  // so the logging is real but no customer can ever see their own trail.
  { pattern: /audit trail|\bRBAC\b/i, why: "AuditLog has no workspaceId; reads are platform-admin only" },
  { pattern: /سجل تدقيق|صلاحيات أدوار/, why: "AuditLog has no workspaceId; reads are platform-admin only" },
];

function claimsOf(plan: (typeof MARKETING_PLANS)[number]): string[] {
  return [...plan.featuresEn, ...plan.featuresAr];
}

function isOnRequest(claim: string): boolean {
  return (
    claim.startsWith(ON_REQUEST_PREFIX.en) || claim.startsWith(ON_REQUEST_PREFIX.ar)
  );
}

describe("plan quotas in marketing match the quotas that are enforced", () => {
  test("every marketed plan has a seeded plan behind it", () => {
    // Anti-vacuous: an empty MARKETING_PLANS would satisfy the loops below.
    expect(MARKETING_PLANS.length).toBeGreaterThan(0);
    for (const plan of MARKETING_PLANS) {
      const seeded = DEFAULT_PLANS.find((p) => p.name === plan.code);
      expect(seeded, `no DEFAULT_PLANS entry named ${plan.code}`).toBeTruthy();
    }
  });

  test("a marketed proposal or document count is the enforced count", () => {
    let checked = 0;
    for (const plan of MARKETING_PLANS) {
      const seeded = DEFAULT_PLANS.find((p) => p.name === plan.code);
      if (!seeded) continue;
      for (const claim of plan.featuresEn) {
        const proposals = /^(\d+) proposals/.exec(claim);
        if (proposals) {
          expect(Number(proposals[1]), `${plan.code} proposals`).toBe(seeded.maxProposals);
          checked += 1;
        }
        const docs = /^(\d+) (?:tender )?documents/.exec(claim);
        if (docs) {
          expect(Number(docs[1]), `${plan.code} documents`).toBe(seeded.maxDocuments);
          checked += 1;
        }
      }
    }
    // Anti-vacuous: a copy rewrite that drops every number must not pass here.
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});

describe("no plan sells a capability the code does not deliver", () => {
  test("plan feature lists are backed or explicitly on request", () => {
    const hits: string[] = [];
    for (const plan of MARKETING_PLANS) {
      for (const claim of claimsOf(plan)) {
        if (isOnRequest(claim)) continue;
        for (const { pattern, why } of UNBACKED) {
          if (pattern.test(claim)) hits.push(`${plan.code}: "${claim}" — ${why}`);
        }
      }
    }
    expect(hits, `unbacked plan claim:\n${hits.join("\n")}`).toEqual([]);
  });

  test("the comparison table is backed too", () => {
    const hits: string[] = [];
    for (const row of pricingComparison) {
      for (const label of [row.feature.en, row.feature.ar]) {
        for (const { pattern, why } of UNBACKED) {
          if (pattern.test(label)) hits.push(`"${label}" — ${why}`);
        }
      }
    }
    expect(hits, `unbacked comparison row:\n${hits.join("\n")}`).toEqual([]);
  });

  test("the pricing card feature lists are backed too", () => {
    const hits: string[] = [];
    for (const plan of pricingPlans) {
      for (const claim of [...plan.features.en, ...plan.features.ar]) {
        if (isOnRequest(claim)) continue;
        for (const { pattern, why } of UNBACKED) {
          if (pattern.test(claim)) hits.push(`"${claim}" — ${why}`);
        }
      }
    }
    expect(hits, `unbacked pricing card claim:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("the enforced levers are still the ones being sold", () => {
  test("storage and quota claims survive the correction", () => {
    // Anti-vacuous: deleting every feature line would pass the scans above, so
    // pin that the plans still describe the limits quotas.ts actually applies.
    const all = MARKETING_PLANS.flatMap(claimsOf).join(" | ");
    expect(all).toMatch(/proposals/i);
    expect(all).toMatch(/documents/i);
    expect(all).toMatch(/GB/);
  });
});
