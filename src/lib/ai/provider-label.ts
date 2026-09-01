/**
 * Turn a stored provider id into something a user can read.
 *
 * The ids come from `LlmProvider.provider` (prisma/schema.prisma:613) and are
 * lowercase snake_case storage keys. Rows are added by operators without a code
 * change, so the fallback has to be shippable on its own rather than a TODO.
 */

const KNOWN: Record<string, string> = {
  openai: "OpenAI",
  openai_compatible: "OpenAI-compatible",
  azure_openai: "Azure OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  mistral: "Mistral",
  ollama: "Ollama",
  zai: "Z.ai",
};

export function providerDisplayName(provider: string): string {
  const id = provider.trim().toLowerCase();
  if (!id) return "";
  return (
    KNOWN[id] ??
    id
      .split(/[_\s-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
