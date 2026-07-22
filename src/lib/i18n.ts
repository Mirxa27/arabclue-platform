import type { Locale } from "./types";

type Dict = Record<string, { ar: string; en: string }>;

export const t: Dict = {
  // Brand
  appName: { ar: "أراب كلاو", en: "Arabclue" },
  appTagline: {
    ar: "أتمتة العطاءات الحكومية السعودية بالذكاء الاصطناعي",
    en: "AI-automated Saudi government tender proposals",
  },

  // Navigation
  nav_dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
  nav_projects: { ar: "المشاريع", en: "Projects" },
  nav_documents: { ar: "المستندات", en: "Documents" },
  nav_proposals: { ar: "العطاءات", en: "Proposals" },
  nav_compliance: { ar: "الامتثال", en: "Compliance" },
  nav_brand: { ar: "إعداد الحساب", en: "Account Setup" },
  nav_account: { ar: "إعداد الحساب", en: "Account Setup" },
  nav_agents: { ar: "وكلاء الذكاء", en: "AI Agents" },
  nav_history: { ar: "الإصدارات", en: "Version History" },
  nav_billing: { ar: "الاشتراك والدفع", en: "Billing" },
  nav_reviews: { ar: "المراجعات", en: "Reviews" },
  nav_settings: { ar: "الإعدادات", en: "Settings" },
  status_REVIEWED: { ar: "تمت المراجعة", en: "Reviewed" },
  status_APPROVED: { ar: "معتمد", en: "Approved" },
  status_REJECTED: { ar: "مرفوض", en: "Rejected" },
  nav_admin: { ar: "لوحة الإدارة", en: "Admin Panel" },
  nav_admin_ai: { ar: "مزودو الذكاء", en: "AI Providers" },
  nav_admin_env: { ar: "إدارة البيئة", en: "Environment" },
  nav_admin_billing: { ar: "الفوترة والباقات", en: "Billing" },
  nav_admin_security: { ar: "الأمن والصلاحيات", en: "Security & RBAC" },
  nav_admin_audit: { ar: "سجل التدقيق", en: "Audit Trail" },

  // Sections
  section_overview: { ar: "نظرة عامة", en: "Overview" },
  section_ingestion: { ar: "منطقة استيعاب الملفات", en: "File Ingestion Zone" },
  section_compliance: { ar: "مراقب الامتثال الذكي", en: "AI Compliance Monitor" },
  section_agents: { ar: "سير عمل الوكلاء", en: "Multi-Agent Workflow" },
  section_matrix: { ar: "مصفوفة المستندات", en: "Document Matrix" },
  section_versions: { ar: "سجل الإصدارات", en: "Version History" },
  section_brand: { ar: "إعداد الهوية", en: "Brand Configuration" },

  // Stats
  stat_active_projects: { ar: "المشاريع النشطة", en: "Active Projects" },
  stat_proposals_generated: { ar: "العطاءات المُنشأة", en: "Proposals Generated" },
  stat_compliance_score: { ar: "متوسط الامتثال", en: "Avg Compliance" },
  stat_documents_processed: { ar: "المستندات المعالجة", en: "Documents Processed" },

  // File ingestion
  ingest_title: { ar: "أسحب وأفلت ملفات المناقصة هنا", en: "Drag & drop tender files here" },
  ingest_subtitle: {
    ar: "كراسة الشروط، المواصفات الفنية، عقد تقنية المعلومات، متطلبات الامتثال",
    en: "RFP, Technical Specs, IT Contract, EA Compliance requirements",
  },
  ingest_browse: { ar: "تصفح الملفات", en: "Browse Files" },
  ingest_supported: { ar: "الصيغ المدعومة: PDF, DOCX, XLSX, ZIP", en: "Supported: PDF, DOCX, XLSX, ZIP" },

  // Doc categories
  cat_RFP: { ar: "كراسة الشروط", en: "RFP / Conditions Booklet" },
  cat_TECHNICAL_SPECS: { ar: "المواصفات الفنية", en: "Technical Specs" },
  cat_IT_CONTRACT: { ar: "عقد تقنية المعلومات", en: "IT Contract Template" },
  cat_EA_COMPLIANCE: { ar: "متطلبات البنية المؤسسية", en: "EA Compliance" },
  cat_QUALIFICATION: { ar: "معايير التأهيل", en: "Qualification Criteria" },
  cat_FINANCIAL: { ar: "البيانات المالية", en: "Financial Statements" },
  cat_BRAND_ASSET: { ar: "أصول العلامة", en: "Brand Asset" },
  cat_OTHER: { ar: "أخرى", en: "Other" },

  // Agents
  agent_INGESTION_name: { ar: "وكيل الاستيعاب والتحليل", en: "Ingestion & Parser Agent" },
  agent_INGESTION_desc: {
    ar: "استخراج نطاق العمل، عقوبات SLA، ومعالم التسليم",
    en: "Extracts Scope of Work, SLA penalties, delivery milestones",
  },
  agent_COMPLIANCE_REGULATORY_name: { ar: "وكيل الامتثال والتنظيم", en: "Compliance & Regulatory Agent" },
  agent_COMPLIANCE_REGULATORY_desc: {
    ar: "NCA وPDPL والمحتوى المحلي وNORA — نظام المنافسات",
    en: "NCA, PDPL, local content & NORA — procurement law",
  },
  agent_TECHNICAL_ARCHITECT_name: { ar: "وكيل المعمارية الفنية", en: "Technical & Solution Architect" },
  agent_TECHNICAL_ARCHITECT_desc: {
    ar: "RAG من المشاريع السابقة ومنهجية التنفيذ",
    en: "RAG from past projects + execution methodology",
  },
  // Legacy keys kept for any cached UI
  agent_EA_COMPLIANCE_name: { ar: "وكيل الامتثال والتنظيم", en: "Compliance & Regulatory Agent" },
  agent_EA_COMPLIANCE_desc: {
    ar: "NCA وPDPL والمحتوى المحلي وNORA",
    en: "NCA, PDPL, local content & NORA",
  },
  agent_LEGAL_REGULATORY_name: { ar: "وكيل المعمارية الفنية", en: "Technical & Solution Architect" },
  agent_LEGAL_REGULATORY_desc: {
    ar: "RAG من المشاريع السابقة ومنهجية التنفيذ",
    en: "RAG from past projects + execution methodology",
  },
  agent_FINANCIAL_QUALIFICATION_name: { ar: "الوكيل المالي والتأهيلي", en: "Financial & Qualification Agent" },
  agent_FINANCIAL_QUALIFICATION_desc: {
    ar: "نسبة السيولة السريعة، نسبة السعودة، التأهيل",
    en: "Quick liquidity ratio, Saudization, qualification checks",
  },
  agent_PROPOSAL_DRAFTING_name: { ar: "وكيل صياغة العطاء", en: "Proposal Drafting Agent" },
  agent_PROPOSAL_DRAFTING_desc: {
    ar: "RAG من المشاريع السابقة + رؤية 2030",
    en: "RAG from past projects + Vision 2030 alignment",
  },

  // Compliance frameworks
  fw_NCA_ECC1: { ar: "ضوابط الأمن السيبراني الأساسية ECC-1:2018", en: "NCA Essential Cybersecurity Controls ECC-1:2018" },
  fw_NCA_CCC1: { ar: "ضوابط الأمن السيبراني السحابية CCC-1:2020", en: "NCA Cloud Cybersecurity Controls CCC-1:2020" },
  fw_PDPL: { ar: "نظام حماية البيانات الشخصية PDPL", en: "Personal Data Protection Law PDPL" },
  fw_EA_TP1: { ar: "مبدأ البنية المؤسسية — السحابة أولاً", en: "EA Principle — Cloud First (TP1)" },
  fw_EA_SP1: { ar: "التصميم الآمن SP1", en: "Secure by Design (SP1)" },
  fw_EA_SP2: { ar: "الثقة المعدومة SP2", en: "Zero Trust (SP2)" },
  fw_LOCAL_CONTENT: { ar: "المحتوى المحلي والمشاريع الصغيرة", en: "Local Content & SME" },
  fw_NORA: { ar: "الإطار الوطني للبنية المؤسسية NORA", en: "NORA Enterprise Architecture" },

  // Status
  status_PENDING: { ar: "قيد الانتظار", en: "Pending" },
  status_PARSING: { ar: "جاري التحليل", en: "Parsing" },
  status_PARSED: { ar: "تم التحليل", en: "Parsed" },
  status_FAILED: { ar: "فشل", en: "Failed" },
  status_DRAFT: { ar: "مسودة", en: "Draft" },
  status_DRAFTING: { ar: "جاري الصياغة", en: "Drafting" },
  status_REVIEW: { ar: "قيد المراجعة", en: "In Review" },
  status_SUBMITTED: { ar: "تم التقديم", en: "Submitted" },
  status_ARCHIVED: { ar: "مؤرشف", en: "Archived" },
  status_QUEUED: { ar: "في قائمة الانتظار", en: "Queued" },
  status_RUNNING: { ar: "قيد التشغيل", en: "Running" },
  status_COMPLETED: { ar: "مكتمل", en: "Completed" },
  status_CANCELLED: { ar: "ملغى", en: "Cancelled" },
  status_COMPLIANT: { ar: "متوافق", en: "Compliant" },
  status_PARTIAL: { ar: "متوافق جزئياً", en: "Partial" },
  status_NON_COMPLIANT: { ar: "غير متوافق", en: "Non-Compliant" },
  status_NOT_APPLICABLE: { ar: "غير قابل للتطبيق", en: "N/A" },
  status_GENERATED: { ar: "تم الإنشاء", en: "Generated" },
  status_EXPORTED: { ar: "تم التصدير", en: "Exported" },

  // Actions
  action_upload: { ar: "رفع", en: "Upload" },
  action_run_agents: { ar: "تشغيل الوكلاء", en: "Run Agents" },
  action_generate: { ar: "إنشاء العطاء", en: "Generate Proposal" },
  action_download: { ar: "تنزيل", en: "Download" },
  action_view: { ar: "عرض", en: "View" },
  action_edit: { ar: "تحرير", en: "Edit" },
  action_revert: { ar: "استرجاع", en: "Revert" },
  proposal_editor: { ar: "محرر العطاء", en: "Proposal Editor" },
  proposal_preview: { ar: "معاينة", en: "Preview" },
  proposal_saved: { ar: "تم حفظ العطاء", en: "Proposal saved" },
  proposal_save_pdf: { ar: "حفظ وتنزيل PDF", en: "Save & Download PDF" },
  proposal_ai_rewrite: { ar: "إعادة صياغة بالذكاء الاصطناعي", en: "AI Rewrite Section" },
  proposal_version: { ar: "الإصدار", en: "Version" },
  proposal_locale: { ar: "لغة العطاء", en: "Proposal language" },
  action_compare: { ar: "مقارنة", en: "Compare" },
  action_delete: { ar: "حذف", en: "Delete" },
  action_save: { ar: "حفظ", en: "Save" },
  action_cancel: { ar: "إلغاء", en: "Cancel" },
  action_add_project: { ar: "إضافة مشروع", en: "Add Project" },

  // Brand
  brand_logo: { ar: "شعار الشركة", en: "Company Logo" },
  brand_primary_color: { ar: "اللون الأساسي", en: "Primary Color" },
  brand_secondary_color: { ar: "اللون الثانوي", en: "Secondary Color" },
  brand_accent_color: { ar: "لون التمييز", en: "Accent Color" },
  brand_tagline: { ar: "الشعار التعريفي", en: "Tagline" },
  brand_past_projects: { ar: "المشاريع السابقة", en: "Past Projects" },

  // Misc
  search_placeholder: { ar: "بحث في المشاريع والمستندات...", en: "Search projects & documents..." },
  rtl_toggle: { ar: "EN", en: "ع" },
  theme_toggle: { ar: "الوضع الليلي", en: "Dark Mode" },
  loading: { ar: "جاري التحميل...", en: "Loading..." },
  no_data: { ar: "لا توجد بيانات", en: "No data available" },
  vision2030: { ar: "رؤية 2030", en: "Vision 2030" },
  footer_rights: { ar: "جميع الحقوق محفوظة", en: "All rights reserved" },
  footer_pdpl_note: {
    ar: "بياناتك مستضافة محلياً في المملكة العربية السعودية — متوافق مع PDPL",
    en: "Your data is hosted locally in KSA — PDPL compliant",
  },

  // Tender types
  tender_type: { ar: "نوع المناقصة", en: "Tender Type" },
  tender_IT: { ar: "تقنية المعلومات", en: "IT & Digital" },
  tender_CONSTRUCTION: { ar: "الإنشاءات", en: "Construction" },
  tender_CONSULTING: { ar: "الاستشارات", en: "Consulting" },
  tender_OPERATIONS: { ar: "التشغيل", en: "Operations" },
  tender_MEDICAL: { ar: "الطبي", en: "Medical" },
  tender_GENERAL: { ar: "عام", en: "General" },
  one_click_generate: { ar: "إنشاء بنقرة واحدة", en: "One-Click Generate" },
  download_zip: { ar: "تنزيل الحزمة (ZIP)", en: "Download Package (ZIP)" },

  // Admin
  admin_title: { ar: "لوحة تحكم المسؤول", en: "Admin Control Panel" },
  admin_ai_providers: { ar: "مزودو نماذج الذكاء الاصطناعي", en: "AI Provider & Model Configuration" },
  admin_env: { ar: "إدارة متغيرات البيئة", en: "Environment Variables (.env)" },
  admin_billing: { ar: "الفوترة وإدارة الباقات", en: "Billing & Package Management" },
  admin_security: { ar: "الأمن والتحكم في الوصول", en: "Security & Access Control" },
  admin_audit: { ar: "سجل التدقيق غير القابل للتغيير", en: "Immutable Audit Trail" },
  admin_active_provider: { ar: "المزود النشط", en: "Active Provider" },
  admin_temperature: { ar: "درجة الحرارة", en: "Temperature" },
  admin_max_tokens: { ar: "الحد الأقصى للرموز", en: "Max Tokens" },
  admin_confidence: { ar: "حد الثقة", en: "Confidence Threshold" },
  admin_guardrails: { ar: "الحواجز الأمنية", en: "Safety Guardrails" },
  admin_toxicity: { ar: "تصفية السموم", en: "Toxicity Filter" },
  admin_pii: { ar: "تصفية البيانات الشخصية", en: "PII Filter" },
  admin_hallucination: { ar: "منع الهلوسة", en: "Hallucination Guard" },
  admin_activate: { ar: "تفعيل", en: "Activate" },
  admin_add_provider: { ar: "إضافة مزود", en: "Add Provider" },
  admin_encrypted: { ar: "مشفر AES-256", en: "AES-256 Encrypted" },
  admin_rotate: { ar: "تدوير المفتاح", en: "Rotate Key" },
  admin_reveal: { ar: "إظهار", en: "Reveal" },
  admin_masked: { ar: "مخفي", en: "Masked" },
  admin_plans: { ar: "الباقات", en: "Subscription Plans" },
  admin_usage: { ar: "الاستخدام", en: "Usage" },
  admin_revenue: { ar: "الإيرادات", en: "Revenue" },
  admin_users: { ar: "المستخدمون", en: "Users" },
  admin_roles: { ar: "الأدوار", en: "Roles" },
  admin_role_SUPER_ADMIN: { ar: "مدير عام", en: "Super Admin" },
  admin_role_ADMIN: { ar: "مسؤول", en: "Admin" },
  admin_role_BIDDER: { ar: "مقدم عطاء", en: "Bidder" },
  admin_role_REVIEWER: { ar: "مراجع", en: "Reviewer" },
  admin_role_FINANCE: { ar: "مالية", en: "Finance" },
  admin_quota: { ar: "الحصة", en: "Quota" },
  admin_unlimited: { ar: "غير محدود", en: "Unlimited" },
  admin_per_month: { ar: "/ شهرياً", en: "/ month" },
  admin_per_year: { ar: "/ سنوياً", en: "/ year" },
  admin_audit_action: { ar: "الإجراء", en: "Action" },
  admin_audit_resource: { ar: "المورد", en: "Resource" },
  admin_audit_severity: { ar: "الخطورة", en: "Severity" },
  admin_audit_time: { ar: "الوقت", en: "Timestamp" },
  admin_audit_user: { ar: "المستخدم", en: "User" },
};

export function tr(key: string, locale: Locale): string {
  const entry = t[key];
  if (!entry) return key;
  return entry[locale] ?? entry.en ?? key;
}
