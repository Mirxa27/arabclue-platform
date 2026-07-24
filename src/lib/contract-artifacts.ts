import type { ContractArticle } from "./contract-format";
import type { ObligationMilestone } from "./contract-obligations";
import type { SaudiLawResearchBrief } from "./saudi-law-research";

export type ParsedContractArtifacts = {
  research?: SaudiLawResearchBrief;
  articles?: ContractArticle[];
  milestones?: ObligationMilestone[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMilestones(obj: Record<string, unknown>): ObligationMilestone[] | undefined {
  const entities = isRecord(obj.entities) ? obj.entities : null;
  const raw = Array.isArray(obj.milestones)
    ? obj.milestones
    : Array.isArray(entities?.milestones)
      ? entities.milestones
      : null;
  if (!raw) return undefined;

  return raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const name = typeof item.name === "string" ? item.name : undefined;
    const title = typeof item.title === "string" ? item.title : undefined;
    const weeks = typeof item.weeks === "number" ? item.weeks : undefined;
    if (!name && !title) return [];
    return [{ name, title, weeks }];
  });
}

export function parseContractArtifacts(
  raw: string | null | undefined
): ParsedContractArtifacts {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!isRecord(first)) return {};
    return {
      research: first.research as SaudiLawResearchBrief | undefined,
      articles: first.articles as ContractArticle[] | undefined,
      milestones: parseMilestones(first),
    };
  } catch {
    return {};
  }
}
