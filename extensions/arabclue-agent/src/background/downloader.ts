/** Document download manager for Etimad tender attachments */

import type { EtimadTender, TenderDocument, DownloadTask } from "../types";
import { STORAGE, LIMITS } from "../constants";
import { uuid } from "../utils";

/** Download all documents for a tender */
export async function downloadTenderDocuments(tender: EtimadTender): Promise<DownloadTask[]> {
  const tasks: DownloadTask[] = [];

  for (const doc of tender.documents) {
    const task = await downloadSingleDocument(doc, tender.referenceNumber);
    tasks.push(task);
  }

  await persistDownloadTasks(tasks);
  return tasks;
}

/** Download a single document */
export async function downloadSingleDocument(doc: TenderDocument, tenderId: string): Promise<DownloadTask> {
  const task: DownloadTask = {
    id: uuid(),
    tenderId,
    document: doc,
    status: "pending",
    startedAt: new Date().toISOString(),
  };

  try {
    task.status = "downloading";

    const response = await fetch(doc.url, {
      credentials: "include",
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Check file size
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > LIMITS.MAX_DOCUMENT_SIZE_MB * 1024 * 1024) {
      throw new Error("File too large");
    }

    const blob = await response.blob();
    
    // Use Chrome downloads API
    const dataUrl = await blobToDataUrl(blob);
    const filename = sanitizeFilename(`${tenderId}_${doc.name}`);
    
    await chrome.downloads.download({
      url: dataUrl,
      filename: `arabclue-tenders/${filename}`,
      saveAs: false,
    });

    task.status = "complete";
    task.completedAt = new Date().toISOString();
    task.document.downloadedAt = task.completedAt;
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Download failed";
  }

  return task;
}

/** Convert blob to base64 data URL for upload to ArabClue */
export async function convertToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

/** Fetch a document and return as base64 for API upload */
export async function fetchDocumentAsBase64(url: string): Promise<{ base64: string; mimeType: string; size: number }> {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const blob = await response.blob();
  if (blob.size > LIMITS.MAX_DOCUMENT_SIZE_MB * 1024 * 1024) {
    throw new Error(`File too large: ${Math.round(blob.size / 1024 / 1024)}MB`);
  }

  const base64 = await convertToBase64(blob);
  return {
    base64,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
  };
}

/** Get all download tasks */
export async function getDownloadStatus(): Promise<DownloadTask[]> {
  const stored = await chrome.storage.local.get({ [STORAGE.DOWNLOADS]: [] });
  return stored[STORAGE.DOWNLOADS] || [];
}

/** Cancel a pending/in-progress download */
export async function cancelDownload(taskId: string): Promise<void> {
  const tasks = await getDownloadStatus();
  const updated = tasks.map(t =>
    t.id === taskId && t.status !== "complete"
      ? { ...t, status: "failed" as const, error: "Cancelled" }
      : t
  );
  await persistDownloadTasks(updated);
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function persistDownloadTasks(tasks: DownloadTask[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE.DOWNLOADS]: tasks.slice(-50) });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Blob read failed"));
    reader.readAsDataURL(blob);
  });
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 100);
}
