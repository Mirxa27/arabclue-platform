/**
 * Persist / hydrate Mission Control chat transcripts (CopilotMessage).
 */

import { db } from "@/lib/db";
import { touchMission } from "./mission";

export type StoredUiMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: unknown[];
};

function normalizeRole(role: string): "user" | "assistant" | "system" | null {
  if (role === "user" || role === "assistant" || role === "system") return role;
  return null;
}

/** Convert DB rows into AI SDK UI messages. */
export function hydrateUiMessages(
  rows: Array<{ id: string; role: string; partsJson: string }>
): StoredUiMessage[] {
  const out: StoredUiMessage[] = [];
  for (const row of rows) {
    const role = normalizeRole(row.role);
    if (!role) continue;
    try {
      const parsed = JSON.parse(row.partsJson) as {
        id?: string;
        parts?: unknown[];
        text?: string;
      };
      const parts =
        Array.isArray(parsed.parts) && parsed.parts.length > 0
          ? parsed.parts
          : typeof parsed.text === "string"
            ? [{ type: "text", text: parsed.text }]
            : typeof row.partsJson === "string" && !row.partsJson.startsWith("{")
              ? [{ type: "text", text: row.partsJson }]
              : [{ type: "text", text: "" }];
      out.push({
        id: typeof parsed.id === "string" && parsed.id ? parsed.id : row.id,
        role,
        parts,
      });
    } catch {
      out.push({
        id: row.id,
        role,
        parts: [{ type: "text", text: row.partsJson.slice(0, 8000) }],
      });
    }
  }
  return out;
}

/**
 * Replace mission transcript with the latest UI message list (capped).
 * Called after each agent turn so reloads restore the full conversation.
 */
export async function syncMissionTranscript(opts: {
  missionId: string;
  userId: string;
  messages: Array<{ id?: string; role?: string; parts?: unknown }>;
  maxMessages?: number;
}): Promise<number> {
  const max = opts.maxMessages ?? 200;
  const normalized: StoredUiMessage[] = [];
  for (const m of opts.messages) {
    const role = normalizeRole(String(m.role ?? ""));
    if (!role) continue;
    const parts = Array.isArray(m.parts) ? m.parts : [];
    normalized.push({
      id:
        typeof m.id === "string" && m.id
          ? m.id
          : `msg_${normalized.length}_${Date.now()}`,
      role,
      parts,
    });
  }
  const slice = normalized.slice(-max);

  await db.$transaction(async (tx) => {
    await tx.copilotMessage.deleteMany({ where: { missionId: opts.missionId } });
    for (const m of slice) {
      await tx.copilotMessage.create({
        data: {
          missionId: opts.missionId,
          userId: m.role === "user" ? opts.userId : null,
          role: m.role,
          partsJson: JSON.stringify({ id: m.id, parts: m.parts }),
        },
      });
    }
  });
  await touchMission(opts.missionId);
  return slice.length;
}
