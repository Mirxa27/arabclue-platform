/**
 * Which platform-agent tool calls need a human's approval, and how document
 * text is fenced before it re-enters the agent loop. Pure — no database, no
 * SDK — so the gate can be unit-tested and reused by the voice path.
 */

/**
 * Tools whose execution mutates state on the user's behalf: approving a review,
 * changing a project's status, cancelling a run, and the one-shot package
 * orchestration that creates a project and queues the whole pipeline. The
 * agent loop asks the person for approval before running any of them
 * (`toolApproval` in main-agent.ts); the live voice path, which dispatches
 * tools directly, refuses them and points at the typed console.
 */
export const PRIVILEGED_TOOL_NAMES = [
  "decideReview",
  "orchestrateTenderPackage",
  "cancelAgentRun",
  "updateProject",
] as const;
export type PrivilegedToolName = (typeof PRIVILEGED_TOOL_NAMES)[number];

/**
 * Whether this call needs a human's approval. `updateProject` is privileged
 * only when it changes the workflow status — renaming a project is not.
 */
export function toolCallNeedsApproval(toolName: string, input: unknown): boolean {
  if (!(PRIVILEGED_TOOL_NAMES as readonly string[]).includes(toolName)) return false;
  if (toolName !== "updateProject") return true;
  const status = (input as { status?: unknown } | null)?.status;
  return status != null && status !== "";
}

/** What a tool returns for a privileged action the voice path cannot confirm. */
export function requiresConfirmationResult(toolName: string, locale: "ar" | "en") {
  return {
    ok: false as const,
    requiresConfirmation: true as const,
    toolName,
    error:
      locale === "ar"
        ? "هذا الإجراء يحتاج تأكيداً صريحاً منك. أعد طلبه من وحدة التحكم النصية لتوافق عليه."
        : "This action needs your explicit approval. Ask for it again in the typed console to approve it.",
  };
}

/**
 * Document text is data the agent reads, never instructions it follows. Every
 * document-derived string a tool returns is wrapped so the model can tell the
 * two apart; the system prompt states the rule once.
 */
export function wrapUntrustedDocument(text: string): string {
  return `<untrusted_document>\n${text}\n</untrusted_document>`;
}
