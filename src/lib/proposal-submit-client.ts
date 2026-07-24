export type ProposalSubmitFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface SubmitProposalWithStructuredSnapshotInput {
  readonly proposalId: string;
  readonly currentContentMd: string;
  readonly currentLocale: "ar" | "en";
  readonly persistedContentMd: string;
  readonly persistedLocale: "ar" | "en";
  readonly persistedVersion: number;
  readonly persistedUpdatedAt: string;
  readonly hasStructuredSnapshot: boolean;
  readonly counterpartContentMd?: string;
  readonly fetcher?: ProposalSubmitFetch;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response
    .json()
    .catch(() => ({})) as Promise<Record<string, unknown>>;
}

function responseError(
  body: Record<string, unknown>,
  fallback: string
): Error {
  return new Error(
    typeof body.error === "string" && body.error.trim()
      ? body.error
      : fallback
  );
}

/**
 * Production editor bridge: persist unsaved Markdown, hydrate it into an
 * explicitly user-entered structured snapshot when needed, then submit the
 * exact server state. An existing explicitly authored snapshot is preserved.
 */
export async function submitProposalWithStructuredSnapshot(
  input: SubmitProposalWithStructuredSnapshotInput
): Promise<Record<string, unknown>> {
  const fetcher = input.fetcher ?? fetch;
  const dirty =
    input.currentContentMd !== input.persistedContentMd ||
    input.currentLocale !== input.persistedLocale;
  if (dirty) {
    const save = await fetcher(`/api/proposals/${input.proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentMd: input.currentContentMd,
        locale: input.currentLocale,
        changeLog: "Editor save before structured review",
        expectedVersion: input.persistedVersion,
        expectedUpdatedAt: input.persistedUpdatedAt,
      }),
    });
    const saveBody = await responseJson(save);
    if (!save.ok) throw responseError(saveBody, "Save failed");
  }

  if (dirty || !input.hasStructuredSnapshot) {
    if (!input.counterpartContentMd?.trim()) {
      throw new Error(
        "Explicit counterpart-language content is required before structured review"
      );
    }
    const hydration = await fetcher(
      `/api/proposals/${input.proposalId}/snapshot`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartMd: input.counterpartContentMd,
        }),
      }
    );
    const hydrationBody = await responseJson(hydration);
    if (!hydration.ok) {
      throw responseError(
        hydrationBody,
        "Structured proposal preparation failed"
      );
    }
  }

  const submit = await fetcher(`/api/proposals/${input.proposalId}/submit`, {
    method: "POST",
  });
  const submitBody = await responseJson(submit);
  if (!submit.ok) throw responseError(submitBody, "Submit failed");
  return submitBody;
}
