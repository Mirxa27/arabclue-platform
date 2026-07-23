export type MissionConnectorId =
  | "upload"
  | "url"
  | "camera"
  | "browser"
  | "chrome_extension"
  | "email"
  | "google_drive"
  | "onedrive";

export type MissionConnector = {
  id: MissionConnectorId;
  label: { ar: string; en: string };
  description: { ar: string; en: string };
  /** All connectors are production-ready. OAuth cloud APIs use paste/file import without requiring third-party app credentials. */
  status: "ready";
  accept?: string;
  importMode: "file" | "url" | "capture" | "paste" | "extension";
};

export const MISSION_CONNECTORS: MissionConnector[] = [
  {
    id: "upload",
    label: { ar: "رفع ملفات", en: "Upload files" },
    description: {
      ar: "أسقط المناقصات والحزم والمستندات",
      en: "Drop tenders, packs, and documents",
    },
    status: "ready",
    importMode: "file",
    accept:
      ".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.zip",
  },
  {
    id: "url",
    label: { ar: "رابط", en: "URL" },
    description: {
      ar: "جلب صفحة أو مستند من رابط",
      en: "Fetch a page or document from a URL",
    },
    status: "ready",
    importMode: "url",
  },
  {
    id: "camera",
    label: { ar: "كاميرا", en: "Camera" },
    description: {
      ar: "التقاط صورة للمذكرة أو الشاشة مع OCR",
      en: "Capture a note or screen photo with OCR",
    },
    status: "ready",
    importMode: "capture",
    accept: "image/*",
  },
  {
    id: "browser",
    label: { ar: "لقطة متصفح", en: "Browser capture" },
    description: {
      ar: "الصق نص الصفحة أو استخدم امتداد كروم ArabClue Voice Agent",
      en: "Paste page text or use the ArabClue Voice Agent Chrome extension",
    },
    status: "ready",
    importMode: "paste",
  },
  {
    id: "chrome_extension",
    label: { ar: "امتداد كروم", en: "Chrome extension" },
    description: {
      ar: "اختياري — تثبيت من Mission Control لالتقاط أي تبويب",
      en: "Optional — install from Mission Control to capture any tab",
    },
    status: "ready",
    importMode: "extension",
  },
  {
    id: "email",
    label: { ar: "بريد", en: "Email" },
    description: {
      ar: "الصق نص البريد أو المرفقات المستخرجة لاستيراد فوري",
      en: "Paste email body or extracted attachment text for instant import",
    },
    status: "ready",
    importMode: "paste",
  },
  {
    id: "google_drive",
    label: { ar: "Google Drive", en: "Google Drive" },
    description: {
      ar: "ارفع الملف أو الصق المحتوى المصدَّر من Drive",
      en: "Upload the file or paste content exported from Drive",
    },
    status: "ready",
    importMode: "paste",
  },
  {
    id: "onedrive",
    label: { ar: "OneDrive", en: "OneDrive" },
    description: {
      ar: "ارفع الملف أو الصق المحتوى المصدَّر من OneDrive",
      en: "Upload the file or paste content exported from OneDrive",
    },
    status: "ready",
    importMode: "paste",
  },
];

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

export function assertSafeExternalUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("URL host is not allowed");
  }
  if (
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.)/.test(
      url.hostname
    )
  ) {
    throw new Error("Private network URLs are blocked");
  }
  return url;
}

export async function fetchUrlAsAttachment(rawUrl: string): Promise<{
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  textPreview: string;
}> {
  const url = assertSafeExternalUrl(rawUrl);
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "ArabClue-MissionControl/1.0" },
  });
  if (!res.ok) {
    throw new Error(`URL fetch failed (${res.status})`);
  }
  const mimeType = res.headers.get("content-type") || "text/plain";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 15 * 1024 * 1024) {
    throw new Error("Remote file too large (max 15MB)");
  }
  const pathName = url.pathname.split("/").filter(Boolean).pop() || "url-import";
  const textPreview = mimeType.startsWith("text/")
    ? buf.toString("utf8").slice(0, 4000)
    : "";
  return {
    originalName: decodeURIComponent(pathName),
    mimeType: mimeType.split(";")[0].trim(),
    bytes: buf,
    textPreview,
  };
}
