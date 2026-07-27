/** API uplink to ArabClue backend — tender ingest + proposal pipeline */

import type { EtimadTender, TenderDocument, ProposalPrepResult } from "../types";
import { DEFAULT_SETTINGS } from "../constants";
import { normalizeApiBase, slug } from "../utils";
import { fetchDocumentAsBase64 } from "./downloader";

/** Get current settings */
async function getApiBase(): Promise<string> {
  const stored = await chrome.storage.sync.get({ apiBase: DEFAULT_SETTINGS.apiBase });
  return normalizeApiBase(stored.apiBase);
}

/** Ingest a complete tender into ArabClue platform */
export async function ingestTender(
  tender: EtimadTender,
  documents: TenderDocument[]
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
      documents: documents.map(d => ({ name: d.name, type: d.type, url: d.url })),
    },
    text: buildTenderSummary(tender),
    title: tender.titleAr || tender.title,
    url: tender.url,
    source: "chrome-extension",
    headings: [tender.entity, tender.category, tender.referenceNumber].filter(Boolean),
    metaDescription: `Etimad tender ${tender.referenceNumber} — ${tender.entity}`,
  };

  const res = await fetch(`${base}/api/platform-agent/extension/ingest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || `Ingest failed (${res.status})`,
      message: data.error || "Failed to ingest tender",
    };
  }

  return {
    ok: true,
    missionId: data.missionId,
    projectId: data.projectId,
    message: data.message || "Tender ingested into Mission Control",
  };
}

/** Trigger the full proposal preparation pipeline */
export async function startProposalPipeline(
  tender: EtimadTender,
  documents: TenderDocument[]
): Promise<ProposalPrepResult> {
  // Step 1: Ingest the tender
  const ingestResult = await ingestTender(tender, documents);
  if (!ingestResult.ok) return ingestResult;

  // Step 2: Upload downloaded documents
  for (const doc of documents) {
    if (!doc.url) continue;
    try {
      const { base64, mimeType } = await fetchDocumentAsBase64(doc.url);
      await uploadDocument(doc, base64, mimeType, ingestResult.missionId!);
    } catch {
      // Non-fatal — continue with other docs
    }
  }

  // Step 3: Trigger agent pipeline
  const base = await getApiBase();
  try {
    const pipelineRes = await fetch(`${base}/api/platform-agent/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Prepare a proposal for Etimad tender ${tender.referenceNumber}: "${tender.titleAr}". Entity: ${tender.entityAr}. Deadline: ${tender.closingDate}. Automatically analyze all uploaded documents and generate a technical proposal draft.`,
        missionId: ingestResult.missionId,
      }),
    });

    if (pipelineRes.ok) {
      const pipelineData = await pipelineRes.json().catch(() => ({}));
      return {
        ...ingestResult,
        agentRunId: pipelineData.agentRunId,
        message: "Proposal pipeline started",
      };
    }
  } catch {
    // Pipeline trigger is best-effort
  }

  return { ...ingestResult, message: "Tender ingested — start proposal manually" };
}

/** Upload a single document to the mission */
async function uploadDocument(
  doc: TenderDocument,
  base64: string,
  mimeType: string,
  missionId: string
): Promise<void> {
  const base = await getApiBase();
  await fetch(`${base}/api/platform-agent/extension/ingest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "page",
      title: doc.name,
      url: doc.url,
      text: `Tender document: ${doc.name}\nType: ${doc.type}\nSource: Etimad`,
      screenshotDataUrl: mimeType.startsWith("image/") ? base64 : undefined,
      source: "chrome-extension",
    }),
  });
}

/** Create project from tender metadata */
export async function createProjectFromTender(tender: EtimadTender): Promise<{ projectId: string } | null> {
  const base = await getApiBase();
  try {
    const res = await fetch(`${base}/api/platform-agent/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Create a new project for Etimad tender ${tender.referenceNumber}: "${tender.titleAr}" from ${tender.entityAr}. Set the deadline to ${tender.closingDate}.`,
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.projectId ? { projectId: data.projectId } : null;
    }
  } catch {
    // best-effort
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────

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
    tender.localContentRequired ? `**محتوى محلي / Local Content:** Required (${tender.localContentMinimum || "?"}%)` : "",
    "",
    tender.qualifications.length ? "## المتطلبات / Requirements" : "",
    ...tender.qualifications.map(q => `- ${q}`),
    "",
    tender.documents.length ? "## المستندات / Documents" : "",
    ...tender.documents.map(d => `- [${d.type}] ${d.name}`),
    "",
    `Source: ${tender.url}`,
    `Extracted: ${tender.extractedAt}`,
  ];

  return lines.filter(Boolean).join("\n");
}
