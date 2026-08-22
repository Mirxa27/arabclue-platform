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

/**
 * Prisma `where` predicate for looking up a marketplace entry by id or key on
 * behalf of one workspace.
 *
 * A marketplace entry is visible to a workspace when the workspace published it,
 * when it is a system entry (`workspaceId: null` and public), or when another
 * workspace published it publicly. Nothing else is visible.
 *
 * This exists as one shared predicate because the three consuming routes
 * previously each carried their own copy, and every copy included a bare
 * `{ id }` branch with no ownership or visibility term — so any entry could be
 * read by primary key, and `/use` would copy another tenant's private template
 * into the caller's workspace.
 *
 * `idOrKey` is matched against both the primary key and the template key, which
 * is what the routes' public contract promises.
 */
export function marketplaceEntryVisibilityWhere(
  idOrKey: string,
  workspaceId: string
): {
  AND: [
    { OR: [{ id: string }, { templateKey: string }] },
    {
      OR: [
        { workspaceId: string },
        { workspaceId: null; isPublic: true },
        { isPublic: true },
      ];
    },
  ];
} {
  return {
    AND: [
      { OR: [{ id: idOrKey }, { templateKey: idOrKey }] },
      {
        OR: [
          // Published by the caller's workspace.
          { workspaceId },
          // System catalog entry.
          { workspaceId: null, isPublic: true },
          // Another workspace's entry, published publicly.
          { isPublic: true },
        ],
      },
    ],
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
