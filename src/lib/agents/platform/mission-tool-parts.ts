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
  chromeExtensionIngest: {
    en: "Chrome extension capture",
    ar: "التقاط امتداد كروم",
    kind: "mission",
  },
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

/**
 * Spoken / visual "human hand" action labels — how a person would do the same step.
 */
export function humanActionLabel(name: string, ar: boolean): string {
  const kind = toolKind(name);
  const byName: Record<string, { en: string; ar: string }> = {
    navigateToView: {
      en: "Clicking the sidebar…",
      ar: "ينقر الشريط الجانبي…",
    },
    setActiveProject: {
      en: "Selecting the active project…",
      ar: "يختار المشروع النشط…",
    },
    listProjects: { en: "Opening Projects…", ar: "يفتح المشاريع…" },
    getProject: { en: "Opening project details…", ar: "يفتح تفاصيل المشروع…" },
    createProject: { en: "Filling Create Project…", ar: "يملأ إنشاء مشروع…" },
    listDocuments: { en: "Browsing Documents…", ar: "يتصفح المستندات…" },
    getDocumentSummary: {
      en: "Reading the document…",
      ar: "يقرأ المستند…",
    },
    startAgentPipeline: {
      en: "Pressing Run agents…",
      ar: "يضغط تشغيل الوكلاء…",
    },
    getAgentRunStatus: {
      en: "Checking pipeline progress…",
      ar: "يفحص تقدم الخط…",
    },
    getProposal: { en: "Opening the proposal editor…", ar: "يفتح محرر العرض…" },
    getCompliance: {
      en: "Opening Compliance matrix…",
      ar: "يفتح مصفوفة الامتثال…",
    },
    researchSaudiLaw: {
      en: "Researching Saudi regulatory sources…",
      ar: "يبحث في المصادر التنظيمية…",
    },
    searchDocumentChunks: {
      en: "Searching tender evidence…",
      ar: "يبحث في أدلة المناقصة…",
    },
    getMissionPulse: {
      en: "Reviewing mission activity…",
      ar: "يراجع نشاط المهمة…",
    },
    importExternalSource: {
      en: "Connecting an external source…",
      ar: "يربط مصدراً خارجياً…",
    },
    chromeExtensionIngest: {
      en: "Receiving browser capture…",
      ar: "يستلم التقاط المتصفح…",
    },
    stageMissionAttachment: {
      en: "Staging the dropped file…",
      ar: "يُدرج الملف المسقط…",
    },
  };
  if (byName[name]) return ar ? byName[name].ar : byName[name].en;
  const byKind: Record<string, { en: string; ar: string }> = {
    navigate: { en: "Moving through the UI…", ar: "يتنقل في الواجهة…" },
    project: { en: "Working in Projects…", ar: "يعمل في المشاريع…" },
    document: { en: "Working with documents…", ar: "يعمل على المستندات…" },
    proposal: { en: "Editing the proposal…", ar: "يحرّر العرض…" },
    pipeline: { en: "Driving the agent pipeline…", ar: "يقود خط الوكلاء…" },
    compliance: { en: "Checking compliance…", ar: "يفحص الامتثال…" },
    search: { en: "Searching evidence…", ar: "يبحث في الأدلة…" },
    mission: { en: "Updating Mission Control…", ar: "يحدّث مركز القيادة…" },
    review: { en: "Working the review queue…", ar: "يعمل على طابور المراجعة…" },
    billing: { en: "Checking billing…", ar: "يفحص الفوترة…" },
    admin: { en: "Using admin tools…", ar: "يستخدم أدوات المشرف…" },
    general: { en: "Using a platform tool…", ar: "يستخدم أداة المنصة…" },
  };
  const fallback = byKind[kind] || byKind.general;
  return ar ? fallback.ar : fallback.en;
}

export type AgentActionPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking";

export type AgentAction = {
  phase: AgentActionPhase;
  /** Human-style label, e.g. "Pressing Run agents…" */
  label: string;
  /** Tool display name when acting, else null */
  toolName: string | null;
  kind: string;
  /** Count of tools currently running */
  runningCount: number;
};

/**
 * Derive the single most relevant "what is the agent doing right now" action,
 * expressed the way a human operator would describe their own clicks.
 */
export function currentAgentAction(opts: {
  tools: TheaterToolEvent[];
  locale: "ar" | "en";
  listening?: boolean;
  speaking?: boolean;
  thinking?: boolean;
}): AgentAction {
  const ar = opts.locale === "ar";
  const running = opts.tools.filter(
    (t) => isToolRunning(t.state) || t.preliminary
  );
  // Most recent running tool wins (agents act sequentially, like a human).
  const active = running.length ? running[running.length - 1] : null;

  if (active) {
    return {
      phase: "acting",
      label: humanActionLabel(active.name, ar),
      toolName: toolDisplayName(active.name, ar),
      kind: toolKind(active.name),
      runningCount: running.length,
    };
  }
  if (opts.listening) {
    return {
      phase: "listening",
      label: ar ? "ينصت إليك…" : "Listening to you…",
      toolName: null,
      kind: "general",
      runningCount: 0,
    };
  }
  if (opts.speaking) {
    return {
      phase: "speaking",
      label: ar ? "يشرح ما ينفّذه…" : "Explaining as it works…",
      toolName: null,
      kind: "general",
      runningCount: 0,
    };
  }
  if (opts.thinking) {
    return {
      phase: "thinking",
      label: ar ? "يخطّط للخطوة التالية…" : "Planning the next step…",
      toolName: null,
      kind: "general",
      runningCount: 0,
    };
  }
  return {
    phase: "idle",
    label: ar ? "جاهز — تحدّث أو اكتب" : "Ready — speak or type",
    toolName: null,
    kind: "general",
    runningCount: 0,
  };
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

export type DelegationStep = {
  id: string;
  order: number;
  label: string;
  command: string;
};

/**
 * Find a delegation plan emitted by `orchestrateTenderPackage` / `getMyCapabilities`
 * in the most recent tool output so the theater can show the commanded team.
 */
export function extractDelegationPlan(
  tools: TheaterToolEvent[]
): DelegationStep[] | null {
  for (const t of [...tools].reverse()) {
    if (!t.output || typeof t.output !== "object") continue;
    const o = t.output as Record<string, unknown>;
    const raw = Array.isArray(o.delegationPlan)
      ? o.delegationPlan
      : Array.isArray(o.team)
        ? o.team
        : null;
    if (!raw) continue;
    const steps: DelegationStep[] = [];
    raw.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const s = item as Record<string, unknown>;
      steps.push({
        id: typeof s.id === "string" ? s.id : `step-${i}`,
        order: typeof s.order === "number" ? s.order : i + 1,
        label: typeof s.label === "string" ? s.label : `Agent ${i + 1}`,
        command: typeof s.command === "string" ? s.command : "",
      });
    });
    if (steps.length) return steps.sort((a, b) => a.order - b.order);
  }
  return null;
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

/**
 * Human-readable preview of tool arguments while a step is running.
 * Never dump raw JSON into the theater UI.
 */
export function summarizeToolInput(input: unknown, ar: boolean): string {
  if (input == null) return "";
  if (typeof input === "string") {
    const t = input.trim();
    return t.slice(0, 160);
  }
  if (typeof input !== "object") return String(input).slice(0, 160);
  const o = input as Record<string, unknown>;

  const pickStr = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  const view = pickStr("view", "targetView", "screen");
  if (view) return ar ? `الشاشة: ${view}` : `Screen: ${view}`;

  const title = pickStr("title", "titleAr", "name", "projectTitle");
  if (title) return title.slice(0, 160);

  const query = pickStr("query", "q", "search", "term", "prompt");
  if (query) return ar ? `بحث: ${query.slice(0, 140)}` : `Search: ${query.slice(0, 140)}`;

  const projectId = pickStr("projectId", "activeProjectId");
  if (projectId) {
    return ar
      ? `مشروع ${projectId.slice(0, 12)}…`
      : `Project ${projectId.slice(0, 12)}…`;
  }

  const runId = pickStr("runId");
  if (runId) {
    return ar ? `تشغيل ${runId.slice(0, 12)}…` : `Run ${runId.slice(0, 12)}…`;
  }

  const documentId = pickStr("documentId", "docId", "proposalId");
  if (documentId) {
    return ar
      ? `مستند ${documentId.slice(0, 12)}…`
      : `Document ${documentId.slice(0, 12)}…`;
  }

  const url = pickStr("url", "href", "sourceUrl");
  if (url) return url.slice(0, 160);

  const message = pickStr("message", "question", "note", "reason");
  if (message) return message.slice(0, 160);

  if (typeof o.tenderType === "string") {
    return ar ? `نوع المناقصة: ${o.tenderType}` : `Tender type: ${o.tenderType}`;
  }

  // Prefer a short key=value preview over JSON dumps
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (pairs.length >= 3) break;
    if (v == null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      pairs.push(`${k}=${String(v).slice(0, 40)}`);
    }
  }
  return pairs.length ? pairs.join(" · ").slice(0, 160) : "";
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
  if (o.ok === true) {
    return ar ? "تم بنجاح" : "Completed successfully";
  }
  // Avoid dumping raw JSON into the UI — keep theater human-readable.
  return "";
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
