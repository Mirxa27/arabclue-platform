/** ArabClue Agent — Side Panel Controller (Mission Control UI) */

import { MSG } from "../constants";
import { t, type LocaleKey } from "../i18n";
import type {
  EtimadTender,
  ScanState,
  ExtensionSettings,
  UserMatchCriteria,
  DownloadTask,
  RemoteExtensionConfig,
  TenderCategory,
} from "../types";
import { formatDate, formatSAR, daysUntil } from "../utils";
import { initFx } from "./fx";

type ViewName = "dashboard" | "capture" | "copilot" | "detail" | "criteria" | "downloads" | "settings";

let locale: "ar" | "en" = "ar";
let theme: ExtensionSettings["theme"] = "dark";
let currentView: ViewName = "dashboard";
let scanState: ScanState = {
  lastScanAt: null,
  tendersFound: 0,
  tendersMatched: 0,
  isScanning: false,
  currentPage: 0,
  totalPages: 0,
};
let matchedTenders: EtimadTender[] = [];
let selectedTender: EtimadTender | null = null;
let criteria: UserMatchCriteria = {
  categories: [],
  keywords: [],
  keywordsAr: [],
  autoDownloadDocuments: false,
  autoStartProposal: false,
};
let remoteConfig: RemoteExtensionConfig | null = null;
let lastMissionUrl: string | null = null;
let queuePending = 0;

const $ = (id: string) => document.getElementById(id);

async function send(type: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function init(): Promise<void> {
  const settingsRes = await send(MSG.GET_SETTINGS);
  if (settingsRes?.ok && settingsRes.settings) {
    const settings = settingsRes.settings as ExtensionSettings;
    locale = settings.locale || "ar";
    theme = settings.theme || "dark";
  }

  const criteriaRes = await send(MSG.GET_MATCH_CRITERIA);
  if (criteriaRes?.ok && criteriaRes.criteria) {
    criteria = criteriaRes.criteria as UserMatchCriteria;
  }

  const configRes = await send(MSG.SYNC_REMOTE_CONFIG, { force: false });
  if (configRes?.ok && configRes.config) {
    remoteConfig = configRes.config as RemoteExtensionConfig;
  }

  applyTheme(theme);
  applyLocaleShell();
  applyFeatureFlags();
  initFx($("stage") as HTMLElement);
  setupEventListeners();
  await refreshAuthStrip();
  await refreshDashboard();
  setInterval(() => {
    void refreshDashboard();
    void refreshAuthStrip();
  }, 15_000);
}

function applyFeatureFlags(): void {
  const flags = remoteConfig?.featureFlags;
  const captureNav = document.querySelector('.nav-btn[data-view="capture"]') as HTMLElement | null;
  const copilotNav = document.querySelector('.nav-btn[data-view="copilot"]') as HTMLElement | null;
  if (captureNav) captureNav.classList.toggle("hidden", flags?.universalCapture === false);
  if (copilotNav) copilotNav.classList.toggle("hidden", flags?.copilot === false);
}

function setupEventListeners(): void {
  document.querySelectorAll(".top-nav .nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = (btn as HTMLElement).dataset.view as ViewName;
      if (view) showView(view);
    });
  });

  $("btnScan")?.addEventListener("click", handleScan);
  $("btnStop")?.addEventListener("click", () => void send(MSG.STOP_SCAN));
  $("btnExtract")?.addEventListener("click", handleExtract);
  $("btnMissionControl")?.addEventListener("click", () => void send(MSG.OPEN_MISSION_CONTROL));
  $("btnBack")?.addEventListener("click", () => showView("dashboard"));
  $("btnBackCriteria")?.addEventListener("click", () => showView("dashboard"));
  $("btnBackDownloads")?.addEventListener("click", () => showView("dashboard"));
  $("btnBackSettings")?.addEventListener("click", () => showView("dashboard"));
  $("btnSaveCriteria")?.addEventListener("click", handleSaveCriteria);
  $("btnSaveSettings")?.addEventListener("click", handleSaveSettings);
  $("btnFlush")?.addEventListener("click", handleFlush);
  $("btnConnect")?.addEventListener("click", handleConnect);
  $("btnCapturePage")?.addEventListener("click", () => void handleCapture(MSG.CAPTURE_PAGE));
  $("btnCaptureSelection")?.addEventListener("click", () => void handleCapture(MSG.CAPTURE_SELECTION));
  $("btnCaptureScreenshot")?.addEventListener("click", () => void handleCapture(MSG.CAPTURE_SCREENSHOT));
  $("btnGrantHost")?.addEventListener("click", () => void send(MSG.REQUEST_HOST_PERMISSION));
  $("btnSyncConfig")?.addEventListener("click", handleSyncConfig);
  $("chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void handleCopilotSend();
  });
}

function showView(view: ViewName): void {
  currentView = view;
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  $(`view-${view}`)?.classList.remove("hidden");

  document.querySelectorAll(".top-nav .nav-btn").forEach((btn) => {
    const active = (btn as HTMLElement).dataset.view === view;
    btn.classList.toggle("active", active);
  });

  if (view === "dashboard") void refreshDashboard();
  if (view === "criteria") renderCriteriaForm();
  if (view === "downloads") void refreshDownloads();
  if (view === "settings") void renderSettings();
  if (view === "copilot") renderCopilotShell();
  if (view === "capture") applyCaptureLabels();
}

function applyLocaleShell(): void {
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = locale;

  const branding = remoteConfig?.branding;
  setText("eyebrow", t("eyebrow", locale));
  setText("appTitle", branding?.name || t("appTitle", locale));
  setText(
    "appSubtitle",
    locale === "ar"
      ? branding?.taglineAr || t("appSubtitle", locale)
      : branding?.taglineEn || t("appSubtitle", locale)
  );

  setText("navDashboard", t("navDashboard", locale));
  setText("navCapture", t("navCapture", locale));
  setText("navCopilot", t("navCopilot", locale));
  setText("navCriteria", t("navCriteria", locale));
  setText("navDownloads", t("navDownloads", locale));
  setText("navSettings", t("navSettings", locale));

  setText("btnScan", t("scanStart", locale));
  setText("btnStop", t("scanStop", locale));
  setText("btnExtract", t("actionExtract", locale));
  setText("btnMissionControl", t("actionOpenMissionControl", locale));
  setText("btnFlush", t("actionRetryQueue", locale));
  setText("btnConnect", t("connConnect", locale));
  setText("btnBack", t("actionBack", locale));
  setText("btnBackCriteria", t("actionBack", locale));
  setText("btnBackDownloads", t("actionBack", locale));
  setText("btnBackSettings", t("actionBack", locale));
  setText("footerBrand", t("footerBrand", locale));

  applyCaptureLabels();
  applyCriteriaLabels();
  applySettingsLabels();
  renderCopilotShell();
}

function applyCaptureLabels(): void {
  setText("captureTitle", t("captureTitle", locale));
  setText("captureHint", t("captureHint", locale));
  setText("btnCapturePage", t("capturePage", locale));
  setText("btnCaptureSelection", t("captureSelection", locale));
  setText("btnCaptureScreenshot", t("captureScreenshot", locale));
  setText("btnGrantHost", t("captureGrantHost", locale));
}

function applyCriteriaLabels(): void {
  setText("criteriaHeading", t("criteriaTitle", locale));
  setText("labelCategories", t("criteriaCategories", locale));
  setLabelSpan("labelKeywords", t("criteriaKeywords", locale));
  setLabelSpan("labelKeywordsAr", t("criteriaKeywordsAr", locale));
  setLabelSpan("labelMinValue", t("criteriaMinValue", locale));
  setLabelSpan("labelMaxValue", t("criteriaMaxValue", locale));
  setLabelSpan("labelMaxDays", t("criteriaMaxDays", locale));
  setCheckboxLabel("labelAutoDownload", t("criteriaAutoDownload", locale));
  setCheckboxLabel("labelAutoProposal", t("criteriaAutoProposal", locale));
  setText("btnSaveCriteria", t("criteriaSave", locale));
}

function applySettingsLabels(): void {
  setText("settingsHeading", t("settingsTitle", locale));
  setText("downloadsHeading", t("downloadsTitle", locale));
  setLabelSpan("labelApiBase", t("settingsApiBase", locale));
  setLabelSpan("labelAutoScan", t("settingsAutoScan", locale));
  setCheckboxLabel("labelNotify", t("settingsNotify", locale));
  setLabelSpan("labelLocale", t("settingsLocale", locale));
  setLabelSpan("labelTheme", t("settingsTheme", locale));
  setText("optThemeDark", t("settingsThemeDark", locale));
  setText("optThemeLight", t("settingsThemeLight", locale));
  setText("optThemeSystem", t("settingsThemeSystem", locale));
  setText("btnSaveSettings", t("settingsSave", locale));
  setText("btnSyncConfig", t("settingsSyncConfig", locale));
}

function renderCopilotShell(): void {
  setText("copilotTitle", t("copilotTitle", locale));
  setText("btnChatSend", t("copilotSend", locale));
  const input = $("chatInput") as HTMLInputElement | null;
  if (input) input.placeholder = t("copilotPlaceholder", locale);
  const link = $("missionLink") as HTMLAnchorElement | null;
  if (link) {
    link.textContent = t("copilotMissionLink", locale);
    if (lastMissionUrl) {
      link.href = lastMissionUrl;
      link.classList.remove("hidden");
    } else {
      link.classList.add("hidden");
    }
  }
  const log = $("chatLog");
  if (log && !log.childElementCount) {
    log.textContent = t("copilotEmpty", locale);
  }
}

function applyTheme(mode: ExtensionSettings["theme"]): void {
  theme = mode;
  let resolved: "dark" | "light" = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : mode;
  document.documentElement.setAttribute("data-theme", resolved);
}

async function refreshAuthStrip(): Promise<void> {
  const res = await send(MSG.GET_AUTH_STATUS);
  const online = Boolean(res?.online);
  const authenticated = Boolean(res?.authenticated);
  const version = String(res?.version || chrome.runtime.getManifest().version);

  $("connDot")?.classList.toggle("offline", !online);
  $("connDot")?.classList.toggle("auth-ok", authenticated);
  setText("connOnlineLabel", online ? t("connOnline", locale) : t("connOffline", locale));
  setText("connAuthLabel", authenticated ? t("connSignedIn", locale) : t("connSignedOut", locale));
  setText("connVersion", t("connVersion", locale, { version }));

  const btn = $("btnConnect");
  if (btn) btn.classList.toggle("hidden", authenticated);
}

async function refreshDashboard(): Promise<void> {
  const stateRes = await send(MSG.GET_SCAN_STATE);
  if (stateRes?.ok) scanState = stateRes.state as ScanState;

  const tendersRes = await send(MSG.GET_MATCHED_TENDERS);
  if (tendersRes?.ok) matchedTenders = (tendersRes.tenders as EtimadTender[]) || [];

  const queueRes = await send(MSG.GET_QUEUE_STATUS);
  queuePending = Number(queueRes?.count || queueRes?.pending || 0);

  renderDashboard();
}

function renderDashboard(): void {
  const statusTitle = $("statusTitle");
  const statusText = $("statusText");
  if (statusTitle && statusText) {
    if (scanState.isScanning) {
      statusTitle.textContent = t("statusScanning", locale);
      statusText.textContent = t("scanProgress", locale, {
        current: scanState.currentPage,
        total: scanState.totalPages || "?",
      });
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

  const statsEl = $("stats");
  if (statsEl) {
    statsEl.replaceChildren();
    const found = document.createElement("span");
    found.className = "stat";
    found.textContent = t("scanFound", locale, { count: scanState.tendersFound });
    const matched = document.createElement("span");
    matched.className = "stat";
    matched.textContent = t("scanMatched", locale, { count: scanState.tendersMatched });
    statsEl.append(found, matched);
  }

  const btnScan = $("btnScan") as HTMLButtonElement | null;
  const btnStop = $("btnStop") as HTMLButtonElement | null;
  if (btnScan && btnStop) {
    btnScan.classList.toggle("hidden", scanState.isScanning);
    btnStop.classList.toggle("hidden", !scanState.isScanning);
  }

  const queuePanel = $("queuePanel");
  const queueLabel = $("queueLabel");
  if (queuePanel && queueLabel) {
    queuePanel.classList.toggle("hidden", queuePending <= 0);
    queueLabel.textContent = t("queuePending", locale, { count: queuePending });
  }

  const listEl = $("tenderList");
  if (!listEl) return;
  listEl.replaceChildren();

  if (!matchedTenders.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("tenderNoMatches", locale);
    listEl.appendChild(empty);
    return;
  }

  for (const tender of matchedTenders) {
    listEl.appendChild(buildTenderCard(tender));
  }
}

function buildTenderCard(tender: EtimadTender): HTMLElement {
  const card = document.createElement("div");
  card.className = "tender-card";
  card.dataset.ref = tender.referenceNumber;

  const header = document.createElement("div");
  header.className = "tender-header";
  const score = document.createElement("span");
  score.className = "tender-score";
  score.textContent = `${tender.matchScore || 0}%`;
  const status = document.createElement("span");
  status.className = `tender-status status-${tender.status}`;
  status.textContent = t(`tender${capitalize(tender.status)}` as LocaleKey, locale);
  header.append(score, status);

  const title = document.createElement("h3");
  title.className = "tender-title";
  title.textContent = tender.titleAr || tender.title;

  const entity = document.createElement("p");
  entity.className = "tender-entity";
  entity.textContent = tender.entityAr || tender.entity;

  const meta = document.createElement("div");
  meta.className = "tender-meta";
  if (tender.value) {
    const v = document.createElement("span");
    v.textContent = formatSAR(tender.value, locale);
    meta.appendChild(v);
  }
  if (tender.closingDate) {
    const d = document.createElement("span");
    d.textContent = `${daysUntil(tender.closingDate)} ${t("daysUnit", locale)}`;
    meta.appendChild(d);
  }
  const docs = document.createElement("span");
  docs.textContent = `${tender.documents.length} ${t("docsUnit", locale)}`;
  meta.appendChild(docs);

  const actions = document.createElement("div");
  actions.className = "tender-actions";
  const prepare = document.createElement("button");
  prepare.className = "btn-action btn-prepare";
  prepare.type = "button";
  prepare.textContent = t("actionPrepareProposal", locale);
  prepare.addEventListener("click", (e) => {
    e.stopPropagation();
    void handlePrepareProposal(tender);
  });
  const download = document.createElement("button");
  download.className = "btn-action btn-download";
  download.type = "button";
  download.textContent = t("actionDownloadDocs", locale);
  download.addEventListener("click", (e) => {
    e.stopPropagation();
    void handleDownloadDocs(tender);
  });
  actions.append(prepare, download);

  card.append(header, title, entity, meta, actions);
  card.addEventListener("click", () => {
    selectedTender = tender;
    showView("detail");
    renderTenderDetail();
  });
  return card;
}

function renderTenderDetail(): void {
  if (!selectedTender) return;
  const el = $("detailContent");
  if (!el) return;
  const tender = selectedTender;
  el.replaceChildren();

  const h2 = document.createElement("h2");
  h2.textContent = tender.titleAr || tender.title;
  el.appendChild(h2);

  appendField(el, t("tenderEntity", locale), tender.entityAr || tender.entity);
  appendField(el, t("tenderRef", locale), tender.referenceNumber);
  if (tender.value) appendField(el, t("tenderValue", locale, { value: formatSAR(tender.value, locale) }), "");
  if (tender.closingDate) {
    appendField(el, t("tenderDeadline", locale, { date: formatDate(tender.closingDate, locale) }), "");
  }
  appendField(el, t("tenderCategory", locale), tender.category);
  if (tender.location) appendField(el, t("tenderLocation", locale), tender.location);
  if (tender.localContentRequired) {
    appendField(el, t("tenderLocalContent", locale), `${tender.localContentMinimum || "?"}%`);
  }

  if (tender.qualifications.length) {
    const field = document.createElement("div");
    field.className = "detail-field";
    const strong = document.createElement("strong");
    strong.textContent = `${t("tenderRequirements", locale)}:`;
    field.appendChild(strong);
    const ul = document.createElement("ul");
    for (const q of tender.qualifications) {
      const li = document.createElement("li");
      li.textContent = q;
      ul.appendChild(li);
    }
    field.appendChild(ul);
    el.appendChild(field);
  }

  if (tender.documents.length) {
    const field = document.createElement("div");
    field.className = "detail-field";
    const strong = document.createElement("strong");
    strong.textContent = `${t("tenderDocsLabel", locale)} (${tender.documents.length}):`;
    field.appendChild(strong);
    const ul = document.createElement("ul");
    for (const d of tender.documents) {
      const li = document.createElement("li");
      li.textContent = `[${d.type}] ${d.name}`;
      ul.appendChild(li);
    }
    field.appendChild(ul);
    el.appendChild(field);
  }

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const prep = document.createElement("button");
  prep.className = "btn primary";
  prep.type = "button";
  prep.textContent = t("actionPrepareProposal", locale);
  prep.addEventListener("click", () => void handlePrepareProposal(tender));
  const dl = document.createElement("button");
  dl.className = "btn";
  dl.type = "button";
  dl.textContent = t("actionDownloadDocs", locale);
  dl.addEventListener("click", () => void handleDownloadDocs(tender));
  const open = document.createElement("a");
  open.className = "btn ghost";
  open.href = tender.url;
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = t("actionOpenEtimad", locale);
  actions.append(prep, dl, open);
  el.appendChild(actions);
}

function renderCriteriaForm(): void {
  applyCriteriaLabels();
  const form = $("criteriaForm");
  if (!form) return;
  (form.querySelector("#critKeywords") as HTMLInputElement).value = criteria.keywords.join(", ");
  (form.querySelector("#critKeywordsAr") as HTMLInputElement).value = criteria.keywordsAr.join(", ");
  (form.querySelector("#critMinValue") as HTMLInputElement).value = criteria.minValue?.toString() || "";
  (form.querySelector("#critMaxValue") as HTMLInputElement).value = criteria.maxValue?.toString() || "";
  (form.querySelector("#critMaxDays") as HTMLInputElement).value = criteria.maxDaysUntilClose?.toString() || "";
  (form.querySelector("#critAutoDownload") as HTMLInputElement).checked = criteria.autoDownloadDocuments;
  (form.querySelector("#critAutoProposal") as HTMLInputElement).checked = criteria.autoStartProposal;

  const chips = $("categoryChips");
  if (!chips) return;
  chips.replaceChildren();
  const cats = remoteConfig?.categories || [];
  for (const cat of cats) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.id = cat.id;
    chip.textContent = locale === "ar" ? cat.labelAr || cat.id : cat.labelEn || cat.id;
    if (criteria.categories.includes(cat.id)) chip.classList.add("active");
    chip.addEventListener("click", () => {
      const id = cat.id as TenderCategory;
      if (criteria.categories.includes(id)) {
        criteria.categories = criteria.categories.filter((c) => c !== id);
        chip.classList.remove("active");
      } else {
        criteria.categories = [...criteria.categories, id];
        chip.classList.add("active");
      }
    });
    chips.appendChild(chip);
  }
}

async function handleSaveCriteria(): Promise<void> {
  const form = $("criteriaForm");
  if (!form) return;
  criteria = {
    categories: criteria.categories,
    keywords: splitCsv((form.querySelector("#critKeywords") as HTMLInputElement).value),
    keywordsAr: splitCsv((form.querySelector("#critKeywordsAr") as HTMLInputElement).value),
    minValue: parseFloat((form.querySelector("#critMinValue") as HTMLInputElement).value) || undefined,
    maxValue: parseFloat((form.querySelector("#critMaxValue") as HTMLInputElement).value) || undefined,
    maxDaysUntilClose: parseInt((form.querySelector("#critMaxDays") as HTMLInputElement).value, 10) || undefined,
    autoDownloadDocuments: (form.querySelector("#critAutoDownload") as HTMLInputElement).checked,
    autoStartProposal: (form.querySelector("#critAutoProposal") as HTMLInputElement).checked,
  };
  await send(MSG.SET_MATCH_CRITERIA, { criteria });
  showView("dashboard");
}

async function refreshDownloads(): Promise<void> {
  setText("downloadsHeading", t("downloadsTitle", locale));
  const res = await send(MSG.GET_DOWNLOAD_STATUS);
  const tasks = (res?.tasks as DownloadTask[]) || [];
  const el = $("downloadsList");
  if (!el) return;
  el.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = t("downloadsEmpty", locale);
    el.appendChild(empty);
    return;
  }
  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = `download-item status-${task.status}`;
    const name = document.createElement("span");
    name.className = "download-name";
    name.textContent = task.document.name;
    const status = document.createElement("span");
    status.className = "download-status";
    status.textContent = task.status;
    row.append(name, status);
    el.appendChild(row);
  }
}

async function renderSettings(): Promise<void> {
  applySettingsLabels();
  const res = await send(MSG.GET_SETTINGS);
  if (!res?.ok) return;
  const settings = res.settings as ExtensionSettings;
  ($("settApiBase") as HTMLInputElement).value = settings.apiBase;
  ($("settAutoScan") as HTMLInputElement).value = String(settings.autoScanInterval);
  ($("settNotify") as HTMLInputElement).checked = settings.notifyOnMatch;
  ($("settLocale") as HTMLSelectElement).value = settings.locale;
  ($("settTheme") as HTMLSelectElement).value = settings.theme;
}

async function handleSaveSettings(): Promise<void> {
  const settings: Partial<ExtensionSettings> = {
    apiBase: ($("settApiBase") as HTMLInputElement).value,
    autoScanInterval: parseInt(($("settAutoScan") as HTMLInputElement).value, 10) || 0,
    notifyOnMatch: ($("settNotify") as HTMLInputElement).checked,
    locale: ($("settLocale") as HTMLSelectElement).value as "ar" | "en",
    theme: ($("settTheme") as HTMLSelectElement).value as ExtensionSettings["theme"],
  };
  await send(MSG.SET_SETTINGS, { settings });
  locale = settings.locale || locale;
  applyTheme(settings.theme || theme);
  applyLocaleShell();
  showView("dashboard");
}

async function handleScan(): Promise<void> {
  await send(MSG.SCAN_ETIMAD);
  await refreshDashboard();
}

async function handleExtract(): Promise<void> {
  setStatus(t("statusCapturing", locale), "");
  const res = await send(MSG.EXTRACT_CURRENT_PAGE);
  if (res?.ok) {
    setStatus(t("statusComplete", locale), (res.tender as EtimadTender)?.referenceNumber || "");
    await refreshDashboard();
  } else {
    setStatus(t("statusError", locale), String(res?.error || t("errorParseFailed", locale)));
  }
}

async function handlePrepareProposal(tender: EtimadTender): Promise<void> {
  setStatus(t("statusPreparing", locale), tender.titleAr || tender.title);
  const res = await send(MSG.PREPARE_PROPOSAL, { tender });
  if (res?.ok) {
    const result = res.result as { message?: string; missionId?: string } | undefined;
    setStatus(t("statusComplete", locale), result?.message || "Done");
    if (result?.missionId) {
      const settingsRes = await send(MSG.GET_SETTINGS);
      const apiBase = (settingsRes.settings as ExtensionSettings)?.apiBase || "https://arabclue.com";
      lastMissionUrl = `${apiBase}/app?view=copilot&mission=${encodeURIComponent(result.missionId)}`;
    }
  } else {
    setStatus(t("statusError", locale), String(res?.error || "Failed"));
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

async function handleConnect(): Promise<void> {
  const settingsRes = await send(MSG.GET_SETTINGS);
  const apiBase = (settingsRes.settings as ExtensionSettings)?.apiBase || "https://arabclue.com";
  await chrome.tabs.create({ url: `${apiBase}/login` });
}

async function handleCapture(type: string): Promise<void> {
  setStatus(t("statusCapturing", locale), "");
  const statusEl = $("captureStatus");
  if (statusEl) statusEl.textContent = t("statusCapturing", locale);
  const res = await send(type);
  if (res?.ok) {
    setStatus(t("statusComplete", locale), t("captureSuccess", locale));
    if (statusEl) statusEl.textContent = t("captureSuccess", locale);
    const missionId = (res.result as { missionId?: string } | undefined)?.missionId;
    if (missionId) {
      const settingsRes = await send(MSG.GET_SETTINGS);
      const apiBase = (settingsRes.settings as ExtensionSettings)?.apiBase || "https://arabclue.com";
      lastMissionUrl = `${apiBase}/app?view=copilot&mission=${encodeURIComponent(missionId)}`;
    }
  } else {
    const err = String(res?.error || (res.result as { error?: string })?.error || "Failed");
    setStatus(t("statusError", locale), err);
    if (statusEl) statusEl.textContent = err;
  }
}

async function handleSyncConfig(): Promise<void> {
  const res = await send(MSG.SYNC_REMOTE_CONFIG, { force: true });
  if (res?.ok && res.config) {
    remoteConfig = res.config as RemoteExtensionConfig;
    applyLocaleShell();
  }
  await refreshAuthStrip();
}

async function handleCopilotSend(): Promise<void> {
  const input = $("chatInput") as HTMLInputElement | null;
  const text = input?.value.trim() || "";
  if (!text) return;
  if (input) input.value = "";

  appendChatBubble("user", text);
  appendChatBubble("assistant", t("copilotThinking", locale), true);

  const res = await send(MSG.COPILOT_CHAT, { text });
  const log = $("chatLog");
  const thinking = log?.querySelector(".bubble.thinking");
  thinking?.remove();

  if (res?.ok) {
    appendChatBubble("assistant", String(res.reply || ""));
    if (res.missionUrl) {
      lastMissionUrl = String(res.missionUrl);
      renderCopilotShell();
    }
  } else {
    appendChatBubble("assistant", String(res?.error || t("statusError", locale)));
  }
}

function appendChatBubble(role: "user" | "assistant", text: string, thinking = false): void {
  const log = $("chatLog");
  if (!log) return;
  if (log.textContent === t("copilotEmpty", locale)) log.replaceChildren();
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}${thinking ? " thinking" : ""}`;
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function setStatus(title: string, text: string): void {
  const statusTitle = $("statusTitle");
  const statusText = $("statusText");
  if (statusTitle) statusTitle.textContent = title;
  if (statusText) statusText.textContent = text;
}

function appendField(parent: HTMLElement, label: string, value: string): void {
  const field = document.createElement("div");
  field.className = "detail-field";
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  field.appendChild(strong);
  if (value) {
    field.appendChild(document.createTextNode(` ${value}`));
  }
  parent.appendChild(field);
}

function setText(id: string, value: string): void {
  const el = $(id);
  if (el) el.textContent = value;
}

function setLabelSpan(id: string, value: string): void {
  const el = $(id);
  const span = el?.querySelector("span");
  if (span) span.textContent = value;
}

function setCheckboxLabel(id: string, value: string): void {
  const el = $(id);
  const spans = el?.querySelectorAll("span");
  const span = spans?.[spans.length - 1];
  if (span) span.textContent = value;
}

function splitCsv(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, "");
}

void init();
