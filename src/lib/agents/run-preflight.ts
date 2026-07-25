export const NO_DOCUMENTS_PREFLIGHT = {
  code: "NO_DOCUMENTS" as const,
  error: "No documents uploaded for this project",
};

export type AgentRunPreflightResult =
  | { ok: true }
  | { ok: false; code: typeof NO_DOCUMENTS_PREFLIGHT.code; error: string };

/**
 * Pure guard: agent runs require at least one uploaded document on the project.
 */
export function assertProjectHasDocuments(
  documentCount: number
): AgentRunPreflightResult {
  if (!Number.isFinite(documentCount) || documentCount <= 0) {
    return {
      ok: false,
      code: NO_DOCUMENTS_PREFLIGHT.code,
      error: NO_DOCUMENTS_PREFLIGHT.error,
    };
  }
  return { ok: true };
}
