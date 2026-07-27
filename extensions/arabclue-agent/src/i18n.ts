/** Bilingual string table for ArabClue Etimad Agent */

const strings = {
  en: {
    // Header
    appTitle: "ArabClue Etimad Agent",
    appSubtitle: "Intelligent tender discovery & proposal automation",
    
    // Status
    statusReady: "Ready",
    statusScanning: "Scanning Etimad…",
    statusMatching: "Matching tenders…",
    statusDownloading: "Downloading documents…",
    statusPreparing: "Preparing proposal…",
    statusComplete: "Complete",
    statusError: "Error",
    statusOffline: "Offline — will retry",
    
    // Scan
    scanStart: "Scan Etimad",
    scanStop: "Stop scan",
    scanProgress: "Page {current} of {total}",
    scanFound: "{count} tenders found",
    scanMatched: "{count} matches",
    scanNew: "{count} new since last scan",
    scanLast: "Last scan: {time}",
    scanNever: "Never scanned",
    scanAutoEnabled: "Auto-scan every {minutes} min",
    scanAutoDisabled: "Auto-scan disabled",
    
    // Tenders
    tenderOpen: "Open",
    tenderClosingSoon: "Closing soon",
    tenderClosed: "Closed",
    tenderAwarded: "Awarded",
    tenderCancelled: "Cancelled",
    tenderValue: "Value: SAR {value}",
    tenderEntity: "Entity",
    tenderDeadline: "Deadline: {date}",
    tenderDaysLeft: "{days} days left",
    tenderDocuments: "{count} documents",
    tenderMatchScore: "Match: {score}%",
    tenderNoMatches: "No matching tenders yet. Set criteria and scan.",
    
    // Actions
    actionPrepareProposal: "Prepare Proposal",
    actionDownloadDocs: "Download Documents",
    actionViewDetails: "View Details",
    actionOpenEtimad: "Open on Etimad",
    actionOpenMissionControl: "Open Mission Control",
    actionRetryQueue: "Retry now",
    actionClearAll: "Clear all",
    
    // Criteria
    criteriaTitle: "Match Criteria",
    criteriaCategories: "Categories",
    criteriaKeywords: "Keywords (English)",
    criteriaKeywordsAr: "Keywords (Arabic)",
    criteriaMinValue: "Min value (SAR)",
    criteriaMaxValue: "Max value (SAR)",
    criteriaEntities: "Government entities",
    criteriaMaxDays: "Max days until close",
    criteriaLocalContent: "Require local content",
    criteriaAutoDownload: "Auto-download documents",
    criteriaAutoProposal: "Auto-start proposal",
    criteriaSave: "Save criteria",
    criteriaSaved: "Criteria saved",
    
    // Downloads
    downloadsTitle: "Downloads",
    downloadsEmpty: "No downloads yet",
    downloadsPending: "Pending",
    downloadsInProgress: "Downloading…",
    downloadsComplete: "Complete",
    downloadsFailed: "Failed",
    
    // Settings
    settingsTitle: "Settings",
    settingsApiBase: "API base (origin only)",
    settingsLocale: "Language",
    settingsAutoScan: "Auto-scan interval (min)",
    settingsNotify: "Notify on new matches",
    settingsTheme: "Theme",
    settingsSave: "Save",
    settingsSaved: "Settings saved",
    
    // Queue
    queuePending: "{count} captures waiting offline",
    queueEmpty: "Queue empty",
    queueFlushed: "{count} sent successfully",
    
    // Errors
    errorAuth: "Sign in at arabclue.com first",
    errorNetwork: "Network error — saved offline",
    errorQuota: "Quota exceeded",
    errorNoTab: "No active tab",
    errorParseFailed: "Could not parse Etimad page",
    errorNotEtimad: "Not on an Etimad page",
    
    // Notifications
    notifyNewMatches: "{count} new tenders match your criteria",
    notifyClosingSoon: "{count} tenders closing within 48 hours",
    notifyProposalReady: "Proposal ready for: {title}",
    
    // Categories
    catIT: "IT & Technology",
    catConstruction: "Construction",
    catConsulting: "Consulting",
    catMaintenance: "Maintenance",
    catSupply: "Supply",
    catServices: "Services",
    catHealthcare: "Healthcare",
    catEducation: "Education",
    catSecurity: "Security",
    catTransportation: "Transportation",
    catOther: "Other",
    
    // Footer
    footerVersion: "v{version}",
    footerOptional: "Optional · MV3",
  },
  ar: {
    // Header
    appTitle: "وكيل ArabClue لاعتماد",
    appSubtitle: "اكتشاف ذكي للمناقصات وأتمتة إعداد العروض",
    
    // Status
    statusReady: "جاهز",
    statusScanning: "يفحص اعتماد…",
    statusMatching: "يطابق المناقصات…",
    statusDownloading: "ينزّل المستندات…",
    statusPreparing: "يحضّر العرض…",
    statusComplete: "اكتمل",
    statusError: "خطأ",
    statusOffline: "غير متصل — سيعاد المحاولة",
    
    // Scan
    scanStart: "فحص اعتماد",
    scanStop: "إيقاف الفحص",
    scanProgress: "صفحة {current} من {total}",
    scanFound: "{count} مناقصات",
    scanMatched: "{count} مطابقات",
    scanNew: "{count} جديدة منذ آخر فحص",
    scanLast: "آخر فحص: {time}",
    scanNever: "لم يتم الفحص بعد",
    scanAutoEnabled: "فحص تلقائي كل {minutes} دقيقة",
    scanAutoDisabled: "الفحص التلقائي معطّل",
    
    // Tenders
    tenderOpen: "مفتوح",
    tenderClosingSoon: "يغلق قريباً",
    tenderClosed: "مغلق",
    tenderAwarded: "تمت الترسية",
    tenderCancelled: "ملغى",
    tenderValue: "القيمة: {value} ريال",
    tenderEntity: "الجهة",
    tenderDeadline: "الموعد النهائي: {date}",
    tenderDaysLeft: "{days} يوم متبقي",
    tenderDocuments: "{count} مستندات",
    tenderMatchScore: "التطابق: {score}%",
    tenderNoMatches: "لا توجد مناقصات مطابقة. حدد المعايير وابدأ الفحص.",
    
    // Actions
    actionPrepareProposal: "إعداد عرض",
    actionDownloadDocs: "تنزيل المستندات",
    actionViewDetails: "عرض التفاصيل",
    actionOpenEtimad: "فتح في اعتماد",
    actionOpenMissionControl: "فتح Mission Control",
    actionRetryQueue: "إعادة المحاولة",
    actionClearAll: "مسح الكل",
    
    // Criteria
    criteriaTitle: "معايير المطابقة",
    criteriaCategories: "التصنيفات",
    criteriaKeywords: "كلمات مفتاحية (إنجليزي)",
    criteriaKeywordsAr: "كلمات مفتاحية (عربي)",
    criteriaMinValue: "الحد الأدنى (ريال)",
    criteriaMaxValue: "الحد الأعلى (ريال)",
    criteriaEntities: "الجهات الحكومية",
    criteriaMaxDays: "أقصى أيام حتى الإغلاق",
    criteriaLocalContent: "يتطلب محتوى محلي",
    criteriaAutoDownload: "تنزيل تلقائي للمستندات",
    criteriaAutoProposal: "بدء العرض تلقائياً",
    criteriaSave: "حفظ المعايير",
    criteriaSaved: "تم حفظ المعايير",
    
    // Downloads
    downloadsTitle: "التنزيلات",
    downloadsEmpty: "لا توجد تنزيلات",
    downloadsPending: "في الانتظار",
    downloadsInProgress: "جارٍ التنزيل…",
    downloadsComplete: "اكتمل",
    downloadsFailed: "فشل",
    
    // Settings
    settingsTitle: "الإعدادات",
    settingsApiBase: "رابط الخادم (الأصل فقط)",
    settingsLocale: "اللغة",
    settingsAutoScan: "مدة الفحص التلقائي (دقائق)",
    settingsNotify: "إشعار عند وجود مطابقات",
    settingsTheme: "المظهر",
    settingsSave: "حفظ",
    settingsSaved: "تم الحفظ",
    
    // Queue
    queuePending: "{count} التقاطات في الانتظار",
    queueEmpty: "قائمة الانتظار فارغة",
    queueFlushed: "تم إرسال {count} بنجاح",
    
    // Errors
    errorAuth: "سجّل الدخول في arabclue.com أولاً",
    errorNetwork: "خطأ في الشبكة — تم الحفظ محلياً",
    errorQuota: "تم تجاوز الحد المسموح",
    errorNoTab: "لا يوجد تبويب نشط",
    errorParseFailed: "تعذر تحليل صفحة اعتماد",
    errorNotEtimad: "لست على صفحة اعتماد",
    
    // Notifications
    notifyNewMatches: "{count} مناقصات جديدة تطابق معاييرك",
    notifyClosingSoon: "{count} مناقصات تغلق خلال 48 ساعة",
    notifyProposalReady: "العرض جاهز لـ: {title}",
    
    // Categories
    catIT: "تقنية المعلومات",
    catConstruction: "إنشاءات",
    catConsulting: "استشارات",
    catMaintenance: "صيانة",
    catSupply: "توريد",
    catServices: "خدمات",
    catHealthcare: "صحة",
    catEducation: "تعليم",
    catSecurity: "أمن",
    catTransportation: "نقل",
    catOther: "أخرى",
    
    // Footer
    footerVersion: "v{version}",
    footerOptional: "اختياري · MV3",
  },
} as const;

export type LocaleKey = keyof typeof strings.en;

/** Translate a key with optional interpolation */
export function t(key: LocaleKey, locale: "ar" | "en", params?: Record<string, string | number>): string {
  const value = strings[locale]?.[key] ?? strings.en[key] ?? key;
  if (!params) return value;
  return Object.entries(params).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    value
  );
}

export { strings };
