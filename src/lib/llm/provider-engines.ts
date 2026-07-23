/**
 * Persist / activate helpers for multi-engine AI provider configs.
 */

import { db } from "../db";
import {
  normalizeEngines,
  parseProviderEngines,
  serializeEngines,
  type AgentEngine,
} from "./model-catalog";

/** Deactivate other active providers that serve any of the given engines. */
export async function deactivateConflictingProviders(
  engines: AgentEngine[],
  exceptId?: string
): Promise<void> {
  const targets = new Set(normalizeEngines(engines));
  const actives = await db.aIProviderConfig.findMany({
    where: {
      isActive: true,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });

  const conflicting = actives.filter((p) =>
    parseProviderEngines(p).some((e) => targets.has(e))
  );

  if (conflicting.length === 0) return;

  await db.aIProviderConfig.updateMany({
    where: { id: { in: conflicting.map((p) => p.id) } },
    data: { isActive: false },
  });
}

export function enginesPayloadFromBody(body: {
  engines?: unknown;
  engine?: unknown;
}): { engines: AgentEngine[]; primary: AgentEngine; enginesJson: string } {
  const engines = normalizeEngines(
    body.engines ?? body.engine,
    typeof body.engine === "string" ? body.engine : "DEFAULT"
  );
  return {
    engines,
    primary: engines[0] ?? "DEFAULT",
    enginesJson: serializeEngines(engines),
  };
}
