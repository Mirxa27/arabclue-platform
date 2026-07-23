/**
 * Agent hierarchy + role capability model for the ArabClue voice/platform agent.
 *
 * The voice agent (ArabClue Copilot) is the *orchestrator*: it commands a team of
 * six specialist sub-agents to produce the full tender package. It operates at
 * exactly the signed-in user's permission level (role parity).
 *
 * Pure, dependency-light logic so it is unit-testable.
 */

import { AGENTS } from "@/lib/constants";
import type { AgentId } from "@/lib/types";

export type DelegatedAgent = {
  id: AgentId;
  order: number;
  /** Human-style command the orchestrator issues to this sub-agent. */
  command: string;
  commandAr: string;
  /** Short label for UI chips. */
  label: string;
  labelAr: string;
};

const AGENT_COMMANDS: Record<
  AgentId,
  { label: string; labelAr: string; command: string; commandAr: string }
> = {
  INGESTION: {
    label: "Ingestion",
    labelAr: "الاستيعاب",
    command: "Read the RFP and extract requirements, scope, and evaluation split",
    commandAr: "اقرأ الكراسة واستخرج المتطلبات والنطاق وتقسيم التقييم",
  },
  COMPLIANCE_REGULATORY: {
    label: "Compliance",
    labelAr: "الامتثال",
    command: "Map NCA, PDPL, and NORA controls into an evidence-backed matrix",
    commandAr: "اربط ضوابط الهيئة و PDPL و NORA في مصفوفة مدعومة بالأدلة",
  },
  TECHNICAL_ARCHITECT: {
    label: "Technical",
    labelAr: "الفني",
    command: "Draft the technical solution, governance, and risk approach",
    commandAr: "صُغ الحل الفني والحوكمة ومنهج المخاطر",
  },
  FINANCIAL_QUALIFICATION: {
    label: "Financial",
    labelAr: "المالي",
    command: "Structure the financial qualification forms — never suggest prices",
    commandAr: "هيكِل نماذج التأهيل المالي — دون اقتراح أي أسعار",
  },
  PROPOSAL_DRAFTING: {
    label: "Proposal",
    labelAr: "العرض",
    command: "Assemble the bilingual technical proposal from all prior outputs",
    commandAr: "جمّع العرض الفني الثنائي اللغة من كل المخرجات السابقة",
  },
  LAW_CONTRACT: {
    label: "Law & Contract",
    labelAr: "القانون والعقد",
    command: "Prepare the bilingual draft contract (counsel review required)",
    commandAr: "جهّز مسودة العقد الثنائية (مراجعة مستشار مطلوبة)",
  },
};

/**
 * The ordered team of sub-agents the orchestrator commands for a full run.
 */
export function buildDelegationPlan(): DelegatedAgent[] {
  return [...AGENTS]
    .sort((a, b) => a.order - b.order)
    .map((a) => {
      const meta = AGENT_COMMANDS[a.id];
      return {
        id: a.id,
        order: a.order,
        label: meta.label,
        labelAr: meta.labelAr,
        command: meta.command,
        commandAr: meta.commandAr,
      };
    });
}

// ─── Role capabilities (agent inherits the user's role) ──────────────────────

export type CapabilityLevel = "admin" | "editor" | "reviewer";

export type AgentSkill = {
  id: string;
  label: string;
  labelAr: string;
  allowed: boolean;
};

export type RoleCapabilities = {
  role: string;
  canWrite: boolean;
  isAdmin: boolean;
  level: CapabilityLevel;
  summary: string;
  summaryAr: string;
  skills: AgentSkill[];
};

/**
 * Describe what the voice agent may do — identical to the user's own role.
 */
export function roleCapabilities(opts: {
  role: string;
  canWrite: boolean;
  isAdmin: boolean;
}): RoleCapabilities {
  const { role, canWrite, isAdmin } = opts;
  const level: CapabilityLevel = isAdmin
    ? "admin"
    : canWrite
      ? "editor"
      : "reviewer";

  const skills: AgentSkill[] = [
    {
      id: "read",
      label: "Read projects, documents, proposals, compliance",
      labelAr: "قراءة المشاريع والمستندات والعروض والامتثال",
      allowed: true,
    },
    {
      id: "navigate",
      label: "Operate the app UI (navigate, focus projects)",
      labelAr: "تشغيل واجهة التطبيق (تنقّل، تركيز المشاريع)",
      allowed: true,
    },
    {
      id: "create_project",
      label: "Create & update tender projects",
      labelAr: "إنشاء وتحديث مشاريع المناقصات",
      allowed: canWrite,
    },
    {
      id: "ingest",
      label: "Ingest files/URLs and classify & route them",
      labelAr: "استيعاب الملفات/الروابط وتصنيفها وتوجيهها",
      allowed: canWrite,
    },
    {
      id: "run_pipeline",
      label: "Command the 6-agent pipeline to generate the full package",
      labelAr: "قيادة خط الوكلاء الستة لتوليد الحزمة الكاملة",
      allowed: canWrite,
    },
    {
      id: "review",
      label: "Decide reviews you are assigned to",
      labelAr: "البتّ في المراجعات المسندة إليك",
      allowed: true,
    },
    {
      id: "admin",
      label: "Admin tools: AI providers, env, audit, RBAC",
      labelAr: "أدوات المشرف: مزودو الذكاء، البيئة، التدقيق، الصلاحيات",
      allowed: isAdmin,
    },
  ];

  const summary = isAdmin
    ? `Full admin control (role ${role}): operate the whole platform including admin tools, and command the agent team end-to-end.`
    : canWrite
      ? `Editor control (role ${role}): create tenders, ingest, and command the agent team to generate the full package. No admin tools.`
      : `Read-only control (role ${role}): inspect and navigate everything and decide assigned reviews. Cannot mutate data or run the pipeline.`;

  const summaryAr = isAdmin
    ? `تحكّم إداري كامل (الدور ${role}): تشغيل المنصة بالكامل مع أدوات المشرف وقيادة فريق الوكلاء من البداية للنهاية.`
    : canWrite
      ? `تحكّم محرّر (الدور ${role}): إنشاء المناقصات والاستيعاب وقيادة فريق الوكلاء لتوليد الحزمة الكاملة. دون أدوات المشرف.`
      : `تحكّم للقراءة فقط (الدور ${role}): تصفّح كل شيء والبتّ في المراجعات المسندة. لا يمكن تعديل البيانات أو تشغيل الخط.`;

  return { role, canWrite, isAdmin, level, summary, summaryAr, skills };
}
