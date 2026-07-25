import { SYSTEM_TEMPLATE_CATALOG } from "./template-marketplace-catalog";
import type {
  LocalizedString,
  SectionType,
  TemplateCategory,
  TemplateMarketplaceItem,
} from "./proposal-builder-types";

export type ResolvedMarketplaceTemplate = {
  readonly id: string;
  readonly templateKey: string;
  readonly name: LocalizedString;
  readonly category: TemplateCategory | string;
  readonly sectionTypes: readonly SectionType[];
  readonly source: "system-catalog" | "database";
};

export function findSystemMarketplaceTemplate(
  idOrKey: string
): TemplateMarketplaceItem | null {
  return (
    SYSTEM_TEMPLATE_CATALOG.find((item) => item.id === idOrKey) ??
    SYSTEM_TEMPLATE_CATALOG.find((item) => item.templateKey === idOrKey) ??
    null
  );
}

export function mapDbMarketplaceRow(row: {
  id: string;
  templateKey: string;
  nameJson: unknown;
  category: string;
  sectionTypes: unknown;
}): ResolvedMarketplaceTemplate | null {
  const name = row.nameJson as LocalizedString | null;
  const sectionTypes = row.sectionTypes as SectionType[] | null;
  if (!name?.ar || !name?.en || !Array.isArray(sectionTypes)) return null;
  return {
    id: row.id,
    templateKey: row.templateKey,
    name,
    category: row.category,
    sectionTypes,
    source: "database",
  };
}

export function resolveMarketplaceTemplateFromCatalog(
  idOrKey: string
): ResolvedMarketplaceTemplate | null {
  const system = findSystemMarketplaceTemplate(idOrKey);
  if (!system) return null;
  return {
    id: system.id,
    templateKey: system.templateKey,
    name: system.name,
    category: system.category,
    sectionTypes: system.sectionTypes,
    source: "system-catalog",
  };
}
