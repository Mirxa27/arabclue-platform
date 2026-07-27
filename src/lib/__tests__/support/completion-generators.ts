import * as fc from "fast-check";

export const COMPLETION_PROPERTY_MIN_RUNS = 100;
export const COMPLETION_PROPERTY_SEED = 0x4152434c;

/**
 * Baseline options for every randomized platform-completion property.
 * Use completionPropertyOptions when adding per-property overrides so the
 * minimum run count cannot accidentally be reduced.
 */
export const COMPLETION_PROPERTY_PARAMETERS = Object.freeze({
  numRuns: COMPLETION_PROPERTY_MIN_RUNS,
  seed: COMPLETION_PROPERTY_SEED,
  endOnFailure: true,
});

export function completionPropertyOptions<
  T extends Readonly<{ numRuns?: number }> & Record<string, unknown>,
>(overrides?: T) {
  const requestedRuns = overrides?.numRuns;
  const safeRuns =
    typeof requestedRuns === "number" && Number.isFinite(requestedRuns)
      ? Math.max(COMPLETION_PROPERTY_MIN_RUNS, Math.floor(requestedRuns))
      : COMPLETION_PROPERTY_MIN_RUNS;

  return Object.freeze({
    ...COMPLETION_PROPERTY_PARAMETERS,
    ...overrides,
    numRuns: safeRuns,
  });
}

const boundedNonBlankText = fc
  .string({ minLength: 1, maxLength: 200 })
  .map((value) => value.replace(/\s+/gu, " ").trim())
  .filter((value) => value.length > 0);

const workspaceId = fc.uuid().map((id) => `workspace-${id}`);

/** Shared, bounded generators for completion properties. */
export const completionArbitraries = Object.freeze({
  locale: fc.constantFrom<"ar" | "en">("ar", "en"),
  identifier: fc.uuid(),
  workspaceId,
  userId: fc.uuid().map((id) => `user-${id}`),
  nonBlankText: boundedNonBlankText,
  utcInstant: fc
    .integer({
      min: Date.UTC(2020, 0, 1),
      max: Date.UTC(2035, 11, 31, 23, 59, 59, 999),
    })
    .map((milliseconds) => new Date(milliseconds)),
  positiveRepeatCount: fc.integer({ min: 1, max: 20 }),
  distinctWorkspacePair: fc
    .tuple(workspaceId, workspaceId)
    .filter(([callerWorkspaceId, targetWorkspaceId]) =>
      callerWorkspaceId !== targetWorkspaceId
    )
    .map(([callerWorkspaceId, targetWorkspaceId]) => ({
      callerWorkspaceId,
      targetWorkspaceId,
    })),
});
