/**
 * Pure helpers for the dashboard KPI route. The route counts compliance
 * checks and agent runs with Prisma `groupBy` (one aggregate row per status)
 * instead of loading every row and counting in JS; these helpers turn those
 * aggregate rows into the numbers the cards render.
 */

export type StatusCountGroup = Readonly<{
  status: string;
  _count: number | Readonly<{ _all?: number }>;
}>;

function groupCount(group: StatusCountGroup): number {
  return typeof group._count === "number"
    ? group._count
    : (group._count._all ?? 0);
}

/** Total rows across all status groups. */
export function totalCount(groups: readonly StatusCountGroup[]): number {
  return groups.reduce((sum, group) => sum + groupCount(group), 0);
}

/** Rows in one status; 0 when the status has no group. */
export function countForStatus(
  groups: readonly StatusCountGroup[],
  status: string,
): number {
  return groups
    .filter((group) => group.status === status)
    .reduce((sum, group) => sum + groupCount(group), 0);
}

/**
 * Share of COMPLIANT checks as a rounded percentage, or `null` when there are
 * no checks at all. A new workspace has nothing to be compliant with; the old
 * `100` default read as "100% compliance" on an empty dashboard.
 */
export function complianceScoreFromGroups(
  groups: readonly StatusCountGroup[],
): number | null {
  const total = totalCount(groups);
  if (total === 0) return null;
  return Math.round((countForStatus(groups, "COMPLIANT") / total) * 100);
}
