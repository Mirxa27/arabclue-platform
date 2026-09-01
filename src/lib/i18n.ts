import type { Locale } from "./types";
import { VIEW_LABEL_KEYS, type DashboardView } from "./dashboard-routes";

export type TranslationPair = Readonly<{ ar: string; en: string }>;
type Dict = Readonly<Record<string, TranslationPair>>;

/**
 * Canonical bilingual registry. Keep the literal key/value types intact so
 * finite dynamic-key families and error contracts are checked at compile time.
 */
export const localizationRegistry = {
  // Brand
  appName: { ar: "أراب كلاو", en: "Arabclue" },
  appTagline: {
    ar: "أتمتة العطاءات الحكومية السعودية بالذكاء الاصطناعي",
    en: "AI-automated Saudi government tender proposals",
  },

  // Navigation
  nav_dashboard: { ar: "لوحة التحكم", en: "Dashboard" },
  overview_subtitle: {
    ar: "المطلوب الآن على المناقصة النشطة",
    en: "What this tender needs next",
  },
  nav_projects: { ar: "المشاريع", en: "Projects" },
  nav_documents: { ar: "المستندات", en: "Documents" },
  nav_proposals: { ar: "العطاءات", en: "Proposals" },
  nav_compliance: { ar: "الامتثال", en: "Compliance" },
  nav_brand: { ar: "إعداد الحساب", en: "Account Setup" },
  nav_account: { ar: "إعداد الحساب", en: "Account Setup" },
  nav_business_profile: { ar: "ملف الشركة", en: "Business Profile" },
  nav_copilot: { ar: "الوكيل الصوتي", en: "Voice Copilot" },
  nav_setup: { ar: "الإعداد الموجّه", en: "Guided Setup" },

  // Copilot processing view (Mission Control)
  copilot_proc_title: { ar: "حالة المعالجة", en: "Processing status" },
  copilot_proc_idle: {
    ar: "جاهز — أرسل رسالة لبدء التشغيل",
    en: "Ready — send a message to start",
  },
  copilot_proc_queued: {
    ar: "في قائمة الانتظار — جارٍ تجهيز الطلب…",
    en: "Queued — preparing your request…",
  },
  copilot_proc_streaming: {
    ar: "يبث الرد لحظياً…",
    en: "Streaming response…",
  },
  copilot_proc_generating: {
    ar: "يولّد المستندات والمعاينات الحية…",
    en: "Generating documents and live previews…",
  },
  copilot_proc_finalizing: {
    ar: "يُنهي الخطوة ويحفظ النتيجة…",
    en: "Finalizing and saving the result…",
  },
  copilot_proc_completed: {
    ar: "اكتملت المعالجة",
    en: "Processing complete",
  },
  copilot_proc_error: {
    ar: "تعذّرت المعالجة — يمكنك إعادة المحاولة",
    en: "Processing failed — you can retry",
  },
  copilot_proc_error_offline: {
    ar: "انقطع الاتصال أثناء البث — حُفظت المسودة الجزئية",
    en: "Connection lost mid-stream — partial draft preserved",
  },
  copilot_proc_error_timeout: {
    ar: "انتهت المهلة — أوقفنا التشغيل لحماية الجلسة",
    en: "Timed out — the run was stopped to protect the session",
  },
  copilot_proc_cancel: { ar: "إيقاف", en: "Cancel" },
  copilot_proc_retry: { ar: "إعادة المحاولة", en: "Retry" },
  copilot_proc_elapsed: { ar: "الوقت {{time}}", en: "Elapsed {{time}}" },
  copilot_proc_tokens: { ar: "{{count}} رمز", en: "{{count}} tokens" },
  copilot_proc_progress: { ar: "{{pct}}%", en: "{{pct}}%" },
  copilot_proc_preview_empty: {
    ar: "معاينة البث تظهر هنا دون إزاحة للتخطيط",
    en: "Stream preview appears here without layout shift",
  },
  copilot_proc_offline_badge: { ar: "بدون اتصال", en: "Offline" },
  copilot_proc_restored: {
    ar: "استُعيدت مسودة جزئية",
    en: "Restored partial draft",
  },

  nav_agents: { ar: "وكلاء الذكاء", en: "AI Agents" },
  nav_history: { ar: "الإصدارات", en: "Version History" },
  nav_billing: { ar: "الاشتراك والدفع", en: "Billing" },
  nav_reviews: { ar: "المراجعات", en: "Reviews" },
  nav_knowledge_approval: { ar: "اعتماد المعرفة", en: "Knowledge Approval" },
  nav_settings: { ar: "الإعدادات", en: "Settings" },
  status_REVIEWED: { ar: "تمت المراجعة", en: "Reviewed" },
  status_APPROVED: { ar: "معتمد", en: "Approved" },
  status_REJECTED: { ar: "مرفوض", en: "Rejected" },
  nav_admin: { ar: "لوحة الإدارة", en: "Admin Panel" },
  nav_admin_ai: { ar: "مزودو الذكاء", en: "AI Providers" },
  nav_admin_env: { ar: "إدارة البيئة", en: "Environment" },
  nav_admin_billing: { ar: "الفوترة والباقات", en: "Billing & Plans" },
  nav_admin_myfatoorah: { ar: "مي فاتورة", en: "MyFatoorah" },
  nav_admin_security: { ar: "الأمن والصلاحيات", en: "Security & RBAC" },
  nav_admin_audit: { ar: "سجل التدقيق", en: "Audit Trail" },

  // Phase 4: Enhanced Proposal System
  nav_proposal_builder: { ar: "بناء العروض", en: "Proposal Builder" },
  nav_marketplace: { ar: "سوق القوالب", en: "Template Marketplace" },
  nav_analytics: { ar: "التحليلات", en: "Analytics" },
  nav_group_workflow: { ar: "سير العمل", en: "Workflow" },
  nav_group_library: { ar: "المكتبة", en: "Library" },
  nav_group_account: { ar: "الحساب", en: "Account" },
  nav_home_agent: { ar: "الوكيل", en: "Agent" },
  nav_more: { ar: "المزيد", en: "More" },
  workspace_load_error: { ar: "تعذر تحميل مساحة العمل", en: "Could not load workspace" },
  workspace_retry: { ar: "إعادة المحاولة", en: "Retry" },
  nav_expand: { ar: "توسيع", en: "Expand" },
  nav_collapse: { ar: "طي", en: "Collapse" },
  projects_empty_title: { ar: "لا توجد مناقصات بعد", en: "No tenders yet" },
  projects_empty_description: {
    ar: "أنشئ مناقصة لرفع الكراسة وتشغيل الوكلاء وتصدير العرض.",
    en: "Set up a tender so you can upload the RFP, run agents, and export the bid.",
  },
  nav_confirm: { ar: "تأكيد", en: "Confirm" },
  nav_cancel: { ar: "إلغاء", en: "Cancel" },

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
  stat_trend_vs_prior_7d: {
    ar: "مقارنة بآخر 7 أيام (نشاط جديد)",
    en: "vs prior 7 days (new activity)",
  },
  stat_trend_tooltip: {
    ar: "نسبة التغيّر في النشاط الجديد خلال آخر 7 أيام مقارنة بالـ 7 أيام السابقة — لا تعكس الرقم الإجمالي أعلاه",
    en: "Change in new activity over the last 7 days vs the prior 7 days — not the total shown above",
  },

  // File ingestion
  ingest_title: { ar: "أسحب وأفلت ملفات المناقصة هنا", en: "Drag & drop tender files here" },
  ingest_subtitle: {
    ar: "كراسة الشروط، المواصفات الفنية، عقد تقنية المعلومات، متطلبات الامتثال",
    en: "RFP, Technical Specs, IT Contract, EA Compliance requirements",
  },
  ingest_browse: { ar: "تصفح الملفات", en: "Browse Files" },
  ingest_supported: { ar: "الصيغ المدعومة: PDF, DOCX, XLSX, ZIP", en: "Supported: PDF, DOCX, XLSX, ZIP" },

  // Doc categories
  cat_AUTO: { ar: "تلقائي", en: "Auto detect" },
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
  agent_LAW_CONTRACT_name: { ar: "وكيل القانون والعقود", en: "Law & Contract Agent" },
  agent_LAW_CONTRACT_desc: {
    ar: "بحث في أطر الأنظمة السعودية ثم صياغة عقد ثنائي اللغة للمراجعة القانونية",
    en: "Researches Saudi legal frameworks then drafts a bilingual contract for counsel review",
  },

  nav_contracts: { ar: "العقود", en: "Contracts" },
  nav_clause_library: { ar: "مكتبة البنود", en: "Clause Library" },
  nav_template_editor: { ar: "محرر القوالب", en: "Template Editor" },

  // Addressable views
  view_unknown_redirect: { 
    ar: "الصفحة المطلوبة غير موجودة. تم إعادة التوجيه للوحة التحكم.", 
    en: "The requested page was not found. Redirected to dashboard." 
  },

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
  brand_exports_note: {
    ar: "تُطبَّق هذه الهوية على كل تصدير للعروض من هذه المنشأة.",
    en: "This identity is applied to every bid export from this organisation.",
  },
  brand_logo: { ar: "شعار الشركة", en: "Company Logo" },
  brand_primary_color: { ar: "اللون الأساسي", en: "Primary Color" },
  brand_secondary_color: { ar: "اللون الثانوي", en: "Secondary Color" },
  brand_accent_color: { ar: "لون التمييز", en: "Accent Color" },
  brand_tagline: { ar: "الشعار التعريفي", en: "Tagline" },
  brand_past_projects: { ar: "المشاريع السابقة", en: "Past Projects" },

  // Misc
  search_placeholder: { ar: "بحث في المشاريع والمستندات...", en: "Search projects & documents..." },
  dismiss: { ar: "إخفاء", en: "Dismiss" },
  rtl_toggle: { ar: "EN", en: "ع" },
  theme_toggle: { ar: "تبديل المظهر", en: "Toggle theme" },
  theme_switch_to_light: { ar: "التبديل إلى الوضع الفاتح", en: "Switch to light mode" },
  theme_switch_to_dark: { ar: "التبديل إلى الوضع الداكن", en: "Switch to dark mode" },
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
  admin_myfatoorah: { ar: "المدفوعات — مي فاتورة", en: "Payments — MyFatoorah" },
  admin_security: { ar: "الأمن والتحكم في الوصول", en: "Security & Access Control" },
  admin_audit: { ar: "سجل التدقيق", en: "Audit Trail" },
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

  // Auth - error codes
  EMAIL_ALREADY_REGISTERED: { ar: "البريد الإلكتروني مسجل مسبقاً", en: "Email already registered" },
  RESERVED_IDENTITY: {
    ar: "الهوية محجوزة للتطوير وغير مسموحة في الإنتاج",
    en: "Reserved development identity not allowed in production",
  },
  VERIFICATION_TOKEN_INVALID: { ar: "رمز التحقق غير صالح أو منتهي", en: "Verification token invalid or expired" },
  VERIFICATION_EMAIL_UNCONFIGURED: {
    ar: "تم إنشاء الحساب لكن خدمة البريد غير مهيأة — تواصل مع الإدارة",
    en: "Account created but email service is not configured — contact admin",
  },
  // Worded so the answer is identical for a registered, an already-verified and
  // an unknown address — the endpoint must not reveal which one was submitted.
  VERIFICATION_EMAIL_RESEND_ACCEPTED: {
    ar: "إذا كان هذا البريد مسجلاً وغير مؤكد فستصلك رسالة تحقق جديدة",
    en: "If this email is registered and unverified, a new verification message is on the way",
  },
  VERIFICATION_RESEND_INVALID: {
    ar: "البريد الإلكتروني المُدخل غير صالح",
    en: "The submitted email address is invalid",
  },
  EMAIL_VERIFIED: { ar: "تم تأكيد البريد الإلكتروني بنجاح", en: "Email verified successfully" },
  EMAIL_VERIFICATION_REQUIRED: { ar: "تأكيد البريد الإلكتروني مطلوب", en: "Email verification required" },
  // A send that fails after the token is committed still answers with this
  // code (naming the failure would reveal that the address is registered), so
  // the wording has to leave the user a way out instead of an open-ended wait.
  RECOVERY_REQUEST_ACCEPTED: {
    ar: "تم قبول طلب الاستعادة — إذا كان البريد موجوداً ستصلك رسالة خلال دقائق. تحقق من مجلد البريد المزعج، وإن لم تصل فأعد المحاولة أو راسل الدعم",
    en: "Recovery request accepted — if the email exists a message arrives within a few minutes. Check your spam folder, then request again or contact support if nothing arrives",
  },
  RECOVERY_EMAIL_UNCONFIGURED: {
    ar: "خدمة البريد غير مهيأة لاستعادة كلمة المرور",
    en: "Email service not configured for password recovery",
  },
  RECOVERY_TOKEN_INVALID: { ar: "رمز الاستعادة غير صالح أو منتهي", en: "Recovery token invalid or expired" },
  PASSWORD_RESET: { ar: "تمت إعادة تعيين كلمة المرور", en: "Password has been reset" },
  INVITE_FORBIDDEN: {
    ar: "ليس لديك صلاحية لدعوة أعضاء — مالك أو مسؤول فقط",
    en: "You do not have permission to invite — owner or admin only",
  },
  ALREADY_A_MEMBER: { ar: "المستخدم عضو بالفعل في مساحة العمل", en: "User is already a member of the workspace" },
  SEAT_LIMIT_REACHED: { ar: "تم الوصول للحد الأقصى لعدد المقاعد", en: "Seat limit reached" },
  INVITATION_REVOKED: { ar: "تم إلغاء الدعوة", en: "Invitation revoked" },
  INVITATION_TOKEN_INVALID: { ar: "رمز الدعوة غير صالح أو منتهي", en: "Invitation token invalid or expired" },
  INVITATION_EMAIL_MISMATCH: {
    ar: "البريد الإلكتروني للدعوة لا يطابق حسابك",
    en: "Invitation email does not match your account",
  },
  INVITATION_SENT: { ar: "تم إرسال الدعوة", en: "Invitation sent" },
  INVITATION_ACCEPTED: { ar: "تم قبول الدعوة", en: "Invitation accepted" },

  // Auth UI
  auth_register_title: { ar: "إنشاء حساب جديد", en: "Create new account" },
  auth_register_subtitle: { ar: "ابدأ مساحة عملك في ثوان", en: "Start your workspace in seconds" },
  auth_login_title: { ar: "تسجيل الدخول", en: "Sign in" },
  auth_email: { ar: "البريد الإلكتروني", en: "Email" },
  auth_password: { ar: "كلمة المرور", en: "Password" },
  auth_name: { ar: "الاسم الكامل", en: "Full name" },
  auth_workspace_name: { ar: "اسم مساحة العمل", en: "Workspace name" },
  auth_register_btn: { ar: "إنشاء الحساب", en: "Create account" },
  auth_have_account: { ar: "لديك حساب؟", en: "Already have an account?" },
  auth_no_account: { ar: "ليس لديك حساب؟", en: "Don't have an account?" },
  auth_signin_link: { ar: "تسجيل الدخول", en: "Sign in" },
  auth_signup_link: { ar: "إنشاء حساب", en: "Sign up" },
  auth_verifying: { ar: "جاري التحقق...", en: "Verifying..." },
  auth_verify_title: { ar: "تأكيد البريد الإلكتروني", en: "Verify your email" },
  auth_verify_success: { ar: "تم تأكيد البريد، يمكنك تسجيل الدخول الآن", en: "Email verified, you can sign in now" },
  auth_verify_failed: { ar: "فشل التحقق من البريد", en: "Email verification failed" },
  auth_forgot_title: { ar: "استعادة كلمة المرور", en: "Forgot password" },
  auth_forgot_subtitle: { ar: "أدخل بريدك لإرسال رابط الاستعادة", en: "Enter your email to receive a reset link" },
  auth_forgot_btn: { ar: "إرسال رابط الاستعادة", en: "Send reset link" },
  auth_forgot_expiry_hint: {
    ar: "رابط الاستعادة صالح لمدة 60 دقيقة، ويلزم أن يكون البريد مؤكداً",
    en: "The reset link is valid for 60 minutes and requires a verified email",
  },
  auth_reset_title: { ar: "إعادة تعيين كلمة المرور", en: "Reset password" },
  auth_reset_subtitle: {
    ar: "اختر كلمة مرور جديدة بين 10 و 128 حرفاً",
    en: "Choose a new password between 10 and 128 characters",
  },
  auth_reset_btn: { ar: "تعيين كلمة مرور جديدة", en: "Set new password" },
  auth_reset_success: { ar: "تمت إعادة التعيين، سجّل الدخول", en: "Password reset, please sign in" },
  auth_new_password: { ar: "كلمة المرور الجديدة", en: "New password" },
  auth_confirm_password: { ar: "تأكيد كلمة المرور", en: "Confirm password" },
  auth_password_mismatch: {
    ar: "كلمتا المرور غير متطابقتين",
    en: "Passwords do not match",
  },
  auth_reset_token_label: { ar: "رمز الاستعادة", en: "Reset token" },
  auth_reset_token_placeholder: {
    ar: "الصق الرمز من البريد",
    en: "Paste token from email",
  },
  auth_back_to_signin: { ar: "العودة لتسجيل الدخول", en: "Back to sign in" },
  auth_token_required: { ar: "الرمز مطلوب", en: "Token required" },
  auth_invite_title: { ar: "قبول دعوة مساحة العمل", en: "Accept workspace invitation" },
  auth_invite_badge: { ar: "دعوة مساحة عمل", en: "Workspace invitation" },
  auth_invite_subtitle: {
    ar: "الرابط صالح 7 أيام — إذا كنت مسجلاً دخولك، سيتم ربط البريد تلقائياً",
    en: "Link valid 7 days — if signed in, email is matched automatically",
  },
  auth_invite_token_label: { ar: "رمز الدعوة", en: "Invite token" },
  auth_invite_token_placeholder: {
    ar: "الصق رمز الدعوة",
    en: "Paste invite token",
  },
  auth_invite_current_account: { ar: "البريد الحالي", en: "current account" },
  auth_invite_accept_btn: { ar: "قبول الدعوة", en: "Accept invitation" },
  auth_resend_verification: { ar: "إعادة إرسال رسالة التحقق", en: "Resend verification" },
  auth_verify_action: { ar: "تحقق", en: "Verify" },
  auth_verify_paste_hint: {
    ar: "افتح رابط التحقق من بريدك الإلكتروني، أو الصق الرمز هنا:",
    en: "Open the verification link from your email, or paste the token here:",
  },
  auth_verify_token_placeholder: { ar: "الصق رمز التحقق", en: "Paste verification token" },
  auth_verify_redirecting: { ar: "جارٍ تحويلك...", en: "Redirecting you..." },
  auth_network_error: {
    ar: "حدث خطأ في الشبكة، حاول مرة أخرى",
    en: "A network error occurred, please try again",
  },
  auth_register_verify_hint: {
    ar: "باقة STARTER مجانية — يلزم تأكيد البريد قبل الاستخدام",
    en: "Free STARTER plan — email verification required before use",
  },
  auth_register_check_email: {
    ar: "تم إنشاء الحساب! تحقق من بريدك لتأكيد الحساب.",
    en: "Account created! Check your email to verify the account.",
  },
  auth_name_placeholder: { ar: "محمد العتيبي", en: "Mohammed Alotaibi" },
  auth_workspace_placeholder: { ar: "شركة الحلول المتقدمة", en: "Advanced Solutions Co." },
  auth_email_placeholder: { ar: "name@company.sa", en: "name@company.sa" },

  clause_library_title: { ar: "مكتبة البنود المعيارية", en: "Standard Clause Library" },
  clause_library_subtitle: {
    ar: "32 بندًا معياريًا + بنود مخصصة لمساحة العمل — معاينة ثنائية اللغة ومراجعة قانونية مطلوبة",
    en: "32 standard clauses + workspace custom clauses — bilingual preview, counsel review required",
  },
  clause_filter_category: { ar: "تصفية حسب الفئة", en: "Filter by category" },
  clause_filter_mandatory: { ar: "الإلزامية فقط", en: "Mandatory only" },
  clause_filter_search: { ar: "بحث في البنود...", en: "Search clauses..." },
  clause_mandatory_badge: { ar: "إلزامي", en: "Mandatory" },
  clause_optional_badge: { ar: "اختياري", en: "Optional" },
  clause_system_badge: { ar: "نظام", en: "System" },
  clause_custom_badge: { ar: "مخصص", en: "Custom" },
  clause_legal_unreviewed: { ar: "غير مراجع قانونياً", en: "UNREVIEWED" },
  clause_counsel_required: { ar: "يتطلب مراجعة مستشار", en: "Counsel review required" },
  clause_contract_select: { ar: "تحديد للعقد", en: "Select for contract" },
  clause_insert_draft: { ar: "إدراج في المسودة", en: "Insert into draft" },
  clause_inserted: { ar: "تم الإدراج في المسودة النشطة", en: "Inserted into active draft" },
  clause_empty: { ar: "لا توجد بنود مطابقة", en: "No matching clauses" },
  clause_empty_hint: {
    ar: "جرّب تغيير الفئة أو البحث أو أضف بندًا مخصصًا جديدًا",
    en: "Try changing category or search, or add a new custom clause",
  },
  clause_add_custom: { ar: "إضافة بند مخصص", en: "Add custom clause" },
  clause_create_title: { ar: "بند مخصص جديد", en: "New custom clause" },
  clause_field_category: { ar: "الفئة", en: "Category" },
  clause_field_title_en: { ar: "العنوان (إنجليزي)", en: "Title (English)" },
  clause_field_title_ar: { ar: "العنوان (عربي)", en: "Title (Arabic)" },
  clause_field_content_en: { ar: "النص الإنجليزي", en: "English text" },
  clause_field_content_ar: { ar: "النص العربي", en: "Arabic text" },
  clause_save: { ar: "حفظ البند", en: "Save clause" },
  clause_cancel: { ar: "إلغاء", en: "Cancel" },
  clause_translated_both: { ar: "يتطلب نصًا عربيًا وإنجليزيًا", en: "Requires both Arabic and English text" },
  clause_error_translation_missing: {
    ar: "النص العربي والإنجليزي مطلوبان ولا يجوز أن يكونا فارغين",
    en: "Both Arabic and English texts are required and must be non-empty",
  },
  clause_error_unsafe_text: {
    ar: "النص يحتوي على ترميز غير آمن أو رموز تحكم اتجاه النص أو صيغة متغير غير محلولة",
    en: "Text contains unsafe markup, bidi controls, or unresolved token syntax",
  },
  clause_error_not_found: { ar: "البند غير موجود", en: "Clause not found" },
  clause_error_field_invalid: { ar: "بيانات البند غير صالحة", en: "Clause field invalid" },
  clause_error_migration: {
    ar: "ترحيل مخطط البنود قيد الانتظار",
    en: "Clause schema migration pending",
  },
  SCHEMA_MIGRATION_PENDING: {
    ar: "ترحيل قاعدة البيانات قيد الانتظار — يرجى المحاولة لاحقاً",
    en: "Database schema migration pending — please retry",
  },
  CLAUSE_NOT_FOUND: { ar: "البند غير موجود", en: "Clause not found" },
  CLAUSE_TRANSLATION_MISSING: {
    ar: "النص العربي والإنجليزي مطلوبان",
    en: "Arabic and English texts required",
  },
  UNSAFE_CLAUSE_TEXT: {
    ar: "نص البند غير آمن",
    en: "Unsafe clause text",
  },
  CLAUSE_FIELD_INVALID: { ar: "بيانات غير صالحة", en: "Invalid field" },

  metric_proposals_created: { ar: "عروض تم إنشاؤها", en: "Proposals Created" },
  metric_proposals_exported: { ar: "عروض تم تصديرها", en: "Proposals Exported" },
  metric_templates_used: { ar: "قوالب مستخدمة", en: "Templates Used" },
  metric_proposal_views: { ar: "مشاهدات العروض", en: "Proposal Views" },
  metric_agent_runs_completed: { ar: "تشغيلات الوكلاء المكتملة", en: "Agent Runs Completed" },
  metric_agent_runs_failed: { ar: "تشغيلات فاشلة", en: "Failed Runs" },
  metric_agent_median_duration: { ar: "متوسط زمن التشغيل", en: "Median Run Duration" },
  chart_proposalsOverTime: { ar: "العروض عبر الزمن", en: "Proposals Over Time" },
  chart_exportsByType: { ar: "التصدير حسب النوع", en: "Exports by Type" },
  chart_templateUsage: { ar: "استخدام القوالب", en: "Template Usage" },
  chart_sectionCompletion: { ar: "اكتمال الأقسام", en: "Section Completion" },
  chart_axis_date: { ar: "التاريخ", en: "Date" },
  chart_axis_count: { ar: "العدد", en: "Count" },
  chart_axis_category: { ar: "الفئة", en: "Category" },
  analytics_emptyRange: { ar: "لا توجد بيانات للفترة المحددة", en: "No data for the selected period" },
  analytics_emptyDescription: {
    ar: "ابدأ بإنشاء عروض واستخدام القوالب لتظهر الإحصائيات هنا",
    en: "Start creating proposals and using templates to see statistics here",
  },
  analytics_dashboard_title: { ar: "لوحة التحليلات", en: "Analytics Dashboard" },
  analytics_dashboard_subtitle: {
    ar: "إحصائيات إنشاء العروض والقوالب",
    en: "Proposal generation and template usage statistics",
  },
  analytics_no_data: { ar: "لا توجد بيانات", en: "No data" },
  ANALYTICS_DATE_RANGE_REQUIRED: {
    ar: "التواريخ مطلوبة — حدد تاريخ البداية والنهاية",
    en: "Date range required — provide start and end dates",
  },
  ANALYTICS_DATE_INVALID: {
    ar: "صيغة التاريخ غير صالحة",
    en: "Invalid date format",
  },
  ANALYTICS_DATE_RANGE_INVALID: {
    ar: "تاريخ البداية يجب أن يكون قبل تاريخ النهاية",
    en: "Start date must be before end date",
  },
  ANALYTICS_RANGE_TOO_LARGE: {
    ar: "نطاق التاريخ يتجاوز 366 يوماً",
    en: "Date range exceeds 366 days",
  },
  event_proposal_created: { ar: "تم إنشاء العرض", en: "Proposal Created" },
  event_proposal_edited: { ar: "تم تعديل العرض", en: "Proposal Edited" },
  event_proposal_submitted: { ar: "تم تقديم العرض للمراجعة", en: "Proposal Submitted" },
  event_proposal_approved: { ar: "تمت الموافقة على العرض", en: "Proposal Approved" },
  event_proposal_rejected: { ar: "تم رفض العرض", en: "Proposal Rejected" },
  event_proposal_exported: { ar: "تم تصدير العرض", en: "Proposal Exported" },
  event_agent_run_started: { ar: "بدأ تشغيل الوكيل", en: "Agent Run Started" },
  event_agent_run_completed: { ar: "اكتمل تشغيل الوكيل", en: "Agent Run Completed" },
  event_agent_run_failed: { ar: "فشل تشغيل الوكيل", en: "Agent Run Failed" },
  event_agent_run_cancelled: { ar: "تم إلغاء تشغيل الوكيل", en: "Agent Run Cancelled" },
  event_document_uploaded: { ar: "تم رفع المستند", en: "Document Uploaded" },
  event_document_version_created: { ar: "تم إنشاء إصدار مستند", en: "Document Version Created" },
  event_template_used: { ar: "تم استخدام القالب", en: "Template Used" },
  event_section_added: { ar: "تمت إضافة قسم", en: "Section Added" },

  // Contract Template Authoring (Req 6)
  RESERVED_TEMPLATE_KEY: {
    ar: "مفتاح القالب محجوز لقوالب النظام",
    en: "Template key is reserved for system templates",
  },
  INVALID_TEMPLATE_KEY: {
    ar: "مفتاح القالب غير صالح — يجب أن يكون slug بأحرف صغيرة (2-64 حرف)",
    en: "Invalid template key — must be a lowercase slug (2-64 chars)",
  },
  TEMPLATE_KEY_EXISTS: {
    ar: "يوجد قالب بهذا المفتاح بالفعل",
    en: "A template with this key already exists",
  },
  TEMPLATE_NOT_FOUND: {
    ar: "القالب غير موجود",
    en: "Template not found",
  },
  TEMPLATE_VERSION_NOT_FOUND: {
    ar: "إصدار القالب غير موجود",
    en: "Template version not found",
  },
  TEMPLATE_RETIRED: {
    ar: "لا يمكن تحديث قالب متقاعد",
    en: "Cannot update a retired template",
  },
  TEMPLATE_TITLE_REQUIRED: {
    ar: "العنوان العربي والإنجليزي مطلوبان",
    en: "Arabic and English titles are required",
  },
  UNREFERENCED_TEMPLATE_VARIABLE: {
    ar: "المتغير معرّف لكنه غير مستخدم في أقسام القالب",
    en: "Variable is declared but never referenced in template sections",
  },
  UNDECLARED_TEMPLATE_VARIABLE: {
    ar: "المتغير مستخدم في القالب لكنه غير معرّف",
    en: "Variable is referenced in template but not declared",
  },
  INVALID_TEMPLATE_DATA: {
    ar: "بيانات القالب غير صالحة",
    en: "Invalid template data",
  },
  TEMPLATE_CURSOR_NOT_FOUND: {
    ar: "مؤشر القالب غير موجود",
    en: "Template cursor not found",
  },
  VERSION_CURSOR_NOT_FOUND: {
    ar: "مؤشر الإصدار غير موجود",
    en: "Version cursor not found",
  },

  // Contract Version History (Req 7)
  CONTRACT_REVISION_NOT_FOUND: {
    ar: "مراجعة العقد غير موجودة",
    en: "Contract revision not found",
  },
  CONTRACT_REVISION_INTEGRITY_FAILURE: {
    ar: "فشل التحقق من سلامة مراجعة العقد — التجزئة المخزنة لا تتطابق مع التجزئة المحسوبة",
    en: "Contract revision integrity check failed — stored hash does not match computed hash",
  },
  CONTRACT_NOT_FOUND: {
    ar: "العقد غير موجود في مساحة العمل",
    en: "Contract not found in workspace",
  },
  CONTRACT_REVISION_CURSOR_NOT_FOUND: {
    ar: "مؤشر مراجعة العقد غير موجود",
    en: "Contract revision cursor not found",
  },
  CONTRACT_REVISION_COMPARISON_INVALID: {
    ar: "معاملات المقارنة غير صالحة — يجب أن تكون المراجعات مختلفة",
    en: "Invalid comparison parameters — revisions must be different",
  },
  CONTRACT_WORKSPACE_MISMATCH: {
    ar: "العقد لا ينتمي إلى مساحة العمل الحالية",
    en: "Contract does not belong to the current workspace",
  },
  CONTRACT_VERSION_QUERY_INVALID: {
    ar: "معاملات استعلام إصدار العقد غير صالحة",
    en: "Invalid contract version query parameters",
  },
  CONTRACT_REVISION_INVALID: {
    ar: "رقم المراجعة غير صالح",
    en: "Invalid revision number",
  },
  nav_contract_versions: {
    ar: "سجل إصدارات العقد",
    en: "Contract Version History",
  },
  contract_versions_title: {
    ar: "سجل إصدارات العقد",
    en: "Contract Version History",
  },
  contract_versions_subtitle: {
    ar: "عرض ومقارنة مراجعات العقد",
    en: "View and compare contract revisions",
  },
  contract_version_compare: {
    ar: "مقارنة المراجعات",
    en: "Compare Revisions",
  },
  contract_version_view: {
    ar: "عرض المراجعة",
    en: "View Revision",
  },
  contract_diff_added: {
    ar: "مضاف",
    en: "Added",
  },
  contract_diff_removed: {
    ar: "محذوف",
    en: "Removed",
  },
  contract_diff_modified: {
    ar: "معدّل",
    en: "Modified",
  },
  contract_diff_unchanged: {
    ar: "بدون تغيير",
    en: "Unchanged",
  },

  // Structured XLSX Export (Req 8)
  xlsx_sheet_manifest: {
    ar: "البيان",
    en: "Manifest",
  },
  xlsx_sheet_table: {
    ar: "جدول",
    en: "Table",
  },
  xlsx_sheet_kpi: {
    ar: "مؤشرات الأداء",
    en: "KPIs",
  },
  xlsx_sheet_evidence: {
    ar: "سجل الأدلة",
    en: "Evidence Register",
  },
  xlsx_sheet_commercial: {
    ar: "تسليم تجاري",
    en: "Commercial Handoff",
  },
  xlsx_manifest_revision: {
    ar: "مراجعة اللقطة",
    en: "Snapshot Revision",
  },
  xlsx_manifest_hash: {
    ar: "بصمة اللقطة",
    en: "Snapshot Hash",
  },
  xlsx_manifest_plan_hash: {
    ar: "بصمة الخطة",
    en: "Plan Hash",
  },
  xlsx_manifest_preset: {
    ar: "إعداد التخطيط",
    en: "Layout Preset",
  },
  xlsx_manifest_timestamp: {
    ar: "الطابع الزمني للتصدير",
    en: "Export Timestamp",
  },
  xlsx_manifest_not_representable: {
    ar: "كتل غير قابلة للتمثيل",
    en: "Not Representable Blocks",
  },
  xlsx_not_representable_marker: {
    ar: "[غير قابل للتمثيل في صيغة الجدول]",
    en: "[Not representable in spreadsheet format]",
  },

  // Recurring Billing (Req 9)
  recurring_billing_title: {
    ar: "الدفع المتكرر",
    en: "Recurring Billing",
  },
  recurring_billing_subtitle: {
    ar: "إدارة تجديد الاشتراك التلقائي",
    en: "Manage automatic subscription renewal",
  },
  recurring_status_active: {
    ar: "نشط",
    en: "Active",
  },
  recurring_status_canceled: {
    ar: "ملغى",
    en: "Canceled",
  },
  // Platform completion: the four recurring profile states of Requirement 9.
  recurring_state_draft: {
    ar: "مسودة",
    en: "Draft",
  },
  recurring_state_active: {
    ar: "نشط",
    en: "Active",
  },
  recurring_state_suspended: {
    ar: "موقوف",
    en: "Suspended",
  },
  recurring_state_cancelled: {
    ar: "ملغى",
    en: "Cancelled",
  },
  recurring_status_completed: {
    ar: "مكتمل",
    en: "Completed",
  },
  recurring_status_uncompleted: {
    ar: "غير مكتمل",
    en: "Uncompleted",
  },
  recurring_interval_monthly: {
    ar: "شهري",
    en: "Monthly",
  },
  recurring_interval_yearly: {
    ar: "سنوي",
    en: "Yearly",
  },
  recurring_next_charge: {
    ar: "الدفعة القادمة",
    en: "Next charge",
  },
  recurring_last_charge: {
    ar: "آخر دفعة",
    en: "Last charge",
  },
  recurring_cancel_btn: {
    ar: "إلغاء التجديد",
    en: "Cancel renewal",
  },
  recurring_resume_btn: {
    ar: "استئناف التجديد",
    en: "Resume renewal",
  },
  recurring_canceled_success: {
    ar: "تم إلغاء الاشتراك المتكرر",
    en: "Recurring subscription canceled",
  },
  recurring_resumed_success: {
    ar: "تم استئناف الاشتراك المتكرر",
    en: "Recurring subscription resumed",
  },
  recurring_cancel_failed: {
    ar: "فشل إلغاء الاشتراك",
    en: "Failed to cancel subscription",
  },
  recurring_resume_failed: {
    ar: "فشل استئناف الاشتراك",
    en: "Failed to resume subscription",
  },
  recurring_no_profiles: {
    ar: "لا توجد ملفات دفع متكررة",
    en: "No recurring payment profiles",
  },
  recurring_failed_attempts: {
    ar: "محاولة فاشلة",
    en: "failed attempt(s)",
  },
  BILLING_PROVIDER_UNCONFIGURED: {
    ar: "لم يتم تهيئة مزود الفوترة — تواصل مع الإدارة",
    en: "Billing provider is not configured — contact admin",
  },
  RECURRING_PROFILE_NOT_FOUND: {
    ar: "ملف الدفع المتكرر غير موجود",
    en: "Recurring profile not found",
  },
  RECURRING_PROFILE_COMPLETED: {
    ar: "لا يمكن استئناف ملف دفع مكتمل",
    en: "Cannot resume a completed recurring profile",
  },
  MYFATOORAH_CANCEL_FAILED: {
    ar: "فشل إلغاء الدفع المتكرر عبر مي فاتورة",
    en: "Failed to cancel recurring payment with MyFatoorah",
  },
  MYFATOORAH_RESUME_FAILED: {
    ar: "فشل استئناف الدفع المتكرر عبر مي فاتورة",
    en: "Failed to resume recurring payment with MyFatoorah",
  },
  NO_PAYMENT_METHODS: {
    ar: "لا توجد وسائل دفع متاحة للفوترة المتكررة",
    en: "No payment methods available for recurring billing",
  },

  // Payment Reconciliation (Req 10)
  reconcile_title: {
    ar: "تسوية المدفوعات",
    en: "Payment Reconciliation",
  },
  reconcile_subtitle: {
    ar: "فحص ومزامنة حالات الدفع مع مزود الخدمة",
    en: "Check and sync payment states with provider",
  },
  reconcile_fetch_btn: {
    ar: "فحص الآن",
    en: "Fetch Report",
  },
  reconcile_apply_btn: {
    ar: "تطبيق",
    en: "Apply",
  },
  reconcile_no_mismatches: {
    ar: "لا توجد حالات غير متطابقة",
    en: "No state mismatches found",
  },
  reconcile_initial_prompt: {
    ar: "اضغط 'فحص الآن' لمقارنة حالات الدفع المحلية مع المزود",
    en: "Click 'Fetch Report' to compare local payment states with provider",
  },
  reconcile_col_checkout: {
    ar: "رقم العملية",
    en: "Checkout ID",
  },
  reconcile_col_workspace: {
    ar: "المستخدم",
    en: "User",
  },
  reconcile_col_amount: {
    ar: "المبلغ",
    en: "Amount",
  },
  reconcile_col_local_state: {
    ar: "الحالة المحلية",
    en: "Local State",
  },
  reconcile_col_provider_state: {
    ar: "حالة المزود",
    en: "Provider State",
  },
  reconcile_col_created: {
    ar: "تاريخ الإنشاء",
    en: "Created",
  },
  reconcile_col_action: {
    ar: "الإجراء",
    en: "Action",
  },
  reconcile_manual_review: {
    ar: "مراجعة يدوية",
    en: "Manual Review",
  },
  reconcile_already_applied: {
    ar: "تم تطبيق التسوية مسبقاً",
    en: "Reconciliation already applied",
  },
  RECONCILE_ALREADY_APPLIED: {
    ar: "تم تطبيق التسوية مسبقاً",
    en: "Reconciliation already applied",
  },
  reconcile_col_age: {
    ar: "العمر (دقيقة)",
    en: "Age (min)",
  },
  reconcile_col_provider_value: {
    ar: "قيمة المزود",
    en: "Provider Value",
  },
  reconcile_col_provider_currency: {
    ar: "عملة المزود",
    en: "Provider Currency",
  },
  reconcile_col_mismatch: {
    ar: "عدم تطابق",
    en: "Mismatch",
  },
  reconcile_bulk_apply_btn: {
    ar: "تطبيق الكل",
    en: "Apply All",
  },
  reconcile_apply_selected_btn: {
    ar: "تطبيق المحدد",
    en: "Apply Selected",
  },
  reconcile_select_all: {
    ar: "تحديد الكل",
    en: "Select All",
  },
  reconcile_selected_count: {
    ar: "{{count}} محدد",
    en: "{{count}} selected",
  },
  reconcile_bulk_results: {
    ar: "تطبيق: {{applied}}، أخطاء: {{errors}}، مُطبّقة مسبقاً: {{already}}",
    en: "Applied: {{applied}}, Errors: {{errors}}, Already applied: {{already}}",
  },
  reconcile_total_pending: {
    ar: "إجمالي المعلّق: {{count}}",
    en: "Total pending: {{count}}",
  },
  reconcile_next_page: {
    ar: "الصفحة التالية",
    en: "Next Page",
  },
  reconcile_amount_mismatch: {
    ar: "عدم تطابق المبلغ",
    en: "Amount mismatch",
  },
  reconcile_yes: { ar: "نعم", en: "Yes" },
  reconcile_no: { ar: "لا", en: "No" },
  reconcile_provider_timeout: {
    ar: "انتهت مهلة المزود",
    en: "Provider timeout",
  },
  reconcile_unresolved_preserved: {
    ar: "العمليات غير المحلومة محفوظة",
    en: "Unresolved items preserved",
  },
  reconcile_rows_updated: {
    ar: "تم تحديث الصفوف",
    en: "Rows updated",
  },
  reconcile_apply_all_success: {
    ar: "تم تطبيق التسوية على {{count}} عملية",
    en: "Reconciliation applied to {{count}} checkout(s)",
  },
  reconcile_confirm_apply_all: {
    ar: "هل تريد تطبيق التسوية على جميع العناصر المتطابقة؟",
    en: "Apply reconciliation to all matching items?",
  },
  reconcile_confirm_apply_selected: {
    ar: "هل تريد تطبيق التسوية على {{count}} عنصر محدد؟",
    en: "Apply reconciliation to {{count}} selected item(s)?",
  },
  reconcile_provider_not_paid: {
    ar: "حالة المزود ليست مدفوع",
    en: "Provider state is not PAID",
  },
  reconcile_checkout_not_found: {
    ar: "العملية غير موجودة",
    en: "Checkout not found",
  },
  reconcile_no_invoice_id: {
    ar: "لا يوجد معرف فاتورة للتحقق",
    en: "No invoice ID to verify",
  },
  reconcile_apply_success_single: {
    ar: "تم تطبيق التسوية على العملية {{checkoutId}}",
    en: "Reconciliation applied to checkout {{checkoutId}}",
  },
  reconcile_bulk_apply_success: {
    ar: "تم تطبيق التسوية المجمعة بنجاح",
    en: "Bulk reconciliation applied successfully",
  },
  reconcile_bulk_apply_error: {
    ar: "فشل تطبيق التسوية المجمعة",
    en: "Failed to apply bulk reconciliation",
  },
  reconcile_apply_error: {
    ar: "فشل تطبيق التسوية على العملية {{checkoutId}}",
    en: "Failed to apply reconciliation to checkout {{checkoutId}}",
  },
  reconcile_provider_unresolved_msg: {
    ar: "تعذر حسم حالة المزود",
    en: "Provider state unresolved",
  },
  reconcile_provider_mismatch_msg: {
    ar: "بيانات المزود لا تطابق",
    en: "Provider data mismatch",
  },
  reconcile_already_applied_msg: {
    ar: "تم تطبيق التسوية مسبقاً",
    en: "Reconciliation already applied",
  },
  reconcile_loading_report: {
    ar: "جارٍ تحميل تقرير التسوية",
    en: "Loading reconciliation report",
  },
  reconcile_applying: {
    ar: "جارٍ التطبيق",
    en: "Applying",
  },
  reconcile_applying_bulk: {
    ar: "جارٍ تطبيق التسوية على {{count}} عملية",
    en: "Applying reconciliation to {{count}} checkout(s)",
  },
  reconcile_empty_hint: {
    ar: "لا توجد عمليات دفع معلّقة تحتاج تسوية",
    en: "No pending checkouts require reconciliation",
  },
  reconcile_provider_error: {
    ar: "خطأ في الاتصال بالمزود",
    en: "Provider connection error",
  },
  reconcile_unconfigured_msg: {
    ar: "مزود الفوترة غير مُهيأ",
    en: "Provider Not Configured",
  },
  reconcile_error_msg: {
    ar: "خطأ",
    en: "Error",
  },
  reconcile_last_checked: {
    ar: "آخر فحص:",
    en: "Last checked:",
  },
  reconcile_scanned_label: {
    ar: "{{count}} عملية تم فحصها",
    en: "{{count}} checkout(s) scanned",
  },
  reconcile_of_label: {
    ar: "من",
    en: "of",
  },
  reconcile_state_mismatch: {
    ar: "عدم تطابق",
    en: "Mismatch",
  },
  reconcile_none_label: {
    ar: "—",
    en: "—",
  },

  // Knowledge Approval Queue (Req 11)
  knowledge_approval_subtitle: {
    ar: "اعتماد أو رفض سجلات الشهادات والمشاريع السابقة والمنهجيات ومكتبة المحتوى",
    en: "Approve or reject certificates, past projects, methodologies, and content library items",
  },
  knowledge_approval_empty: {
    ar: "لا توجد سجلات بانتظار الاعتماد",
    en: "No records pending approval",
  },
  knowledge_approval_empty_desc: {
    ar: "تم اعتماد جميع سجلات المعرفة",
    en: "All knowledge records have been reviewed",
  },
  knowledge_record_certificate: {
    ar: "شهادة",
    en: "Certificate",
  },
  knowledge_record_past_project: {
    ar: "مشروع سابق",
    en: "Past Project",
  },
  knowledge_record_methodology: {
    ar: "منهجية",
    en: "Methodology",
  },
  knowledge_record_library: {
    ar: "مكتبة المحتوى",
    en: "Content Library",
  },
  knowledge_evidence_select: {
    ar: "اختر مستند الدليل",
    en: "Select evidence document",
  },
  knowledge_rejection_reason: {
    ar: "سبب الرفض",
    en: "Rejection reason",
  },
  knowledge_approve_btn: {
    ar: "اعتماد",
    en: "Approve",
  },
  knowledge_reject_btn: {
    ar: "رفض",
    en: "Reject",
  },
  knowledge_approved: {
    ar: "تم اعتماد السجل",
    en: "Record approved",
  },
  knowledge_rejected: {
    ar: "تم رفض السجل",
    en: "Record rejected",
  },
  knowledge_expiry_soon: {
    ar: "ينتهي قريباً",
    en: "Expiring Soon",
  },
  knowledge_expired: {
    ar: "منتهي",
    en: "Expired",
  },
  APPROVAL_FORBIDDEN: {
    ar: "ليس لديك صلاحية اعتماد السجلات",
    en: "You do not have approval authority",
  },
  EVIDENCE_VERSION_MISSING: {
    ar: "مستند الدليل يفتقر إلى checksum — ارفع إصداراً جديداً",
    en: "Evidence document version is missing checksum — upload a new version",
  },
  // Wider than EVIDENCE_VERSION_MISSING on purpose: the resolver refuses a
  // pointer for four reasons — no such document, another workspace's document,
  // no checksum, or a reference that contradicts the provenance — and the
  // reader's next move is the same for all four.
  KNOWLEDGE_EVIDENCE_INVALID: {
    ar: "يتطلب الاعتماد مستند دليل من مساحة العمل هذه يحمل checksum",
    en: "Approval requires a checksummed evidence document from this workspace",
  },
  KNOWLEDGE_REVOCATION_INVALID: {
    ar: "يتطلب الإلغاء سجلاً معتمداً حالياً مع ذكر السبب",
    en: "Revocation requires currently approved evidence and a reason",
  },

  // Collaboration Comments (Req 12)
  COMMENT_EDIT_FORBIDDEN: {
    ar: "لا يمكنك تحرير تعليق شخص آخر",
    en: "Only the comment author can edit",
  },
  COMMENT_RESOLVED: {
    ar: "لا يمكن تحرير تعليق محلول",
    en: "Cannot edit a resolved comment",
  },
  COMMENT_DELETE_FORBIDDEN: {
    ar: "ليس لديك صلاحية حذف هذا التعليق",
    en: "You do not have permission to delete this comment",
  },
  comment_edited: {
    ar: "تم التحرير",
    en: "edited",
  },
  comment_withdrawn: {
    ar: "محذوف",
    en: "Withdrawn",
  },
  comment_deleted_placeholder: {
    ar: "[تم حذف هذا التعليق]",
    en: "[This comment has been deleted]",
  },
  comment_reply_deleted_placeholder: {
    ar: "[تم حذف هذا الرد]",
    en: "[This reply has been deleted]",
  },
  comment_edit_btn: {
    ar: "تحرير",
    en: "Edit",
  },
  comment_delete_btn: {
    ar: "حذف",
    en: "Delete",
  },
  comment_delete_title: {
    ar: "حذف التعليق",
    en: "Delete Comment",
  },
  comment_delete_description: {
    ar: "هل أنت متأكد من حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء.",
    en: "Are you sure you want to delete this comment? This action cannot be undone.",
  },
  comment_updated: {
    ar: "تم تحديث التعليق",
    en: "Comment updated",
  },
  comment_deleted: {
    ar: "تم حذف التعليق",
    en: "Comment deleted",
  },
  comment_editing: {
    ar: "تحرير التعليق",
    en: "Editing comment",
  },
  comment_empty_title: {
    ar: "لا توجد تعليقات بعد",
    en: "No comments yet",
  },
  comments_load_failed: {
    ar: "تعذر تحميل التعليقات",
    en: "Unable to load comments",
  },
  comments_unavailable_schema: {
    ar: "التعليقات غير متاحة على قاعدة البيانات الحالية بعد",
    en: "Collaboration comments are not available on this database yet.",
  },
  presence_online: {
    ar: "متصل",
    en: "online",
  },

  // Version History (Req 13)
  version_history_subtitle: {
    ar: "سجل إصدارات المستندات والعروض",
    en: "Document and proposal version timeline",
  },
  version_current: {
    ar: "الإصدار الحالي",
    en: "Current version",
  },
  version_previous: {
    ar: "إصدار سابق",
    en: "Previous version",
  },
  version_load_more: {
    ar: "تحميل المزيد",
    en: "Load more",
  },
  version_collapse: {
    ar: "طي",
    en: "Collapse",
  },
  version_all: {
    ar: "كل الإصدارات",
    en: "All versions",
  },
  version_search_placeholder: {
    ar: "بحث بالاسم...",
    en: "Search by name...",
  },
  version_history_empty_title: {
    ar: "لا يوجد سجل إصدارات بعد",
    en: "No version history yet",
  },
  version_history_empty_description: {
    ar: "ارفع مستندات أو أنشئ عروضاً لتتبع الإصدارات هنا.",
    en: "Upload documents or create proposals to track versions here.",
  },
  documents_matrix_empty_title: {
    ar: "لا توجد مستندات بعد",
    en: "No documents yet",
  },
  documents_matrix_empty_description: {
    ar: "ارفع مستندات المناقصة أو افتح مشروعاً نشطاً.",
    en: "Upload tender documents or open an active project.",
  },
  agent_run_history_empty_title: {
    ar: "لا توجد تشغيلات بعد",
    en: "No runs yet",
  },
  agent_run_history_empty_description: {
    ar: "ارفع مستندات المناقصة ثم شغّل الوكلاء من مشروع نشط.",
    en: "Upload tender documents, then start agents from an active project.",
  },
  agent_run_start_action: {
    ar: "تشغيل الوكلاء",
    en: "Start agents",
  },
  agent_run_upload_docs_action: {
    ar: "رفع المستندات",
    en: "Upload documents",
  },
  version_load_failed: {
    ar: "تعذر تحميل الإصدارات",
    en: "Failed to load versions",
  },
  version_reverted: {
    ar: "تم الاسترجاع بنجاح",
    en: "Successfully reverted",
  },
  version_revert_failed: {
    ar: "فشل الاسترجاع",
    en: "Revert failed",
  },
  version_no_diff: {
    ar: "لا توجد فروقات",
    en: "No differences found",
  },
  VERSION_NOT_FOUND: {
    ar: "الإصدار غير موجود",
    en: "Version not found",
  },

  // Template Marketplace Lifecycle (Req 15)
  MARKETPLACE_TRANSLATION_MISSING: {
    ar: "العنوان والوصف بالعربية والإنجليزية مطلوبان",
    en: "Arabic and English title and description are required",
  },
  MARKETPLACE_SECTION_REQUIRED: {
    ar: "يجب تحديد قسم واحد على الأقل",
    en: "At least one section type is required",
  },
  MARKETPLACE_ENTRY_RETIRED: {
    ar: "تم إيقاف هذا القالب من السوق",
    en: "This template has been retired from the marketplace",
  },
  MARKETPLACE_RETIRE_FORBIDDEN: {
    ar: "لا يمكنك إيقاف قالب لا ينتمي لمساحة عملك",
    en: "You cannot retire a template from another workspace",
  },
  MARKETPLACE_RATING_INVALID: {
    ar: "التقييم يجب أن يكون رقمًا صحيحًا بين 1 و 5",
    en: "Rating must be an integer between 1 and 5",
  },
  marketplace_rating_label: {
    ar: "التقييم",
    en: "Rating",
  },
  marketplace_rating_count: {
    ar: "تقييمات",
    en: "ratings",
  },
  marketplace_usage_count: {
    ar: "استخدام",
    en: "uses",
  },
  marketplace_retired_badge: {
    ar: "متقاعد",
    en: "Retired",
  },
  marketplace_rate_btn: {
    ar: "تقييم",
    en: "Rate",
  },
  marketplace_your_rating: {
    ar: "تقييمك",
    en: "Your rating",
  },
  marketplace_avg_rating: {
    ar: "متوسط التقييم",
    en: "Average rating",
  },
  marketplace_rating_1: {
    ar: "ضعيف",
    en: "Poor",
  },
  marketplace_rating_2: {
    ar: "مقبول",
    en: "Fair",
  },
  marketplace_rating_3: {
    ar: "جيد",
    en: "Good",
  },
  marketplace_rating_4: {
    ar: "جيد جدًا",
    en: "Very Good",
  },
  marketplace_rating_5: {
    ar: "ممتاز",
    en: "Excellent",
  },

  // ─── Transactional Notification Templates (Req 17) ────────────────────────

  notification_review_requested_subject: {
    ar: "طلب مراجعة عرض جديد",
    en: "New Proposal Review Request",
  },
  notification_review_requested_body: {
    ar: "تم تقديم عرض \"{{proposalTitle}}\" للمراجعة في مشروع \"{{projectTitle}}\". يرجى مراجعة العرض واتخاذ القرار المناسب.",
    en: "Proposal \"{{proposalTitle}}\" has been submitted for review in project \"{{projectTitle}}\". Please review and make your decision.",
  },
  notification_review_decision_subject: {
    ar: "قرار مراجعة العرض",
    en: "Proposal Review Decision",
  },
  notification_review_decision_body: {
    ar: "تم اتخاذ قرار بشأن عرضك \"{{proposalTitle}}\": {{decision}}",
    en: "A decision has been made on your proposal \"{{proposalTitle}}\": {{decision}}",
  },
  notification_subscription_past_due_subject: {
    ar: "تنبيه: مشكلة في الاشتراك",
    en: "Alert: Subscription Payment Issue",
  },
  notification_subscription_past_due_body: {
    ar: "لم نتمكن من تحصيل دفعة الاشتراك. يرجى تحديث معلومات الدفع لتجنب انقطاع الخدمة.",
    en: "We were unable to process your subscription payment. Please update your payment information to avoid service interruption.",
  },

  // Platform completion: account and invitation surfaces
  account_registration_success: { ar: "تم إنشاء الحساب ومساحة العمل بنجاح", en: "Account and workspace created successfully" },
  account_verification_pending: { ar: "تحقق من بريدك الإلكتروني لإكمال تفعيل الحساب", en: "Check your email to finish activating the account" },
  account_recovery_confirmation: { ar: "إذا كان الحساب مؤهلاً فستصلك رسالة استعادة", en: "If the account is eligible, a recovery message will be sent" },
  account_delivery_sent: { ar: "تم إرسال الرسالة إلى {{email}}", en: "Message sent to {{email}}" },
  account_delivery_unconfigured: { ar: "تم حفظ الطلب، لكن خدمة البريد غير مهيأة", en: "The request was saved, but email delivery is not configured" },
  account_delivery_failed: { ar: "تم حفظ الطلب، لكن تعذر إرسال الرسالة", en: "The request was saved, but the message could not be sent" },
  account_verification_email_subject: { ar: "أكد بريدك الإلكتروني في أراب كلاو", en: "Confirm your Arabclue email address" },
  account_verification_email_heading: { ar: "تأكيد البريد الإلكتروني", en: "Email address confirmation" },
  account_verification_email_intro: { ar: "تم إنشاء مساحة العمل {{workspaceName}} وبانتظار تأكيد بريدك الإلكتروني.", en: "Workspace {{workspaceName}} was created and is waiting for your email confirmation." },
  account_verification_email_action: { ar: "تأكيد البريد الإلكتروني", en: "Confirm email address" },
  account_verification_email_expiry: { ar: "ينتهي رابط التأكيد بعد {{hours}} ساعة من إنشائه.", en: "The confirmation link expires {{hours}} hours after it was created." },
  account_verification_email_ignore: { ar: "إذا لم تطلب إنشاء هذا الحساب فتجاهل هذه الرسالة.", en: "If you did not request this account, ignore this message." },
  account_password_requirements: { ar: "استخدم كلمة مرور من {{min}} إلى {{max}} حرفاً", en: "Use a password between {{min}} and {{max}} characters" },
  account_field_error: { ar: "راجع الحقل: {{field}}", en: "Review the field: {{field}}" },
  invitation_list_title: { ar: "الدعوات المعلقة", en: "Pending invitations" },
  invitation_list_empty: { ar: "لا توجد دعوات معلقة", en: "No pending invitations" },
  invitation_field_email: { ar: "البريد الإلكتروني للمدعو", en: "Invitee email" },
  invitation_field_role: { ar: "دور العضو", en: "Member role" },
  invitation_field_inviter: { ar: "أرسلها", en: "Invited by" },
  invitation_field_expires: { ar: "تنتهي في", en: "Expires at" },
  invitation_revoke_action: { ar: "إلغاء الدعوة", en: "Revoke invitation" },
  invitation_accept_success: { ar: "تم الانضمام إلى مساحة العمل بدور {{role}}", en: "Joined the workspace with role {{role}}" },
  invitation_delivery_pending: { ar: "بانتظار الإرسال", en: "Pending delivery" },
  invitation_delivery_sent: { ar: "تم الإرسال", en: "Sent" },
  invitation_delivery_unconfigured: { ar: "خدمة البريد غير مهيأة", en: "Email not configured" },
  invitation_delivery_failed: { ar: "فشل الإرسال", en: "Delivery failed" },
  invitation_email_subject: { ar: "دعوة للانضمام إلى مساحة عمل في أراب كلاو", en: "Invitation to join an Arabclue workspace" },
  invitation_email_heading: { ar: "دعوة مساحة عمل", en: "Workspace invitation" },
  invitation_email_intro: { ar: "تمت دعوتك للانضمام إلى مساحة العمل {{workspaceName}} بدور {{role}}.", en: "You have been invited to join workspace {{workspaceName}} with the role {{role}}." },
  invitation_email_action: { ar: "قبول الدعوة", en: "Accept the invitation" },
  invitation_email_expiry: { ar: "ينتهي رابط الدعوة بعد {{days}} أيام من إنشائه.", en: "The invitation link expires {{days}} days after it was created." },
  invitation_email_ignore: { ar: "إذا لم تكن تتوقع هذه الدعوة فتجاهل هذه الرسالة.", en: "If you did not expect this invitation, ignore this message." },

  // Platform completion: analytics, clauses, templates, and contracts
  analytics_range_start: { ar: "بداية الفترة", en: "Range start" },
  analytics_range_end: { ar: "نهاية الفترة", en: "Range end" },
  analytics_previous_period: { ar: "مقارنة بالفترة السابقة", en: "Compared with previous period" },
  analytics_median_unavailable: { ar: "المدة الوسيطة غير متاحة", en: "Median duration unavailable" },
  analytics_unit_count: { ar: "حدث", en: "events" },
  analytics_unit_milliseconds: { ar: "مللي ثانية", en: "milliseconds" },
  analytics_loading: { ar: "جارٍ تحميل التحليلات", en: "Loading analytics" },
  analytics_load_failed: { ar: "تعذر تحميل التحليلات", en: "Unable to load analytics" },
  clause_loading: { ar: "جارٍ تحميل مكتبة البنود", en: "Loading clause library" },
  clause_load_failed: { ar: "تعذر تحميل مكتبة البنود", en: "Unable to load clause library" },
  clause_create_failed: { ar: "تعذر حفظ البند المخصص", en: "Unable to save the custom clause" },
  clause_selection_limit: { ar: "يمكن تحديد {{max}} بنداً كحد أقصى", en: "You can select at most {{max}} clauses" },
  clause_detail_title: { ar: "تفاصيل البند", en: "Clause details" },
  template_editor_title: { ar: "محرر قوالب العقود", en: "Contract template editor" },
  template_create_action: { ar: "إنشاء قالب", en: "Create template" },
  template_update_action: { ar: "حفظ إصدار جديد", en: "Save new version" },
  template_retire_action: { ar: "إيقاف القالب", en: "Retire template" },
  template_section_title: { ar: "أقسام القالب", en: "Template sections" },
  template_variable_title: { ar: "متغيرات القالب", en: "Template variables" },
  template_clause_bindings: { ar: "البنود المرتبطة", en: "Bound clauses" },
  template_preview_title: { ar: "معاينة القالب", en: "Template preview" },
  template_history_title: { ar: "سجل إصدارات القالب", en: "Template version history" },
  template_version_number: { ar: "الإصدار {{version}}", en: "Version {{version}}" },
  template_current_badge: { ar: "الإصدار الحالي", en: "Current version" },
  template_non_executable_badge: { ar: "غير قابل للتنفيذ", en: "Non-executable" },
  contract_history_empty: { ar: "لا توجد مراجعات عقد مسجلة", en: "No contract revisions have been recorded" },
  contract_revision_number: { ar: "المراجعة {{revision}}", en: "Revision {{revision}}" },
  contract_revision_author: { ar: "أنشأها {{author}}", en: "Created by {{author}}" },
  contract_revision_created_at: { ar: "وقت الإنشاء: {{timestamp}}", en: "Created at: {{timestamp}}" },
  contract_compare_from: { ar: "المراجعة الأساسية", en: "Base revision" },
  contract_compare_to: { ar: "المراجعة المقارنة", en: "Compared revision" },
  contract_integrity_badge: { ar: "تم التحقق من السلامة", en: "Integrity verified" },
  contract_integrity_failed: { ar: "تعذر عرض المراجعة بسبب فشل التحقق من سلامتها", en: "The revision cannot be shown because its integrity check failed" },

  // Platform completion: XLSX, recurring billing, and reconciliation
  xlsx_manifest_locale: { ar: "لغة المصنف", en: "Workbook locale" },
  xlsx_manifest_block_key: { ar: "مفتاح الكتلة", en: "Block key" },
  xlsx_manifest_block_type: { ar: "نوع الكتلة", en: "Block type" },
  xlsx_manifest_marker_ar: { ar: "العلامة العربية", en: "Arabic marker" },
  xlsx_manifest_marker_en: { ar: "العلامة الإنجليزية", en: "English marker" },
  xlsx_not_available: { ar: "غير متاح", en: "Not available" },
  xlsx_export_action: { ar: "تنزيل ملف XLSX", en: "Download XLSX file" },
  xlsx_export_blocked: { ar: "تم حظر تصدير XLSX حتى تُحل أخطاء التحقق", en: "XLSX export is blocked until validation errors are resolved" },
  xlsx_manifest_field: { ar: "الحقل", en: "Field" },
  xlsx_manifest_value: { ar: "القيمة", en: "Value" },
  xlsx_manifest_module_key: { ar: "مفتاح القسم", en: "Module key" },
  xlsx_sheet_block_fallback: { ar: "كتلة {{index}}", en: "Block {{index}}" },
  xlsx_col_kpi_label: { ar: "تسمية مؤشر الأداء", en: "KPI label" },
  xlsx_col_kpi_value: { ar: "القيمة المخزنة", en: "Stored value" },
  xlsx_col_kpi_unit: { ar: "الوحدة", en: "Unit" },
  xlsx_col_kpi_as_of: { ar: "تاريخ القيمة", en: "As of" },
  xlsx_col_evidence_label: { ar: "بند الدليل", en: "Evidence entry" },
  xlsx_col_evidence_status: { ar: "حالة الدليل", en: "Evidence status" },
  xlsx_col_source_refs: { ar: "مراجع المصادر", en: "Source references" },
  xlsx_col_commercial_description: { ar: "وصف البند التجاري", en: "Commercial entry description" },
  xlsx_col_commercial_amount: { ar: "المبلغ المخزن كما هو", en: "Stored amount as recorded" },
  xlsx_col_commercial_currency: { ar: "العملة المخزنة كما هي", en: "Stored currency as recorded" },
  xlsx_attr_module_title: { ar: "عنوان القسم", en: "Module title" },
  xlsx_attr_block_title: { ar: "عنوان الكتلة", en: "Block title" },
  xlsx_attr_pricing_status: { ar: "حالة التسعير", en: "Pricing status" },
  xlsx_attr_commercial_instruction: { ar: "تعليمات التسليم التجاري", en: "Commercial handoff instruction" },
  xlsx_block_type_narrative: { ar: "نص سردي", en: "Narrative" },
  xlsx_block_type_bullet_list: { ar: "قائمة نقطية", en: "Bullet list" },
  xlsx_block_type_diagram: { ar: "رسم توضيحي", en: "Diagram" },
  xlsx_block_type_table: { ar: "جدول بيانات", en: "Data table" },
  xlsx_block_type_kpi: { ar: "مؤشر أداء", en: "KPI" },
  xlsx_block_type_evidence_register: { ar: "سجل أدلة", en: "Evidence register" },
  xlsx_block_type_commercial_handoff: { ar: "تسليم تجاري", en: "Commercial handoff" },
  evidence_status_verified: { ar: "موثق", en: "Verified" },
  evidence_status_pending: { ar: "قيد الانتظار", en: "Pending" },
  evidence_status_not_available: { ar: "غير متاح", en: "Not available" },
  pricing_status_user_entry_required: { ar: "يلزم إدخال المستخدم", en: "User entry required" },
  pricing_status_verified_source_values: { ar: "قيم مصادر موثقة", en: "Verified source values" },
  recurring_status_draft: { ar: "مسودة", en: "Draft" },
  recurring_status_suspended: { ar: "معلّق", en: "Suspended" },
  recurring_status_cancelled: { ar: "ملغى", en: "Cancelled" },
  recurring_profile_amount: { ar: "المبلغ المخزن", en: "Stored amount" },
  recurring_profile_currency: { ar: "العملة المخزنة", en: "Stored currency" },
  recurring_profile_interval_days: { ar: "فاصل التجديد: {{days}} يوماً", en: "Renewal interval: {{days}} days" },
  recurring_profile_state: { ar: "حالة التجديد", en: "Renewal state" },
  recurring_start_action: { ar: "بدء التجديد التلقائي", en: "Start automatic renewal" },
  recurring_single_cycle_action: { ar: "المتابعة بدفعة واحدة", en: "Continue with a single-cycle payment" },
  recurring_empty_action: { ar: "اختر باقة شهرية أو سنوية لبدء التجديد", en: "Choose a monthly or yearly plan to start renewal" },
  reconcile_col_currency: { ar: "العملة", en: "Currency" },
  reconcile_summary_scanned: { ar: "تم فحص {{count}} عملية", en: "Scanned {{count}} checkouts" },
  reconcile_summary_paid: { ar: "تمت تسوية {{count}} عملية كمدفوعة", en: "Reconciled {{count}} checkouts as paid" },
  reconcile_summary_failed: { ar: "تمت تسوية {{count}} عملية كفاشلة", en: "Reconciled {{count}} checkouts as failed" },
  reconcile_summary_unresolved: { ar: "بقيت {{count}} عملية دون حسم", en: "Left {{count}} checkouts unresolved" },
  reconcile_loading: { ar: "جارٍ التحقق من حالات الدفع", en: "Checking payment states" },
  reconcile_load_failed: { ar: "تعذر تحميل تقرير التسوية", en: "Unable to load the reconciliation report" },
  reconcile_apply_success: { ar: "تم تطبيق التسوية على العملية {{checkoutId}}", en: "Reconciliation applied to checkout {{checkoutId}}" },

  // Platform completion: knowledge, comments, and presence
  knowledge_approval_title: { ar: "قائمة اعتماد المعرفة", en: "Knowledge approval queue" },
  knowledge_record_staff: { ar: "عضو فريق", en: "Staff member" },
  knowledge_col_type: { ar: "نوع السجل", en: "Record type" },
  knowledge_col_title: { ar: "العنوان", en: "Title" },
  knowledge_col_submitter: { ar: "مقدم السجل", en: "Submitted by" },
  knowledge_col_submitted_at: { ar: "وقت التقديم", en: "Submitted at" },
  knowledge_col_expiry: { ar: "تاريخ الانتهاء", en: "Expiry date" },
  knowledge_col_evidence: { ar: "مستند الدليل", en: "Evidence document" },
  knowledge_no_expiry: { ar: "لا يوجد تاريخ انتهاء", en: "No expiry date" },
  knowledge_no_evidence: { ar: "لا يوجد دليل مرفق", en: "No evidence attached" },
  knowledge_pending_count: { ar: "{{count}} سجل بانتظار الاعتماد", en: "{{count}} records pending approval" },
  knowledge_decision_conflict: { ar: "سُجل القرار مسبقاً بالحالة {{status}}", en: "A decision was already recorded with status {{status}}" },
  comment_edited_at: { ar: "تم التحرير في {{timestamp}}", en: "Edited at {{timestamp}}" },
  comment_content_hint: { ar: "اكتب تعليقاً من {{min}} إلى {{max}} حرفاً", en: "Write a comment between {{min}} and {{max}} characters" },
  comment_save_edit: { ar: "حفظ التعديل", en: "Save edit" },
  comment_cancel_edit: { ar: "إلغاء التعديل", en: "Cancel edit" },
  comment_delete_confirm: { ar: "تأكيد حذف التعليق", en: "Confirm comment deletion" },
  presence_viewers_count: { ar: "{{count}} مشاهد متصل", en: "{{count}} viewers online" },
  presence_total_count: { ar: "إجمالي المشاهدين: {{count}}", en: "Total viewers: {{count}}" },
  presence_last_heartbeat: { ar: "آخر نشاط: {{timestamp}}", en: "Last active: {{timestamp}}" },
  presence_offline: { ar: "غير متصل", en: "Offline" },
  presence_stream_failed: { ar: "تعذر تحديث قائمة المشاهدين", en: "Unable to update the viewer list" },

  // Platform completion: full history and canonical routing
  proposal_history_title: { ar: "سجل إصدارات العرض", en: "Proposal version history" },
  document_history_title: { ar: "سجل إصدارات المستند", en: "Document version history" },
  history_revision_label: { ar: "المراجعة {{revision}}", en: "Revision {{revision}}" },
  history_change_log: { ar: "سجل التغيير", en: "Change log" },
  history_author: { ar: "المؤلف", en: "Author" },
  history_created_at: { ar: "تاريخ الإنشاء", en: "Created at" },
  history_oldest_reached: { ar: "تم الوصول إلى أقدم مراجعة", en: "Oldest revision reached" },
  history_revert_confirm: { ar: "هل تريد إنشاء مراجعة جديدة من المراجعة {{revision}}؟", en: "Create a new revision from revision {{revision}}?" },
  routing_unknown_notice: { ar: "المسار المطلوب غير موجود؛ تم فتح لوحة التحكم", en: "The requested route does not exist; the dashboard was opened" },
  routing_forbidden_notice: { ar: "لا يسمح دورك بفتح هذا المسار", en: "Your role is not permitted to open this route" },
  routing_project_unavailable_notice: { ar: "المشروع المطلوب غير متاح في مساحة العمل", en: "The requested project is unavailable in this workspace" },
  routing_project_required_notice: { ar: "اختر مشروعاً قبل فتح هذه الصفحة", en: "Select a project before opening this view" },
  routing_restoring_link: { ar: "جارٍ استعادة الرابط المطلوب", en: "Restoring the requested link" },

  // Platform completion: marketplace and readiness
  marketplace_title: { ar: "سوق قوالب العروض", en: "Proposal template marketplace" },
  marketplace_detail_title: { ar: "تفاصيل قالب السوق", en: "Marketplace template details" },
  marketplace_publish_action: { ar: "نشر القالب", en: "Publish template" },
  marketplace_retire_action: { ar: "إيقاف القالب", en: "Retire template" },
  marketplace_apply_action: { ar: "تطبيق القالب على العرض", en: "Apply template to proposal" },
  marketplace_empty: { ar: "لا توجد قوالب منشورة", en: "No published templates" },
  marketplace_filter_empty: {
    ar: "لا توجد قوالب مطابقة للفلاتر",
    en: "No templates match your filters",
  },
  marketplace_clear_filters: { ar: "مسح الفلاتر", en: "Clear filters" },
  marketplace_publisher: { ar: "مساحة العمل الناشرة", en: "Publisher workspace" },
  marketplace_lifecycle_state: { ar: "حالة القالب", en: "Template lifecycle state" },
  marketplace_section_outline: { ar: "مخطط الأقسام", en: "Section outline" },
  marketplace_apply_success: { ar: "تم تطبيق القالب على العرض", en: "Template applied to the proposal" },
  readiness_title: { ar: "جاهزية المنصة", en: "Platform readiness" },
  readiness_ready: { ar: "المنصة جاهزة", en: "Platform ready" },
  readiness_not_ready: { ar: "المنصة غير جاهزة", en: "Platform not ready" },
  readiness_liveness: { ar: "حالة التشغيل", en: "Liveness" },
  readiness_missing_migrations: { ar: "الترحيلات المعلقة", en: "Pending migrations" },
  readiness_capabilities: { ar: "القدرات المتأثرة", en: "Affected capabilities" },
  readiness_checked_at: { ar: "تم الفحص في {{timestamp}}", en: "Checked at {{timestamp}}" },
  readiness_retry_action: { ar: "إعادة فحص الجاهزية", en: "Check readiness again" },

  // Platform completion: minimized notification content
  notification_inbox_title: { ar: "الإشعارات", en: "Notifications" },
  notification_inbox_empty: { ar: "لا توجد إشعارات جديدة", en: "No new notifications" },
  notification_inbox_unavailable: {
    ar: "تعذر تحميل الإشعارات",
    en: "Unable to load notifications",
  },
  ai_assist_optimize_proposal: {
    ar: "تحسين العرض بالذكاء",
    en: "Optimize proposal with AI",
  },
  ai_assist_analyze_compliance: {
    ar: "تحليل الامتثال بالذكاء",
    en: "Analyze compliance with AI",
  },
  ai_assist_draft_contract: {
    ar: "مسودة عقد بالذكاء",
    en: "AI contract draft assist",
  },
  ai_assist_match_vendors: {
    ar: "مطابقة الموردين",
    en: "Match vendors",
  },
  ai_assist_failed: {
    ar: "تعذر إكمال طلب الذكاء الاصطناعي. أعد المحاولة.",
    en: "AI request failed. Please try again.",
  },
  ai_assist_done: { ar: "اكتمل التحليل", en: "Analysis complete" },
  ai_assist_score: {
    ar: "الدرجة {{score}}",
    en: "Score {{score}}",
  },
  ai_assist_win_prob: {
    ar: "احتمال الفوز {{pct}}%",
    en: "Win probability {{pct}}%",
  },
  ai_assist_compliance_summary: {
    ar: "درجة {{score}} · {{findings}} نتيجة · {{gaps}} فجوة",
    en: "Score {{score}} · {{findings}} findings · {{gaps}} gaps",
  },
  ai_assist_contract_summary: {
    ar: "{{clauses}} بند · {{issues}} ملاحظة تحقق",
    en: "{{clauses}} clauses · {{issues}} validation notes",
  },
  ai_assist_vendor_top: {
    ar: "أفضل مطابقة: {{name}} ({{score}})",
    en: "Top match: {{name}} ({{score}})",
  },
  ai_assist_vendor_need_context: {
    ar: "يلزم متطلبات مناقصة ومورد واحد على الأقل",
    en: "Need tender requirements and at least one vendor",
  },
  notification_open_action: { ar: "فتح السجل المرتبط", en: "Open related record" },
  notification_review_requested_event: { ar: "طلب مراجعة عرض", en: "Proposal review requested" },
  notification_review_approved_event: { ar: "تم اعتماد العرض", en: "Proposal approved" },
  notification_review_rejected_event: { ar: "تم رفض العرض", en: "Proposal rejected" },
  notification_subscription_past_due_event: { ar: "الاشتراك متأخر السداد", en: "Subscription past due" },
  notification_subscription_failed_event: { ar: "فشل الاشتراك", en: "Subscription failed" },
  notification_minimized_subject: { ar: "إشعار {{eventLabel}}: {{title}}", en: "{{eventLabel}} notification: {{title}}" },
  notification_minimized_body: {
    ar: "يتطلب الحدث {{eventLabel}} للعنصر «{{title}}» انتباهك. المنفذ: {{actor}}. الوقت: {{timestamp}}. الرابط: {{link}}",
    en: "The {{eventLabel}} event for “{{title}}” needs your attention. Actor: {{actor}}. Time: {{timestamp}}. Link: {{link}}",
  },
  notification_delivery_pending: { ar: "بانتظار الإرسال", en: "Pending delivery" },
  notification_delivery_sent: { ar: "تم التسليم", en: "Delivered" },
  notification_delivery_failed: { ar: "فشل التسليم", en: "Delivery failed" },
  notification_delivery_unconfigured: { ar: "مزود البريد غير مهيأ", en: "Email provider unconfigured" },

  // Platform completion: shared actions and finite UI state labels
  action_retry: { ar: "إعادة المحاولة", en: "Retry" },
  action_confirm: { ar: "تأكيد", en: "Confirm" },
  action_load_more: { ar: "تحميل المزيد", en: "Load more" },

  account_recovery_email_hint: {
    ar: "أدخل بريد الحساب لإرسال رابط استعادة آمن",
    en: "Enter the account email to receive a secure recovery link",
  },
  account_reset_password_hint: {
    ar: "أدخل كلمة مرور جديدة تستوفي متطلبات الأمان",
    en: "Enter a new password that meets the security requirements",
  },
  account_verification_sign_in_action: { ar: "العودة إلى تسجيل الدخول", en: "Return to sign in" },
  account_submit_failed: { ar: "تعذر إرسال طلب الحساب", en: "Unable to submit the account request" },

  invitation_role_administrator: { ar: "مسؤول", en: "Administrator" },
  invitation_role_member: { ar: "عضو", en: "Member" },
  invitation_revoke_confirm: {
    ar: "هل تريد إلغاء دعوة {{email}}؟",
    en: "Revoke the invitation for {{email}}?",
  },
  invitation_list_load_failed: { ar: "تعذر تحميل الدعوات المعلقة", en: "Unable to load pending invitations" },
  invitation_revoke_failed: { ar: "تعذر إلغاء الدعوة", en: "Unable to revoke the invitation" },
  invitation_accept_failed: { ar: "تعذر قبول الدعوة", en: "Unable to accept the invitation" },

  analytics_period_7_days: { ar: "٧ أيام", en: "7 days" },
  analytics_period_30_days: { ar: "٣٠ يوماً", en: "30 days" },
  analytics_period_90_days: { ar: "٩٠ يوماً", en: "90 days" },
  analytics_period_1_year: { ar: "سنة واحدة", en: "1 year" },
  analytics_difference_increase: { ar: "زيادة عن الفترة السابقة", en: "Increase from the previous period" },
  analytics_difference_decrease: { ar: "انخفاض عن الفترة السابقة", en: "Decrease from the previous period" },
  analytics_difference_unchanged: { ar: "دون تغيير عن الفترة السابقة", en: "No change from the previous period" },

  template_field_key: { ar: "مفتاح القالب", en: "Template key" },
  template_field_title_ar: { ar: "العنوان العربي", en: "Arabic title" },
  template_field_title_en: { ar: "العنوان الإنجليزي", en: "English title" },
  template_add_section: { ar: "إضافة قسم", en: "Add section" },
  template_section_text_ar: { ar: "نص القسم بالعربية", en: "Arabic section text" },
  template_section_text_en: { ar: "نص القسم بالإنجليزية", en: "English section text" },
  template_add_variable: { ar: "إضافة متغير", en: "Add variable" },
  template_variable_name: { ar: "اسم المتغير", en: "Variable name" },
  template_variable_type: { ar: "نوع المتغير", en: "Variable type" },
  template_variable_option: { ar: "خيار المتغير", en: "Variable option" },

  // Platform completion: template variable type vocabulary (Req 6.10)
  template_variable_type_text: { ar: "نص", en: "Text" },
  template_variable_type_number: { ar: "رقم", en: "Number" },
  template_variable_type_date: { ar: "تاريخ", en: "Date" },
  template_variable_type_single_choice: { ar: "قائمة اختيار واحد", en: "Single-choice list" },

  // Platform completion: contract revision safety indicators (Req 7.6)
  contract_legal_review_label: { ar: "حالة المراجعة القانونية", en: "Legal review status" },
  contract_counsel_required: { ar: "يتطلب مراجعة مستشار قانوني", en: "Counsel review required" },
  contract_non_executable: { ar: "غير قابل للتنفيذ", en: "Non-executable" },
  legal_review_UNREVIEWED: { ar: "غير مراجع قانونياً", en: "Unreviewed" },
  legal_review_NOT_REQUIRED: { ar: "لا يتطلب مراجعة قانونية", en: "Legal review not required" },
  legal_review_REQUIRED: { ar: "يتطلب مراجعة قانونية", en: "Legal review required" },
  legal_review_PENDING: { ar: "قيد المراجعة القانونية", en: "Legal review pending" },
  legal_review_APPROVED: { ar: "معتمد قانونياً", en: "Legally approved" },
  legal_review_NOT_LEGAL_ADVICE: { ar: "ليست استشارة قانونية", en: "Not legal advice" },

  // Platform completion: reconciliation state vocabulary (Req 10.6)
  payment_state_pending: { ar: "قيد الانتظار", en: "Pending" },
  payment_state_paid: { ar: "مدفوع", en: "Paid" },
  payment_state_failed: { ar: "فاشل", en: "Failed" },
  payment_state_expired: { ar: "منتهي الصلاحية", en: "Expired" },
  payment_state_cancelled: { ar: "ملغى", en: "Cancelled" },
  payment_state_unknown: { ar: "حالة غير معروفة", en: "Unknown state" },

  // Platform completion: marketplace lifecycle and rating presentation (Req 15.1)
  marketplace_state_published: { ar: "منشور", en: "Published" },
  marketplace_state_retired: { ar: "متقاعد", en: "Retired" },
  marketplace_rating_unrated: { ar: "لا توجد تقييمات بعد", en: "No ratings yet" },
  marketplace_average_rating_value: {
    ar: "متوسط التقييم {{average}} من 5",
    en: "Average rating {{average}} of 5",
  },
  marketplace_section_outline_entry: {
    ar: "القسم {{position}}: {{title}}",
    en: "Section {{position}}: {{title}}",
  },

  // Platform completion: knowledge decision confirmations (Req 11.11)
  knowledge_decision_confirm_approve: {
    ar: "تأكيد اعتماد السجل {{title}}",
    en: "Confirm approval of record {{title}}",
  },
  knowledge_decision_confirm_reject: {
    ar: "تأكيد رفض السجل {{title}}",
    en: "Confirm rejection of record {{title}}",
  },

  REGISTRATION_CREATED: { ar: "تم إنشاء الحساب", en: "Account registration created" },
  REGISTRATION_INVALID: { ar: "بيانات التسجيل غير صالحة: {{fieldPaths}}", en: "Registration data is invalid: {{fieldPaths}}" },
  REGISTRATION_RATE_LIMITED: { ar: "تم تجاوز حد محاولات إنشاء الحساب", en: "Account registration rate limit exceeded" },
  VERIFICATION_RATE_LIMITED: { ar: "تم تجاوز حد محاولات التحقق من البريد", en: "Email verification rate limit exceeded" },
  VERIFICATION_RESEND_RATE_LIMITED: { ar: "تم تجاوز حد إعادة إرسال رسالة التحقق — حاول لاحقاً", en: "Verification resend limit exceeded — try again later" },
  VERIFICATION_EMAIL_SEND_FAILED: { ar: "تعذر إرسال رسالة التحقق بعد إنشاء الحساب", en: "Verification email could not be sent after account creation" },
  PASSWORD_RESET_COMPLETE: { ar: "اكتملت إعادة تعيين كلمة المرور", en: "Password reset completed" },
  RECOVERY_RATE_LIMITED: { ar: "تم تجاوز حد محاولات استعادة الحساب", en: "Account recovery rate limit exceeded" },
  RECOVERY_PASSWORD_REJECTED: { ar: "كلمة المرور الجديدة لا تستوفي المتطلبات", en: "The new password does not meet the requirements" },
  INVITATION_ACCEPTANCE_INVALID: { ar: "بيانات قبول الدعوة غير صالحة: {{fieldPath}}", en: "Invitation acceptance data is invalid: {{fieldPath}}" },
  INVITATION_RATE_LIMITED: { ar: "تم تجاوز حد محاولات قبول الدعوة. انتظر قليلاً ثم أعد المحاولة", en: "Too many invitation acceptance attempts. Wait a moment and try again" },
  // Split from INVITATION_RATE_LIMITED for the same reason AI_RATE_LIMIT_UNAVAILABLE
  // is split from AI_RATE_LIMITED: the invitee did nothing wrong, and telling
  // them to slow down would send them looking for a mistake they did not make.
  INVITATION_RATE_LIMIT_UNAVAILABLE: { ar: "تعذر التحقق من حد المحاولات، ولم تُقبل الدعوة. أعد المحاولة بعد قليل", en: "The attempt limit could not be checked, so the invitation was not accepted. Try again shortly" },
  // One sentence for every limiter outage. From the caller's side it is the
  // same event wherever it happens: nothing was written, and waiting fixes it.
  RATE_LIMIT_UNAVAILABLE: { ar: "تعذر التحقق من حد المحاولات، ولم يُنفَّذ أي تغيير. أعد المحاولة بعد قليل", en: "The attempt limit could not be checked, so nothing was changed. Try again shortly" },
  INVALID_CREDENTIALS: { ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة", en: "Invalid email or password" },
  LOGIN_RATE_LIMITED: { ar: "محاولات تسجيل دخول كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many sign-in attempts. Wait a moment and try again" },
  PASSWORD_CHANGE_RATE_LIMITED: { ar: "محاولات تغيير كلمة المرور كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many password change attempts. Wait a moment and try again" },
  MFA_SETUP_RATE_LIMITED: { ar: "محاولات إعداد المصادقة الثنائية كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many MFA setup attempts. Wait a moment and try again" },
  MFA_VERIFY_RATE_LIMITED: { ar: "محاولات تأكيد رمز المصادقة كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many MFA verification attempts. Wait a moment and try again" },
  MFA_DISABLE_RATE_LIMITED: { ar: "محاولات تعطيل المصادقة الثنائية كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many MFA disable attempts. Wait a moment and try again" },
  PROFILE_UPDATE_RATE_LIMITED: { ar: "محاولات تحديث الملف الشخصي كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many profile update attempts. Wait a moment and try again" },
  AVATAR_UPLOAD_RATE_LIMITED: { ar: "محاولات رفع الصورة الشخصية كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many avatar upload attempts. Wait a moment and try again" },
  PROPOSAL_DOWNLOAD_RATE_LIMITED: { ar: "طلبات تنزيل كثيرة. انتظر قليلاً ثم أعد المحاولة", en: "Too many download requests. Wait a moment and try again" },
  ANALYTICS_EVENT_TYPE_INVALID: { ar: "نوع حدث التحليلات غير مسجل", en: "Analytics event type is not registered" },
  TEMPLATE_SUBMISSION_INVALID: { ar: "بيانات القالب غير صالحة: {{fieldPath}}", en: "Template submission is invalid: {{fieldPath}}" },
  TEMPLATE_KEY_IN_USE: { ar: "مفتاح القالب مستخدم في مساحة العمل", en: "Template key is already in use in the workspace" },
  TEMPLATE_VERSION_CONFLICT: { ar: "تعارض تحديث القالب مع الإصدار {{version}}", en: "Template update conflicts with version {{version}}" },
  STRUCTURED_SNAPSHOT_REQUIRED: { ar: "يلزم إنشاء لقطة عرض منظمة قبل التصدير", en: "A structured proposal snapshot is required before export" },
  XLSX_BILINGUAL_LABEL_MISSING: { ar: "تسمية ثنائية اللغة مفقودة: {{fieldPath}}", en: "A bilingual label is missing: {{fieldPath}}" },
  XLSX_EXPORT_FAILED: { ar: "تعذر إنشاء ملف XLSX", en: "Unable to create the XLSX file" },
  RECURRING_UNAVAILABLE: { ar: "التجديد التلقائي غير متاح حالياً", en: "Automatic renewal is currently unavailable" },
  RECURRING_PROFILE_EXISTS: { ar: "يوجد ملف تجديد حالي للاشتراك", en: "A current renewal profile already exists for the subscription" },
  RECURRING_STATE_CONFLICT: { ar: "حالة ملف التجديد لا تسمح بهذا الإجراء", en: "The renewal profile state does not allow this action" },
  RECURRING_PROVIDER_ERROR: { ar: "تعذر إكمال إجراء التجديد لدى مزود الدفع", en: "The payment provider could not complete the renewal action" },
  ADMIN_REQUIRED: { ar: "يتطلب إجراء التسوية صلاحية مسؤول", en: "The reconciliation action requires an administrator" },
  RECONCILE_PROVIDER_MISMATCH: { ar: "بيانات المزود لا تطابق العملية {{checkoutId}}", en: "Provider data does not match checkout {{checkoutId}}" },
  RECONCILE_PROVIDER_UNRESOLVED: { ar: "تعذر حسم حالة العملية {{checkoutId}}", en: "Checkout {{checkoutId}} could not be resolved" },
  INVALID_QUEUE_CURSOR: { ar: "مؤشر قائمة اعتماد المعرفة غير صالح", en: "Knowledge approval queue cursor is invalid" },
  KNOWLEDGE_RECORD_NOT_FOUND: { ar: "سجل المعرفة غير موجود في مساحة العمل", en: "Knowledge record was not found in the workspace" },
  REJECTION_REASON_INVALID: { ar: "سبب الرفض غير صالح للغة {{language}}", en: "Rejection reason is invalid for {{language}}" },
  KNOWLEDGE_DECISION_ALREADY_RECORDED: { ar: "سُجل قرار المعرفة مسبقاً بالحالة {{status}}", en: "Knowledge decision was already recorded with status {{status}}" },
  COMMENT_CONTENT_INVALID: { ar: "يجب أن يكون التعليق من {{min}} إلى {{max}} حرفاً", en: "Comment content must be between {{min}} and {{max}} characters" },
  COMMENT_NOT_FOUND: { ar: "التعليق غير موجود أو مسحوب", en: "Comment was not found or has been withdrawn" },
  PRESENCE_UNAVAILABLE: { ar: "خدمة حضور المشاهدين غير متاحة", en: "Viewer presence is unavailable" },
  VERSION_CURSOR_INVALID: { ar: "مؤشر سجل الإصدارات غير صالح", en: "Version history cursor is invalid" },
  REVERT_FORBIDDEN: { ar: "لا يسمح دورك باسترجاع هذا الإصدار", en: "Your role cannot revert this version" },
  ROUTE_VIEW_NOT_FOUND: { ar: "لا يوجد عرض مطابق للمسار المطلوب", en: "No application view matches the requested route" },
  ROUTE_VIEW_FORBIDDEN: { ar: "لا يسمح دور الجلسة بفتح العرض المطلوب", en: "The session role cannot open the requested view" },
  ROUTE_VIEW_MOVED: { ar: "انتقلت هذه اللوحة إلى شاشة أخرى، وقد فتحناها لك", en: "This panel moved into another screen, and we opened it for you" },
  ROUTE_PROJECT_UNAVAILABLE: { ar: "المشروع الموجود في المسار غير متاح", en: "The project in the route is unavailable" },
  ROUTE_PROJECT_REQUIRED: { ar: "يتطلب العرض المطلوب اختيار مشروع", en: "The requested view requires a selected project" },
  MARKETPLACE_ENTRY_NOT_FOUND: { ar: "قالب السوق غير موجود", en: "Marketplace template was not found" },
  MARKETPLACE_FORBIDDEN: { ar: "لا يسمح دورك بتنفيذ إجراء السوق", en: "Your role cannot perform the marketplace action" },
  READINESS_DATABASE_UNREACHABLE: { ar: "تعذر الوصول إلى قاعدة البيانات أثناء فحص الجاهزية", en: "The database could not be reached during the readiness check" },
  READINESS_MIGRATION_QUERY_FAILED: { ar: "تعذر قراءة سجل الترحيلات أثناء فحص الجاهزية", en: "The migration record could not be read during the readiness check" },
  READINESS_TIMEOUT: { ar: "انتهت مهلة فحص جاهزية المنصة", en: "The platform readiness check timed out" },
  NOTIFICATION_EMAIL_UNCONFIGURED: { ar: "تم حفظ الإشعار لكن مزود البريد غير مهيأ", en: "The notification was saved, but the email provider is not configured" },
  NOTIFICATION_DELIVERY_FAILED: { ar: "تعذر تسليم الإشعار بعد المحاولات المسموحة", en: "The notification could not be delivered after the allowed attempts" },
  REQUEST_VALIDATION_FAILED: { ar: "تعذر تنفيذ الطلب بسبب الحقل {{fieldPath}}", en: "The request could not be completed because of field {{fieldPath}}" },
  AUTHENTICATION_REQUIRED: { ar: "يتطلب الطلب جلسة مصادقة صالحة", en: "The request requires a valid authenticated session" },
  WORKSPACE_ROLE_FORBIDDEN: { ar: "لا يسمح دورك في مساحة العمل بتنفيذ هذا الطلب", en: "Your workspace role cannot perform this request" },
  TENANT_ACCESS_FORBIDDEN: { ar: "تعذر الوصول إلى المورد خارج مساحة العمل الحالية", en: "The resource cannot be accessed outside the current workspace" },
  RESOURCE_NOT_FOUND: { ar: "تعذر العثور على المورد المطلوب", en: "The requested resource could not be found" },
  DOCUMENT_LANGUAGE_MISSING: { ar: "تعذر التصدير لأن القسم {{section}} لا يحتوي لغة {{language}}", en: "Export failed because section {{section}} has no {{language}} value" },
  DOCUMENT_LANGUAGE_INVALID: { ar: "تعذر التصدير بسبب محتوى لا يطابق اللغة {{language}}", en: "Export failed because content does not match the {{language}} language" },
  LOCALIZATION_KEY_MISSING: { ar: "تعذر عرض النص المحلي للمفتاح {{key}}", en: "Localized text could not be resolved for key {{key}}" },
  LOCALIZATION_PLACEHOLDER_MISMATCH: { ar: "تعذر تنسيق النص المحلي بسبب اختلاف المتغيرات", en: "Localized text could not be formatted because placeholders differ" },
  INTERNAL_ERROR: { ar: "تعذر إكمال الطلب بسبب خطأ داخلي", en: "The request could not be completed because of an internal error" },

  // Document upload and revision history. Every one of these reaches a bid
  // writer mid-task — dragging in a tender pack, restoring yesterday's file —
  // so each says what to do next rather than naming the check that tripped.
  DOCUMENT_UPLOAD_FORM_INVALID: {
    ar: "يجب إرسال المستند كملف مرفق في نموذج الرفع",
    en: "The document must be sent as an attached file in the upload form",
  },
  DOCUMENT_FILE_MISSING: {
    ar: "لم يُرفَق أي ملف بعملية الرفع",
    en: "No file was attached to the upload",
  },
  DOCUMENT_METADATA_MISSING: {
    ar: "يلزم اسم الملف وتصنيف المستند قبل الرفع",
    en: "The upload needs a file name and a document category",
  },
  DOCUMENT_PROJECT_MISSING: {
    ar: "اختر مشروعًا نشطًا قبل رفع المستند",
    en: "Select an active project before uploading the document",
  },
  DOCUMENT_EVIDENCE_DELETE_FORBIDDEN: {
    ar: "يُحفَظ هذا المستند كدليل معرفة مُعتمد ولا يمكن حذفه",
    en: "This document is retained as reviewed knowledge evidence and cannot be deleted",
  },
  DOCUMENT_EVIDENCE_DELETE_CONFLICT: {
    ar: "أصبح هذا المستند دليل معرفة مُعتمدًا أثناء الحذف، فتوقّف الحذف",
    en: "This document became reviewed knowledge evidence during the delete, so the delete stopped",
  },
  DOCUMENT_VERSION_REQUEST_INVALID: {
    ar: "طلب إنشاء إصدار المستند غير صالح",
    en: "The request to create a document revision is not valid",
  },
  DOCUMENT_VERSION_FILE_MISSING: {
    ar: "ملف الإصدار المخزَّن غير موجود في مساحة العمل هذه",
    en: "The stored revision file was not found in this workspace",
  },
  DOCUMENT_VERSION_SIZE_MISMATCH: {
    ar: "الحجم المعلَن للإصدار لا يطابق حجم البيانات المخزَّنة",
    en: "The declared revision size does not match the stored bytes",
  },
  DOCUMENT_COMPARE_VERSIONS_MISSING: {
    ar: "تتطلب المقارنة رقمي إصدارين",
    en: "Comparing revisions needs two revision numbers",
  },
  DOCUMENT_VERSION_CONFLICT: {
    ar: "تغيَّر المستند أثناء عملك؛ أعد التحميل ثم حاول مرة أخرى",
    en: "The document changed while you were working; reload and retry",
  },
  // The three below are separate codes on purpose. They read alike to the
  // writer but name different server states, and the last one is the only
  // signal that stored bytes changed under a recorded checksum — collapsing it
  // into the others would erase a tamper indication from the response.
  DOCUMENT_VERSION_CHECKSUM_MISSING: {
    ar: "لا يحمل هذا الإصدار بصمة تحقق، لذا لا يمكن التأكد منه قبل الاستعادة",
    en: "This revision carries no checksum, so it cannot be verified before restoring",
  },
  DOCUMENT_VERSION_BYTES_UNAVAILABLE: {
    ar: "البيانات المخزَّنة لهذا الإصدار غير متاحة",
    en: "The stored bytes for this revision are unavailable",
  },
  DOCUMENT_VERSION_INTEGRITY_FAILED: {
    ar: "فشل التحقق من سلامة البيانات المخزَّنة لهذا الإصدار",
    en: "The stored bytes for this revision failed integrity verification",
  },

  // MFA and password error codes (audit: i18n — replace hardcoded English)
  MFA_NOT_SET_UP: { ar: "لم يتم إعداد المصادقة الثنائية", en: "MFA is not set up" },
  MFA_TOKEN_INVALID: { ar: "رمز المصادقة الثنائية غير صالح", en: "Invalid MFA token" },
  MFA_ROTATION_TOKEN_REQUIRED: {
    ar: "يلزم رمز المصادقة الثنائية الحالي لتدوير المفتاح",
    en: "Current MFA token required to rotate MFA",
  },
  MFA_PASSWORD_REQUIRED: {
    ar: "يلزم كلمة المرور الحالية لتغيير المصادقة الثنائية",
    en: "Current password is required to change MFA",
  },
  MFA_REPLAYED_TOKEN: {
    ar: "تم استخدام رمز المصادقة الثنائية هذا مسبقاً",
    en: "This MFA code has already been used",
  },
  PASSWORD_INCORRECT: { ar: "كلمة المرور الحالية غير صحيحة", en: "Current password is incorrect" },
  AVATAR_TOO_LARGE: { ar: "حجم الصورة يجب أن يكون أقل من ٢ ميجابايت", en: "Avatar must be under 2MB" },
  EMAIL_ALREADY_IN_USE: { ar: "البريد الإلكتروني مستخدم بالفعل", en: "Email already in use" },
  CANNOT_DEACTIVATE_OWN_ACCOUNT: {
    ar: "لا يمكنك تعطيل حسابك الخاص",
    en: "Cannot deactivate your own account",
  },
  DATABASE_URL_PROTECTED: {
    ar: "لا يمكن تغيير DATABASE_URL عبر واجهة برمجة التطبيقات في الإنتاج",
    en: "DATABASE_URL cannot be changed via API in production",
  },
  PROVIDER_NOT_FOUND: { ar: "المزود غير موجود", en: "Provider not found" },
  INVALID_JSON_BODY: { ar: "صيغة JSON غير صالحة", en: "Invalid JSON body" },
  INVALID_REQUEST: { ar: "طلب غير صالح", en: "Invalid request" },
  INVALID_VERSION: { ar: "رقم الإصدار غير صالح", en: "Invalid version" },
  NO_BRAND_PROFILE: { ar: "لا يوجد ملف تعريف علامة تجارية", en: "No brand profile" },
  // Two codes, not the avatar route's single `INVALID_REQUEST`: a reader whose
  // logo was rejected can act on "wrong kind of file" and on "this file will not
  // open", and on nothing else. Both sentences keep naming the accepted formats,
  // because the English literals they replace did.
  LOGO_IMAGE_TYPE_UNSUPPORTED: {
    ar: "ارفع صورة PNG أو JPEG أو WebP بحجم لا يتجاوز ٨ ميجابايت",
    en: "Upload a PNG, JPEG, or WebP image up to 8 MiB",
  },
  LOGO_IMAGE_UNREADABLE: {
    ar: "تعذر قراءة ملف الشعار. أعد تصديره بصيغة PNG أو JPEG أو WebP ثم حاول مرة أخرى",
    en: "The logo file could not be read. Re-export it as PNG, JPEG, or WebP and try again",
  },

  // Agent surface. The chat transport renders these verbatim, so both locales
  // must read as a finished sentence to the person in the console.
  MISSION_NOT_FOUND: { ar: "المهمة غير موجودة", en: "Mission not found" },
  ONBOARDING_INCOMPLETE: {
    ar: "أكمل إعداد الحساب قبل تشغيل الوكلاء",
    en: "Complete account setup before running the agents",
  },
  // The caller did nothing wrong — a run they already started is still going —
  // so both locales name the wait and the alternative rather than reading as a
  // rejection. The response carries `runId`, which is what the console opens.
  AGENT_RUN_IN_PROGRESS: {
    ar: "هناك تشغيل للوكلاء جارٍ بالفعل على هذا المشروع. انتظر انتهاءه أو افتح التشغيل الحالي",
    en: "An agent run is already in progress for this project. Wait for it to finish, or open the run in progress",
  },
  AI_RATE_LIMITED: {
    ar: "تم تجاوز حد الطلبات على المساعد الذكي. انتظر قليلاً ثم أعد المحاولة",
    en: "Too many AI assistant requests. Wait a moment and try again",
  },
  // The agents read the uploaded tender documents; with none there is nothing
  // to read, so the text names the upload rather than blaming the request.
  NO_DOCUMENTS: {
    ar: "لا توجد مستندات مرفوعة لهذا المشروع. ارفع كراسة الشروط أولاً ثم شغّل الوكلاء",
    en: "No documents are uploaded for this project. Upload the tender documents first, then run the agents",
  },
  // Distinct from AI_RATE_LIMITED on purpose: the caller did nothing wrong and
  // slowing down will not help, so the text must not read as a quota message.
  AI_RATE_LIMIT_UNAVAILABLE: {
    ar: "تعذر التحقق من حد الطلبات، ولم يتم تشغيل المساعد الذكي. أعد المحاولة بعد قليل",
    en: "The request limit could not be checked, so the AI assistant did not run. Try again shortly",
  },
  PRICING_REFUSED: {
    ar: "لا تقترح أرابكلو أسعار العطاءات أو الخصومات أو الهوامش أو الاستراتيجية التجارية. أدخل المبالغ في النماذج المالية",
    en: "ArabClue does not suggest bid prices, discounts, margins, or commercial strategy. Enter amounts in the financial forms",
  },
  LIVE_VOICE_START_FAILED: {
    ar: "تعذر بدء الجلسة الصوتية المباشرة",
    en: "Could not start the live voice session",
  },
  AGENT_TOOL_FAILED: {
    ar: "تعذر تنفيذ أداة المساعد الذكي",
    en: "The AI assistant could not run that tool",
  },
  AI_PROVIDER_UNAVAILABLE: {
    ar: "لا يوجد مزوّد ذكاء اصطناعي متاح الآن، ولم يتم إنشاء أي محتوى. اطلب من المشرف ربط مزوّد",
    en: "No AI provider is available right now, so nothing was generated. Ask your administrator to connect a provider",
  },
  SECRET_DECRYPTION_FAILED: {
    ar: "تعذر فتح القيمة المخزَّنة بمفتاح التشفير الحالي، ولم يتم تغيير أي شيء. تحقّق من مفتاح التشفير قبل إعادة المحاولة",
    en: "The stored value could not be opened with the current encryption key, so nothing was changed. Verify the encryption key before retrying",
  },
  EXTENSION_PACK_FAILED: {
    ar: "تعذر تجهيز حزمة الإضافة",
    en: "Could not pack the browser extension",
  },

  // Plan limits. The reader has to know which limit they hit and that the fix
  // is an upgrade, so each kind gets its own sentence.
  QUOTA_DOCUMENTS_EXCEEDED: {
    ar: "بلغت الحد الأقصى للمستندات في باقتك. رقِّ الباقة لرفع الحد",
    en: "You have reached the document limit on your plan. Upgrade to raise it",
  },
  QUOTA_PROPOSALS_EXCEEDED: {
    ar: "بلغت الحد الأقصى للعروض في باقتك. رقِّ الباقة لرفع الحد",
    en: "You have reached the proposal limit on your plan. Upgrade to raise it",
  },
  QUOTA_STORAGE_EXCEEDED: {
    ar: "بلغت الحد الأقصى لمساحة التخزين في باقتك. احذف ملفات أو رقِّ الباقة",
    en: "You have reached the storage limit on your plan. Delete files or upgrade",
  },
  QUOTA_TOKENS_EXCEEDED: {
    ar: "بلغت الحد الأقصى لاستخدام الذكاء الاصطناعي في باقتك. رقِّ الباقة لرفع الحد",
    en: "You have reached the AI usage limit on your plan. Upgrade to raise it",
  },
  SUBSCRIPTION_INACTIVE: {
    ar: "اشتراكك غير نشط. جدِّد الاشتراك لمتابعة العمل",
    en: "Your subscription is not active. Renew it to continue",
  },

  // Structured proposal snapshots. These rejections used to be English strings
  // written at the call site in the snapshot route, which meant an Arabic
  // editor showed English the moment a save failed.
  SNAPSHOT_BODY_TOO_LARGE: {
    ar: "تتجاوز نسخة العرض المهيكلة الحد المسموح لحجم الطلب",
    en: "The structured proposal snapshot exceeds the request size budget",
  },
  INVALID_SNAPSHOT_JSON: {
    ar: "محتوى الطلب ليس JSON صالحاً",
    en: "The request body is not valid JSON",
  },
  INVALID_SNAPSHOT_REQUEST: {
    ar: "طلب نسخة العرض المهيكلة غير صالح",
    en: "The structured proposal snapshot request is invalid",
  },
  INVALID_SNAPSHOT_SHAPE: {
    ar: "النسخة لا تطابق البنية المتوقعة",
    en: "The snapshot does not match the expected structure",
  },
  INVALID_SNAPSHOT_IDENTITY: {
    ar: "حقول هوية النسخة غير صالحة",
    en: "The snapshot identity fields are invalid",
  },
  INVALID_SNAPSHOT_REVISION: {
    ar: "رقم مراجعة النسخة غير صالح",
    en: "The snapshot revision number is invalid",
  },
  INVALID_SNAPSHOT_CONTENT: {
    ar: "فشل التحقق من محتوى النسخة",
    en: "The snapshot content failed validation",
  },
  PERSISTED_SNAPSHOT_METADATA_MISMATCH: {
    ar: "بيانات النسخة المخزنة لم تعد تطابق محتواها",
    en: "The stored snapshot metadata no longer matches its content",
  },
  SNAPSHOT_REVISION_CONFLICT: {
    ar: "تغيّر العرض. أعد تحميله قبل استبدال النسخة",
    en: "The proposal changed. Reload it before replacing the snapshot",
  },
  STRUCTURED_IDENTITY_MISMATCH: {
    ar: "هوية العرض لا تطابق سجلات المستأجر الحالية",
    en: "The proposal identity does not match the current tenant records",
  },
  STRUCTURED_EVIDENCE_NOT_APPROVED: {
    ar: "تستشهد النسخة بأدلة غير معتمدة أو غير موثّقة",
    en: "The snapshot cites evidence that is not approved or not verified",
  },
  STRUCTURED_SNAPSHOT_TYPE_MISMATCH: {
    ar: "سجلات العقود لا تقبل نسخ العروض",
    en: "Contract records do not accept proposal snapshots",
  },
  STRUCTURED_SNAPSHOT_REQUIRED_FOR_XLSX: {
    ar: "يتطلب تصدير XLSX المنظم نسخة ثابتة. استخدم xlsx-matrix أو xlsx-boq للعروض القديمة",
    en: "Structured XLSX export requires an immutable snapshot. Use xlsx-matrix or xlsx-boq for legacy proposals",
  },
  STRUCTURED_EXPORT_BLOCKED: {
    ar: "أوقفت فحوص الجودة تصدير هذا العرض. راجع التشخيصات المرفقة",
    en: "Quality checks blocked this proposal export. Review the attached diagnostics",
  },
  EXPORT_STATE_CHANGED: {
    ar: "تغيّر العرض أثناء تجهيز الملف المعتمد. أعد المحاولة من أحدث حالة",
    en: "The proposal changed while the authoritative file was being prepared. Retry from the latest state",
  },
  PDF_UNAVAILABLE: {
    ar: "مولّد ملفات PDF غير متاح على الخادم حاليًا. جرّب صيغة HTML أو أبلغ المشرف",
    en: "The PDF generator is not available on the server right now. Try the HTML format or tell your administrator",
  },
  // The contract render snapshot is captured at review submission and frozen;
  // a final contract export is refused unless it is present and still matches.
  CONTRACT_RENDER_SNAPSHOT_REQUIRED: {
    ar: "يتطلب التصدير النهائي للعقد نسخة العرض الثابتة المُلتقطة عند تقديم المراجعة",
    en: "Final contract export requires the immutable render snapshot captured at review submission",
  },
  CONTRACT_RENDER_SNAPSHOT_INVALID: {
    ar: "نسخة عرض العقد المخزّنة تالفة ولا يمكن التصدير منها",
    en: "The stored contract render snapshot is corrupt and cannot be exported",
  },
  CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH: {
    ar: "نسخة عرض العقد تخص سجلًا آخر",
    en: "The contract render snapshot belongs to a different record",
  },
  CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH: {
    ar: "تغيّر العقد بعد التقاط نسخة العرض. أعد تقديمه للمراجعة",
    en: "The contract changed after its render snapshot was captured. Resubmit it for review",
  },
  CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH: {
    ar: "لا يطابق محتوى نسخة عرض العقد بصمتها المسجّلة",
    en: "The contract render snapshot content does not match its recorded hash",
  },
  CONTRACT_RENDER_SNAPSHOT_TOO_LARGE: {
    ar: "نسخة عرض العقد تتجاوز الحجم المسموح به",
    en: "The contract render snapshot exceeds the permitted size",
  },
  SNAPSHOT_SERVER_IDENTITY_NOT_FOUND: {
    ar: "لم يتم العثور على هوية مشروع العرض أو مساحة العمل",
    en: "The proposal project or workspace identity was not found",
  },
  SNAPSHOT_WRITE_FAILED: {
    ar: "تعذر حفظ النسخة",
    en: "The snapshot could not be saved",
  },
  SNAPSHOT_READ_FAILED: {
    ar: "تعذر تحميل النسخة",
    en: "The snapshot could not be loaded",
  },
  SNAPSHOT_HYDRATION_FAILED: {
    ar: "تعذرت إعادة بناء النسخة من السجلات المخزنة",
    en: "The snapshot could not be rebuilt from the stored records",
  },
  EMPTY_PROPOSAL_CONTENT: {
    ar: "محتوى العرض فارغ",
    en: "The proposal content is empty",
  },
  STATUS_LOCKED: {
    ar: "العرض مقفل للتحرير في حالته الحالية",
    en: "The proposal is locked for editing in its current status",
  },
  // Optimistic-concurrency rejection shared by the edit, rewrite and revert
  // routes. `SNAPSHOT_REVISION_CONFLICT` is the narrower sibling: it is about
  // replacing a stored snapshot, not about a stale editor buffer.
  PROPOSAL_VERSION_CONFLICT: {
    ar: "تغيّر العرض منذ فتحه. أعد تحميله قبل الحفظ",
    en: "The proposal changed since it was opened. Reload it before saving",
  },
  UNSUPPORTED_EXPORT_FORMAT: {
    ar: "صيغة التصدير المطلوبة غير مدعومة",
    en: "The requested export format is not supported",
  },
  STRUCTURED_EXPORT_FORMAT_UNSUPPORTED: {
    ar: "لهذا العرض نسخة منظمة معتمدة. استخدم html أو pdf أو pptx؛ الصيغ القديمة معطّلة لتفادي مخرجات قديمة",
    en: "This proposal has an authoritative structured snapshot. Use html, pdf, or pptx; legacy-only formats are disabled to prevent stale output",
  },
  FINAL_REVIEW_BINDING_INVALID: {
    ar: "يتطلب التصدير النهائي سلسلة الاعتماد الحالية كاملة، بكل خطوة معتمدة ومرتبطة بحالة المستند الحالية",
    en: "Final export requires the exact current approval-policy chain, with every assigned step approved and bound to the current document state",
  },
  BILINGUAL_LANGUAGE_DIRECTION_INVALID: {
    ar: "فشلت المسودتان العربية والإنجليزية في التحقق من اتجاه اللغة",
    en: "The English and Arabic drafts failed language-direction validation",
  },
  BILINGUAL_COUNTERPART_REQUIRED: {
    ar: "يلزم توفير نص Markdown باللغة المقابلة",
    en: "Markdown in the counterpart language is required",
  },

  // Generic access rejections. Both contract-draft routes and the snapshot
  // route answer with these, so they stay wording-neutral about the resource.
  FORBIDDEN: {
    ar: "ليست لديك صلاحية تنفيذ هذا الإجراء",
    en: "You do not have permission to perform this action",
  },
  UNAUTHORIZED: {
    ar: "سجّل الدخول للمتابعة",
    en: "Sign in to continue",
  },
  PROPOSAL_NOT_FOUND: {
    ar: "لم يتم العثور على العرض",
    en: "The proposal was not found",
  },
  PROJECT_NOT_FOUND: {
    ar: "لم يتم العثور على المشروع",
    en: "The project was not found",
  },
  AGENT_RUN_NOT_FOUND: {
    ar: "لم يتم العثور على تشغيل الوكلاء",
    en: "The agent run was not found",
  },
  // `_MISSING`, not `_REQUIRED`: resolveFailureStatus maps a `_REQUIRED`
  // suffix to 403, and this is a malformed query, not a permission problem.
  AGENT_RUN_SELECTOR_MISSING: {
    ar: "حدّد معرّف التشغيل أو معرّف المشروع",
    en: "Provide either a run id or a project id",
  },

  // Contract drafts: the route surface.
  CONTRACT_DRAFT_BODY_TOO_LARGE: {
    ar: "يتجاوز طلب مسودة العقد الحد المسموح لحجم الطلب",
    en: "The contract draft request exceeds the request size budget",
  },
  CONTRACT_DRAFT_CONTENT_TYPE_UNSUPPORTED: {
    ar: "يجب أن يكون Content-Type هو application/json",
    en: "Content-Type must be application/json",
  },
  CONTRACT_DRAFT_INVALID_CONTENT_LENGTH: {
    ar: "ترويسة Content-Length غير صالحة",
    en: "The Content-Length header is invalid",
  },
  CONTRACT_DRAFT_INVALID_JSON: {
    ar: "محتوى الطلب ليس JSON صالحاً",
    en: "The request body is not valid JSON",
  },
  CONTRACT_DRAFT_INVALID_REQUEST: {
    ar: "طلب مسودة العقد غير صالح",
    en: "The contract draft request is invalid",
  },
  CONTRACT_DRAFT_BODY_INVALID: {
    ar: "حمولة مسودة العقد غير صالحة",
    en: "The contract draft payload is invalid",
  },
  CONTRACT_DRAFT_ID_INVALID: {
    ar: "معرّف مسودة العقد غير صالح",
    en: "The contract draft id is invalid",
  },
  CONTRACT_DRAFT_QUERY_INVALID: {
    ar: "استعلام مسودة العقد غير صالح",
    en: "The contract draft query is invalid",
  },
  CONTRACT_DRAFT_LIST_FAILED: {
    ar: "تعذر تحميل مسودات العقود",
    en: "The contract drafts could not be loaded",
  },
  CONTRACT_DRAFT_READ_FAILED: {
    ar: "تعذر تحميل مسودة العقد",
    en: "The contract draft could not be loaded",
  },
  CONTRACT_DRAFT_UPDATE_FAILED: {
    ar: "تعذر تحديث مسودة العقد",
    en: "The contract draft could not be updated",
  },
  CONTRACT_DRAFT_DELETE_FAILED: {
    ar: "تعذر حذف مسودة العقد",
    en: "The contract draft could not be deleted",
  },
  CONTRACT_DRAFT_PERSISTENCE_FAILED: {
    ar: "تعذر حفظ مسودة العقد",
    en: "The contract draft could not be saved",
  },
  CONTRACT_DRAFT_PROJECT_NOT_FOUND: {
    ar: "لم يتم العثور على مشروع المنافسة",
    en: "The tender project was not found",
  },
  CONTRACT_DRAFT_NOT_FOUND: {
    ar: "لم يتم العثور على مسودة العقد",
    en: "The contract draft was not found",
  },
  CONTRACT_DRAFT_RATE_LIMITED: {
    ar: "تم تجاوز حد معدل الكتابة لمسودات العقود. حاول مرة أخرى بعد قليل",
    en: "The contract draft write rate limit was exceeded. Try again shortly",
  },
  CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE: {
    ar: "خدمة ضبط معدل مسودات العقود الموزّعة غير متاحة. حاول مرة أخرى بعد قليل",
    en: "Distributed contract draft admission is unavailable. Try again shortly",
  },

  // Contract drafts: rejections raised by the persistence layer and re-thrown
  // through the routes, so they need the same bilingual treatment.
  CONTRACT_DRAFT_WORKSPACE_NOT_FOUND: {
    ar: "لم يتم العثور على مساحة العمل",
    en: "The workspace was not found",
  },
  CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT: {
    ar: "مفتاح عدم التكرار مرتبط بالفعل بمسودة عقد أخرى",
    en: "The idempotency key is already bound to a different contract draft",
  },
  CONTRACT_DRAFT_INTEGRITY_FAILED: {
    ar: "فشل العقد المحفوظ في فحص السلامة",
    en: "The saved contract failed its integrity check",
  },
  CONTRACT_DRAFT_CONCURRENCY_CONFLICT: {
    ar: "تغيّرت مسودة العقد بالتوازي. أعد المحاولة بنفس معرّف الطلب",
    en: "The contract draft changed concurrently. Retry with the same request id",
  },
  CONTRACT_DRAFT_OUTPUT_TOO_LARGE: {
    ar: "يتجاوز العقد المُنشأ الحجم المسموح",
    en: "The generated contract exceeds the allowed size",
  },
  CONTRACT_DRAFT_QUOTA_EXCEEDED: {
    ar: "استُنفدت حصة مسودات العقود لمساحة العمل",
    en: "The workspace contract draft quota is exhausted",
  },
  CONTRACT_DRAFT_CURSOR_NOT_FOUND: {
    ar: "مؤشر التصفح لم يعد صالحاً",
    en: "The pagination cursor is no longer valid",
  },
  CONTRACT_TEMPLATE_NOT_FOUND: {
    ar: "قالب العقد غير معروف",
    en: "The contract template is unknown",
  },
  CONTRACT_TEMPLATE_STALE: {
    ar: "تغيّر قالب العقد المختار. أعد تحميل الفهرس قبل الحفظ",
    en: "The selected contract template changed. Reload the catalog before saving",
  },
  CONTRACT_TEMPLATE_CATALOG_DRIFT: {
    ar: "فشل فهرس قوالب العقود في فحص البصمة المعيارية",
    en: "The contract template catalog failed its canonical hash check",
  },
  CONTRACT_TEMPLATE_BLOCKED: {
    ar: "تجميع قالب العقد محظور",
    en: "Contract template compilation is blocked",
  },
  CONTRACT_TEMPLATE_PERSISTENCE_DRIFT: {
    ar: "بيانات قالب العقد المخزنة تختلف عن الفهرس المجمّد",
    en: "The stored contract template metadata differs from the frozen catalog",
  },

  // Action prefixes used by the stable bilingual error contract builder
  error_action_register_account: { ar: "تعذر إنشاء الحساب", en: "Unable to create the account" },
  error_action_verify_email: { ar: "تعذر التحقق من البريد الإلكتروني", en: "Unable to verify the email address" },
  error_action_recover_account: { ar: "تعذر استعادة الحساب", en: "Unable to recover the account" },
  error_action_manage_invitation: { ar: "تعذر تنفيذ إجراء الدعوة", en: "Unable to complete the invitation action" },
  error_action_load_analytics: { ar: "تعذر تنفيذ طلب التحليلات", en: "Unable to complete the analytics request" },
  error_action_manage_clause: { ar: "تعذر تنفيذ إجراء البند", en: "Unable to complete the clause action" },
  error_action_manage_template: { ar: "تعذر تنفيذ إجراء القالب", en: "Unable to complete the template action" },
  error_action_load_contract_history: { ar: "تعذر تنفيذ إجراء سجل العقد", en: "Unable to complete the contract history action" },
  error_action_export_xlsx: { ar: "تعذر تصدير ملف XLSX", en: "Unable to export the XLSX file" },
  error_action_manage_recurring: { ar: "تعذر تنفيذ إجراء التجديد", en: "Unable to complete the renewal action" },
  error_action_reconcile_billing: { ar: "تعذر تنفيذ تسوية الدفع", en: "Unable to reconcile the payment" },
  error_action_decide_knowledge: { ar: "تعذر تسجيل قرار المعرفة", en: "Unable to record the knowledge decision" },
  error_action_manage_comment: { ar: "تعذر تنفيذ إجراء التعليق", en: "Unable to complete the comment action" },
  error_action_update_presence: { ar: "تعذر تحديث حضور المشاهدين", en: "Unable to update viewer presence" },
  error_action_load_version_history: { ar: "تعذر تنفيذ إجراء سجل الإصدارات", en: "Unable to complete the version history action" },
  error_action_upload_document: { ar: "تعذر رفع المستند", en: "Unable to upload the document" },
  error_action_resolve_route: { ar: "تعذر فتح مسار التطبيق", en: "Unable to open the application route" },
  error_action_manage_marketplace: { ar: "تعذر تنفيذ إجراء السوق", en: "Unable to complete the marketplace action" },
  error_action_check_readiness: { ar: "تعذر فحص جاهزية المنصة", en: "Unable to check platform readiness" },
  error_action_deliver_notification: { ar: "تعذر تسليم الإشعار", en: "Unable to deliver the notification" },
  error_action_validate_request: { ar: "تعذر التحقق من الطلب", en: "Unable to validate the request" },
  error_action_access_resource: { ar: "تعذر الوصول إلى المورد", en: "Unable to access the resource" },
  error_action_validate_document_language: { ar: "تعذر التحقق من لغة المستند", en: "Unable to validate the document language" },
  error_action_complete_request: { ar: "تعذر إكمال الطلب", en: "Unable to complete the request" },
  error_action_run_agent: { ar: "تعذر تنفيذ طلب المساعد الذكي", en: "Unable to complete the AI assistant request" },
  error_action_manage_mfa: { ar: "تعذر تنفيذ إجراء المصادقة الثنائية", en: "Unable to complete the MFA action" },
  error_action_change_password: { ar: "تعذر تغيير كلمة المرور", en: "Unable to change the password" },
  error_action_save_proposal_snapshot: { ar: "تعذر حفظ نسخة العرض", en: "Unable to save the proposal snapshot" },
  error_action_manage_contract_draft: { ar: "تعذر تنفيذ إجراء مسودة العقد", en: "Unable to complete the contract draft action" },
  error_action_download_proposal: { ar: "تعذر تنزيل ملف العطاء", en: "Unable to download the bid document" },
  error_action_sign_in: { ar: "تعذر تسجيل الدخول", en: "Unable to sign in" },
  error_action_update_profile: { ar: "تعذر تحديث الملف الشخصي", en: "Unable to update the profile" },
} as const satisfies Dict;

/** Compatibility alias for existing callers that index the dictionary with API codes. */
export const t: Dict = localizationRegistry;

export type TranslationKey = keyof typeof localizationRegistry;
export type TranslationInterpolationValues = Readonly<Record<string, string | number>>;

type NamedPlaceholder<S extends string> =
  S extends `${string}{{${infer Name}}}${infer Rest}`
    ? Name | NamedPlaceholder<Rest>
    : never;

export type TranslationPlaceholder<Key extends TranslationKey> =
  | NamedPlaceholder<(typeof localizationRegistry)[Key]["ar"]>
  | NamedPlaceholder<(typeof localizationRegistry)[Key]["en"]>;

export type TranslationValues<Key extends TranslationKey> = Readonly<
  Record<TranslationPlaceholder<Key>, string | number>
>;

type DynamicManifestShape = Readonly<
  Record<string, Readonly<Record<string, TranslationKey>>>
>;

/**
 * Finite lookup families for every computed translation lookup. Components
 * select a member here instead of assembling unchecked strings at runtime.
 */
export const DYNAMIC_TRANSLATION_KEY_MANIFEST = {
  status: {
    PENDING: "status_PENDING",
    PARSING: "status_PARSING",
    PARSED: "status_PARSED",
    FAILED: "status_FAILED",
    DRAFT: "status_DRAFT",
    DRAFTING: "status_DRAFTING",
    REVIEW: "status_REVIEW",
    SUBMITTED: "status_SUBMITTED",
    ARCHIVED: "status_ARCHIVED",
    QUEUED: "status_QUEUED",
    RUNNING: "status_RUNNING",
    COMPLETED: "status_COMPLETED",
    CANCELLED: "status_CANCELLED",
    APPROVED: "status_APPROVED",
    REJECTED: "status_REJECTED",
  },
  documentCategory: {
    RFP: "cat_RFP",
    TECHNICAL_SPECS: "cat_TECHNICAL_SPECS",
    IT_CONTRACT: "cat_IT_CONTRACT",
    EA_COMPLIANCE: "cat_EA_COMPLIANCE",
    QUALIFICATION: "cat_QUALIFICATION",
    FINANCIAL: "cat_FINANCIAL",
    BRAND_ASSET: "cat_BRAND_ASSET",
    OTHER: "cat_OTHER",
  },
  framework: {
    NCA_ECC1: "fw_NCA_ECC1",
    NCA_CCC1: "fw_NCA_CCC1",
    PDPL: "fw_PDPL",
    EA_TP1: "fw_EA_TP1",
    EA_SP1: "fw_EA_SP1",
    EA_SP2: "fw_EA_SP2",
    LOCAL_CONTENT: "fw_LOCAL_CONTENT",
    NORA: "fw_NORA",
  },
  agentName: {
    INGESTION: "agent_INGESTION_name",
    COMPLIANCE_REGULATORY: "agent_COMPLIANCE_REGULATORY_name",
    TECHNICAL_ARCHITECT: "agent_TECHNICAL_ARCHITECT_name",
    FINANCIAL_QUALIFICATION: "agent_FINANCIAL_QUALIFICATION_name",
    PROPOSAL_DRAFTING: "agent_PROPOSAL_DRAFTING_name",
    LAW_CONTRACT: "agent_LAW_CONTRACT_name",
  },
  agentDescription: {
    INGESTION: "agent_INGESTION_desc",
    COMPLIANCE_REGULATORY: "agent_COMPLIANCE_REGULATORY_desc",
    TECHNICAL_ARCHITECT: "agent_TECHNICAL_ARCHITECT_desc",
    FINANCIAL_QUALIFICATION: "agent_FINANCIAL_QUALIFICATION_desc",
    PROPOSAL_DRAFTING: "agent_PROPOSAL_DRAFTING_desc",
    LAW_CONTRACT: "agent_LAW_CONTRACT_desc",
  },
  /**
   * Mirrors `ANALYTICS_EVENT_TYPES` in `./analytics-collector` exactly, so every
   * vocabulary value has one registered bilingual label and no label exists for
   * a value no collector writes (requirement 4.10).
   */
  analyticsEvent: {
    PROPOSAL_CREATED: "event_proposal_created",
    PROPOSAL_EDITED: "event_proposal_edited",
    PROPOSAL_SUBMITTED: "event_proposal_submitted",
    PROPOSAL_APPROVED: "event_proposal_approved",
    PROPOSAL_REJECTED: "event_proposal_rejected",
    PROPOSAL_EXPORTED: "event_proposal_exported",
    AGENT_RUN_STARTED: "event_agent_run_started",
    AGENT_RUN_COMPLETED: "event_agent_run_completed",
    AGENT_RUN_FAILED: "event_agent_run_failed",
    AGENT_RUN_CANCELLED: "event_agent_run_cancelled",
    DOCUMENT_UPLOADED: "event_document_uploaded",
    DOCUMENT_VERSION_CREATED: "event_document_version_created",
    TEMPLATE_USED: "event_template_used",
    SECTION_ADDED: "event_section_added",
  },
  invitationDelivery: {
    PENDING: "invitation_delivery_pending",
    SENT: "invitation_delivery_sent",
    UNCONFIGURED: "invitation_delivery_unconfigured",
    FAILED: "invitation_delivery_failed",
  },
  recurringStatus: {
    DRAFT: "recurring_status_draft",
    ACTIVE: "recurring_status_active",
    SUSPENDED: "recurring_status_suspended",
    CANCELLED: "recurring_status_cancelled",
  },
  knowledgeRecord: {
    CERTIFICATE: "knowledge_record_certificate",
    PAST_PROJECT: "knowledge_record_past_project",
    METHODOLOGY_ASSET: "knowledge_record_methodology",
    CONTENT_LIBRARY_ITEM: "knowledge_record_library",
    STAFF_MEMBER: "knowledge_record_staff",
  },
  contractDifference: {
    ADDED: "contract_diff_added",
    REMOVED: "contract_diff_removed",
    MODIFIED: "contract_diff_modified",
    UNCHANGED: "contract_diff_unchanged",
  },
  marketplaceRating: {
    ONE: "marketplace_rating_1",
    TWO: "marketplace_rating_2",
    THREE: "marketplace_rating_3",
    FOUR: "marketplace_rating_4",
    FIVE: "marketplace_rating_5",
  },
  notificationEvent: {
    REVIEW_REQUESTED: "notification_review_requested_event",
    REVIEW_APPROVED: "notification_review_approved_event",
    REVIEW_REJECTED: "notification_review_rejected_event",
    SUBSCRIPTION_PAST_DUE: "notification_subscription_past_due_event",
    SUBSCRIPTION_FAILED: "notification_subscription_failed_event",
  },
  notificationDelivery: {
    PENDING: "notification_delivery_pending",
    SENT: "notification_delivery_sent",
    FAILED: "notification_delivery_failed",
    UNCONFIGURED: "notification_delivery_unconfigured",
  },
  /** Closes the `admin_role_${role}` lookup over the `Role` union in `./types`. */
  adminRole: {
    SUPER_ADMIN: "admin_role_SUPER_ADMIN",
    ADMIN: "admin_role_ADMIN",
    BIDDER: "admin_role_BIDDER",
    REVIEWER: "admin_role_REVIEWER",
    FINANCE: "admin_role_FINANCE",
  },
  invitationRole: {
    ADMINISTRATOR: "invitation_role_administrator",
    MEMBER: "invitation_role_member",
  },
  tenderType: {
    IT: "tender_IT",
    CONSTRUCTION: "tender_CONSTRUCTION",
    CONSULTING: "tender_CONSULTING",
    OPERATIONS: "tender_OPERATIONS",
    MEDICAL: "tender_MEDICAL",
    GENERAL: "tender_GENERAL",
  },
  accountDelivery: {
    SENT: "account_delivery_sent",
    UNCONFIGURED: "account_delivery_unconfigured",
    FAILED: "account_delivery_failed",
  },
  analyticsMetric: {
    PROPOSALS_CREATED: "metric_proposals_created",
    PROPOSALS_EXPORTED: "metric_proposals_exported",
    TEMPLATES_USED: "metric_templates_used",
    PROPOSAL_VIEWS: "metric_proposal_views",
    AGENT_RUNS_COMPLETED: "metric_agent_runs_completed",
    AGENT_RUNS_FAILED: "metric_agent_runs_failed",
    AGENT_MEDIAN_DURATION: "metric_agent_median_duration",
  },
  analyticsChart: {
    PROPOSALS_OVER_TIME: "chart_proposalsOverTime",
    EXPORTS_BY_TYPE: "chart_exportsByType",
    TEMPLATE_USAGE: "chart_templateUsage",
    SECTION_COMPLETION: "chart_sectionCompletion",
  },
  analyticsAxis: {
    DATE: "chart_axis_date",
    COUNT: "chart_axis_count",
    CATEGORY: "chart_axis_category",
  },
  analyticsPeriod: {
    LAST_7_DAYS: "analytics_period_7_days",
    LAST_30_DAYS: "analytics_period_30_days",
    LAST_90_DAYS: "analytics_period_90_days",
    LAST_YEAR: "analytics_period_1_year",
  },
  analyticsDifference: {
    INCREASE: "analytics_difference_increase",
    DECREASE: "analytics_difference_decrease",
    UNCHANGED: "analytics_difference_unchanged",
  },
  templateVariableType: {
    TEXT: "template_variable_type_text",
    NUMBER: "template_variable_type_number",
    DATE: "template_variable_type_date",
    SINGLE_CHOICE: "template_variable_type_single_choice",
  },
  legalReviewStatus: {
    UNREVIEWED: "legal_review_UNREVIEWED",
    NOT_REQUIRED: "legal_review_NOT_REQUIRED",
    REQUIRED: "legal_review_REQUIRED",
    PENDING: "legal_review_PENDING",
    APPROVED: "legal_review_APPROVED",
    NOT_LEGAL_ADVICE: "legal_review_NOT_LEGAL_ADVICE",
  },
  xlsxSheet: {
    MANIFEST: "xlsx_sheet_manifest",
    TABLE: "xlsx_sheet_table",
    KPI: "xlsx_sheet_kpi",
    EVIDENCE: "xlsx_sheet_evidence",
    COMMERCIAL: "xlsx_sheet_commercial",
  },
  /** Closes the manifest block-type column over the `ProposalBlockType` union. */
  xlsxBlockType: {
    NARRATIVE: "xlsx_block_type_narrative",
    BULLET_LIST: "xlsx_block_type_bullet_list",
    DIAGRAM: "xlsx_block_type_diagram",
    TABLE: "xlsx_block_type_table",
    KPI: "xlsx_block_type_kpi",
    EVIDENCE_REGISTER: "xlsx_block_type_evidence_register",
    COMMERCIAL_HANDOFF: "xlsx_block_type_commercial_handoff",
  },
  evidenceStatus: {
    VERIFIED: "evidence_status_verified",
    PENDING: "evidence_status_pending",
    NOT_AVAILABLE: "evidence_status_not_available",
  },
  pricingStatus: {
    USER_ENTRY_REQUIRED: "pricing_status_user_entry_required",
    VERIFIED_SOURCE_VALUES: "pricing_status_verified_source_values",
  },
  recurringInterval: {
    MONTHLY: "recurring_interval_monthly",
    YEARLY: "recurring_interval_yearly",
  },
  paymentState: {
    PENDING: "payment_state_pending",
    PAID: "payment_state_paid",
    FAILED: "payment_state_failed",
    EXPIRED: "payment_state_expired",
    CANCELLED: "payment_state_cancelled",
    UNKNOWN: "payment_state_unknown",
  },
  knowledgeDecision: {
    APPROVE: "knowledge_decision_confirm_approve",
    REJECT: "knowledge_decision_confirm_reject",
  },
  historySurface: {
    PROPOSAL: "proposal_history_title",
    DOCUMENT: "document_history_title",
  },
  routingNotice: {
    VIEW_NOT_FOUND: "routing_unknown_notice",
    VIEW_FORBIDDEN: "routing_forbidden_notice",
    PROJECT_UNAVAILABLE: "routing_project_unavailable_notice",
    PROJECT_REQUIRED: "routing_project_required_notice",
  },
  marketplaceLifecycleState: {
    PUBLISHED: "marketplace_state_published",
    RETIRED: "marketplace_state_retired",
  },
  // Requirement 9.8 displays the stored profile state; the four members below
  // close the vocabulary Requirement 9 defines.
  recurringProfileState: {
    DRAFT: "recurring_state_draft",
    ACTIVE: "recurring_state_active",
    SUSPENDED: "recurring_state_suspended",
    CANCELLED: "recurring_state_cancelled",
  },
  readinessState: {
    READY: "readiness_ready",
    NOT_READY: "readiness_not_ready",
  },
} as const satisfies DynamicManifestShape;

export type DynamicTranslationFamily = keyof typeof DYNAMIC_TRANSLATION_KEY_MANIFEST;
export type DynamicTranslationMember<Family extends DynamicTranslationFamily> =
  Extract<keyof (typeof DYNAMIC_TRANSLATION_KEY_MANIFEST)[Family], string>;
export type DynamicTranslationKey = {
  [Family in DynamicTranslationFamily]:
    (typeof DYNAMIC_TRANSLATION_KEY_MANIFEST)[Family][DynamicTranslationMember<Family>];
}[DynamicTranslationFamily];

export function getDynamicTranslationKey<
  Family extends DynamicTranslationFamily,
  Member extends DynamicTranslationMember<Family>,
>(
  family: Family,
  member: Member,
): (typeof DYNAMIC_TRANSLATION_KEY_MANIFEST)[Family][Member] {
  return DYNAMIC_TRANSLATION_KEY_MANIFEST[family][member];
}

export const COMPLETION_TRANSLATION_KEY_MANIFEST = {
  account: [
    "auth_register_title", "auth_email", "auth_password", "auth_workspace_name",
    "account_registration_success", "account_verification_pending", "account_recovery_confirmation",
    "account_delivery_sent", "account_delivery_unconfigured", "account_delivery_failed",
    "account_verification_email_subject", "account_verification_email_heading",
    "account_verification_email_intro", "account_verification_email_action",
    "account_verification_email_expiry", "account_verification_email_ignore",
  ],
  invitations: [
    "auth_invite_title", "invitation_list_title", "invitation_list_empty", "invitation_field_email",
    "invitation_field_role", "invitation_field_inviter", "invitation_field_expires",
    "invitation_revoke_action", "invitation_accept_success",
    "invitation_email_subject", "invitation_email_heading", "invitation_email_intro",
    "invitation_email_action", "invitation_email_expiry", "invitation_email_ignore",
  ],
  analytics: [
    "analytics_dashboard_title", "analytics_emptyRange", "analytics_range_start", "analytics_range_end",
    "analytics_previous_period", "analytics_median_unavailable", "analytics_unit_count",
    "analytics_unit_milliseconds", "analytics_loading", "analytics_load_failed",
    "metric_agent_median_duration", "chart_axis_date", "chart_axis_count", "chart_axis_category",
    "analytics_difference_increase", "analytics_difference_decrease", "analytics_difference_unchanged",
  ],
  clauses: [
    "clause_library_title", "clause_filter_category", "clause_filter_mandatory", "clause_loading",
    "clause_load_failed", "clause_create_failed", "clause_selection_limit", "clause_detail_title",
  ],
  templatesContracts: [
    "template_editor_title", "template_create_action", "template_update_action", "template_retire_action",
    "template_section_title", "template_variable_title", "template_clause_bindings", "template_preview_title",
    "template_history_title", "template_version_number", "contract_versions_title", "contract_history_empty",
    "contract_revision_number", "contract_compare_from", "contract_compare_to", "contract_integrity_failed",
    "template_variable_type_text", "template_variable_type_number", "template_variable_type_date",
    "template_variable_type_single_choice", "contract_legal_review_label", "contract_counsel_required",
    "contract_non_executable",
  ],
  xlsx: [
    "xlsx_sheet_manifest", "xlsx_manifest_revision", "xlsx_manifest_hash", "xlsx_manifest_plan_hash",
    "xlsx_manifest_locale", "xlsx_manifest_block_key", "xlsx_manifest_block_type", "xlsx_not_available",
    "xlsx_export_action", "xlsx_export_blocked", "xlsx_not_representable_marker",
    "xlsx_manifest_preset", "xlsx_manifest_timestamp", "xlsx_manifest_not_representable",
    "xlsx_manifest_marker_ar", "xlsx_manifest_marker_en", "xlsx_manifest_field", "xlsx_manifest_value",
    "xlsx_manifest_module_key", "xlsx_sheet_block_fallback",
    "xlsx_col_kpi_label", "xlsx_col_kpi_value", "xlsx_col_kpi_unit", "xlsx_col_kpi_as_of",
    "xlsx_col_evidence_label", "xlsx_col_evidence_status", "xlsx_col_source_refs",
    "xlsx_col_commercial_description", "xlsx_col_commercial_amount", "xlsx_col_commercial_currency",
    "xlsx_attr_module_title", "xlsx_attr_block_title", "xlsx_attr_pricing_status",
    "xlsx_attr_commercial_instruction",
    "xlsx_block_type_narrative", "xlsx_block_type_bullet_list", "xlsx_block_type_diagram",
    "xlsx_block_type_table", "xlsx_block_type_kpi", "xlsx_block_type_evidence_register",
    "xlsx_block_type_commercial_handoff",
    "evidence_status_verified", "evidence_status_pending", "evidence_status_not_available",
    "pricing_status_user_entry_required", "pricing_status_verified_source_values",
  ],
  recurringBillingReconciliation: [
    "recurring_billing_title", "recurring_profile_amount", "recurring_profile_currency",
    "recurring_profile_interval_days", "recurring_profile_state", "recurring_start_action",
    "recurring_single_cycle_action", "reconcile_title", "reconcile_col_currency",
    "reconcile_summary_scanned", "reconcile_summary_paid", "reconcile_summary_failed",
    "reconcile_summary_unresolved", "reconcile_load_failed",
    "payment_state_pending", "payment_state_paid", "payment_state_failed",
    "payment_state_expired", "payment_state_cancelled", "payment_state_unknown",
    "recurring_state_draft", "recurring_state_active",
    "recurring_state_suspended", "recurring_state_cancelled",
  ],
  knowledge: [
    "knowledge_approval_title", "knowledge_approval_empty", "knowledge_col_type", "knowledge_col_title",
    "knowledge_col_submitter", "knowledge_col_submitted_at", "knowledge_col_expiry", "knowledge_col_evidence",
    "knowledge_no_expiry", "knowledge_no_evidence", "knowledge_pending_count", "knowledge_decision_conflict",
    "knowledge_decision_confirm_approve", "knowledge_decision_confirm_reject",
  ],
  commentsPresence: [
    "comment_edited", "comment_withdrawn", "comment_edited_at", "comment_content_hint",
    "comment_save_edit", "comment_cancel_edit", "comment_delete_confirm", "comment_empty_title",
    "comments_load_failed", "comments_unavailable_schema", "presence_viewers_count",
    "presence_total_count", "presence_last_heartbeat", "presence_offline", "presence_stream_failed",
  ],
  historyRouting: [
    "proposal_history_title", "document_history_title", "history_revision_label", "history_change_log",
    "history_author", "history_created_at", "history_oldest_reached", "history_revert_confirm",
    "routing_unknown_notice", "routing_forbidden_notice", "routing_project_unavailable_notice",
    "routing_project_required_notice", "routing_restoring_link", "action_load_more",
  ],
  marketplace: [
    "marketplace_title", "marketplace_detail_title", "marketplace_publish_action",
    "marketplace_retire_action", "marketplace_apply_action", "marketplace_empty",
    "marketplace_filter_empty", "marketplace_clear_filters", "marketplace_publisher",
    "marketplace_lifecycle_state", "marketplace_section_outline", "marketplace_apply_success",
    "marketplace_state_published", "marketplace_state_retired", "marketplace_rating_unrated",
    "marketplace_average_rating_value", "marketplace_section_outline_entry",
  ],
  readiness: [
    "readiness_title", "readiness_ready", "readiness_not_ready", "readiness_liveness",
    "readiness_missing_migrations", "readiness_capabilities", "readiness_checked_at", "readiness_retry_action",
  ],
  notifications: [
    "notification_inbox_title", "notification_inbox_empty", "notification_inbox_unavailable",
    "notification_open_action",
    "notification_review_requested_event", "notification_review_approved_event",
    "notification_review_rejected_event", "notification_subscription_past_due_event",
    "notification_subscription_failed_event", "notification_minimized_subject", "notification_minimized_body",
    "notification_delivery_pending", "notification_delivery_sent", "notification_delivery_failed",
    "notification_delivery_unconfigured",
  ],
  aiAssist: [
    "ai_assist_optimize_proposal", "ai_assist_analyze_compliance", "ai_assist_draft_contract",
    "ai_assist_match_vendors", "ai_assist_failed", "ai_assist_done", "ai_assist_score",
    "ai_assist_win_prob", "ai_assist_compliance_summary", "ai_assist_contract_summary",
    "ai_assist_vendor_top", "ai_assist_vendor_need_context",
  ],
  integrityErrors: [
    "REQUEST_VALIDATION_FAILED", "AUTHENTICATION_REQUIRED", "WORKSPACE_ROLE_FORBIDDEN",
    "TENANT_ACCESS_FORBIDDEN", "RESOURCE_NOT_FOUND",
    "DOCUMENT_LANGUAGE_MISSING", "DOCUMENT_LANGUAGE_INVALID", "LOCALIZATION_KEY_MISSING",
    "LOCALIZATION_PLACEHOLDER_MISMATCH", "INTERNAL_ERROR",
  ],
} as const satisfies Readonly<Record<string, readonly TranslationKey[]>>;

export type CompletionSurface = keyof typeof COMPLETION_TRANSLATION_KEY_MANIFEST;
export type CompletionTranslationKey =
  (typeof COMPLETION_TRANSLATION_KEY_MANIFEST)[CompletionSurface][number];

type ErrorContractDefinition = Readonly<{
  actionKey: TranslationKey;
  messageKey: TranslationKey;
}>;

/** Stable code -> action + reason keys used by API/UI error mappers. */
export const COMPLETION_ERROR_CONTRACTS = {
  REGISTRATION_INVALID: { actionKey: "error_action_register_account", messageKey: "REGISTRATION_INVALID" },
  EMAIL_ALREADY_REGISTERED: { actionKey: "error_action_register_account", messageKey: "EMAIL_ALREADY_REGISTERED" },
  RESERVED_IDENTITY: { actionKey: "error_action_register_account", messageKey: "RESERVED_IDENTITY" },
  REGISTRATION_RATE_LIMITED: { actionKey: "error_action_register_account", messageKey: "REGISTRATION_RATE_LIMITED" },
  VERIFICATION_TOKEN_INVALID: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_TOKEN_INVALID" },
  VERIFICATION_RATE_LIMITED: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_RATE_LIMITED" },
  VERIFICATION_EMAIL_UNCONFIGURED: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_EMAIL_UNCONFIGURED" },
  VERIFICATION_RESEND_INVALID: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_RESEND_INVALID" },
  VERIFICATION_RESEND_RATE_LIMITED: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_RESEND_RATE_LIMITED" },
  VERIFICATION_EMAIL_SEND_FAILED: { actionKey: "error_action_verify_email", messageKey: "VERIFICATION_EMAIL_SEND_FAILED" },
  EMAIL_VERIFICATION_REQUIRED: { actionKey: "error_action_verify_email", messageKey: "EMAIL_VERIFICATION_REQUIRED" },
  RECOVERY_TOKEN_INVALID: { actionKey: "error_action_recover_account", messageKey: "RECOVERY_TOKEN_INVALID" },
  RECOVERY_RATE_LIMITED: { actionKey: "error_action_recover_account", messageKey: "RECOVERY_RATE_LIMITED" },
  RECOVERY_PASSWORD_REJECTED: { actionKey: "error_action_recover_account", messageKey: "RECOVERY_PASSWORD_REJECTED" },
  RECOVERY_EMAIL_UNCONFIGURED: { actionKey: "error_action_recover_account", messageKey: "RECOVERY_EMAIL_UNCONFIGURED" },
  INVITE_FORBIDDEN: { actionKey: "error_action_manage_invitation", messageKey: "INVITE_FORBIDDEN" },
  ALREADY_A_MEMBER: { actionKey: "error_action_manage_invitation", messageKey: "ALREADY_A_MEMBER" },
  SEAT_LIMIT_REACHED: { actionKey: "error_action_manage_invitation", messageKey: "SEAT_LIMIT_REACHED" },
  INVITATION_REVOKED: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_REVOKED" },
  INVITATION_TOKEN_INVALID: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_TOKEN_INVALID" },
  INVITATION_EMAIL_MISMATCH: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_EMAIL_MISMATCH" },
  INVITATION_ACCEPTANCE_INVALID: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_ACCEPTANCE_INVALID" },
  INVITATION_RATE_LIMITED: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_RATE_LIMITED" },
  INVITATION_RATE_LIMIT_UNAVAILABLE: { actionKey: "error_action_manage_invitation", messageKey: "INVITATION_RATE_LIMIT_UNAVAILABLE" },
  RATE_LIMIT_UNAVAILABLE: { actionKey: "error_action_complete_request", messageKey: "RATE_LIMIT_UNAVAILABLE" },
  INVALID_CREDENTIALS: { actionKey: "error_action_sign_in", messageKey: "INVALID_CREDENTIALS" },
  LOGIN_RATE_LIMITED: { actionKey: "error_action_sign_in", messageKey: "LOGIN_RATE_LIMITED" },
  PASSWORD_CHANGE_RATE_LIMITED: { actionKey: "error_action_change_password", messageKey: "PASSWORD_CHANGE_RATE_LIMITED" },
  MFA_SETUP_RATE_LIMITED: { actionKey: "error_action_manage_mfa", messageKey: "MFA_SETUP_RATE_LIMITED" },
  MFA_VERIFY_RATE_LIMITED: { actionKey: "error_action_manage_mfa", messageKey: "MFA_VERIFY_RATE_LIMITED" },
  MFA_DISABLE_RATE_LIMITED: { actionKey: "error_action_manage_mfa", messageKey: "MFA_DISABLE_RATE_LIMITED" },
  PROFILE_UPDATE_RATE_LIMITED: { actionKey: "error_action_update_profile", messageKey: "PROFILE_UPDATE_RATE_LIMITED" },
  AVATAR_UPLOAD_RATE_LIMITED: { actionKey: "error_action_update_profile", messageKey: "AVATAR_UPLOAD_RATE_LIMITED" },
  PROPOSAL_DOWNLOAD_RATE_LIMITED: { actionKey: "error_action_download_proposal", messageKey: "PROPOSAL_DOWNLOAD_RATE_LIMITED" },
  ANALYTICS_DATE_RANGE_REQUIRED: { actionKey: "error_action_load_analytics", messageKey: "ANALYTICS_DATE_RANGE_REQUIRED" },
  ANALYTICS_DATE_INVALID: { actionKey: "error_action_load_analytics", messageKey: "ANALYTICS_DATE_INVALID" },
  ANALYTICS_DATE_RANGE_INVALID: { actionKey: "error_action_load_analytics", messageKey: "ANALYTICS_DATE_RANGE_INVALID" },
  ANALYTICS_RANGE_TOO_LARGE: { actionKey: "error_action_load_analytics", messageKey: "ANALYTICS_RANGE_TOO_LARGE" },
  ANALYTICS_EVENT_TYPE_INVALID: { actionKey: "error_action_load_analytics", messageKey: "ANALYTICS_EVENT_TYPE_INVALID" },
  CLAUSE_NOT_FOUND: { actionKey: "error_action_manage_clause", messageKey: "CLAUSE_NOT_FOUND" },
  CLAUSE_TRANSLATION_MISSING: { actionKey: "error_action_manage_clause", messageKey: "CLAUSE_TRANSLATION_MISSING" },
  UNSAFE_CLAUSE_TEXT: { actionKey: "error_action_manage_clause", messageKey: "UNSAFE_CLAUSE_TEXT" },
  CLAUSE_FIELD_INVALID: { actionKey: "error_action_manage_clause", messageKey: "CLAUSE_FIELD_INVALID" },
  RESERVED_TEMPLATE_KEY: { actionKey: "error_action_manage_template", messageKey: "RESERVED_TEMPLATE_KEY" },
  UNREFERENCED_TEMPLATE_VARIABLE: { actionKey: "error_action_manage_template", messageKey: "UNREFERENCED_TEMPLATE_VARIABLE" },
  UNDECLARED_TEMPLATE_VARIABLE: { actionKey: "error_action_manage_template", messageKey: "UNDECLARED_TEMPLATE_VARIABLE" },
  TEMPLATE_NOT_FOUND: { actionKey: "error_action_manage_template", messageKey: "TEMPLATE_NOT_FOUND" },
  TEMPLATE_SUBMISSION_INVALID: { actionKey: "error_action_manage_template", messageKey: "TEMPLATE_SUBMISSION_INVALID" },
  TEMPLATE_KEY_IN_USE: { actionKey: "error_action_manage_template", messageKey: "TEMPLATE_KEY_IN_USE" },
  TEMPLATE_VERSION_CONFLICT: { actionKey: "error_action_manage_template", messageKey: "TEMPLATE_VERSION_CONFLICT" },
  TEMPLATE_VERSION_NOT_FOUND: { actionKey: "error_action_manage_template", messageKey: "TEMPLATE_VERSION_NOT_FOUND" },
  CONTRACT_REVISION_NOT_FOUND: { actionKey: "error_action_load_contract_history", messageKey: "CONTRACT_REVISION_NOT_FOUND" },
  CONTRACT_REVISION_INTEGRITY_FAILURE: { actionKey: "error_action_load_contract_history", messageKey: "CONTRACT_REVISION_INTEGRITY_FAILURE" },
  STRUCTURED_SNAPSHOT_REQUIRED: { actionKey: "error_action_export_xlsx", messageKey: "STRUCTURED_SNAPSHOT_REQUIRED" },
  XLSX_BILINGUAL_LABEL_MISSING: { actionKey: "error_action_export_xlsx", messageKey: "XLSX_BILINGUAL_LABEL_MISSING" },
  XLSX_EXPORT_FAILED: { actionKey: "error_action_export_xlsx", messageKey: "XLSX_EXPORT_FAILED" },
  BILLING_PROVIDER_UNCONFIGURED: { actionKey: "error_action_manage_recurring", messageKey: "BILLING_PROVIDER_UNCONFIGURED" },
  RECURRING_UNAVAILABLE: { actionKey: "error_action_manage_recurring", messageKey: "RECURRING_UNAVAILABLE" },
  RECURRING_PROFILE_EXISTS: { actionKey: "error_action_manage_recurring", messageKey: "RECURRING_PROFILE_EXISTS" },
  RECURRING_STATE_CONFLICT: { actionKey: "error_action_manage_recurring", messageKey: "RECURRING_STATE_CONFLICT" },
  RECURRING_PROVIDER_ERROR: { actionKey: "error_action_manage_recurring", messageKey: "RECURRING_PROVIDER_ERROR" },
  ADMIN_REQUIRED: { actionKey: "error_action_reconcile_billing", messageKey: "ADMIN_REQUIRED" },
  RECONCILE_ALREADY_APPLIED: { actionKey: "error_action_reconcile_billing", messageKey: "RECONCILE_ALREADY_APPLIED" },
  RECONCILE_PROVIDER_MISMATCH: { actionKey: "error_action_reconcile_billing", messageKey: "RECONCILE_PROVIDER_MISMATCH" },
  RECONCILE_PROVIDER_UNRESOLVED: { actionKey: "error_action_reconcile_billing", messageKey: "RECONCILE_PROVIDER_UNRESOLVED" },
  APPROVAL_FORBIDDEN: { actionKey: "error_action_decide_knowledge", messageKey: "APPROVAL_FORBIDDEN" },
  EVIDENCE_VERSION_MISSING: { actionKey: "error_action_decide_knowledge", messageKey: "EVIDENCE_VERSION_MISSING" },
  KNOWLEDGE_EVIDENCE_INVALID: { actionKey: "error_action_decide_knowledge", messageKey: "KNOWLEDGE_EVIDENCE_INVALID" },
  KNOWLEDGE_REVOCATION_INVALID: { actionKey: "error_action_decide_knowledge", messageKey: "KNOWLEDGE_REVOCATION_INVALID" },
  INVALID_QUEUE_CURSOR: { actionKey: "error_action_decide_knowledge", messageKey: "INVALID_QUEUE_CURSOR" },
  KNOWLEDGE_RECORD_NOT_FOUND: { actionKey: "error_action_decide_knowledge", messageKey: "KNOWLEDGE_RECORD_NOT_FOUND" },
  REJECTION_REASON_INVALID: { actionKey: "error_action_decide_knowledge", messageKey: "REJECTION_REASON_INVALID" },
  KNOWLEDGE_DECISION_ALREADY_RECORDED: { actionKey: "error_action_decide_knowledge", messageKey: "KNOWLEDGE_DECISION_ALREADY_RECORDED" },
  COMMENT_EDIT_FORBIDDEN: { actionKey: "error_action_manage_comment", messageKey: "COMMENT_EDIT_FORBIDDEN" },
  COMMENT_RESOLVED: { actionKey: "error_action_manage_comment", messageKey: "COMMENT_RESOLVED" },
  COMMENT_DELETE_FORBIDDEN: { actionKey: "error_action_manage_comment", messageKey: "COMMENT_DELETE_FORBIDDEN" },
  COMMENT_CONTENT_INVALID: { actionKey: "error_action_manage_comment", messageKey: "COMMENT_CONTENT_INVALID" },
  COMMENT_NOT_FOUND: { actionKey: "error_action_manage_comment", messageKey: "COMMENT_NOT_FOUND" },
  PRESENCE_UNAVAILABLE: { actionKey: "error_action_update_presence", messageKey: "PRESENCE_UNAVAILABLE" },
  VERSION_NOT_FOUND: { actionKey: "error_action_load_version_history", messageKey: "VERSION_NOT_FOUND" },
  VERSION_CURSOR_INVALID: { actionKey: "error_action_load_version_history", messageKey: "VERSION_CURSOR_INVALID" },
  REVERT_FORBIDDEN: { actionKey: "error_action_load_version_history", messageKey: "REVERT_FORBIDDEN" },
  DOCUMENT_VERSION_REQUEST_INVALID: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_REQUEST_INVALID" },
  DOCUMENT_VERSION_FILE_MISSING: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_FILE_MISSING" },
  DOCUMENT_VERSION_SIZE_MISMATCH: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_SIZE_MISMATCH" },
  DOCUMENT_VERSION_CHECKSUM_MISSING: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_CHECKSUM_MISSING" },
  DOCUMENT_VERSION_BYTES_UNAVAILABLE: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_BYTES_UNAVAILABLE" },
  DOCUMENT_VERSION_INTEGRITY_FAILED: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_INTEGRITY_FAILED" },
  DOCUMENT_VERSION_CONFLICT: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_VERSION_CONFLICT" },
  DOCUMENT_COMPARE_VERSIONS_MISSING: { actionKey: "error_action_load_version_history", messageKey: "DOCUMENT_COMPARE_VERSIONS_MISSING" },
  DOCUMENT_UPLOAD_FORM_INVALID: { actionKey: "error_action_upload_document", messageKey: "DOCUMENT_UPLOAD_FORM_INVALID" },
  DOCUMENT_FILE_MISSING: { actionKey: "error_action_upload_document", messageKey: "DOCUMENT_FILE_MISSING" },
  DOCUMENT_METADATA_MISSING: { actionKey: "error_action_upload_document", messageKey: "DOCUMENT_METADATA_MISSING" },
  DOCUMENT_PROJECT_MISSING: { actionKey: "error_action_upload_document", messageKey: "DOCUMENT_PROJECT_MISSING" },
  DOCUMENT_EVIDENCE_DELETE_FORBIDDEN: { actionKey: "error_action_access_resource", messageKey: "DOCUMENT_EVIDENCE_DELETE_FORBIDDEN" },
  DOCUMENT_EVIDENCE_DELETE_CONFLICT: { actionKey: "error_action_access_resource", messageKey: "DOCUMENT_EVIDENCE_DELETE_CONFLICT" },
  ROUTE_VIEW_NOT_FOUND: { actionKey: "error_action_resolve_route", messageKey: "ROUTE_VIEW_NOT_FOUND" },
  ROUTE_VIEW_FORBIDDEN: { actionKey: "error_action_resolve_route", messageKey: "ROUTE_VIEW_FORBIDDEN" },
  ROUTE_VIEW_MOVED: { actionKey: "error_action_resolve_route", messageKey: "ROUTE_VIEW_MOVED" },
  ROUTE_PROJECT_UNAVAILABLE: { actionKey: "error_action_resolve_route", messageKey: "ROUTE_PROJECT_UNAVAILABLE" },
  ROUTE_PROJECT_REQUIRED: { actionKey: "error_action_resolve_route", messageKey: "ROUTE_PROJECT_REQUIRED" },
  MARKETPLACE_TRANSLATION_MISSING: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_TRANSLATION_MISSING" },
  MARKETPLACE_ENTRY_RETIRED: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_ENTRY_RETIRED" },
  MARKETPLACE_RETIRE_FORBIDDEN: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_RETIRE_FORBIDDEN" },
  MARKETPLACE_RATING_INVALID: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_RATING_INVALID" },
  MARKETPLACE_ENTRY_NOT_FOUND: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_ENTRY_NOT_FOUND" },
  MARKETPLACE_FORBIDDEN: { actionKey: "error_action_manage_marketplace", messageKey: "MARKETPLACE_FORBIDDEN" },
  SCHEMA_MIGRATION_PENDING: { actionKey: "error_action_check_readiness", messageKey: "SCHEMA_MIGRATION_PENDING" },
  READINESS_DATABASE_UNREACHABLE: { actionKey: "error_action_check_readiness", messageKey: "READINESS_DATABASE_UNREACHABLE" },
  READINESS_MIGRATION_QUERY_FAILED: { actionKey: "error_action_check_readiness", messageKey: "READINESS_MIGRATION_QUERY_FAILED" },
  READINESS_TIMEOUT: { actionKey: "error_action_check_readiness", messageKey: "READINESS_TIMEOUT" },
  NOTIFICATION_EMAIL_UNCONFIGURED: { actionKey: "error_action_deliver_notification", messageKey: "NOTIFICATION_EMAIL_UNCONFIGURED" },
  NOTIFICATION_DELIVERY_FAILED: { actionKey: "error_action_deliver_notification", messageKey: "NOTIFICATION_DELIVERY_FAILED" },
  REQUEST_VALIDATION_FAILED: { actionKey: "error_action_validate_request", messageKey: "REQUEST_VALIDATION_FAILED" },
  AUTHENTICATION_REQUIRED: { actionKey: "error_action_access_resource", messageKey: "AUTHENTICATION_REQUIRED" },
  WORKSPACE_ROLE_FORBIDDEN: { actionKey: "error_action_access_resource", messageKey: "WORKSPACE_ROLE_FORBIDDEN" },
  TENANT_ACCESS_FORBIDDEN: { actionKey: "error_action_access_resource", messageKey: "TENANT_ACCESS_FORBIDDEN" },
  RESOURCE_NOT_FOUND: { actionKey: "error_action_access_resource", messageKey: "RESOURCE_NOT_FOUND" },
  DOCUMENT_LANGUAGE_MISSING: { actionKey: "error_action_validate_document_language", messageKey: "DOCUMENT_LANGUAGE_MISSING" },
  DOCUMENT_LANGUAGE_INVALID: { actionKey: "error_action_validate_document_language", messageKey: "DOCUMENT_LANGUAGE_INVALID" },
  LOCALIZATION_KEY_MISSING: { actionKey: "error_action_complete_request", messageKey: "LOCALIZATION_KEY_MISSING" },
  LOCALIZATION_PLACEHOLDER_MISMATCH: { actionKey: "error_action_complete_request", messageKey: "LOCALIZATION_PLACEHOLDER_MISMATCH" },
  INTERNAL_ERROR: { actionKey: "error_action_complete_request", messageKey: "INTERNAL_ERROR" },
  // MFA and password error codes (audit: i18n — replace hardcoded English)
  MFA_NOT_SET_UP: { actionKey: "error_action_manage_mfa", messageKey: "MFA_NOT_SET_UP" },
  MFA_TOKEN_INVALID: { actionKey: "error_action_manage_mfa", messageKey: "MFA_TOKEN_INVALID" },
  MFA_ROTATION_TOKEN_REQUIRED: { actionKey: "error_action_manage_mfa", messageKey: "MFA_ROTATION_TOKEN_REQUIRED" },
  MFA_PASSWORD_REQUIRED: { actionKey: "error_action_manage_mfa", messageKey: "MFA_PASSWORD_REQUIRED" },
  MFA_REPLAYED_TOKEN: { actionKey: "error_action_manage_mfa", messageKey: "MFA_REPLAYED_TOKEN" },
  PASSWORD_INCORRECT: { actionKey: "error_action_change_password", messageKey: "PASSWORD_INCORRECT" },
  AVATAR_TOO_LARGE: { actionKey: "error_action_complete_request", messageKey: "AVATAR_TOO_LARGE" },
  EMAIL_ALREADY_IN_USE: { actionKey: "error_action_complete_request", messageKey: "EMAIL_ALREADY_IN_USE" },
  CANNOT_DEACTIVATE_OWN_ACCOUNT: { actionKey: "error_action_complete_request", messageKey: "CANNOT_DEACTIVATE_OWN_ACCOUNT" },
  DATABASE_URL_PROTECTED: { actionKey: "error_action_complete_request", messageKey: "DATABASE_URL_PROTECTED" },
  PROVIDER_NOT_FOUND: { actionKey: "error_action_complete_request", messageKey: "PROVIDER_NOT_FOUND" },
  INVALID_JSON_BODY: { actionKey: "error_action_validate_request", messageKey: "INVALID_JSON_BODY" },
  INVALID_REQUEST: { actionKey: "error_action_validate_request", messageKey: "INVALID_REQUEST" },
  INVALID_VERSION: { actionKey: "error_action_complete_request", messageKey: "INVALID_VERSION" },
  NO_BRAND_PROFILE: { actionKey: "error_action_complete_request", messageKey: "NO_BRAND_PROFILE" },
  LOGO_IMAGE_TYPE_UNSUPPORTED: { actionKey: "error_action_complete_request", messageKey: "LOGO_IMAGE_TYPE_UNSUPPORTED" },
  LOGO_IMAGE_UNREADABLE: { actionKey: "error_action_complete_request", messageKey: "LOGO_IMAGE_UNREADABLE" },
  MISSION_NOT_FOUND: { actionKey: "error_action_run_agent", messageKey: "MISSION_NOT_FOUND" },
  ONBOARDING_INCOMPLETE: { actionKey: "error_action_run_agent", messageKey: "ONBOARDING_INCOMPLETE" },
  AGENT_RUN_IN_PROGRESS: { actionKey: "error_action_run_agent", messageKey: "AGENT_RUN_IN_PROGRESS" },
  AI_RATE_LIMITED: { actionKey: "error_action_run_agent", messageKey: "AI_RATE_LIMITED" },
  NO_DOCUMENTS: { actionKey: "error_action_run_agent", messageKey: "NO_DOCUMENTS" },
  AI_RATE_LIMIT_UNAVAILABLE: { actionKey: "error_action_run_agent", messageKey: "AI_RATE_LIMIT_UNAVAILABLE" },
  AI_PROVIDER_UNAVAILABLE: { actionKey: "error_action_run_agent", messageKey: "AI_PROVIDER_UNAVAILABLE" },
  PRICING_REFUSED: { actionKey: "error_action_run_agent", messageKey: "PRICING_REFUSED" },
  LIVE_VOICE_START_FAILED: { actionKey: "error_action_run_agent", messageKey: "LIVE_VOICE_START_FAILED" },
  AGENT_TOOL_FAILED: { actionKey: "error_action_run_agent", messageKey: "AGENT_TOOL_FAILED" },
  SECRET_DECRYPTION_FAILED: { actionKey: "error_action_complete_request", messageKey: "SECRET_DECRYPTION_FAILED" },
  EXTENSION_PACK_FAILED: { actionKey: "error_action_complete_request", messageKey: "EXTENSION_PACK_FAILED" },
  QUOTA_DOCUMENTS_EXCEEDED: { actionKey: "error_action_complete_request", messageKey: "QUOTA_DOCUMENTS_EXCEEDED" },
  QUOTA_PROPOSALS_EXCEEDED: { actionKey: "error_action_complete_request", messageKey: "QUOTA_PROPOSALS_EXCEEDED" },
  QUOTA_STORAGE_EXCEEDED: { actionKey: "error_action_complete_request", messageKey: "QUOTA_STORAGE_EXCEEDED" },
  QUOTA_TOKENS_EXCEEDED: { actionKey: "error_action_complete_request", messageKey: "QUOTA_TOKENS_EXCEEDED" },
  SUBSCRIPTION_INACTIVE: { actionKey: "error_action_complete_request", messageKey: "SUBSCRIPTION_INACTIVE" },
  SNAPSHOT_BODY_TOO_LARGE: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_BODY_TOO_LARGE" },
  INVALID_SNAPSHOT_JSON: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_JSON" },
  INVALID_SNAPSHOT_REQUEST: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_REQUEST" },
  INVALID_SNAPSHOT_SHAPE: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_SHAPE" },
  INVALID_SNAPSHOT_IDENTITY: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_IDENTITY" },
  INVALID_SNAPSHOT_REVISION: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_REVISION" },
  INVALID_SNAPSHOT_CONTENT: { actionKey: "error_action_save_proposal_snapshot", messageKey: "INVALID_SNAPSHOT_CONTENT" },
  PERSISTED_SNAPSHOT_METADATA_MISMATCH: { actionKey: "error_action_save_proposal_snapshot", messageKey: "PERSISTED_SNAPSHOT_METADATA_MISMATCH" },
  SNAPSHOT_REVISION_CONFLICT: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_REVISION_CONFLICT" },
  STRUCTURED_IDENTITY_MISMATCH: { actionKey: "error_action_save_proposal_snapshot", messageKey: "STRUCTURED_IDENTITY_MISMATCH" },
  STRUCTURED_EVIDENCE_NOT_APPROVED: { actionKey: "error_action_save_proposal_snapshot", messageKey: "STRUCTURED_EVIDENCE_NOT_APPROVED" },
  STRUCTURED_SNAPSHOT_TYPE_MISMATCH: { actionKey: "error_action_save_proposal_snapshot", messageKey: "STRUCTURED_SNAPSHOT_TYPE_MISMATCH" },
  STRUCTURED_SNAPSHOT_REQUIRED_FOR_XLSX: { actionKey: "error_action_export_xlsx", messageKey: "STRUCTURED_SNAPSHOT_REQUIRED_FOR_XLSX" },
  STRUCTURED_EXPORT_BLOCKED: { actionKey: "error_action_download_proposal", messageKey: "STRUCTURED_EXPORT_BLOCKED" },
  EXPORT_STATE_CHANGED: { actionKey: "error_action_download_proposal", messageKey: "EXPORT_STATE_CHANGED" },
  PDF_UNAVAILABLE: { actionKey: "error_action_download_proposal", messageKey: "PDF_UNAVAILABLE" },
  CONTRACT_RENDER_SNAPSHOT_REQUIRED: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_REQUIRED" },
  CONTRACT_RENDER_SNAPSHOT_INVALID: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_INVALID" },
  CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH" },
  CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH" },
  CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH" },
  CONTRACT_RENDER_SNAPSHOT_TOO_LARGE: { actionKey: "error_action_download_proposal", messageKey: "CONTRACT_RENDER_SNAPSHOT_TOO_LARGE" },
  SNAPSHOT_SERVER_IDENTITY_NOT_FOUND: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_SERVER_IDENTITY_NOT_FOUND" },
  SNAPSHOT_WRITE_FAILED: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_WRITE_FAILED" },
  SNAPSHOT_READ_FAILED: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_READ_FAILED" },
  SNAPSHOT_HYDRATION_FAILED: { actionKey: "error_action_save_proposal_snapshot", messageKey: "SNAPSHOT_HYDRATION_FAILED" },
  EMPTY_PROPOSAL_CONTENT: { actionKey: "error_action_save_proposal_snapshot", messageKey: "EMPTY_PROPOSAL_CONTENT" },
  STATUS_LOCKED: { actionKey: "error_action_save_proposal_snapshot", messageKey: "STATUS_LOCKED" },
  PROPOSAL_VERSION_CONFLICT: { actionKey: "error_action_save_proposal_snapshot", messageKey: "PROPOSAL_VERSION_CONFLICT" },
  UNSUPPORTED_EXPORT_FORMAT: { actionKey: "error_action_download_proposal", messageKey: "UNSUPPORTED_EXPORT_FORMAT" },
  STRUCTURED_EXPORT_FORMAT_UNSUPPORTED: { actionKey: "error_action_download_proposal", messageKey: "STRUCTURED_EXPORT_FORMAT_UNSUPPORTED" },
  FINAL_REVIEW_BINDING_INVALID: { actionKey: "error_action_download_proposal", messageKey: "FINAL_REVIEW_BINDING_INVALID" },
  BILINGUAL_LANGUAGE_DIRECTION_INVALID: { actionKey: "error_action_validate_document_language", messageKey: "BILINGUAL_LANGUAGE_DIRECTION_INVALID" },
  BILINGUAL_COUNTERPART_REQUIRED: { actionKey: "error_action_validate_document_language", messageKey: "BILINGUAL_COUNTERPART_REQUIRED" },
  FORBIDDEN: { actionKey: "error_action_access_resource", messageKey: "FORBIDDEN" },
  UNAUTHORIZED: { actionKey: "error_action_access_resource", messageKey: "UNAUTHORIZED" },
  PROPOSAL_NOT_FOUND: { actionKey: "error_action_access_resource", messageKey: "PROPOSAL_NOT_FOUND" },
  PROJECT_NOT_FOUND: { actionKey: "error_action_access_resource", messageKey: "PROJECT_NOT_FOUND" },
  AGENT_RUN_NOT_FOUND: { actionKey: "error_action_access_resource", messageKey: "AGENT_RUN_NOT_FOUND" },
  AGENT_RUN_SELECTOR_MISSING: { actionKey: "error_action_run_agent", messageKey: "AGENT_RUN_SELECTOR_MISSING" },
  CONTRACT_DRAFT_BODY_TOO_LARGE: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_BODY_TOO_LARGE" },
  CONTRACT_DRAFT_CONTENT_TYPE_UNSUPPORTED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_CONTENT_TYPE_UNSUPPORTED" },
  CONTRACT_DRAFT_INVALID_CONTENT_LENGTH: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_INVALID_CONTENT_LENGTH" },
  CONTRACT_DRAFT_INVALID_JSON: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_INVALID_JSON" },
  CONTRACT_DRAFT_INVALID_REQUEST: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_INVALID_REQUEST" },
  CONTRACT_DRAFT_BODY_INVALID: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_BODY_INVALID" },
  CONTRACT_DRAFT_ID_INVALID: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_ID_INVALID" },
  CONTRACT_DRAFT_QUERY_INVALID: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_QUERY_INVALID" },
  CONTRACT_DRAFT_LIST_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_LIST_FAILED" },
  CONTRACT_DRAFT_READ_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_READ_FAILED" },
  CONTRACT_DRAFT_UPDATE_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_UPDATE_FAILED" },
  CONTRACT_DRAFT_DELETE_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_DELETE_FAILED" },
  CONTRACT_DRAFT_PERSISTENCE_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_PERSISTENCE_FAILED" },
  CONTRACT_DRAFT_PROJECT_NOT_FOUND: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_PROJECT_NOT_FOUND" },
  CONTRACT_DRAFT_NOT_FOUND: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_NOT_FOUND" },
  CONTRACT_DRAFT_RATE_LIMITED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_RATE_LIMITED" },
  CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE" },
  CONTRACT_DRAFT_WORKSPACE_NOT_FOUND: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_WORKSPACE_NOT_FOUND" },
  CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT" },
  CONTRACT_DRAFT_INTEGRITY_FAILED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_INTEGRITY_FAILED" },
  CONTRACT_DRAFT_CONCURRENCY_CONFLICT: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_CONCURRENCY_CONFLICT" },
  CONTRACT_DRAFT_OUTPUT_TOO_LARGE: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_OUTPUT_TOO_LARGE" },
  CONTRACT_DRAFT_QUOTA_EXCEEDED: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_QUOTA_EXCEEDED" },
  CONTRACT_DRAFT_CURSOR_NOT_FOUND: { actionKey: "error_action_manage_contract_draft", messageKey: "CONTRACT_DRAFT_CURSOR_NOT_FOUND" },
  CONTRACT_TEMPLATE_NOT_FOUND: { actionKey: "error_action_manage_template", messageKey: "CONTRACT_TEMPLATE_NOT_FOUND" },
  CONTRACT_TEMPLATE_STALE: { actionKey: "error_action_manage_template", messageKey: "CONTRACT_TEMPLATE_STALE" },
  CONTRACT_TEMPLATE_CATALOG_DRIFT: { actionKey: "error_action_manage_template", messageKey: "CONTRACT_TEMPLATE_CATALOG_DRIFT" },
  CONTRACT_TEMPLATE_BLOCKED: { actionKey: "error_action_manage_template", messageKey: "CONTRACT_TEMPLATE_BLOCKED" },
  CONTRACT_TEMPLATE_PERSISTENCE_DRIFT: { actionKey: "error_action_manage_template", messageKey: "CONTRACT_TEMPLATE_PERSISTENCE_DRIFT" },
} as const satisfies Readonly<Record<string, ErrorContractDefinition>>;

export type CompletionErrorCode = keyof typeof COMPLETION_ERROR_CONTRACTS;
export type CompletionErrorMessageKey<Code extends CompletionErrorCode> =
  (typeof COMPLETION_ERROR_CONTRACTS)[Code]["messageKey"];

export type CompletionErrorContract<Code extends CompletionErrorCode = CompletionErrorCode> = Readonly<{
  ok: false;
  code: Code;
  message: Readonly<{ ar: string; en: string }>;
}>;

export function isTranslationKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(localizationRegistry, key);
}

export function isCompletionErrorCode(code: string): code is CompletionErrorCode {
  return Object.prototype.hasOwnProperty.call(COMPLETION_ERROR_CONTRACTS, code);
}

function interpolate(
  value: string,
  values: TranslationInterpolationValues,
): string {
  return value.replace(/{{\s*([A-Za-z][A-Za-z0-9_]*)\s*}}/g, (placeholder, name: string) => {
    const replacement = values[name];
    return replacement === undefined ? placeholder : String(replacement);
  });
}

const OTHER_LOCALE: Readonly<Record<Locale, Locale>> = { ar: "en", en: "ar" };

/** Bounded ring of missing-lookup conditions so a hot loop cannot grow memory. */
const MISSING_TRANSLATION_LOG_LIMIT = 100;

export type MissingTranslationRecord = Readonly<{
  /** The key the caller requested. */
  key: string;
  /** The locale the caller requested. */
  locale: Locale;
  /** The locale actually rendered, or null when the key identifier was rendered. */
  resolvedLocale: Locale | null;
}>;

export type MissingTranslationReporter = (record: MissingTranslationRecord) => void;

const missingTranslationLog: MissingTranslationRecord[] = [];

const defaultMissingTranslationReporter: MissingTranslationReporter = (record) => {
  console.warn("[i18n] missing translation", {
    key: record.key,
    locale: record.locale,
    renderedFrom: record.resolvedLocale ?? "key",
  });
};

let missingTranslationReporter: MissingTranslationReporter =
  defaultMissingTranslationReporter;

/** Replaces the missing-lookup sink; pass no argument to restore the default. */
export function setMissingTranslationReporter(
  reporter: MissingTranslationReporter = defaultMissingTranslationReporter,
): void {
  missingTranslationReporter = reporter;
}

export function getMissingTranslationRecords(): readonly MissingTranslationRecord[] {
  return [...missingTranslationLog];
}

export function clearMissingTranslationRecords(): void {
  missingTranslationLog.length = 0;
}

function recordMissingTranslation(record: MissingTranslationRecord): void {
  missingTranslationLog.push(record);
  if (missingTranslationLog.length > MISSING_TRANSLATION_LOG_LIMIT) {
    missingTranslationLog.shift();
  }
  missingTranslationReporter(record);
}

function hasRenderableText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export type ResolvedTranslation = Readonly<{
  /** Never an empty string: the other locale's value, or the key identifier. */
  value: string;
  /** The locale the value came from, or null when the key identifier is returned. */
  resolvedLocale: Locale | null;
  missing: boolean;
}>;

/**
 * Resolves one lookup through `active locale -> other locale -> key identifier`
 * and records every miss with the requested key and locale. Never throws and
 * never returns an empty string.
 */
export function resolveTranslation(
  key: string,
  locale: Locale,
  dictionary: Dict = t,
): ResolvedTranslation {
  const entry = dictionary[key];
  const requested = entry?.[locale];
  if (hasRenderableText(requested)) {
    return { value: requested, resolvedLocale: locale, missing: false };
  }

  const fallbackLocale = OTHER_LOCALE[locale];
  const fallback = entry?.[fallbackLocale];
  if (hasRenderableText(fallback)) {
    recordMissingTranslation({ key, locale, resolvedLocale: fallbackLocale });
    return { value: fallback, resolvedLocale: fallbackLocale, missing: true };
  }

  recordMissingTranslation({ key, locale, resolvedLocale: null });
  return { value: key, resolvedLocale: null, missing: true };
}

/** Typed lookup for new components; the legacy tr() helper remains compatible. */
export function translate<Key extends TranslationKey>(
  key: Key,
  locale: Locale,
  values: TranslationValues<Key> = {} as TranslationValues<Key>,
): string {
  return interpolate(resolveTranslation(key, locale).value, values);
}

export function getCompletionErrorContract<Code extends CompletionErrorCode>(
  code: Code,
  values: TranslationValues<CompletionErrorMessageKey<Code>> =
    {} as TranslationValues<CompletionErrorMessageKey<Code>>,
): CompletionErrorContract<Code> {
  const definition = COMPLETION_ERROR_CONTRACTS[code];
  // `values` is keyed by the placeholders of this code's message key. While
  // `Code` is still a type parameter, that mapped type stays deferred, so it is
  // narrowed to the structural interpolation shape once, here, rather than at
  // each `translate` call.
  const interpolationValues = values as TranslationInterpolationValues;
  const render = (locale: Locale): string => {
    const action = resolveTranslation(definition.actionKey, locale).value;
    const reason = interpolate(
      resolveTranslation(definition.messageKey, locale).value,
      interpolationValues,
    );
    return `${action}: ${reason}`;
  };

  return {
    ok: false,
    code,
    message: { ar: render("ar"), en: render("en") },
  };
}

export function tr(
  key: string,
  locale: Locale,
  values: TranslationInterpolationValues = {},
): string {
  return interpolate(resolveTranslation(key, locale).value, values);
}

/** The screen's name as the sidebar spells it. Never a raw route key. */
export function viewLabel(view: DashboardView, locale: Locale): string {
  return tr(VIEW_LABEL_KEYS[view], locale);
}
