/** ArabClue Etimad Agent — Side Panel Controller */

import { MSG, STORAGE } from "../constants";
import { t, type LocaleKey } from "../i18n";
import type { EtimadTender, ScanState, ExtensionSettings, UserMatchCriteria, DownloadTask } from "../types";
import { formatDate, formatSAR, daysUntil } from "../utils";

// ─── State ───────────────────────────────────────────────────────────

let locale: "ar" | "en" = "ar";
let currentView: "dashboard" | "detail" | "criteria" | "downloads" | "settings" = "dashboard";
let scanState: ScanState = { lastScanAt: null, tendersFound: 0, tendersMatched: 0, isScanning: false, currentPage: 0, totalPages: 0 };
let matchedTenders: EtimadTender[] = [];
let selectedTender: EtimadTender | null = null;
let criteria: UserMatchCriteria = { categories: [], keywords: [], keywordsAr: [], autoDownloadDocuments: false, autoStartProposal: false };

const $ = (id: string) => document.getElementById(id);

// ─── Messaging ───────────────────────────────────────────────────────

async function send(type: string, payload: Record<string, unknown> = {}): Promise<any> {
  return chrome.runtime.sendMessage({ type, ...payload });
}

// ─── Init ────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  // Load settings
  const settingsRes = await send(MSG.GET_SETTINGS);
  if (settingsRes?.ok) {
    locale = settingsRes.settings.locale || "ar";
  }
  
  // Load criteria
  const criteriaRes = await send(MSG.GET_MATCH_CRITERIA);
  if (criteriaRes?.ok && criteriaRes.criteria) {
    criteria = criteriaRes.criteria;
  }

  // Apply locale
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;

  // Version
  const ping = await send(MSG.PING);
  const versionEl = $("version");
  if (versionEl && ping?.version) versionEl.textContent = `v${ping.version}`;

  // Setup event listeners
  setupEventListeners();
  
  // Load initial data
  await refreshDashboard();
  
  // Auto-refresh every 15s
  setInterval(refreshDashboard, 15000);
}

// ─── Event Listeners ─────────────────────────────────────────────────

function setupEventListeners(): void {
  $("btnScan")?.addEventListener("click", handleScan);
  $("btnStop")?.addEventListener("click", () => void send(MSG.STOP_SCAN));
  $("btnCriteria")?.addEventListener("click", () => showView("criteria"));
  $("btnDownloads")?.addEventListener("click", () => showView("downloads"));
  $("btnSettings")?.addEventListener("click", () => showView("settings"));
  $("btnMissionControl")?.addEventListener("click", () => void send(MSG.OPEN_MISSION_CONTROL));
  $("btnBack")?.addEventListener("click", () => showView("dashboard"));
  $("btnSaveCriteria")?.addEventListener("click", handleSaveCriteria);
  $("btnSaveSettings")?.addEventListener("click", handleSaveSettings);
  $("btnFlush")?.addEventListener("click", handleFlush);
}

// ─── Views ───────────────────────────────────────────────────────────

function showView(view: typeof currentView): void {
  currentView = view;
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  $(`view-${view}`)?.classList.remove("hidden");
  
  if (view === "dashboard") void refreshDashboard();
  if (view === "criteria") renderCriteriaForm();
  if (view === "downloads") void refreshDownloads();
  if (view === "settings") void renderSettings();
}

// ─── Dashboard ───────────────────────────────────────────────────────

async function refreshDashboard(): Promise<void> {
  // Scan state
  const stateRes = await send(MSG.GET_SCAN_STATE);
  if (stateRes?.ok) scanState = stateRes.state;
  
  // Matched tenders
  const tendersRes = await send(MSG.GET_MATCHED_TENDERS);
  if (tendersRes?.ok) matchedTenders = tendersRes.tenders || [];
  
  renderDashboard();
}

function renderDashboard(): void {
  // Status
  const statusTitle = $("statusTitle");
  const statusText = $("statusText");
  if (statusTitle && statusText) {
    if (scanState.isScanning) {
      statusTitle.textContent = t("statusScanning", locale);
      statusText.textContent = t("scanProgress", locale, { current: scanState.currentPage, total: scanState.totalPages || "?" });
    } else if (scanState.error) {
      statusTitle.textContent = t("statusError", locale);
      statusText.textContent = scanState.error;
    } else {
      statusTitle.textContent = t("statusReady", locale);
      statusText.textContent = scanState.lastScanAt
        ? t("scanLast", locale, { time: formatDate(scanState.lastScanAt, locale) })
        : t("scanNever", locale);
    }
  }

  // Stats
  const statsEl = $("stats");
  if (statsEl) {
    statsEl.innerHTML = `
      <span class="stat">${t("scanFound", locale, { count: scanState.tendersFound })}</span>
      <span class="stat">${t("scanMatched", locale, { count: scanState.tendersMatched })}</span>
    `;
  }

  // Scan button
  const btnScan = $("btnScan") as HTMLButtonElement | null;
  const btnStop = $("btnStop") as HTMLButtonElement | null;
  if (btnScan && btnStop) {
    btnScan.classList.toggle("hidden", scanState.isScanning);
    btnStop.classList.toggle("hidden", !scanState.isScanning);
    btnScan.textContent = t("scanStart", locale);
    btnStop.textContent = t("scanStop", locale);
  }

  // Tender list
  const listEl = $("tenderList");
  if (!listEl) return;

  if (!matchedTenders.length) {
    listEl.innerHTML = `<p class="empty">${t("tenderNoMatches", locale)}</p>`;
    return;
  }

  listEl.innerHTML = matchedTenders.map(tender => `
    <div class="tender-card" data-ref="${tender.referenceNumber}">
      <div class="tender-header">
        <span class="tender-score">${tender.matchScore || 0}%</span>
        <span class="tender-status status-${tender.status}">${t(`tender${capitalize(tender.status)}` as LocaleKey, locale)}</span>
      </div>
      <h3 class="tender-title">${tender.titleAr || tender.title}</h3>
      <p class="tender-entity">${tender.entityAr || tender.entity}</p>
      <div class="tender-meta">
        ${tender.value ? `<span>${formatSAR(tender.value, locale)}</span>` : ""}
        ${tender.closingDate ? `<span>${daysUntil(tender.closingDate)} ${locale === "ar" ? "يوم" : "days"}</span>` : ""}
        <span>${tender.documents.length} ${locale === "ar" ? "مستند" : "docs"}</span>
      </div>
      <div class="tender-actions">
        <button class="btn-action btn-prepare" data-ref="${tender.referenceNumber}">${t("actionPrepareProposal", locale)}</button>
        <button class="btn-action btn-download" data-ref="${tender.referenceNumber}">${t("actionDownloadDocs", locale)}</button>
      </div>
    </div>
  `).join("");

  // Attach tender card click handlers
  listEl.querySelectorAll(".tender-card").forEach(card => {
    card.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const ref = card.getAttribute("data-ref");
      const tender = matchedTenders.find(t => t.referenceNumber === ref);
      if (!tender) return;

      if (target.classList.contains("btn-prepare")) {
        void handlePrepareProposal(tender);
      } else if (target.classList.contains("btn-download")) {
        void handleDownloadDocs(tender);
      } else {
        selectedTender = tender;
        showView("detail");
        renderTenderDetail();
      }
    });
  });
}

// ─── Tender Detail ───────────────────────────────────────────────────

function renderTenderDetail(): void {
  if (!selectedTender) return;
  const el = $("detailContent");
  if (!el) return;

  const t_ = selectedTender;
  el.innerHTML = `
    <h2>${t_.titleAr || t_.title}</h2>
    <div class="detail-field"><strong>${t("tenderEntity", locale)}:</strong> ${t_.entityAr || t_.entity}</div>
    <div class="detail-field"><strong>Ref:</strong> ${t_.referenceNumber}</div>
    ${t_.value ? `<div class="detail-field"><strong>Value:</strong> ${formatSAR(t_.value, locale)}</div>` : ""}
    <div class="detail-field"><strong>Deadline:</strong> ${t_.closingDate ? formatDate(t_.closingDate, locale) : "—"}</div>
    <div class="detail-field"><strong>Category:</strong> ${t_.category}</div>
    ${t_.location ? `<div class="detail-field"><strong>Location:</strong> ${t_.location}</div>` : ""}
    ${t_.localContentRequired ? `<div class="detail-field"><strong>Local Content:</strong> ${t_.localContentMinimum || "?"}%</div>` : ""}
    ${t_.qualifications.length ? `<div class="detail-field"><strong>Requirements:</strong><ul>${t_.qualifications.map(q => `<li>${q}</li>`).join("")}</ul></div>` : ""}
    ${t_.documents.length ? `<div class="detail-field"><strong>Documents (${t_.documents.length}):</strong><ul>${t_.documents.map(d => `<li>[${d.type}] ${d.name}</li>`).join("")}</ul></div>` : ""}
    <div class="detail-actions">
      <button class="btn primary" id="btnDetailPrepare">${t("actionPrepareProposal", locale)}</button>
      <button class="btn" id="btnDetailDownload">${t("actionDownloadDocs", locale)}</button>
      <a href="${t_.url}" target="_blank" class="btn ghost">${t("actionOpenEtimad", locale)}</a>
    </div>
  `;

  $("btnDetailPrepare")?.addEventListener("click", () => void handlePrepareProposal(selectedTender!));
  $("btnDetailDownload")?.addEventListener("click", () => void handleDownloadDocs(selectedTender!));
}

// ─── Criteria Editor ─────────────────────────────────────────────────

function renderCriteriaForm(): void {
  const el = $("criteriaForm");
  if (!el) return;
  
  (el.querySelector("#critKeywords") as HTMLInputElement).value = criteria.keywords.join(", ");
  (el.querySelector("#critKeywordsAr") as HTMLInputElement).value = criteria.keywordsAr.join(", ");
  (el.querySelector("#critMinValue") as HTMLInputElement).value = criteria.minValue?.toString() || "";
  (el.querySelector("#critMaxValue") as HTMLInputElement).value = criteria.maxValue?.toString() || "";
  (el.querySelector("#critMaxDays") as HTMLInputElement).value = criteria.maxDaysUntilClose?.toString() || "";
  (el.querySelector("#critAutoDownload") as HTMLInputElement).checked = criteria.autoDownloadDocuments;
  (el.querySelector("#critAutoProposal") as HTMLInputElement).checked = criteria.autoStartProposal;
}

async function handleSaveCriteria(): Promise<void> {
  const form = $("criteriaForm");
  if (!form) return;

  criteria = {
    categories: criteria.categories, // Keep existing
    keywords: (form.querySelector("#critKeywords") as HTMLInputElement).value.split(",").map(s => s.trim()).filter(Boolean),
    keywordsAr: (form.querySelector("#critKeywordsAr") as HTMLInputElement).value.split(",").map(s => s.trim()).filter(Boolean),
    minValue: parseFloat((form.querySelector("#critMinValue") as HTMLInputElement).value) || undefined,
    maxValue: parseFloat((form.querySelector("#critMaxValue") as HTMLInputElement).value) || undefined,
    maxDaysUntilClose: parseInt((form.querySelector("#critMaxDays") as HTMLInputElement).value) || undefined,
    autoDownloadDocuments: (form.querySelector("#critAutoDownload") as HTMLInputElement).checked,
    autoStartProposal: (form.querySelector("#critAutoProposal") as HTMLInputElement).checked,
  };

  await send(MSG.SET_MATCH_CRITERIA, { criteria });
  showView("dashboard");
}

// ─── Downloads ───────────────────────────────────────────────────────

async function refreshDownloads(): Promise<void> {
  const res = await send(MSG.GET_DOWNLOAD_STATUS);
  const tasks: DownloadTask[] = res?.tasks || [];
  const el = $("downloadsList");
  if (!el) return;

  if (!tasks.length) {
    el.innerHTML = `<p class="empty">${t("downloadsEmpty", locale)}</p>`;
    return;
  }

  el.innerHTML = tasks.map(task => `
    <div class="download-item status-${task.status}">
      <span class="download-name">${task.document.name}</span>
      <span class="download-status">${task.status}</span>
    </div>
  `).join("");
}

// ─── Settings ────────────────────────────────────────────────────────

async function renderSettings(): Promise<void> {
  const res = await send(MSG.GET_SETTINGS);
  if (!res?.ok) return;
  const settings: ExtensionSettings = res.settings;

  (($("settApiBase") as HTMLInputElement)).value = settings.apiBase;
  (($("settAutoScan") as HTMLInputElement)).value = String(settings.autoScanInterval);
  (($("settNotify") as HTMLInputElement)).checked = settings.notifyOnMatch;
  (($("settLocale") as HTMLSelectElement)).value = settings.locale;
}

async function handleSaveSettings(): Promise<void> {
  const settings: Partial<ExtensionSettings> = {
    apiBase: ($("settApiBase") as HTMLInputElement).value,
    autoScanInterval: parseInt(($("settAutoScan") as HTMLInputElement).value) || 0,
    notifyOnMatch: ($("settNotify") as HTMLInputElement).checked,
    locale: ($("settLocale") as HTMLSelectElement).value as "ar" | "en",
  };

  await send(MSG.SET_SETTINGS, { settings });
  locale = settings.locale || locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  showView("dashboard");
}

// ─── Actions ─────────────────────────────────────────────────────────

async function handleScan(): Promise<void> {
  await send(MSG.SCAN_ETIMAD);
  await refreshDashboard();
}

async function handlePrepareProposal(tender: EtimadTender): Promise<void> {
  const statusTitle = $("statusTitle");
  const statusText = $("statusText");
  if (statusTitle) statusTitle.textContent = t("statusPreparing", locale);
  if (statusText) statusText.textContent = tender.titleAr || tender.title;
  
  const res = await send(MSG.PREPARE_PROPOSAL, { tender });
  if (res?.ok) {
    if (statusTitle) statusTitle.textContent = t("statusComplete", locale);
    if (statusText) statusText.textContent = res.result?.message || "Done";
  } else {
    if (statusTitle) statusTitle.textContent = t("statusError", locale);
    if (statusText) statusText.textContent = res?.error || "Failed";
  }
}

async function handleDownloadDocs(tender: EtimadTender): Promise<void> {
  await send(MSG.DOWNLOAD_DOCUMENTS, { tender });
  showView("downloads");
  await refreshDownloads();
}

async function handleFlush(): Promise<void> {
  await send(MSG.FLUSH_QUEUE);
  await refreshDashboard();
}

// ─── Utilities ───────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, "");
}

// ─── Boot ────────────────────────────────────────────────────────────

void init();
