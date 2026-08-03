/** API uplink to ArabClue backend — tender ingest + proposal pipeline + capture */

import type {
  EtimadTender,
  TenderDocument,
  ProposalPrepResult,
  PageCapturePayload,
  CopilotChatResult,
} from "../types";
import { DEFAULT_SETTINGS, MSG, STORAGE } from "../constants";
import { normalizeApiBase, dataUrlToBlob } from "../utils";
import { fetchDocumentAsBase64 } from "./downloader";

async function queueFailedTender(tender: EtimadTender, reason: string): Promise<void> {
  const { enqueueTender } = await import("./queue");
  await enqueueTender(tender, reason);
}

async function getApiBase(): Promise<string> {
  const stored = await chrome.storage.sync.get({ apiBase: DEFAULT_SETTINGS.apiBase });
  return normalizeApiBase(stored.apiBase as string);
}

/** Emit AGENT_EVENT to arabclue tabs so bridge fires extension-ingest */
export async function emitIngestEvent(data: Record<string, unknown>): Promise<void> {
  const patterns = [
    "https://arabclue.com/*",
    "https://*.arabclue.com/*",
    "https://*.vercel.app/*",
    "http://localhost:3000/*",
    "http://127.0.0.1:3000/*",
  ];
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({ url: patterns });
  } catch {
    tabs = [];
  }

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: MSG.AGENT_EVENT,
        event: "extension-ingest",
        data,
      });
    } catch {
      /* tab may not have bridge injected */
    }
  }
}

/** Ingest a complete tender into ArabClue platform */
export async function ingestTender(
  tender: EtimadTender,
  documents: TenderDocument[],
  options: { skipQueue?: boolean } = {}
): Promise<ProposalPrepResult> {
  const base = await getApiBase();

  const payload = {
    mode: "tender" as const,
    tender: {
      referenceNumber: tender.referenceNumber,
      title: tender.title,
      titleAr: tender.titleAr,
      entity: tender.entity,
      entityAr: tender.entityAr,
      category: tender.category,
      value: tender.value,
      currency: tender.currency,
      publishDate: tender.publishDate,
      closingDate: tender.closingDate,
      status: tender.status,
      location: tender.location,
      url: tender.url,
      qualifications: tender.qualifications,
      localContentRequired: tender.localContentRequired,
      localContentMinimum: tender.localContentMinimum,
      documents: documents.map((d) => ({ name: d.name, type: d.type, url: d.url })),
    },
    text: buildTenderSummary(tender),
    title: tender.titleAr || tender.title,
    url: tender.url,
    source: "chrome-extension",
    headings: [tender.entity, tender.category, tender.referenceNumber].filter(Boolean),
    metaDescription: `Etimad tender ${tender.referenceNumber} — ${tender.entity}`,
  };

  try {
    const res = await fetch(`${base}/api/platform-agent/extension/ingest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.status === 401 || (!res.ok && isNetworkish(res.status))) {
      if (!options.skipQueue) {
        await queueFailedTender(tender, (data.error as string) || `HTTP ${res.status}`);
      }
      return {
        ok: false,
        queued: true,
        status: res.status,
        error: (data.error as string) || `Ingest failed (${res.status})`,
        message: res.status === 401 ? "Unauthorized — sign in first" : "Queued for retry",
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data.error as string) || `Ingest failed (${res.status})`,
        message: (data.error as string) || "Failed to ingest tender",
      };
    }

    const missionId = data.missionId as string | undefined;
    if (missionId) {
      await chrome.storage.local.set({ [STORAGE.LAST_MISSION]: missionId });
    }

    await emitIngestEvent({
      mode: "tender",
      missionId,
      tenderRef: tender.referenceNumber,
      ok: true,
    });

    return {
      ok: true,
      missionId,
      projectId: data.projectId as string | undefined,
      message: (data.message as string) || "Tender ingested into Mission Control",
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Network error";
    if (!options.skipQueue) {
      await queueFailedTender(tender, reason);
    }
    return {
      ok: false,
      queued: true,
      error: reason,
      message: "Network error — saved offline",
    };
  }
}

/** Ingest universal page/selection/screenshot capture */
export async function ingestCapture(
  payload: PageCapturePayload,
  options: { skipQueue?: boolean } = {}
): Promise<ProposalPrepResult> {
  const base = await getApiBase();
  try {
    const res = await fetch(`${base}/api/platform-agent/extension/ingest`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (res.status === 401 || (!res.ok && isNetworkish(res.status))) {
      if (!options.skipQueue) {
        const { enqueueCapture } = await import("./queue");
        await enqueueCapture(payload, (data.error as string) || `HTTP ${res.status}`);
      }
      return {
        ok: false,
        queued: true,
        status: res.status,
        error: (data.error as string) || `Capture ingest failed (${res.status})`,
        message: res.status === 401 ? "Unauthorized — sign in first" : "Queued for retry",
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: (data.error as string) || `Capture ingest failed (${res.status})`,
        message: (data.error as string) || "Failed to ingest capture",
      };
    }
    const missionId = data.missionId as string | undefined;
    if (missionId) {
      await chrome.storage.local.set({ [STORAGE.LAST_MISSION]: missionId });
    }
    await emitIngestEvent({ mode: payload.mode, missionId, ok: true });
    return {
      ok: true,
      missionId,
      message: (data.message as string) || "Capture ingested",
    };
  } catch (err) {
    if (!options.skipQueue) {
      const { enqueueCapture } = await import("./queue");
      await enqueueCapture(payload, err instanceof Error ? err.message : "Network error");
    }
    return {
      ok: false,
      queued: true,
      error: err instanceof Error ? err.message : "Network error",
      message: "Network error — saved offline",
    };
  }
}

/** Trigger the full proposal preparation pipeline */
export async function startProposalPipeline(
  tender: EtimadTender,
  documents: TenderDocument[]
): Promise<ProposalPrepResult> {
  const ingestResult = await ingestTender(tender, documents);
  if (!ingestResult.ok || !ingestResult.missionId) return ingestResult;

  for (const doc of documents) {
    if (!doc.url) continue;
    try {
      const { base64, mimeType } = await fetchDocumentAsBase64(doc.url);
      await uploadDocumentMultipart(doc, base64, mimeType, ingestResult.missionId);
    } catch {
      /* non-fatal */
    }
  }

  const autopilot = await triggerAutopilot(ingestResult.missionId, tender);
  return {
    ...ingestResult,
    agentRunId: autopilot.agentRunId,
    message: autopilot.message || ingestResult.message,
  };
}

/** Upload a document via multipart to mission attachments */
async function uploadDocumentMultipart(
  doc: TenderDocument,
  base64: string,
  mimeType: string,
  missionId: string
): Promise<void> {
  const base = await getApiBase();
  const blob = await dataUrlToBlob(
    base64.startsWith("data:") ? base64 : `data:${mimeType};base64,${base64}`
  );
  const form = new FormData();
  const filename = sanitizeUploadName(doc.name || "document");
  form.append("file", blob, filename);
  form.append("source", "browser");

  const res = await fetch(`${base}/api/platform-agent/missions/${missionId}/attachments`, {
    method: "POST",
    credentials: "include",
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    throw new Error(`Attachment upload failed (${res.status})`);
  }
}

/** Prefer autopilot endpoint; fall back to extension copilot on 404 */
async function triggerAutopilot(
  missionId: string,
  tender: EtimadTender
): Promise<{ agentRunId?: string; message: string }> {
  const base = await getApiBase();
  const message = `Prepare a proposal for Etimad tender ${tender.referenceNumber}: "${tender.titleAr || tender.title}". Entity: ${tender.entityAr || tender.entity}. Deadline: ${tender.closingDate}. Automatically analyze all uploaded documents and generate a technical proposal draft.`;

  try {
    const autopilotRes = await fetch(
      `${base}/api/platform-agent/missions/${missionId}/autopilot`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          tenderRef: tender.referenceNumber,
          message,
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (autopilotRes.ok) {
      const data = await autopilotRes.json().catch(() => ({} as Record<string, unknown>));
      return {
        agentRunId: data.agentRunId as string | undefined,
        message: (data.message as string) || "Proposal pipeline started",
      };
    }

    if (autopilotRes.status !== 404) {
      return { message: "Tender ingested — start proposal manually" };
    }
  } catch {
    /* fall through to copilot */
  }

  const chat = await sendCopilotChat(message, missionId);
  if (chat.ok) {
    return { message: "Proposal pipeline started via copilot" };
  }

  return { message: "Tender ingested — start proposal manually" };
}

/** Copilot chat via dedicated non-streaming extension endpoint */
export async function sendCopilotChat(
  text: string,
  missionId?: string
): Promise<CopilotChatResult> {
  const base = await getApiBase();
  let resolvedMission = missionId;
  if (!resolvedMission) {
    const stored = await chrome.storage.local.get({ [STORAGE.LAST_MISSION]: null });
    resolvedMission = stored[STORAGE.LAST_MISSION] || undefined;
  }

  try {
    const res = await fetch(`${base}/api/platform-agent/extension/copilot`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        text,
        missionId: resolvedMission,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 401) {
      return { ok: false, error: "Unauthorized — sign in at arabclue.com" };
    }

    const data = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      // Fallback: AI SDK UI stream from main chat route
      if (res.status === 404) {
        return sendCopilotChatViaStream(text, resolvedMission, base);
      }
      return { ok: false, error: (data.error as string) || `Chat failed (${res.status})` };
    }

    if (data.missionId) resolvedMission = data.missionId as string;
    if (resolvedMission) {
      await chrome.storage.local.set({ [STORAGE.LAST_MISSION]: resolvedMission });
    }

    const reply = String(data.reply || data.message || data.text || "").trim();
    return {
      ok: true,
      reply: reply || "Done.",
      missionId: resolvedMission,
      missionUrl: resolvedMission
        ? `${base}/app?view=copilot&mission=${encodeURIComponent(resolvedMission)}`
        : `${base}/app?view=copilot`,
      streamed: false,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

async function sendCopilotChatViaStream(
  text: string,
  missionId: string | undefined,
  base: string
): Promise<CopilotChatResult> {
  try {
    const res = await fetch(`${base}/api/platform-agent/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json, */*" },
      body: JSON.stringify({
        messages: [
          {
            id: `ext-${Date.now()}`,
            role: "user",
            parts: [{ type: "text", text }],
          },
        ],
        missionId,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 401) {
      return { ok: false, error: "Unauthorized — sign in at arabclue.com" };
    }

    const contentType = res.headers.get("content-type") || "";
    let reply = "";
    let resolvedMission = missionId;

    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        return { ok: false, error: (data.error as string) || `Chat failed (${res.status})` };
      }
      reply = String(data.reply || data.message || data.text || "").trim();
      if (data.missionId) resolvedMission = data.missionId as string;
    } else {
      const raw = await res.text();
      if (!res.ok) {
        return { ok: false, error: raw.slice(0, 400) || `Chat failed (${res.status})` };
      }
      reply = extractStreamText(raw);
    }

    if (resolvedMission) {
      await chrome.storage.local.set({ [STORAGE.LAST_MISSION]: resolvedMission });
    }

    return {
      ok: true,
      reply: reply || "Done.",
      missionId: resolvedMission,
      missionUrl: resolvedMission
        ? `${base}/app?view=copilot&mission=${encodeURIComponent(resolvedMission)}`
        : `${base}/app?view=copilot`,
      streamed: true,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Parse AI SDK UI message SSE (`text-delta` / legacy shapes) */
function extractStreamText(raw: string): string {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const chunks: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/^data:\s*/, "").trim();
    if (!trimmed || trimmed === "[DONE]") continue;
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        delta?: string;
        text?: string;
        content?: string;
      };
      if (parsed.type === "text-delta" && typeof parsed.delta === "string") {
        chunks.push(parsed.delta);
      } else if (typeof parsed.delta === "string") {
        chunks.push(parsed.delta);
      } else if (typeof parsed.text === "string" && parsed.type !== "text-start") {
        chunks.push(parsed.text);
      } else if (typeof parsed.content === "string") {
        chunks.push(parsed.content);
      }
    } catch {
      if (!trimmed.startsWith("{")) chunks.push(trimmed);
    }
  }
  return chunks.join("").trim();
}

function isNetworkish(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function sanitizeUploadName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 120) || "document.bin";
}

function buildTenderSummary(tender: EtimadTender): string {
  const lines = [
    `# ${tender.titleAr || tender.title}`,
    "",
    `**رقم المنافسة / Reference:** ${tender.referenceNumber}`,
    `**الجهة / Entity:** ${tender.entityAr || tender.entity}`,
    `**التصنيف / Category:** ${tender.category}`,
    tender.value ? `**القيمة / Value:** SAR ${tender.value.toLocaleString()}` : "",
    `**تاريخ الطرح / Published:** ${tender.publishDate}`,
    `**آخر موعد / Deadline:** ${tender.closingDate}`,
    `**الحالة / Status:** ${tender.status}`,
    tender.location ? `**الموقع / Location:** ${tender.location}` : "",
    tender.localContentRequired
      ? `**محتوى محلي / Local Content:** Required (${tender.localContentMinimum || "?"}%)`
      : "",
    "",
    tender.qualifications.length ? "## المتطلبات / Requirements" : "",
    ...tender.qualifications.map((q) => `- ${q}`),
    "",
    tender.documents.length ? "## المستندات / Documents" : "",
    ...tender.documents.map((d) => `- [${d.type}] ${d.name}`),
    "",
    `Source: ${tender.url}`,
    `Extracted: ${tender.extractedAt}`,
  ];

  return lines.filter(Boolean).join("\n");
}
