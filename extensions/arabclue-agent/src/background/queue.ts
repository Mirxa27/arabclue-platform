/** Offline queue for failed tender + capture ingestions */

import type { EtimadTender, PageCapturePayload } from "../types";
import { STORAGE, LIMITS, ALARMS } from "../constants";
import { uuid } from "../utils";
import { ingestTender, ingestCapture } from "./ingest";

export type QueueEntry =
  | {
      id: string;
      kind: "tender";
      tender: EtimadTender;
      reason: string;
      queuedAt: string;
      attempts: number;
    }
  | {
      id: string;
      kind: "capture";
      capture: PageCapturePayload;
      reason: string;
      queuedAt: string;
      attempts: number;
    };

function normalizeEntry(raw: unknown): QueueEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.kind === "capture" && e.capture && typeof e.capture === "object") {
    return {
      id: String(e.id || uuid()),
      kind: "capture",
      capture: e.capture as PageCapturePayload,
      reason: String(e.reason || ""),
      queuedAt: String(e.queuedAt || new Date().toISOString()),
      attempts: Number(e.attempts) || 0,
    };
  }
  if (e.tender && typeof e.tender === "object") {
    return {
      id: String(e.id || uuid()),
      kind: "tender",
      tender: e.tender as EtimadTender,
      reason: String(e.reason || ""),
      queuedAt: String(e.queuedAt || new Date().toISOString()),
      attempts: Number(e.attempts) || 0,
    };
  }
  return null;
}

/** Get queue entries from storage */
export async function getQueue(): Promise<QueueEntry[]> {
  const stored = await chrome.storage.local.get({ [STORAGE.QUEUE]: [] });
  const raw = Array.isArray(stored[STORAGE.QUEUE]) ? stored[STORAGE.QUEUE] : [];
  return (raw as unknown[])
    .map((entry) => normalizeEntry(entry))
    .filter((e): e is QueueEntry => Boolean(e));
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

  const existing = queue.findIndex(
    (e) => e.kind === "tender" && e.tender.referenceNumber === tender.referenceNumber
  );
  if (existing >= 0) {
    const entry = queue[existing];
    if (entry.kind === "tender") {
      entry.attempts = 0;
      entry.reason = reason;
      entry.queuedAt = new Date().toISOString();
      entry.tender = tender;
    }
  } else {
    queue.push({
      id: uuid(),
      kind: "tender",
      tender,
      reason,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
  }

  while (queue.length > LIMITS.MAX_QUEUE_SIZE) queue.shift();

  await setQueue(queue);
  chrome.alarms.create(ALARMS.RETRY_QUEUE, { periodInMinutes: 1 });
  return queue.length;
}

/** Enqueue a failed page/selection/screenshot capture */
export async function enqueueCapture(
  capture: PageCapturePayload,
  reason: string
): Promise<number> {
  const queue = await getQueue();
  const key = `${capture.mode}:${capture.url}:${(capture.text || "").slice(0, 80)}`;
  const existing = queue.findIndex(
    (e) =>
      e.kind === "capture" &&
      `${e.capture.mode}:${e.capture.url}:${(e.capture.text || "").slice(0, 80)}` === key
  );
  if (existing >= 0) {
    const entry = queue[existing];
    if (entry.kind === "capture") {
      entry.attempts = 0;
      entry.reason = reason;
      entry.queuedAt = new Date().toISOString();
      entry.capture = capture;
    }
  } else {
    queue.push({
      id: uuid(),
      kind: "capture",
      capture,
      reason,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    });
  }

  while (queue.length > LIMITS.MAX_QUEUE_SIZE) queue.shift();

  await setQueue(queue);
  chrome.alarms.create(ALARMS.RETRY_QUEUE, { periodInMinutes: 1 });
  return queue.length;
}

/** Flush the queue — retry all entries */
export async function flushQueue(): Promise<{
  flushed: number;
  remaining: number;
  lastError?: string;
}> {
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
      if (entry.kind === "capture") {
        const result = await ingestCapture(entry.capture, { skipQueue: true });
        if (!result.ok) throw new Error(result.error || "Capture ingest failed");
      } else {
        const result = await ingestTender(entry.tender, entry.tender.documents || [], {
          skipQueue: true,
        });
        if (!result.ok) throw new Error(result.error || "Ingest failed");
      }
      flushed++;
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
