import type { LocalizedString, ProposalSection } from "./proposal-builder-types";

/**
 * Ephemeral handoff when a marketplace template is applied into Proposal Builder
 * before (or instead of) a persisted GeneratedProposal row.
 */
export type PendingProposalBuilderDraft = {
  readonly source: "marketplace" | "blank";
  readonly templateId?: string;
  readonly templateKey?: string;
  readonly proposalId?: string;
  readonly title: LocalizedString;
  readonly sections: ProposalSection[];
  readonly projectId?: string | null;
};

const STORAGE_KEY = "arabclue-pending-proposal-builder-draft";

/** In-memory fallback for SSR / test runtimes without sessionStorage. */
let memoryDraft: PendingProposalBuilderDraft | null = null;

function storageAvailable(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writePendingProposalBuilderDraft(
  draft: PendingProposalBuilderDraft
): void {
  memoryDraft = draft;
  const storage = storageAvailable();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Quota / private mode — memory handoff still works in-process.
  }
}

export function consumePendingProposalBuilderDraft(): PendingProposalBuilderDraft | null {
  const storage = storageAvailable();
  if (storage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        storage.removeItem(STORAGE_KEY);
        memoryDraft = null;
        const parsed = JSON.parse(raw) as PendingProposalBuilderDraft;
        if (
          !parsed?.sections ||
          !Array.isArray(parsed.sections) ||
          !parsed.title
        ) {
          return null;
        }
        return parsed;
      }
    } catch {
      // fall through to memory
    }
  }

  const draft = memoryDraft;
  memoryDraft = null;
  if (!draft?.sections || !Array.isArray(draft.sections) || !draft.title) {
    return null;
  }
  return draft;
}

/** Test helper — clear both memory and sessionStorage handoff. */
export function clearPendingProposalBuilderDraftForTests(): void {
  memoryDraft = null;
  const storage = storageAvailable();
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
