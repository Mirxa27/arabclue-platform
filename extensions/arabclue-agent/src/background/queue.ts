/** Offline queue for failed tender ingestions */

import type { EtimadTender } from "../types";
import { STORAGE, LIMITS, ALARMS } from "../constants";
import { uuid } from "../utils";
import { ingestTender } from "./ingest";

interface QueueEntry {
  id: string;
  tender: EtimadTender;
  reason: string;
  queuedAt: string;
  attempts: number;
}

/** Get queue entries from storage */
export async function getQueue(): Promise<QueueEntry[]> {
  const stored = await chrome.storage.local.get({ [STORAGE.QUEUE]: [] });
  return Array.isArray(stored[STORAGE.QUEUE]) ? stored[STORAGE.QUEUE] : [];
}

/** Save queue to storage + update badge */
async function setQueue(queue: QueueEntry[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE.QUEUE]: queue });
  await refreshQueueBadge(queue.length);
}

/** Update badge text */
export async function refreshQueueBadge(count?: number): Promise<void> {
  const n = typeof count === "number" ? count : (await getQueue()).length;
  try {
    await chrome.action.setBadgeText({ text: n > 0 ? String(n) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#0e7490" });
  } catch {
    /* badge best-effort */
  }
}

/** Enqueue a failed tender ingestion */
export async function enqueueTender(tender: EtimadTender, reason: string): Promise<number> {
  const queue = await getQueue();
  
  // Deduplicate by reference number
  const existing = queue.findIndex(e => e.tender.referenceNumber === tender.referenceNumber);
  if (existing >= 0) {
    queue[existing].attempts = 0;
    queue[existing].reason = reason;
    queue[existing].queuedAt = new Date().toISOString();
  } else {
    queue.push({
      id: uuid(),
      tender,
      reason,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
  }

  // Trim to limit
  while (queue.length > LIMITS.MAX_QUEUE_SIZE) queue.shift();
  
  await setQueue(queue);
  chrome.alarms.create(ALARMS.RETRY_QUEUE, { periodInMinutes: 1 });
  return queue.length;
}

/** Flush the queue — retry all entries */
export async function flushQueue(): Promise<{ flushed: number; remaining: number; lastError?: string }> {
  const queue = await getQueue();
  if (!queue.length) {
    await chrome.alarms.clear(ALARMS.RETRY_QUEUE);
    return { flushed: 0, remaining: 0 };
  }

  const remaining: QueueEntry[] = [];
  let flushed = 0;
  let lastError: string | undefined;

  for (const entry of queue) {
    try {
      const result = await ingestTender(entry.tender, entry.tender.documents);
      if (result.ok) {
        flushed++;
      } else {
        throw new Error(result.error || "Ingest failed");
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      entry.attempts++;
      if (entry.attempts < LIMITS.MAX_QUEUE_ATTEMPTS) {
        remaining.push(entry);
      }
    }
  }

  await setQueue(remaining);
  if (!remaining.length) await chrome.alarms.clear(ALARMS.RETRY_QUEUE);

  return { flushed, remaining: remaining.length, lastError };
}
