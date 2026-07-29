/** ArabClue Agent — Core Type System */

// ─── Etimad Tender Structure ─────────────────────────────────────────

export interface EtimadTender {
  referenceNumber: string;
  title: string;
  titleAr: string;
  entity: string;
  entityAr: string;
  category: TenderCategory;
  subcategory?: string;
  value?: number;
  currency: "SAR";
  publishDate: string;
  closingDate: string;
  status: TenderStatus;
  location?: string;
  url: string;
  documents: TenderDocument[];
  qualifications: string[];
  localContentRequired?: boolean;
  localContentMinimum?: number;
  extractedAt: string;
  matchScore?: number;
  matchReasons?: string[];
}

export type TenderStatus =
  | "open"
  | "closing_soon"
  | "closed"
  | "awarded"
  | "cancelled";

export type TenderCategory =
  | "IT"
  | "construction"
  | "consulting"
  | "maintenance"
  | "supply"
  | "services"
  | "healthcare"
  | "education"
  | "security"
  | "transportation"
  | "other";

export interface TenderDocument {
  name: string;
  url: string;
  type: TenderDocumentType;
  size?: string;
  downloadedAt?: string;
  localPath?: string;
}

export type TenderDocumentType =
  | "rfp"
  | "terms"
  | "specs"
  | "qualification"
  | "financial"
  | "other";

// ─── User Interest / Matching ────────────────────────────────────────

export interface UserMatchCriteria {
  categories: TenderCategory[];
  keywords: string[];
  keywordsAr: string[];
  minValue?: number;
  maxValue?: number;
  entities?: string[];
  excludeEntities?: string[];
  locations?: string[];
  requireLocalContent?: boolean;
  maxDaysUntilClose?: number;
  autoDownloadDocuments: boolean;
  autoStartProposal: boolean;
}

// ─── Scan / Monitor State ────────────────────────────────────────────

export interface ScanState {
  lastScanAt: string | null;
  tendersFound: number;
  tendersMatched: number;
  isScanning: boolean;
  currentPage: number;
  totalPages: number;
  error?: string;
}

export interface ScanResult {
  tenders: EtimadTender[];
  matched: EtimadTender[];
  newSinceLastScan: EtimadTender[];
  scanDuration: number;
  pagesScanned: number;
}

// ─── Document Download ───────────────────────────────────────────────

export interface DownloadTask {
  id: string;
  tenderId: string;
  document: TenderDocument;
  status: "pending" | "downloading" | "complete" | "failed";
  progress?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// ─── Proposal Preparation ────────────────────────────────────────────

export interface ProposalPrepRequest {
  tender: EtimadTender;
  documents: TenderDocument[];
  mode: "auto" | "manual";
  projectId?: string;
  notes?: string;
}

export interface ProposalPrepResult {
  ok: boolean;
  missionId?: string;
  projectId?: string;
  proposalId?: string;
  agentRunId?: string;
  message: string;
  error?: string;
  queued?: boolean;
  status?: number;
}

// ─── Universal Capture ───────────────────────────────────────────────

export type CaptureMode = "page" | "selection" | "screenshot";

export interface PageCapturePayload {
  mode: CaptureMode;
  title: string;
  url: string;
  text: string;
  headings: string[];
  metaDescription?: string;
  screenshotDataUrl?: string;
  source: "chrome-extension";
}

export interface AuthStatus {
  authenticated: boolean;
  online: boolean;
  user?: { id?: string; name?: string; email?: string };
  version: string;
  apiBase: string;
}

// ─── Remote Config ───────────────────────────────────────────────────

export interface PortalConfig {
  id: string;
  name: string;
  baseUrl: string;
  listUrl: string;
  detailUrlPattern?: string;
  originPattern?: string;
}

export interface RemoteExtensionConfig {
  portals: PortalConfig[];
  categories: { id: TenderCategory; labelEn: string; labelAr: string; keywords: string[] }[];
  featureFlags: {
    universalCapture: boolean;
    copilot: boolean;
    autoScan: boolean;
    documentUpload: boolean;
    autopilot: boolean;
  };
  branding: {
    name: string;
    taglineEn: string;
    taglineAr: string;
  };
  matchCriteriaDefaults?: Partial<UserMatchCriteria>;
  authenticated?: boolean;
  user?: { id?: string; name?: string; email?: string };
  fetchedAt?: string;
}

// ─── Message Types ───────────────────────────────────────────────────

export type MessageType =
  | "PING"
  | "GET_SETTINGS"
  | "SET_SETTINGS"
  | "SCAN_ETIMAD"
  | "STOP_SCAN"
  | "GET_SCAN_STATE"
  | "GET_MATCHED_TENDERS"
  | "GET_TENDER_DETAILS"
  | "DOWNLOAD_DOCUMENTS"
  | "PREPARE_PROPOSAL"
  | "GET_MATCH_CRITERIA"
  | "SET_MATCH_CRITERIA"
  | "OPEN_MISSION_CONTROL"
  | "INGEST_TENDER"
  | "GET_DOWNLOAD_STATUS"
  | "CLEAR_TENDERS"
  | "AGENT_EVENT"
  | "EXTRACT_CURRENT_PAGE"
  | "GET_QUEUE_STATUS"
  | "FLUSH_QUEUE"
  | "CAPTURE_PAGE"
  | "CAPTURE_SELECTION"
  | "CAPTURE_SCREENSHOT"
  | "COPILOT_CHAT"
  | "GET_AUTH_STATUS"
  | "SYNC_REMOTE_CONFIG"
  | "REQUEST_HOST_PERMISSION"
  | "INGEST_CAPTURE";

// ─── Extension Settings ──────────────────────────────────────────────

export interface ExtensionSettings {
  apiBase: string;
  locale: "ar" | "en";
  autoScanInterval: number;
  notifyOnMatch: boolean;
  autoDownload: boolean;
  autoProposal: boolean;
  theme: "dark" | "light" | "system";
}

// ─── Extension Response Envelope ─────────────────────────────────────

export interface ExtensionResponse<T = unknown> {
  ok: boolean;
  error?: string;
  status?: number;
  data?: T;
}

// ─── Match Result ────────────────────────────────────────────────────

export interface MatchResult {
  score: number;
  reasons: string[];
}

// ─── Copilot ─────────────────────────────────────────────────────────

export interface CopilotChatResult {
  ok: boolean;
  reply?: string;
  missionId?: string;
  missionUrl?: string;
  error?: string;
  streamed?: boolean;
}
