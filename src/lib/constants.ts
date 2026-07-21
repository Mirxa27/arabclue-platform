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
