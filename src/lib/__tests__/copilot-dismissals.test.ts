/**
 * The rail forgets every rejection the moment the tab reloads.
 *
 * `suggestionId` is content-addressed on purpose, and says so in its own
 * docblock (`copilot-suggestions.ts:33-36`): *"Stable across passes so the rail
 * can remember what the user dismissed. Content-addressed rather than random:
 * re-running the review on an unchanged paragraph must not resurrect a card the
 * user already rejected."* The hashing delivers that; nothing else does.
 * `dismissed` is `useState<Set<string>>` (`copilot-rail.tsx:109`), so a writer
 * who rejected five suggestions and reloaded gets all five back — and the rail
 * fires a fresh pass on idle, so they will.
 *
 * Storing the suggestions themselves would be the wrong fix: they are anchored
 * to text the writer keeps editing, and re-hydrating a card whose anchor has
 * since moved is exactly the ambiguity `anchorResolves` exists to refuse. Only
 * the rejections are worth keeping, and they are twelve hex characters each.
 *
 * Everything read back is untrusted — `localStorage` is user-writable and
 * shared with every other tab on the origin — so the read path validates and
 * evicts rather than letting a malformed record reach React.
 */

import { describe, expect, test } from "bun:test";
import {
  COPILOT_DISMISSAL_MAX_AGE_MS,
  COPILOT_DISMISSAL_MAX_IDS,
  clearDismissals,
  dismissalKey,
  readDismissals,
  writeDismissals,
  type DismissalStorage,
} from "../ai/copilot-dismissals";

const PROPOSAL = "cmp-proposal-1";
const OTHER = "cmp-proposal-2";
const NOW = new Date("2026-09-01T12:00:00.000Z");

/** Twelve hex characters, the shape `suggestionId` produces. */
function id(seed: number): string {
  return seed.toString(16).padStart(12, "0");
}

function fakeStorage(
  options: Readonly<{ failOnSet?: boolean; failOnGet?: boolean }> = {}
): DismissalStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => {
      if (options.failOnGet) throw new Error("SecurityError");
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (options.failOnSet) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("dismissals survive the reload", () => {
  test("what was rejected reads back", () => {
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1), id(2)], NOW);
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([id(1), id(2)]);
  });

  test("a proposal with no record reads back empty", () => {
    expect(readDismissals(fakeStorage(), PROPOSAL, NOW)).toEqual([]);
  });

  test("one proposal's rejections never reach another", () => {
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1)], NOW);
    writeDismissals(storage, OTHER, [id(2)], NOW);
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([id(1)]);
    expect(readDismissals(storage, OTHER, NOW)).toEqual([id(2)]);
    expect(dismissalKey(PROPOSAL)).not.toBe(dismissalKey(OTHER));
  });

  test("clearing removes the record rather than storing an empty one", () => {
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1)], NOW);
    clearDismissals(storage, PROPOSAL);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });

  test("writing nothing removes the record", () => {
    // Asking a fresh question clears the rail's set so the answer is not hidden
    // by an older rejection. Leaving the old record on disk would put it back
    // on the next reload.
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1)], NOW);
    writeDismissals(storage, PROPOSAL, [], NOW);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });
});

describe("nothing read back is trusted", () => {
  test("a corrupt record is refused and evicted", () => {
    const storage = fakeStorage();
    storage.map.set(dismissalKey(PROPOSAL), "{not json");
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([]);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });

  test("a record naming a different proposal is refused and evicted", () => {
    const storage = fakeStorage();
    storage.map.set(
      dismissalKey(PROPOSAL),
      JSON.stringify({
        proposalId: OTHER,
        ids: [id(1)],
        savedAt: NOW.toISOString(),
      })
    );
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([]);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });

  test("entries that are not suggestion ids are dropped, the rest survive", () => {
    // A dismissal id is only ever twelve hex characters. Anything else came
    // from another tab, a hand-edited store, or an id scheme that has since
    // changed — none of which should cost the writer their real rejections.
    const storage = fakeStorage();
    storage.map.set(
      dismissalKey(PROPOSAL),
      JSON.stringify({
        proposalId: PROPOSAL,
        ids: [id(1), "", "ZZZZZZZZZZZZ", 42, null, id(2)],
        savedAt: NOW.toISOString(),
      })
    );
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([id(1), id(2)]);
  });

  test("a record whose entries are all junk is evicted", () => {
    const storage = fakeStorage();
    storage.map.set(
      dismissalKey(PROPOSAL),
      JSON.stringify({
        proposalId: PROPOSAL,
        ids: ["nope"],
        savedAt: NOW.toISOString(),
      })
    );
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([]);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });
});

describe("the store stays bounded", () => {
  test("an abandoned record expires rather than sitting there forever", () => {
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1)], NOW);
    const later = new Date(
      NOW.getTime() + COPILOT_DISMISSAL_MAX_AGE_MS + 1_000
    );
    expect(readDismissals(storage, PROPOSAL, later)).toEqual([]);
    expect(storage.map.has(dismissalKey(PROPOSAL))).toBe(false);
  });

  test("a record still inside its window is kept", () => {
    // Anti-vacuous: the expiry above has to be the age, not the read itself.
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1)], NOW);
    const later = new Date(
      NOW.getTime() + COPILOT_DISMISSAL_MAX_AGE_MS - 1_000
    );
    expect(readDismissals(storage, PROPOSAL, later)).toEqual([id(1)]);
  });

  test("only the most recent rejections are kept once the cap is hit", () => {
    // Content-addressed ids go dead the moment the anchored text changes, so
    // without a cap a long-lived bid accumulates one dead id per edit forever.
    // The oldest go first: those are the ones whose text has moved on.
    const storage = fakeStorage();
    const many = Array.from({ length: COPILOT_DISMISSAL_MAX_IDS + 5 }, (_, i) =>
      id(i + 1)
    );
    writeDismissals(storage, PROPOSAL, many, NOW);

    const kept = readDismissals(storage, PROPOSAL, NOW);
    expect(kept).toHaveLength(COPILOT_DISMISSAL_MAX_IDS);
    expect(kept.at(-1)).toBe(many.at(-1));
    expect(kept).not.toContain(many[0]);
    expect(kept[0]).toBe(many[5]);
  });

  test("a repeated rejection is stored once", () => {
    const storage = fakeStorage();
    writeDismissals(storage, PROPOSAL, [id(1), id(2), id(1)], NOW);
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([id(1), id(2)]);
  });
});

describe("storage that refuses to work is not an editor crash", () => {
  test("a write that throws is swallowed", () => {
    const storage = fakeStorage({ failOnSet: true });
    expect(() => writeDismissals(storage, PROPOSAL, [id(1)], NOW)).not.toThrow();
  });

  test("a read that throws yields no dismissals", () => {
    const storage = fakeStorage({ failOnGet: true });
    expect(readDismissals(storage, PROPOSAL, NOW)).toEqual([]);
  });

  test("a clear that throws is swallowed", () => {
    const storage: DismissalStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(() => clearDismissals(storage, PROPOSAL)).not.toThrow();
  });
});
