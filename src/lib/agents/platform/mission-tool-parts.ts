/**
 * Extract AI SDK UIMessage tool parts for Mission Control theater.
 * Supports static `tool-${name}` (useChat) and `dynamic-tool` (realtime voice).
 */

export type TheaterToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "running"
  | "SUCCEEDED"
  | "FAILED"
  | "UNDONE"
  | string;

export type TheaterToolEvent = {
  id: string;
  name: string;
  state: TheaterToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  preliminary?: boolean;
  messageId: string;
  at?: number;
};

type LoosePart = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  preliminary?: boolean;
};

type LooseMessage = {
  id: string;
  role: string;
  parts: LoosePart[];
};

export function getToolPartName(part: LoosePart): string | null {
  if (part.type === "dynamic-tool" && part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.replace(/^tool-/, "");
  return null;
}

export function isToolLikePart(part: LoosePart): boolean {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

export function isToolRunning(state?: string): boolean {
  return (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested" ||
    state === "running" ||
    state === "RUNNING"
  );
}

export function isToolDone(state?: string): boolean {
  return (
    state === "output-available" ||
    state === "SUCCEEDED" ||
    state === "succeeded"
  );
}

export function isToolFailed(state?: string): boolean {
  return (
    state === "output-error" ||
    state === "output-denied" ||
    state === "FAILED" ||
    state === "failed"
  );
}

export function extractTheaterTools(
  messages: LooseMessage[]
): TheaterToolEvent[] {
  const out: TheaterToolEvent[] = [];
  for (const message of messages) {
    if (message.role !== "assistant" && message.role !== "user") continue;
    message.parts.forEach((part, index) => {
      const name = getToolPartName(part);
      if (!name) return;
      out.push({
        id: part.toolCallId || `${message.id}:${name}:${index}`,
        name,
        state: part.state || "input-available",
        input: part.input,
        output: part.output,
        errorText: part.errorText,
        preliminary: part.preliminary,
        messageId: message.id,
        at: index,
      });
    });
  }
  return out;
}

/** Human labels for platform tools (en / ar). */
export const TOOL_META: Record<
  string,
  {
    en: string;
    ar: string;
    kind:
      | "navigate"
      | "project"
      | "document"
      | "proposal"
      | "pipeline"
      | "compliance"
      | "review"
      | "billing"
      | "admin"
      | "mission"
      | "search"
      | "general";
  }
> = {
  explainPlatform: { en: "Explain platform", ar: "شرح المنصة", kind: "general" },
  navigateToView: { en: "Navigate UI", ar: "تنقل الواجهة", kind: "navigate" },
  setActiveProject: { en: "Focus project", ar: "تركيز المشروع", kind: "project" },
  getWorkspaceOverview: { en: "Workspace pulse", ar: "نبض مساحة العمل", kind: "general" },
  listProjects: { en: "List projects", ar: "قائمة المشاريع", kind: "project" },
  getProject: { en: "Open project", ar: "فتح مشروع", kind: "project" },
  createProject: { en: "Create project", ar: "إنشاء مشروع", kind: "project" },
  updateProject: { en: "Update project", ar: "تحديث مشروع", kind: "project" },
  listDocuments: { en: "List documents", ar: "قائمة المستندات", kind: "document" },
  getDocumentSummary: { en: "Document brief", ar: "ملخص مستند", kind: "document" },
  listProposals: { en: "List proposals", ar: "قائمة العروض", kind: "proposal" },
  getProposal: { en: "Open proposal", ar: "فتح عرض", kind: "proposal" },
  getCompliance: { en: "Compliance matrix", ar: "مصفوفة الامتثال", kind: "compliance" },
  startAgentPipeline: { en: "Launch agent pipeline", ar: "تشغيل خط الوكلاء", kind: "pipeline" },
  getAgentRunStatus: { en: "Pipeline status", ar: "حالة الخط", kind: "pipeline" },
  cancelAgentRun: { en: "Cancel pipeline", ar: "إلغاء الخط", kind: "pipeline" },
  listReviews: { en: "List reviews", ar: "قائمة المراجعات", kind: "review" },
  decideReview: { en: "Decide review", ar: "قرار المراجعة", kind: "review" },
  getBillingStatus: { en: "Billing status", ar: "حالة الفوترة", kind: "billing" },
  getAccountProfile: { en: "Account profile", ar: "ملف الحساب", kind: "general" },
  adminOverview: { en: "Admin overview", ar: "نظرة المشرف", kind: "admin" },
  adminListAiProviders: { en: "AI providers", ar: "مزودو الذكاء", kind: "admin" },
  adminListAudit: { en: "Audit log", ar: "سجل التدقيق", kind: "admin" },
  listMissionAttachments: { en: "Mission files", ar: "ملفات المهمة", kind: "mission" },
  ingestDroppedFile: { en: "Ingest file", ar: "استيعاب ملف", kind: "document" },
  classifyAndRouteAttachment: { en: "Classify & route", ar: "تصنيف وتوجيه", kind: "mission" },
  ingestUrl: { en: "Ingest URL", ar: "جلب رابط", kind: "document" },
  captureClientArtifact: { en: "Capture artifact", ar: "التقاط محتوى", kind: "mission" },
  searchDocumentChunks: { en: "Search corpus", ar: "بحث في المستندات", kind: "search" },
  undoLastRouting: { en: "Undo routing", ar: "تراجع عن التوجيه", kind: "mission" },
  importExternalSource: { en: "Import external", ar: "استيراد خارجي", kind: "mission" },
  stageMissionAttachment: { en: "Stage attachment", ar: "تجهيز مرفق", kind: "mission" },
  researchSaudiLaw: {
    en: "Regulatory synthesis",
    ar: "تركيب تنظيمي",
    kind: "compliance",
  },
  listRegulatoryRegistry: {
    en: "Regulatory registry",
    ar: "السجل التنظيمي",
    kind: "compliance",
  },
};

export function toolDisplayName(name: string, ar: boolean): string {
  const meta = TOOL_META[name];
  if (meta) return ar ? meta.ar : meta.en;
  return name.replace(/([A-Z])/g, " $1").trim();
}

export function toolKind(name: string) {
  return TOOL_META[name]?.kind ?? "general";
}

const DOC_TOOLS = new Set([
  "getProposal",
  "getDocumentSummary",
  "listProposals",
  "listDocuments",
  "startAgentPipeline",
  "getAgentRunStatus",
  "ingestDroppedFile",
  "ingestUrl",
  "captureClientArtifact",
  "classifyAndRouteAttachment",
  "searchDocumentChunks",
  "stageMissionAttachment",
]);

const COMPLIANCE_TOOLS = new Set([
  "getCompliance",
  "researchSaudiLaw",
  "listRegulatoryRegistry",
]);

export function isDocumentishTool(name: string): boolean {
  return DOC_TOOLS.has(name) || toolKind(name) === "document" || toolKind(name) === "proposal" || toolKind(name) === "pipeline";
}

export function isComplianceishTool(name: string): boolean {
  return COMPLIANCE_TOOLS.has(name) || toolKind(name) === "compliance";
}

/** Flatten nested tool payloads so theater can preview them. */
export function unwrapToolPayload(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== "object") return {};
  const o = output as Record<string, unknown>;
  const nested =
    (o.proposal && typeof o.proposal === "object"
      ? (o.proposal as Record<string, unknown>)
      : null) ||
    (o.run && typeof o.run === "object"
      ? (o.run as Record<string, unknown>)
      : null) ||
    (o.research && typeof o.research === "object"
      ? (o.research as Record<string, unknown>)
      : null) ||
    (o.document && typeof o.document === "object"
      ? (o.document as Record<string, unknown>)
      : null);
  return { ...o, ...(nested || {}) };
}

export function summarizeToolOutput(output: unknown, ar: boolean): string {
  if (output == null) return "";
  if (typeof output === "string") return output.slice(0, 220);
  if (typeof output !== "object") return String(output).slice(0, 220);
  const o = unwrapToolPayload(output);
  if (typeof o.error === "string") return o.error.slice(0, 220);
  if (typeof o.message === "string") return o.message.slice(0, 220);
  if (typeof o.question === "string") return o.question.slice(0, 220);
  if (o.ok === false && typeof o.error === "string") return o.error.slice(0, 220);
  if (typeof o.title === "string") return o.title.slice(0, 220);
  if (Array.isArray(o.findings)) {
    return ar
      ? `${o.findings.length} نتائج تنظيمية`
      : `${o.findings.length} regulatory findings`;
  }
  if (o.summary && typeof o.summary === "object") {
    const s = o.summary as {
      total?: number;
      nonCompliant?: number;
      gaps?: number;
    };
    const gaps = Array.isArray(o.gaps) ? o.gaps.length : s.nonCompliant ?? 0;
    const fws = Array.isArray(o.frameworks)
      ? (o.frameworks as Array<{ framework?: string }>)
          .map((f) => f.framework)
          .filter(Boolean)
          .slice(0, 4)
          .join("/")
      : "";
    return ar
      ? `امتثال ${s.total ?? 0} · فجوات ${gaps}${fws ? ` · ${fws}` : ""}`
      : `Compliance ${s.total ?? 0} · gaps ${gaps}${fws ? ` · ${fws}` : ""}`;
  }
  if (typeof o.runId === "string") {
    return ar ? `تشغيل الوكلاء ${o.runId}` : `Agent run ${o.runId}`;
  }
  if (typeof o.overallProgress === "number") {
    return ar
      ? `تقدم الخط ${Math.round(o.overallProgress)}%`
      : `Pipeline ${Math.round(o.overallProgress)}%`;
  }
  if (typeof o.projectId === "string" && typeof o.view === "string") {
    return ar ? `مشروع → ${o.view}` : `Project → ${o.view}`;
  }
  if (Array.isArray(o.projects)) {
    return ar ? `${o.projects.length} مشاريع` : `${o.projects.length} projects`;
  }
  if (Array.isArray(o.documents)) {
    return ar ? `${o.documents.length} مستندات` : `${o.documents.length} documents`;
  }
  if (Array.isArray(o.proposals)) {
    return ar ? `${o.proposals.length} عروض` : `${o.proposals.length} proposals`;
  }
  if (Array.isArray(o.attachments)) {
    return ar ? `${o.attachments.length} مرفقات` : `${o.attachments.length} attachments`;
  }
  if (Array.isArray(o.hits)) {
    return ar ? `${o.hits.length} نتائج بحث` : `${o.hits.length} search hits`;
  }
  if (Array.isArray(o.instruments)) {
    return ar
      ? `${o.instruments.length} أدوات تنظيمية`
      : `${o.instruments.length} registry instruments`;
  }
  if (o.decision && typeof o.decision === "object") {
    const d = o.decision as { category?: string; confidence?: number };
    return `${d.category ?? "file"} · ${Math.round((d.confidence ?? 0) * 100)}%`;
  }
  if (typeof o.content === "string") return o.content.slice(0, 220);
  if (typeof o.excerpt === "string") return o.excerpt.slice(0, 220);
  if (typeof o.parsedSummary === "string") return o.parsedSummary.slice(0, 220);
  try {
    return JSON.stringify(o).slice(0, 180);
  } catch {
    return "";
  }
}

export function extractDocumentPreview(output: unknown): {
  title: string;
  body: string;
  progress: number;
  sections: string[];
} | null {
  if (!output || typeof output !== "object") return null;
  const o = unwrapToolPayload(output);
  const title =
    (typeof o.title === "string" && o.title) ||
    (typeof o.projectTitle === "string" && o.projectTitle) ||
    (typeof o.originalName === "string" && o.originalName) ||
    (typeof o.runId === "string" && `Run ${o.runId}`) ||
    null;
  const body =
    (typeof o.content === "string" && o.content) ||
    (typeof o.excerpt === "string" && o.excerpt) ||
    (typeof o.parsedSummary === "string" && o.parsedSummary) ||
    (typeof o.message === "string" && o.message) ||
    (typeof o.markdown === "string" && o.markdown) ||
    "";
  const agentStates = Array.isArray(o.agentStates)
    ? (o.agentStates as Array<{ name?: string; status?: string; progress?: number }>)
    : null;
  if (agentStates && agentStates.length) {
    const done = agentStates.filter(
      (a) =>
        a.status === "completed" ||
        a.status === "done" ||
        a.status === "COMPLETED"
    ).length;
    const progress =
      typeof o.overallProgress === "number"
        ? Math.min(1, Math.max(0, Number(o.overallProgress) / 100))
        : done / agentStates.length;
    return {
      title: title || "Agent pipeline",
      body: agentStates
        .map(
          (a) =>
            `${a.name ?? "agent"}: ${a.status ?? "…"} (${Math.round((a.progress ?? 0) * (a.progress && a.progress <= 1 ? 100 : 1))}%)`
        )
        .join("\n"),
      progress,
      sections: agentStates.map((a) => a.name || "agent"),
    };
  }
  if (!title && !body) return null;
  const sections = body
    ? body
        .split(/\n{2,}|\n(?=# )/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  return {
    title: title || "Document",
    body: body.slice(0, 4000),
    progress: body.length > 80 ? 1 : 0.45,
    sections: sections.map((s) => s.split("\n")[0].replace(/^#+\s*/, "").slice(0, 60)),
  };
}

export type RegulatoryPreview = {
  title: string;
  frameworks: string[];
  findings: Array<{
    topic: string;
    certainty: string;
    statement: string;
  }>;
  gaps: Array<{ framework: string; controlId: string; status: string; title: string }>;
  disclaimer: string;
  progress: number;
};

export function extractRegulatoryPreview(output: unknown): RegulatoryPreview | null {
  if (!output || typeof output !== "object") return null;
  const o = unwrapToolPayload(output);
  const findingsRaw = Array.isArray(o.findings)
    ? (o.findings as Array<Record<string, unknown>>)
    : Array.isArray((o.research as { findings?: unknown })?.findings)
      ? ((o.research as { findings: Array<Record<string, unknown>> }).findings)
      : [];
  const gapsRaw = Array.isArray(o.gaps)
    ? (o.gaps as Array<Record<string, unknown>>)
    : [];
  const frameworksFromGaps = gapsRaw
    .map((g) => String(g.framework || ""))
    .filter(Boolean);
  const frameworksFromMeta = Array.isArray(o.frameworks)
    ? (o.frameworks as Array<{ framework?: string }>)
        .map((f) => f.framework || "")
        .filter(Boolean)
    : [];
  const instruments = Array.isArray(o.instruments)
    ? (o.instruments as Array<{ name?: string; id?: string }>)
    : [];
  const frameworks = Array.from(
    new Set([
      ...frameworksFromMeta,
      ...frameworksFromGaps,
      ...instruments.map((i) => i.name || i.id || "").filter(Boolean),
    ])
  ).slice(0, 8);

  if (!findingsRaw.length && !gapsRaw.length && !frameworks.length) return null;

  const findings = findingsRaw.slice(0, 8).map((f) => ({
    topic: String(f.topicEn || f.topicAr || f.topic || f.id || "Finding"),
    certainty: String(f.certainty || "REQUIRES_COUNSEL"),
    statement: String(f.statementEn || f.statementAr || f.statement || "").slice(
      0,
      280
    ),
  }));
  const gaps = gapsRaw.slice(0, 10).map((g) => ({
    framework: String(g.framework || ""),
    controlId: String(g.controlId || ""),
    status: String(g.status || ""),
    title: String(g.title || g.controlId || ""),
  }));
  const disclaimer = String(
    o.disclaimerEn ||
      o.disclaimer ||
      o.disclaimerAr ||
      "Not legal advice — counsel review required."
  );

  return {
    title:
      (typeof o.title === "string" && o.title) ||
      "Regulatory synthesis",
    frameworks,
    findings,
    gaps,
    disclaimer,
    progress: findings.length || gaps.length ? 1 : 0.55,
  };
}
