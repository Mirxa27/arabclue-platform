export interface ProposalEditVersionState {
  readonly version: number;
  readonly updatedAt: Date;
}

/** Exact optimistic-concurrency guard shared by proposal editor writes. */
export function matchesProposalEditPrecondition(
  state: ProposalEditVersionState,
  expected: {
    readonly version: number;
    readonly updatedAt: string;
  }
): boolean {
  const expectedTime = Date.parse(expected.updatedAt);
  return (
    Number.isFinite(expectedTime) &&
    state.version === expected.version &&
    state.updatedAt.getTime() === expectedTime
  );
}
