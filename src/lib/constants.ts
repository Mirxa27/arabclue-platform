import type { AgentId, ComplianceFramework } from "./types";

// Multi-agent workflow definition (the AI Brain)
export const AGENTS: {
  id: AgentId;
  icon: string;
  color: string;
  order: number;
}[] = [
  { id: "INGESTION", icon: "FileSearch", color: "#0EA5E9", order: 1 },
  { id: "EA_COMPLIANCE", icon: "ShieldCheck", color: "#6366F1", order: 2 },
  { id: "LEGAL_REGULATORY", icon: "Scale", color: "#8B5CF6", order: 3 },
  { id: "FINANCIAL_QUALIFICATION", icon: "Calculator", color: "#10B981", order: 4 },
  { id: "PROPOSAL_DRAFTING", icon: "PenLine", color: "#F59E0B", order: 5 },
];

// NCA / PDPL / EA compliance frameworks with hardcoded control rules
export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  {
    id: "NCA_ECC1",
    name: "NCA Essential Cybersecurity Controls",
    nameAr: "ضوابط الأمن السيبراني الأساسية",
    controls: [
      {
        controlId: "ECC-1.1",
        title: "Cybersecurity Governance",
        titleAr: "حوكمة الأمن السيبراني",
        requirement: "Establish cybersecurity governance framework with defined roles and responsibilities",
        level: "C1",
      },
      {
        controlId: "ECC-1.3",
        title: "Asset Management",
        titleAr: "إدارة الأصول",
        requirement: "Maintain inventory of all hardware and software assets with classification",
        level: "C1",
      },
      {
        controlId: "ECC-1.8",
        title: "Cryptography & Key Management",
        titleAr: "التشفير وإدارة المفاتيح",
        requirement: "AES-256 encryption at rest, TLS 1.3 in transit, HSM-backed key management",
        level: "C1",
      },
      {
        controlId: "ECC-1.10",
        title: "Incident Response",
        titleAr: "الاستجابة للحوادث",
        requirement: "24/7 SOC monitoring, incident response plan with 4-hour RTO",
        level: "C1",
      },
    ],
  },
  {
    id: "NCA_CCC1",
    name: "NCA Cloud Cybersecurity Controls",
    nameAr: "ضوابط الأمن السيبراني السحابية",
    controls: [
      {
        controlId: "CCC-1.2",
        title: "Data Residency",
        titleAr: "إقامة البيانات",
        requirement: "All data physically stored within KSA borders, sovereign cloud",
        level: "C1",
      },
      {
        controlId: "CCC-1.4",
        title: "Cloud Tenant Isolation",
        titleAr: "عزل المستأجر السحابي",
        requirement: "Dedicated VPC, network segmentation, multi-tenant isolation controls",
        level: "C1",
      },
      {
        controlId: "CCC-1.7",
        title: "Cloud Backup & DR",
        titleAr: "النسخ الاحتياطي والتعافي السحابي",
        requirement: "Geo-redundant backups within KSA, RPO < 1 hour, RTO < 4 hours",
        level: "C1",
      },
    ],
  },
  {
    id: "PDPL",
    name: "Personal Data Protection Law",
    nameAr: "نظام حماية البيانات الشخصية",
    controls: [
      {
        controlId: "PDPL-3",
        title: "Lawful Processing",
        titleAr: "المعالجة المشروعة",
        requirement: "Obtain explicit consent; define lawful basis for personal data processing",
        level: "C1",
      },
      {
        controlId: "PDPL-14",
        title: "Data Residency in KSA",
        titleAr: "إقامة البيانات في المملكة",
        requirement: "100% data residency within KSA; no cross-border transfer without NDMO approval",
        level: "C1",
      },
      {
        controlId: "PDPL-21",
        title: "Data Subject Rights",
        titleAr: "حقوق أصحاب البيانات",
        requirement: "Implement mechanisms for access, rectification, erasure, and portability",
        level: "C1",
      },
      {
        controlId: "PDPL-29",
        title: "Breach Notification",
        titleAr: "إخلال البيانات",
        requirement: "Notify NDMO within 72 hours of breach detection",
        level: "C1",
      },
    ],
  },
  {
    id: "EA_TP1",
    name: "EA Technology Principle — Cloud First",
    nameAr: "مبدأ البنية المؤسسية — السحابة أولاً",
    controls: [
      {
        controlId: "TP1.1",
        title: "Local Hosting Mandatory",
        titleAr: "الاستضافة المحلية الإلزامية",
        requirement: "Mandatory local hosting on certified Saudi cloud (STC Cloud / Mobily Cloud / Alibaba Riyadh)",
        level: "C1",
      },
      {
        controlId: "TP1.3",
        title: "Cloud Service Model",
        titleAr: "نموذج الخدمة السحابية",
        requirement: "Preferred PaaS/SaaS over IaaS for maintainability",
        level: "C2",
      },
    ],
  },
  {
    id: "EA_SP1",
    name: "EA Security Principle — Secure by Design",
    nameAr: "التصميم الآمن",
    controls: [
      {
        controlId: "SP1.1",
        title: "Encryption at Rest",
        titleAr: "التشفير أثناء التخزين",
        requirement: "AES-256 encryption for all data at rest, including backups",
        level: "C1",
      },
      {
        controlId: "SP1.2",
        title: "Encryption in Transit",
        titleAr: "التشفير أثناء النقل",
        requirement: "TLS 1.3 for all external communications, mTLS for service-to-service",
        level: "C1",
      },
      {
        controlId: "SP1.5",
        title: "Secure SDLC",
        titleAr: "دورة تطوير آمنة",
        requirement: "SAST/DAST in CI/CD, dependency scanning, code review",
        level: "C1",
      },
    ],
  },
  {
    id: "EA_SP2",
    name: "EA Security Principle — Zero Trust",
    nameAr: "الثقة المعدومة",
    controls: [
      {
        controlId: "SP2.1",
        title: "Never Trust, Always Verify",
        titleAr: "لا تثق أبداً، تحقق دائماً",
        requirement: "Continuous verification of every access request, no implicit trust",
        level: "C1",
      },
      {
        controlId: "SP2.3",
        title: "Least Privilege Access",
        titleAr: "أقل امتياز",
        requirement: "RBAC with JIT access, MFA enforced for all privileged operations",
        level: "C1",
      },
      {
        controlId: "SP2.6",
        title: "Microsegmentation",
        titleAr: "التقسيم المجهري للشبكة",
        requirement: "Network microsegmentation, east-west traffic inspection",
        level: "C2",
      },
    ],
  },
  {
    id: "LOCAL_CONTENT",
    name: "Local Content & SME Preference",
    nameAr: "المحتوى المحلي والمشاريع الصغيرة",
    controls: [
      {
        controlId: "LC-1",
        title: "10% Price Preference",
        titleAr: "تفضيل سعري 10%",
        requirement: "Apply mandatory 10% price preference for Local Content and SMEs",
        level: "C1",
      },
      {
        controlId: "LC-2",
        title: "Saudization Rate",
        titleAr: "نسبة السعودة",
        requirement: "Minimum 35% Saudization, target 50%+ for technical roles",
        level: "C1",
      },
    ],
  },
];

// SLA penalty rules (Saudi government services contracts)
export const SLA_RULES = {
  weeklyDelayPenalty: 2, // % per week of delay
  maxPenalty: 20, // max % cap for services
  maxPenaltyConstruction: 10, // cap for construction
};

// Saudi Vision 2030 alignment pillars
export const VISION_2030_PILLARS = [
  {
    id: "vibrant-society",
    name: "Vibrant Society",
    nameAr: "مجتمع حيوي",
    color: "#10B981",
  },
  {
    id: "thriving-economy",
    name: "Thriving Economy",
    nameAr: "اقتصاد مزدهر",
    color: "#0EA5E9",
  },
  {
    id: "ambitious-nation",
    name: "Ambitious Nation",
    nameAr: "وطن طموح",
    color: "#6366F1",
  },
];

// 5-Pillar Execution Methodology (Agile + PMI)
export const EXECUTION_METHODOLOGY = [
  { id: 1, name: "Discovery & Initiation", nameAr: "الاكتشاف والبدء", pmi: "Initiating", agile: "Sprint 0" },
  { id: 2, name: "Planning & Architecture", nameAr: "التخطيط والمعمارية", pmi: "Planning", agile: "Backlog Refinement" },
  { id: 3, name: "Agile Execution", nameAr: "التنفيذ الرشيق", pmi: "Executing", agile: "Sprint Iterations" },
  { id: 4, name: "Monitoring & QA", nameAr: "المراقبة والجودة", pmi: "Monitoring & Controlling", agile: "Review & Retro" },
  { id: 5, name: "Closure & Handover", nameAr: "الإغلاق والتسليم", pmi: "Closing", agile: "Release" },
];

// ─── Tender Types (Arabclue supports all government tender categories) ────────

export interface TenderTypeDef {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  color: string;
  slaMaxPenalty: number; // % cap
  slaPerWeek: number; // % per week delay
  typicalBudget: number;
  complianceScope: string[]; // which compliance frameworks apply
  evaluationSplit: { technical: number; financial: number };
}

export const TENDER_TYPES: TenderTypeDef[] = [
  {
    id: "IT",
    name: "IT & Digital Services",
    nameAr: "تقنية المعلومات والخدمات الرقمية",
    icon: "Cpu",
    color: "#1E3A8A",
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 25000000,
    complianceScope: ["NCA_ECC1", "NCA_CCC1", "PDPL", "EA_TP1", "EA_SP1", "EA_SP2", "LOCAL_CONTENT"],
    evaluationSplit: { technical: 70, financial: 30 },
  },
  {
    id: "CONSTRUCTION",
    name: "Construction & Infrastructure",
    nameAr: "الإنشاءات والبنية التحتية",
    icon: "Building2",
    color: "#B45309",
    slaMaxPenalty: 10,
    slaPerWeek: 1,
    typicalBudget: 150000000,
    complianceScope: ["LOCAL_CONTENT", "SAFETY", "ENVIRONMENTAL"],
    evaluationSplit: { technical: 60, financial: 40 },
  },
  {
    id: "CONSULTING",
    name: "Consulting & Advisory",
    nameAr: "الاستشارات والدراسات",
    icon: "Lightbulb",
    color: "#7C3AED",
    slaMaxPenalty: 15,
    slaPerWeek: 1.5,
    typicalBudget: 8000000,
    complianceScope: ["LOCAL_CONTENT", "PDPL"],
    evaluationSplit: { technical: 80, financial: 20 },
  },
  {
    id: "OPERATIONS",
    name: "Operations & Facility Management",
    nameAr: "التشغيل وإدارة المرافق",
    icon: "Settings",
    color: "#0891B2",
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 45000000,
    complianceScope: ["NCA_ECC1", "PDPL", "LOCAL_CONTENT", "SAFETY"],
    evaluationSplit: { technical: 65, financial: 35 },
  },
  {
    id: "MEDICAL",
    name: "Medical & Healthcare",
    nameAr: "الطبي والرعاية الصحية",
    icon: "HeartPulse",
    color: "#BE123C",
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 60000000,
    complianceScope: ["NCA_ECC1", "PDPL", "SFDA", "LOCAL_CONTENT"],
    evaluationSplit: { technical: 75, financial: 25 },
  },
  {
    id: "GENERAL",
    name: "General Supplies & Services",
    nameAr: "التوريدات والخدمات العامة",
    icon: "Package",
    color: "#475569",
    slaMaxPenalty: 20,
    slaPerWeek: 2,
    typicalBudget: 12000000,
    complianceScope: ["LOCAL_CONTENT", "PDPL"],
    evaluationSplit: { technical: 55, financial: 45 },
  },
];

export function getTenderType(id: string | null | undefined): TenderTypeDef {
  return TENDER_TYPES.find((t) => t.id === id) ?? TENDER_TYPES[0];
}

// ─── Admin: AI Provider presets ──────────────────────────────────────────────

export const AI_PROVIDER_PRESETS = [
  {
    name: "ZAI GLM-4.6",
    provider: "zai",
    modelId: "glm-4.6",
    apiBase: "",
    temperature: 0.2,
    maxTokens: 4096,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.045,
  },
  {
    name: "ZAI GLM-4.5",
    provider: "zai",
    modelId: "glm-4.5",
    apiBase: "",
    temperature: 0.3,
    maxTokens: 8192,
    inputCostPer1k: 0.012,
    outputCostPer1k: 0.036,
  },
  {
    name: "OpenAI GPT-4o",
    provider: "openai",
    modelId: "gpt-4o",
    apiBase: "https://api.openai.com/v1",
    temperature: 0.2,
    maxTokens: 4096,
    inputCostPer1k: 0.019,
    outputCostPer1k: 0.076,
  },
  {
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    apiBase: "https://api.anthropic.com/v1",
    temperature: 0.2,
    maxTokens: 8192,
    inputCostPer1k: 0.026,
    outputCostPer1k: 0.131,
  },
  {
    name: "Mistral Large",
    provider: "mistral",
    modelId: "mistral-large-latest",
    apiBase: "https://api.mistral.ai/v1",
    temperature: 0.2,
    maxTokens: 4096,
    inputCostPer1k: 0.008,
    outputCostPer1k: 0.024,
  },
];

// ─── Admin: Env setting catalog (known keys) ─────────────────────────────────

export const ENV_CATALOG = [
  { key: "OPENAI_API_KEY", category: "AI_PROVIDER", description: "OpenAI API key for GPT models", isRequired: false },
  { key: "ANTHROPIC_API_KEY", category: "AI_PROVIDER", description: "Anthropic API key for Claude models", isRequired: false },
  { key: "ZAI_API_KEY", category: "AI_PROVIDER", description: "Z.ai API key for GLM models", isRequired: false },
  { key: "MISTRAL_API_KEY", category: "AI_PROVIDER", description: "Mistral API key", isRequired: false },
  { key: "DATABASE_URL", category: "DATABASE", description: "Primary database connection string", isRequired: true },
  { key: "REDIS_URL", category: "DATABASE", description: "Redis broker URL for async tasks", isRequired: false },
  { key: "VECTOR_DB_URL", category: "DATABASE", description: "Vector database (Milvus/Pinecone) endpoint", isRequired: false },
  { key: "WEBHOOK_URL", category: "INTEGRATION", description: "Outbound webhook for event notifications", isRequired: false },
  { key: "SMTP_HOST", category: "INTEGRATION", description: "Email relay host", isRequired: false },
  { key: "SMTP_PORT", category: "INTEGRATION", description: "Email relay port", isRequired: false },
  { key: "ARABCLUE_ENC_KEY", category: "SECURITY", description: "Master encryption key for env secrets", isRequired: true },
  { key: "JWT_SECRET", category: "SECURITY", description: "JWT signing secret", isRequired: true },
  { key: "STRIPE_SECRET_KEY", category: "BILLING", description: "Stripe payment gateway secret", isRequired: false },
  { key: "MADA_MERCHANT_ID", category: "BILLING", description: "mada merchant identifier", isRequired: false },
  { key: "STC_PAY_MERCHANT_ID", category: "BILLING", description: "STC Pay merchant identifier", isRequired: false },
];

// ─── Admin: Default subscription plans ───────────────────────────────────────

export const DEFAULT_PLANS = [
  {
    name: "STARTER",
    nameAr: "المبتدئ",
    description: "For solo bidders getting started",
    priceMonthly: 299,
    priceYearly: 2990,
    maxProposals: 10,
    maxDocuments: 50,
    maxWorkspaces: 1,
    maxTokensPerMonth: 500000,
    maxStorageGb: 5,
    featuresJson: JSON.stringify(["basic_agents", "pdf_export", "email_support"]),
  },
  {
    name: "PRO",
    nameAr: "الاحترافي",
    description: "For growing bid teams",
    priceMonthly: 999,
    priceYearly: 9990,
    maxProposals: 50,
    maxDocuments: 250,
    maxWorkspaces: 3,
    maxTokensPerMonth: 3000000,
    maxStorageGb: 25,
    featuresJson: JSON.stringify(["all_agents", "pptx_pdf_xlsx_export", "brand_customization", "priority_support", "rag_corpus"]),
  },
  {
    name: "ENTERPRISE",
    nameAr: "المؤسسات",
    description: "For large organizations with unlimited needs",
    priceMonthly: 2999,
    priceYearly: 29990,
    maxProposals: -1,
    maxDocuments: -1,
    maxWorkspaces: 20,
    maxTokensPerMonth: 20000000,
    maxStorageGb: 200,
    featuresJson: JSON.stringify(["all_agents", "all_exports", "brand_customization", "dedicated_support", "rag_corpus", "rbac", "audit_trail", "sso", "custom_agents"]),
  },
  {
    name: "PAY_AS_YOU_GO",
    nameAr: "الدفع حسب الاستخدام",
    description: "No commitment, pay per proposal",
    priceMonthly: 0,
    priceYearly: 0,
    maxProposals: -1,
    maxDocuments: -1,
    maxWorkspaces: 1,
    maxTokensPerMonth: -1,
    maxStorageGb: 10,
    featuresJson: JSON.stringify(["all_agents", "all_exports", "pay_per_proposal"]),
  },
];

