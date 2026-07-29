/** Shared constants for ArabClue Agent */

import type { ExtensionSettings, MessageType, RemoteExtensionConfig, TenderCategory } from "./types";

// ─── Message Type Constants ──────────────────────────────────────────

export const MSG: Record<MessageType, MessageType> = {
  PING: "PING",
  GET_SETTINGS: "GET_SETTINGS",
  SET_SETTINGS: "SET_SETTINGS",
  SCAN_ETIMAD: "SCAN_ETIMAD",
  STOP_SCAN: "STOP_SCAN",
  GET_SCAN_STATE: "GET_SCAN_STATE",
  GET_MATCHED_TENDERS: "GET_MATCHED_TENDERS",
  GET_TENDER_DETAILS: "GET_TENDER_DETAILS",
  DOWNLOAD_DOCUMENTS: "DOWNLOAD_DOCUMENTS",
  PREPARE_PROPOSAL: "PREPARE_PROPOSAL",
  GET_MATCH_CRITERIA: "GET_MATCH_CRITERIA",
  SET_MATCH_CRITERIA: "SET_MATCH_CRITERIA",
  OPEN_MISSION_CONTROL: "OPEN_MISSION_CONTROL",
  INGEST_TENDER: "INGEST_TENDER",
  GET_DOWNLOAD_STATUS: "GET_DOWNLOAD_STATUS",
  CLEAR_TENDERS: "CLEAR_TENDERS",
  AGENT_EVENT: "AGENT_EVENT",
  EXTRACT_CURRENT_PAGE: "EXTRACT_CURRENT_PAGE",
  GET_QUEUE_STATUS: "GET_QUEUE_STATUS",
  FLUSH_QUEUE: "FLUSH_QUEUE",
  CAPTURE_PAGE: "CAPTURE_PAGE",
  CAPTURE_SELECTION: "CAPTURE_SELECTION",
  CAPTURE_SCREENSHOT: "CAPTURE_SCREENSHOT",
  COPILOT_CHAT: "COPILOT_CHAT",
  GET_AUTH_STATUS: "GET_AUTH_STATUS",
  SYNC_REMOTE_CONFIG: "SYNC_REMOTE_CONFIG",
  REQUEST_HOST_PERMISSION: "REQUEST_HOST_PERMISSION",
  INGEST_CAPTURE: "INGEST_CAPTURE",
};

// ─── Default Settings ────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBase: "https://arabclue.com",
  locale: "ar",
  autoScanInterval: 30,
  notifyOnMatch: true,
  autoDownload: false,
  autoProposal: false,
  theme: "dark",
};

// ─── Etimad URLs (local fallback) ────────────────────────────────────

export const ETIMAD = {
  BASE: "https://tenders.etimad.sa",
  TENDERS_LIST: "https://tenders.etimad.sa/Tender/AllTendersForVisitor",
  TENDER_DETAIL: "https://tenders.etimad.sa/Tender/DetailsForVisitor",
  SEARCH: "https://tenders.etimad.sa/Tender/AllTendersForVisitor",
  ORIGIN_PATTERN: /https:\/\/(tenders\.)?etimad\.sa/i,
} as const;

// ─── Storage Keys ────────────────────────────────────────────────────

export const STORAGE = {
  SETTINGS: "arabclue.settings",
  CRITERIA: "arabclue.matchCriteria",
  TENDERS: "arabclue.tenders",
  MATCHED: "arabclue.matched",
  SCAN_STATE: "arabclue.scanState",
  DOWNLOADS: "arabclue.downloads",
  QUEUE: "arabclue.captureQueue",
  REMOTE_CONFIG: "arabclue.remoteConfig",
  LAST_MISSION: "arabclue.lastMissionId",
} as const;

// ─── Limits ──────────────────────────────────────────────────────────

export const LIMITS = {
  MAX_TENDERS_STORED: 200,
  MAX_MATCHED_STORED: 50,
  MAX_SCAN_PAGES: 20,
  MAX_QUEUE_SIZE: 20,
  MAX_QUEUE_ATTEMPTS: 12,
  MAX_DOCUMENT_SIZE_MB: 25,
  SCAN_PAGE_DELAY_MS: 2000,
  MATCH_MIN_SCORE: 30,
  REMOTE_CONFIG_TTL_MS: 15 * 60 * 1000,
  PAGE_TEXT_MAX: 80_000,
} as const;

// ─── Alarms ──────────────────────────────────────────────────────────

export const ALARMS = {
  AUTO_SCAN: "arabclue-auto-scan",
  RETRY_QUEUE: "arabclue-retry-queue",
  DEADLINE_CHECK: "arabclue-deadline-check",
} as const;

// ─── Category Keywords (for inference — fallback) ────────────────────

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  IT: ["تقنية", "برمجيات", "أنظمة", "حاسب", "شبكات", "سحابي", "رقمي", "إلكتروني", "software", "cloud", "network", "digital", "IT", "systems", "computing", "cyber"],
  construction: ["إنشاء", "بناء", "مقاولات", "تشييد", "هندسة مدنية", "construction", "building", "civil"],
  consulting: ["استشار", "دراسة", "تحليل", "consulting", "advisory", "study", "analysis"],
  maintenance: ["صيانة", "تشغيل", "إصلاح", "maintenance", "operation", "repair"],
  supply: ["توريد", "تجهيز", "شراء", "supply", "procurement", "provision"],
  services: ["خدمات", "تنظيف", "حراسة", "نقل", "services", "cleaning", "security", "transport"],
  healthcare: ["صحة", "طبي", "مستشفى", "أدوية", "health", "medical", "hospital", "pharmaceutical"],
  education: ["تعليم", "تدريب", "جامعة", "مدرسة", "education", "training", "university"],
  security: ["أمن", "حماية", "مراقبة", "security", "protection", "surveillance"],
  transportation: ["نقل", "مواصلات", "طرق", "سكك", "transport", "roads", "railway"],
};

const FALLBACK_CATEGORIES: RemoteExtensionConfig["categories"] = (
  [
    ["IT", "IT & Technology", "تقنية المعلومات"],
    ["construction", "Construction", "إنشاءات"],
    ["consulting", "Consulting", "استشارات"],
    ["maintenance", "Maintenance", "صيانة"],
    ["supply", "Supply", "توريد"],
    ["services", "Services", "خدمات"],
    ["healthcare", "Healthcare", "صحة"],
    ["education", "Education", "تعليم"],
    ["security", "Security", "أمن"],
    ["transportation", "Transportation", "نقل"],
    ["other", "Other", "أخرى"],
  ] as const
).map(([id, labelEn, labelAr]) => ({
  id: id as TenderCategory,
  labelEn,
  labelAr,
  keywords: CATEGORY_KEYWORDS[id] || [],
}));

/** Built-in remote config used when the platform is offline */
export const FALLBACK_REMOTE_CONFIG: RemoteExtensionConfig = {
  portals: [
    {
      id: "etimad",
      name: "Etimad",
      baseUrl: ETIMAD.BASE,
      listUrl: ETIMAD.TENDERS_LIST,
      detailUrlPattern: "/Tender/Details",
      originPattern: "https://(tenders.)?etimad.sa",
    },
  ],
  categories: FALLBACK_CATEGORIES,
  featureFlags: {
    universalCapture: true,
    copilot: true,
    autoScan: true,
    documentUpload: true,
    autopilot: true,
  },
  branding: {
    name: "ArabClue Agent",
    taglineEn: "Etimad intelligence · universal capture · Mission Control copilot",
    taglineAr: "ذكاء اعتماد · التقاط عالمي · مساعد Mission Control",
  },
};
