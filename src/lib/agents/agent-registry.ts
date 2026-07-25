/**
 * @module agent-registry
 * @description Central, auditable registry documenting every agent's decision logic.
 * This file is the single source of truth for transparency, traceability, and modifiability.
 *
 * Design Principles:
 * - **Transparency**: Every decision point is documented with rationale and source categories
 * - **Auditability**: All inputs/outputs are logged with evidence chains
 * - **Modifiability**: Thresholds, rules, and prompts are configurable, not hardcoded
 * - **Determinism**: Fallback to deterministic logic when LLM unavailable
 * - **Safety**: Hard rules prevent pricing hallucination, false legal certainty, invented identifiers
 *
 * Architecture Overview:
 * ┌──────────────┐  text + mime   ┌──────────────┐  entities   ┌──────────────────────┐
 * │  Documents   │ ────────────▶ │  AGENT 1     │ ─────────▶ │ AGENT 2 COMPLIANCE   │
 * │  + Tender    │   extraction  │  INGESTION   │  parse      │ Regulatory Matrix    │
 * └──────────────┘               └──────────────┘             └──────────────────────┘
 *         ▲                           │                           │
 *         │                           ▼                           ▼
 * ┌──────────────┐               ┌──────────────┐             ┌──────────────┐
 * │  Past Projects│               │ AGENT 3      │◀─ RAG ─────▶│ AGENT 4      │
 * │  Knowledge   │─RAG──────────▶│ TECHNICAL    │             │ FINANCIAL    │
 * └──────────────┘               └──────────────┘             └──────────────┘
 *                                     │                           │
 *                                     ▼                           ▼
 *                                ┌──────────────┐             ┌──────────────┐
 *                                │  Coverage    │◀────────────│   Metrics    │
 *                                │  Plan Matrix │             └──────────────┘
 *                                └──────┬───────┘
 *                                       ▼
 *                                ┌──────────────┐
 *                                │ AGENT 5      │  Markdown + Validation Gate
 *                                │ DRAFTING     │  (blocks export if errors)
 *                                └──────┬───────┘
 *                                       │
 *                                ┌──────▼───────┐
 *                                │ AGENT 6 LAW  │  Saudi Registry Research + Bilingual EN|AR
 *                                │ CONTRACT     │  No 100% certainty, disclaimer mandatory
 *                                └──────────────┘
 */

import type { AgentId } from "@/lib/types";
import type { Locale } from "@/lib/types";

export type AgentDecisionSourceCategory =
  | "EXPLICIT_TENDER"
  | "REGULATORY_CANDIDATE"
  | "INFERRED_APPLICABILITY"
  | "INTERNAL_RECOMMENDATION"
  | "APPROVED_KNOWLEDGE"
  | "DETERMINISTIC_CALC"
  | "LLM_ENRICHMENT";

export type AgentIdExtended = AgentId | "ORCHESTRATOR";

export interface AgentDecisionRule {
  /** Stable, human readable rule identifier */
  readonly ruleId: string;
  /** Which source category this rule belongs to */
  readonly sourceCategory: AgentDecisionSourceCategory;
  /** Plain language description of the rule */
  readonly description: string;
  /** Description in Arabic for bilingual audit */
  readonly descriptionAr: string;
  /** Inputs that feed this rule */
  readonly inputs: readonly string[];
  /** Output or side-effect */
  readonly output: string;
  /** How to verify this rule fired */
  readonly auditEvidence: string;
  /** Modifiable parameters */
  readonly configurableParams?: readonly string[];
  /** Hard safety guard if applicable */
  readonly safetyGuard?: string;
}

export interface AgentSpecification {
  readonly id: AgentIdExtended;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly purpose: string;
  readonly purposeAr: string;
  /** What this agent receives */
  readonly inputs: readonly string[];
  /** What this agent produces */
  readonly outputs: readonly string[];
  /** Decision points */
  readonly decisionRules: readonly AgentDecisionRule[];
  /** Failure modes and how they are handled */
  readonly failureModes: readonly {
    readonly mode: string;
    readonly cause: string;
    readonly mitigation: string;
    readonly severity: "WARNING" | "BLOCKING";
  }[];
  /** How this agent's output is validated */
  readonly validationGates: readonly string[];
  /** Who can modify thresholds */
  readonly modifiability: {
    readonly configFile: string;
    readonly envVars?: readonly string[];
    readonly promptFile?: string;
  };
  /** Audit trail fields produced */
  readonly auditFields: readonly string[];
}

export const AGENT_REGISTRY: Record<AgentIdExtended, AgentSpecification> = {
  ORCHESTRATOR: {
    id: "ORCHESTRATOR",
    nameEn: "Pipeline Orchestrator",
    nameAr: "منسق خط الأنابيب",
    purpose: "Execute 6 agents sequentially with cancellation, progress tracking, and transactional proposal versioning. Ensures every run is auditable and retry-safe.",
    purposeAr: "ينفذ 6 وكلاء بتسلسل مع دعم الإلغاء وتتبع التقدم وترقيم إصدارات العطاء بشكل ذري لضمان قابلية التدقيق وإعادة المحاولة.",
    inputs: ["projectId", "workspaceId", "userId", "uploadedDocuments", "brandProfile", "approvedKnowledge", "locale"],
    outputs: ["agentStates[]", "overallProgress", "finalArtifact { proposalId, contractId, validation, coverage, provider }", "proposal version history"],
    decisionRules: [
      {
        ruleId: "orchestration-order",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "Agents run strictly: INGESTION → COMPLIANCE_REGULATORY → TECHNICAL_ARCHITECT → FINANCIAL_QUALIFICATION → PROPOSAL_DRAFTING → LAW_CONTRACT. No parallel execution to guarantee data dependency.",
        descriptionAr: "يعمل الوكلاء بترتيب صارم بدون تنفيذ متوازٍ لضمان اعتماد البيانات.",
        inputs: ["AGENT_DAG"],
        output: "Sequential state machine",
        auditEvidence: "agentStates[].startedAt/completedAt timestamps are monotonic",
        configurableParams: ["AGENTS order in constants.ts"],
      },
      {
        ruleId: "cancellation-check",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "Before every mark/persist, check AgentRun.status === CANCELLED. If cancelled, throw PipelineCancelledError and persist CANCELLED.",
        descriptionAr: "قبل كل حفظ يتم فحص حالة الإلغاء وإيقاف التنفيذ فوراً إن طُلب.",
        inputs: ["AgentRun.status"],
        output: "Throws or continues",
        auditEvidence: "ErrorMessage='Cancelled by user' and completedAt set",
      },
      {
        ruleId: "zero-doc-fail-fast",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "If combined document text is empty and docs.length===0, fail INGESTION as FAILED 100% and persist RUN FAILED with error 'No documents uploaded'.",
        descriptionAr: "إذا لم تُرفع مستندات تفشل مرحلة الاستيعاب فوراً كمؤشر لإكمال الرفع.",
        inputs: ["docs.length", "combined.length"],
        output: "persist FAILED",
        auditEvidence: "findings: 'Upload at least one RFP'",
      },
      {
        ruleId: "transactional-versioning",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "Regenerate modes: version increments with optimistic locking (updatedAt+version check), fork creates child with parentProposalId. Both use Prisma $transaction.",
        descriptionAr: "إعادة التوليد بنمط إصدار أو تفرع مع قفل تفاؤلي داخل معاملة.",
        inputs: ["regenerateMode", "targetProposalId"],
        output: "ProposalVersion row or failure if concurrent mutation",
        auditEvidence: "ProposalVersion.changeLog + parentProposalId",
      },
    ],
    failureModes: [
      { mode: "NoDocuments", cause: "User started without uploading", mitigation: "Fail INGESTION early with actionable message", severity: "BLOCKING" },
      { mode: "Cancelled", cause: "User pressed stop", mitigation: "Persist CANCELLED and release poller", severity: "WARNING" },
      { mode: "ConcurrentMutation", cause: "Two regenerates race", mitigation: "Optimistic lock throws, client must refetch latest", severity: "WARNING" },
    ],
    validationGates: ["INGESTION must produce scope length >=40", "COMPLIANCE must score calculable", "DRAFTING must pass proposal validation gate", "LAW must pass contract disclaimer + bilingual structure"],
    modifiability: { configFile: "src/lib/constants.ts (AGENTS array)", envVars: ["LLM_PROVIDER"], promptFile: "src/lib/agents/prompts.ts" },
    auditFields: ["agentStates JSON", "overallProgress", "startedAt/completedAt", "errorMessage", "finalArtifact.validation", "audit() calls per proposal"],
  },

  INGESTION: {
    id: "INGESTION",
    nameEn: "Tender Ingestion & Requirements Engineer",
    nameAr: "مهندس استيعاب المناقصة والمتطلبات",
    purpose: "Extract title, Etimad ref, budget, deadline, category, evaluation weights, SLA penalties, milestones from heterogeneous files (PDF/DOCX/XLSX/ZIP/Images via OCR). Preserve original wording; never overwrite tender penalties with statutory defaults.",
    purposeAr: "استخراج العنوان ومرجع اعتماد والميزانية وموعد التسليم وفئة المناقصة وأوزان التقييم وجزاءات التأخير والمعالم مع الحفاظ على الصياغة الأصلية.",
    inputs: ["storagePath, mimeType, originalName per doc", "project.category fallback", "tenderText combined"],
    outputs: ["IngestionEntities { scope, project { title, budget... }, evaluation { technical, financial }, sla { perWeek, maxPercent, originalWording, statutoryCandidate }, milestones[], evidence[], rawTextExcerpt }"],
    decisionRules: [
      {
        ruleId: "text-extraction-routing",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "Route by mime/lower name: text/* → utf8, image/* → OCR via tesseract/sharp, PDF → pdf-parse, DOCX → mammoth, XLSX → exceljs, ZIP → safe-zip with zip-slip + bomb protection, else empty.",
        descriptionAr: "توجيه الاستخراج حسب نوع الملف مع حماية من هجمات المسار المضغوط وحجْم ZIP.",
        inputs: ["bytes, mimeType, originalName"],
        output: "sanitizedText",
        auditEvidence: "evidence[] includes '[zip] blocked path-traversal' when relevant",
      },
      {
        ruleId: "tender-field-first-labeled",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Title, ref, deadline, category, budget via firstLabeledValue() regex for bilingual labels (e.g., 'Tender Title:', 'اسم المنافسة'). cleanFieldValue strips suffix punctuation, limits 500 chars.",
        descriptionAr: "استخراج الحقول عبر مطابقة تسميات ثنائية اللغة مع تنظيف وحصر طول.",
        inputs: ["clean text, labelPatterns[]"],
        output: "project.* fields",
        auditEvidence: "rawTextExcerpt + explicit label match",
        configurableParams: ["labelPatterns list"],
      },
      {
        ruleId: "eval-weight-detection",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Detect technical percent via /technical[^%\\d]{0,40}(\\d{1,3})%/ and similar Arabic. Fallback to tenderType.evaluationSplit. Push evidence when detected weight differs from default.",
        descriptionAr: "التقاط أوزان التقييم من النص مع إرجاع افتراضي من نوع المناقصة.",
        inputs: ["text"],
        output: "evaluation.technical, financial",
        auditEvidence: "evidence[]: 'Evaluation technical weight detected: X%'",
        configurableParams: ["regex patterns"],
      },
      {
        ruleId: "sla-preservation",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Extract per-week and max percent with regex, preserve originalWording substring (120 chars). Do NOT rewrite with statutory candidate. Separately list statutory candidate max for legal review via SLA_PENALTY_RULES.statutoryCandidate(tenderCategory).",
        descriptionAr: "الحفاظ على صياغة الجزاءات كما في الكراسة وعدم إعادة كتابتها بالمرشح النظامي.",
        inputs: ["text, tenderCategory"],
        output: "sla { perWeek, maxPercent, originalWording, statutoryCandidate }",
        auditEvidence: "evidence: 'Tender SLA (EXPLICIT_TENDER): ...' + separate statutory note",
        safetyGuard: "REGULATORY_PRECISION_RULE: Never inject default penalty % as tender fact.",
      },
      {
        ruleId: "local-content-explicit-only",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Via extractLocalContentPreference(): only return preferencePercent if found in tender. Never assume blanket 15%/20%. Log evidence when present.",
        descriptionAr: "استخراج نسبة تفضيل المحتوى المحلي فقط إذا كانت واردة في الكراسة.",
        inputs: ["clean text"],
        output: "localContentPreferencePercent + originalWording",
        auditEvidence: "evidence: 'Local-content preference X% extracted'",
        safetyGuard: "No blanket preference assumption",
      },
      {
        ruleId: "milestone-extraction",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Extract via 3 patterns: 'milestone: name ... weeks', 'name : weeks', 'weeks : name' up to 10 items, dedup by lowercased name, validate quality via isQualityMilestoneName. Fallback STANDARD_DELIVERY_MILESTONES.",
        descriptionAr: "استخراج المعالم بأنماط متعددة مع إزالة التكرار والتحقق من الجودة.",
        inputs: ["text"],
        output: "milestones[]",
        auditEvidence: "evidence: 'Extracted N milestone(s)' or fallback note",
        configurableParams: ["STANDARD_DELIVERY_MILESTONES"],
      },
      {
        ruleId: "scope-quality",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Match /(scope of work|نطاق العمل|SOW)[:...]{40,600}/, take first paragraph, validate via isQualityScopeText. Else take first quality paragraph, else placeholder 'نطاق العمل يُستكمل من كراسة الشروط' and push evidence gap.",
        descriptionAr: "تحديد نطاق العمل مع التحقق من جودته وإلا ترك مهمة استكمال بشرية.",
        inputs: ["clean"],
        output: "scope",
        auditEvidence: "evidence: 'Scope of Work section located' or gap note",
      },
      {
        ruleId: "ai-enrichment-optional",
        sourceCategory: "LLM_ENRICHMENT",
        description: "enrichIngestionWithAi() refines scope (>40 chars), merges evidence up to 20, appends refinementNotes and provider/fallback note. Deterministic numbers preserved.",
        descriptionAr: "تحسين بالذكاء مع الحفاظ على الأرقام الحتمية.",
        inputs: ["deterministic entities, excerpt 6000 chars"],
        output: "refined entities",
        auditEvidence: "evidence includes 'Ingestion AI skill applied via X' or fallback note",
        configurableParams: ["SYSTEM_INGESTION prompt", "LLM temperature maxTokens"],
      },
    ],
    failureModes: [
      { mode: "EmptyExtraction", cause: "Scanned PDF with no OCR engine or corrupted file", mitigation: "Return empty, fail fast if all docs empty, otherwise use project.title placeholder", severity: "WARNING" },
      { mode: "ZipSlip", cause: "Malicious ZIP path traversal", mitigation: "Block entries via safe-zip, log '[zip] blocked'", severity: "BLOCKING" },
      { mode: "ControlCharBreakage", cause: "C0 controls break JSON", mitigation: "sanitizeText strips \\u0000-\\u0008 etc", severity: "WARNING" },
    ],
    validationGates: ["scope.length >= 40 OR gap flagged", "milestones quality filter", "budget non-negative", "deadline ISO parsable"],
    modifiability: {
      configFile: "src/lib/text-quality.ts, src/lib/constants.ts TENDER_TYPES, src/lib/procurement-rules.ts SLA_PENALTY_RULES",
      envVars: ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
      promptFile: "src/lib/agents/prompts.ts SYSTEM_INGESTION",
    },
    auditFields: ["parsedSummary", "extractedEntities JSON", "evidence[] with source labels", "sla.originalWording", "localContentOriginalWording"],
  },

  COMPLIANCE_REGULATORY: {
    id: "COMPLIANCE_REGULATORY",
    nameEn: "Compliance & Regulatory Matrix Engineer",
    nameAr: "مهندس مصفوفة الامتثال والالتزام التنظيمي",
    purpose: "Build tender-specific compliance matrix from COMPLIANCE_FRAMEWORKS (NCA ECC/CCC, PDPL, LOCAL_CONTENT, NORA) with sourceCategory separation to avoid mixing tender facts with regulatory candidates. Never blanket COMPLIANT without corroborating text.",
    purposeAr: "بناء مصفوفة امتثال تفصل الحقائق الواردة في الكراسة عن المرشحات التنظيمية وتجنب منح مكتمل بدون دليل.",
    inputs: ["tenderText", "IngestionEntities", "tenderCategory", "saudizationTarget", "localContentTarget"],
    outputs: ["rows ComplianceMatrixRow[] { frameworkId, controlId, title, status, evidence, remediation, sourceCategory, legalReviewStatus, policyVersionId }", "findings[]", "score = compliant/total *100"],
    decisionRules: [
      {
        ruleId: "pdpl-residency-explicit",
        sourceCategory: "EXPLICIT_TENDER",
        description: "For PDPL controls with residency keyword: if mentions KSA residency/NDMO → COMPLIANT, evidence includes PLATFORM_DATA_POSTURE. If cross-border transfer present → LEGAL_REVIEW_REQUIRED. Else → CLARIFICATION_REQUIRED, never assume 100% residency mandate.",
        descriptionAr: "تقييم إقامة البيانات مع عدم افتراض إلزام شامل 100% بالإقامة.",
        inputs: ["corpus mentions of residency,ksa,NDMO, cross-border"],
        output: "status + evidence + remediation",
        auditEvidence: "evidence contains 'residencyEvaluationNote' + sourceCategory",
        safetyGuard: "PDPL_RULES.residencyEvaluationNote: do not state blanket 100% residency",
      },
      {
        ruleId: "local-content-preference-explicit",
        sourceCategory: "EXPLICIT_TENDER",
        description: "If preferencePercent != null (tender-stated) → COMPLIANT + sourceCategory EXPLICIT_TENDER. If language present without percent or target % present → PARTIAL. Else → NOT_APPLICABLE. Findings log exact.",
        descriptionAr: "نسبة تفضيل المحتوى المحلي تُحتسب فقط إذا كانت واردة في الكراسة.",
        inputs: ["localContent.preferencePercent, corpus hit, target"],
        output: "status + citation PROCUREMENT_LAW.citation",
        auditEvidence: "findings: 'Local content preference X% from tender (EXPLICIT_TENDER)' or 'No blanket'",
        safetyGuard: "Never apply blanket 15%/10% automatically",
      },
      {
        ruleId: "nora-approved-only",
        sourceCategory: "REGULATORY_CANDIDATE",
        description: "Only use NORA principle IDs from tender text (noraPrinciplesFromTender) or from NORA_PRINCIPLES with humanApprovalStatus APPROVED. If neither → NOT_APPLICABLE/CLARIFICATION_REQUIRED with note 'ArabClue does not invent NORA IDs'.",
        descriptionAr: "استخدام معرفات نورا فقط من الكراسة أو من سجل معتمد.",
        inputs: ["tenderNora[], NORA_PRINCIPLES registry"],
        output: "status for NORA rows",
        auditEvidence: "evidence: 'Principle X present in tender' or 'No approved official NORA source'",
        safetyGuard: "NO inventing NORA principle identifiers",
      },
      {
        ruleId: "nca-keyword-scoring",
        sourceCategory: "REGULATORY_CANDIDATE",
        description: "For NCA ECC/CCC: keywordHits from controlKeywordHits() (controlId+title+requirement tokenized >3 chars, top 10). frameworkHit via mentions nca/ecc/ccc/cybersecurity. If hitCount>=3 && frameworkHit → COMPLIANT, >=1 or frameworkHit → PARTIAL, else EVIDENCE_MISSING. SourceCategory EXPLICIT_TENDER if frameworkHit else REGULATORY_CANDIDATE.",
        descriptionAr: "تقييم ضوابط الأمن السيبراني عبر عدد الكلمات المفتاحية وذِكر الإطار.",
        inputs: ["corpus, ctrl.title/requirement"],
        output: "status + evidence keywords + remediation",
        auditEvidence: "evidence: 'NCA ECC control ... evidenced via terms: ...'",
        configurableParams: ["COMPLIANCE_FRAMEWORKS controls list"],
      },
      {
        ruleId: "sla-tender-vs-statutory-separation",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Push TWO rows: SLA-TENDER (tender clause EXPLICIT_TENDER COMPLIANT preserved as-is) + SLA-STATUTORY-CANDIDATE (REGULATORY_CANDIDATE, LEGAL_REVIEW_REQUIRED if exceeds candidate, sourceReference from procurement-rules). Backward-compat SLA-CAP reflects tender clause with statutory note.",
        descriptionAr: "فصل بند جزاء التأخير الوارد في الكراسة عن المرشح النظامي لغايات المراجعة القانونية.",
        inputs: ["entities.sla"],
        output: "3 SLA rows + findings",
        auditEvidence: "findings: 'SLA tender clause X%/week, max Y% ... statutory candidate max Z%'",
        safetyGuard: "Never rewrite statutory candidate into tender fact",
      },
    ],
    failureModes: [
      { mode: "MissingCorpus", cause: "Empty tender text", mitigation: "All controls become EVIDENCE_MISSING/PARTIAL with evidence pointing to gap", severity: "WARNING" },
      { mode: "NoNoraRegistry", cause: "NORA_PRINCIPLES empty/awaiting approval", mitigation: "Return NOT_APPLICABLE with note not to invent", severity: "WARNING" },
    ],
    validationGates: ["Every row has sourceCategory set", "No row claims COMPLIANT without evidence mention", "Score compute compliant/total", "LEGAL_DISCLAIMER present in findings"],
    modifiability: {
      configFile: "src/lib/constants.ts COMPLIANCE_FRAMEWORKS, src/lib/procurement-rules.ts PDPL_RULES, NCA_FRAMEWORKS, NORA_PRINCIPLES, SLA_PENALTY_RULES, PROCUREMENT_LAW, PLATFORM_DATA_POSTURE",
      promptFile: "src/lib/agents/prompts.ts SYSTEM_COMPLIANCE",
    },
    auditFields: ["ComplianceCheck rows with controlId, status, sourceCategory, evidence, legalReviewStatus, framework", "complianceScore %", "findings with LEGAL_DISCLAIMER"],
  },

  TECHNICAL_ARCHITECT: {
    id: "TECHNICAL_ARCHITECT",
    nameEn: "Technical & Solution Architecture Engineer",
    nameAr: "مهندس الحل التقني والمعمارية",
    purpose: "Build evaluation-aligned delivery narrative from approved RAG corpus only. Distinguish exact vs analogous vs proposed experience. Map to Vision2030 pillars only when supportable. Prevent inventory hallucination.",
    purposeAr: "بناء سرد تنفيذي مواءم لمعايير التقييم من أدلة معتمدة فقط مع تصنيف الخبرة وتجنّب اختراع المشاريع.",
    inputs: ["entities scope/milestones", "pastProjects RagDocument[] with embeddings", "tenderCorpus RagDocument[]", "vision2030Alignment", "queryEmbedding", "locale"],
    outputs: ["TechnicalArchitectOutput { methodology[], matchedProjects[], solutionApproach, deliveryModel, governance, qualityPlan, riskPlan, securityPrivacy, serviceManagement, trainingTransition, continuity, evaluationAlignment, vision2030Notes, findings, ragContext, tenderContext }"],
    decisionRules: [
      {
        ruleId: "rag-retrieval-thresholds",
        sourceCategory: "APPROVED_KNOWLEDGE",
        description: "retrieveRelevant(query embedding cosine similarity) topK 5 past projects score >=0.18, quality title filter isQualityPastProjectTitle. TenderCorpus topK 8. Experience class: score >=0.45 exact, >=0.22 analogous, else proposed. No project invented.",
        descriptionAr: "استرجاع ذكي من قاعدة المعرفة المعتمدة مع عتبات جودة وتصنيف خبرة.",
        inputs: ["query string scope + milestones, embedding, pastProjects[]"],
        output: "matchedProjects with score + why + class",
        auditEvidence: "findings: 'Retrieved N approved past project(s)' + 'Match: title (class, score)'",
        configurableParams: ["topK, score thresholds 0.18/0.22/0.45, pastProject embedding cache"],
      },
      {
        ruleId: "methodology-mapping",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "EXECUTION_METHODOLOGY (PMI phases mapped to Agile) each phase rationale ties scopeSnippet (first 160 chars) to method. Scope quality validated via isQualityScopeText; if not ok uses placeholder but still builds.",
        descriptionAr: "ربط منهجية التنفيذ بمفهوم المشروع المستخرج.",
        inputs: ["EXECUTION_METHODOLOGY constant"],
        output: "methodology[] with name/nameAr/rationale",
        auditEvidence: "methodology rationale contains scopeSnippet",
      },
      {
        ruleId: "scope-snippet-quality",
        sourceCategory: "EXPLICIT_TENDER",
        description: "scopeOk via isQualityScopeText. scopeSnippet first 160 chars or AR/EN placeholder. Used throughout narrative, never marketing generic.",
        descriptionAr: "التحقق من جودة نص النطاق قبل إدراجه.",
        inputs: ["entities.scope"],
        output: "solutionApproach intro, tenderSnippets",
        auditEvidence: "solutionApproach starts with tender-specific line or explicit gap note",
      },
      {
        ruleId: "evidence-only-architecture",
        sourceCategory: "APPROVED_KNOWLEDGE",
        description: "All architecture sections (solutionApproach, deliveryModel, governance, qualityPlan, riskPlan, securityPrivacy, serviceManagement, trainingTransition, continuity) contain tender-grounded line + matchedProjects list if present else explicit gap statement 'No sufficiently similar...'. No secure credentials invented. VISION_2030 alignment only if opts.vision2030Alignment set or tender mentions; otherwise candidate note.",
        descriptionAr: "بناء معمارية تقنية مبنية على الأدلة فقط مع تحديد الفجوات بوضوح.",
        inputs: ["tenderSnippets, matchedProjects, vision2030 pillar"],
        output: "9 narrative fields + evaluationAlignment + vision2030Notes",
        auditEvidence: "findings include evaluationAlignment and vision2030Notes, RAG contexts with evidence",
        safetyGuard: "Never invent project experience, certifications, staff",
      },
      {
        ruleId: "ai-enrichment-optional-technical",
        sourceCategory: "LLM_ENRICHMENT",
        description: "enrichTechnicalWithAi() improves clarity of 9 narratives (>20 chars) preserving facts. Findings extended with provider/fallback note.",
        descriptionAr: "تحسين بذكاء مع الحفاظ على الحقائق.",
        inputs: ["deterministic technical JSON"],
        output: "refined technical",
        auditEvidence: "findings: 'Technical AI skill applied via X' or fallback",
      },
    ],
    failureModes: [
      { mode: "NoRagHits", cause: "No past projects pass threshold", mitigation: "Return empty matchedProjects and gap statement remains standards-based", severity: "WARNING" },
      { mode: "LowQualityScope", cause: "Scope extraction failed quality", mitigation: "Use generic tender SOW placeholder and flag human completion needed", severity: "WARNING" },
      { mode: "EmbeddingCacheMiss", cause: "Past project embedding missing", mitigation: "embedText(query) on the fly and cache in DB embeddingJson", severity: "WARNING" },
    ],
    validationGates: ["isQualityPastProjectTitle filter", "isQualityMilestoneName filter for milestones", "sanitizeMilestonesForBoq", "No staff/cert invent"],
    modifiability: {
      configFile: "src/lib/constants.ts EXECUTION_METHODOLOGY, VISION_2030_PILLARS, src/lib/rag.ts retrieveRelevant thresholds, src/lib/text-quality.ts quality functions",
      promptFile: "src/lib/agents/prompts.ts SYSTEM_TECHNICAL",
    },
    auditFields: ["matchedProjects with score + experienceClass", "ragContext formatted", "tenderContext snippets", "findings with retrieval counts"],
  },

  FINANCIAL_QUALIFICATION: {
    id: "FINANCIAL_QUALIFICATION",
    nameEn: "Financial Qualification & Forms Structuring Engineer",
    nameAr: "مهندس التأهيل المالي وهيكلة النماذج",
    purpose: "Extract qualification figures only from uploaded FINANCIAL docs, compute QLR = (Cash + AR)/CurrentLiabilities, do NOT interpret pass/fail unless tender threshold explicit. BoQ structure only: item/unit/qty, unitPrice and total MUST stay null for client human entry. Never suggest pricing, margins.",
    purposeAr: "استخراج أرقام التأهيل من المستندات المالية فقط وحساب QLR مع هيكلة BoQ بدون تسعير نهائياً.",
    inputs: ["financialText from FINANCIAL+QUALIFICATION docs or combined fallback", "entities", "projectBudget", "currency", "tenderText"],
    outputs: ["FinancialExtract { cashEquivalents, accountsReceivable, currentLiabilities, quickLiquidityRatio, qlrPasses, qlrThreshold, qlrFormula, saudizationPercent, boqItems[] { item,unit,qty,unitPrice=null,total=null }, localContentPreferenceApplied, notes[], findings[] }"],
    decisionRules: [
      {
        ruleId: "qlr-formula-exact",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "findAmount via regex for cash equivalents (cash & equivalents, نقد), AR (accounts receivable, ذمم مدينة), current liabilities (current liabilities, التزامات متداولة). If all three present → compute QLR via computeQuickLiquidityRatio(formula string, passes vs threshold). If threshold null (no tender explicit), do NOT interpret PASS/FAIL as tender outcome, only calculation. Notes include values.",
        descriptionAr: "حساب QLR بصيغة ثابتة دون تأويل نجاح/فشل إن لم يرد حد في الكراسة.",
        inputs: ["financialText"],
        output: "quickLiquidityRatio, qlrPasses, qlrFormula, qlrThreshold",
        auditEvidence: "findings: 'QLR = X via formula (no tender threshold — pass/fail not interpreted)' or with threshold",
        configurableParams: ["procurement-rules extractQlrThreshold regex"],
        safetyGuard: "Do not interpret QLR as pass/fail unless tender states explicit threshold",
      },
      {
        ruleId: "boq-structure-only",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "Milestones sanitized via sanitizeMilestonesForBoq then mapped to BoQ lines: { item=name, unit='LS', qty=1, unitPrice=null, total=null }. Always blank amounts. Notes include ArabClue does not price bids.",
        descriptionAr: "هيكلة جدول الكميات بدون أي تسعير.",
        inputs: ["entities.milestones"],
        output: "boqItems[]",
        auditEvidence: "notes: 'BoQ structure generated without prices' + findings: 'BoQ structure generated with N lines (unitPrice/total blank)'",
        safetyGuard: "HARD RULE: Never suggest, calculate, or comment on bid prices, unit prices, discounts, margins",
      },
      {
        ruleId: "local-content-boq-note",
        sourceCategory: "EXPLICIT_TENDER",
        description: "Preference handled via extractLocalContentPreference but for BoQ note: if preferencePercent from entities present → note evaluation preference X% stated in tender, not a bid price suggestion. Else note no blanket preference applied.",
        descriptionAr: "توضيح نسبة تفضيل المحتوى المحلي كمعلومة تقييم لا تسعير.",
        inputs: ["entities.localContentPreferencePercent or tenderCorpus"],
        output: "notes[] local-content note, localContentPreferenceApplied",
        auditEvidence: "notes contain exact % when tender-stated",
        safetyGuard: "No pricing rule + no blanket preference",
      },
      {
        ruleId: "financial-ai-enrichment",
        sourceCategory: "LLM_ENRICHMENT",
        description: "enrichFinancialWithAi() may add notes[] and findings[] and narrative but does NOT populate amounts. Preserves deterministic amounts.",
        descriptionAr: "تحسين وصفي فقط دون لمس الأرقام.",
        inputs: ["financial deterministic, budget, currency"],
        output: "merged notes/findings",
        auditEvidence: "findings include provider or fallback note",
      },
    ],
    failureModes: [
      { mode: "MissingLineItems", cause: "FINANCIAL doc missing Cash/AR/CL", mitigation: "Note insufficient line items, QLR null, finding recorded", severity: "WARNING" },
      { mode: "NoFinancialDoc", cause: "No doc categorized FINANCIAL/QUALIFICATION", mitigation: "Fallback to combined tender text for structure, still blank pricing", severity: "WARNING" },
    ],
    validationGates: ["BoQ unitPrice and total always null", "QLR threshold extraction only from tender explicit regex", "No pricing suggestion string passes guardrails detectPricingRequest/detectPricingSuggestion"],
    modifiability: {
      configFile: "src/lib/procurement-rules.ts computeQuickLiquidityRatio, extractQlrThreshold, extractLocalContentPreference; src/lib/text-quality.ts sanitizeMilestonesForBoq",
      promptFile: "src/lib/agents/prompts.ts SYSTEM_FINANCIAL",
    },
    auditFields: ["FinancialExtract all numeric sources", "QLR formula + threshold", "BoQ blank guarantee", "notes with source values"],
  },

  PROPOSAL_DRAFTING: {
    id: "PROPOSAL_DRAFTING",
    nameEn: "Proposal Drafting Engineer",
    nameAr: "مهندس صياغة العطاء الفني والمالي",
    purpose: "Compose evaluator-ready technical+financial proposal in Markdown with 18 mandatory sections, coverage matrix, BoQ blank, compliance, methodology, team only approved, experience classification exact/analogous/proposed, no superlatives invented, human is final author, draft pending approval, legal disclaimer verbatim.",
    purposeAr: "صياغة عطاء فني متكامل بـ 18 قسماً إلزامياً مع مصفوفة تغطية ومصفوفة امتثال وهيكل مالي واعتماد البشر كمؤلف نهائي.",
    inputs: ["projectTitle, etimadRef, tenderTypeName, entities, complianceRows (50 max), technical (9 narratives + methodology + matchedProjects + ragContext), financial, coverage (coveragePercent, covered/partial/gap, evaluationWeights, winStrategyNotes, missingEvidenceTasks, rows 40 max), brandTagline, vision2030, locale, restrictions"],
    outputs: ["contentMd Markdown", "provider/model/tokensUsed/fallback, locale", "artifactsJson list (PDF,PPTX,HTML,XLSX matrix, BoQ, ZIP)", "financialFormsJson BoQ structure", "complianceScore", "proposalVersion 1 or N", "finalArtifact validation coverage provider knowledgeFindings exportReady slidesMetrics"],
    decisionRules: [
      {
        ruleId: "drafting-prompt-construction",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "Build complianceJson (control, status, sourceCategory, evidence 220 chars, remediation) 50 max; coverageJson (percent, counts, weights, winStrategyNotes, missingEvidenceTasks 15 max, rows 40 max each with id, text 200 chars, status, section, evidenceTitles, outline, sectionRef, pageRef). ingestionJson 8000 chars. technicalJson includes 9 narratives, methodology, matchedProjects, deliveryModel etc. financialJson full. ragContext from technical. restrictions. All serialized deterministically.",
        descriptionAr: "بناء مدخلات المطالبة الهيكلية مع تقليم محدد.",
        inputs: ["all orchestrator assembled contexts"],
        output: "user prompt string",
        auditEvidence: "finalArtifact contains provider, model, tokensUsed, coverage rows",
        configurableParams: ["slice limits 50/40/15", "maxTokens 8192, temperature 0.28, engine DRAFTING in llm.ts"],
      },
      {
        ruleId: "system-prompt-locale",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "systemDrafting(locale): If ar → primary Modern Standard Arabic, bilingual headings Arabic first, English terms for NCA/PDPL kept Latin. If en → professional English with Arabic titles in parentheses. Tone government-formal, scannable headings, tables, requirement IDs. Must include sections list 1-18. Must include LEGAL_DISCLAIMER verbatim, and 'Draft pending authorized human approval — user is final author of record.' Must enforce NO_PRICING_RULE + REGULATORY_PRECISION_RULE.",
        descriptionAr: "توجيهات صياغة ثنائية اللغة مع منع التسعير واليقين القانوني الزائف.",
        inputs: ["locale"],
        output: "system prompt",
        auditEvidence: "contentMd contains 'Draft pending authorized human approval' + legal disclaimer",
        safetyGuard: "NO_PRICING_RULE, REGULATORY_PRECISION_RULE, LEGAL_DISCLAIMER mandatory",
      },
      {
        ruleId: "deterministic-fallback",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "If LLM returns empty or fallback flag true, buildDeterministicProposal() composes all 18 sections using locales templates, coverageTable(), complianceBlock (25 rows), QLR label mapping, BoQ blank table 20 max, experienceBlock classified exact/analogous/proposed, brand placeholder detection, gaps list 12 max, strengths, winStrategyNotes, humanNotice, LEGAL_DISCLAIMER. No experience invented, gaps flagged.",
        descriptionAr: "بديل حتمي متكامل عند تعذر LLM.",
        inputs: ["opts deterministic"],
        output: "contentMd",
        auditEvidence: "fallback boolean true, provider 'deterministic', contentMd contains all 18 sections headers",
        configurableParams: ["coverageTable implementation, complianceBlock limit 25"],
      },
      {
        ruleId: "validation-gate-blocking",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "validateProposalOutput({ contentMd, financial, entities, complianceRows, restrictions, approvedEvidenceIds }) returns report with issues severity error/warning and blocking boolean. If blocking → proposal status DRAFT not GENERATED, exportReady false. Issues stored in finalArtifact.validation.",
        descriptionAr: "بوابة تحقق إلزامية تمنع التصدير عند أخطاء حرجة.",
        inputs: ["contentMd validation: pricing blank?, staff approved?, compliance evidence?, bidi controls?, etc"],
        output: "validationReport, status DRAFT/GENERATED, exportReady boolean",
        auditEvidence: "findings: 'Validation BLOCKED export: codes...' or 'Validation passed — draft ready'",
        configurableParams: ["validation-gate.ts rules"],
      },
      {
        ruleId: "artifact-versioning",
        sourceCategory: "INTERNAL_RECOMMENDATION",
        description: "TitleEn 'Technical & Financial Proposal — {project.title}' TitleAr Arabic. financialFormsJson includes boqItems source agent_structure_only. Artifacts: PDF, PPTX, HTML slides, EA matrix XLSX, BoQ XLSX, ZIP. Initially PLACEHOLDER path replaced with proposal.id after create. Transaction creates proposal + ProposalVersion with changeLog.",
        descriptionAr: "إنشاء المخرجات مع مسارات تنزيل حقيقية.",
        inputs: ["project.title, proposal.id"],
        output: "artifactsJson realArtifacts",
        auditEvidence: "artifactsJson downloadPath contains proposal.id, ProposalVersion rows",
      },
    ],
    failureModes: [
      { mode: "EmptyLLMOutput", cause: "LLM returned empty or throws", mitigation: "Switch to deterministic proposal, mark fallback true, tokensUsed 0", severity: "WARNING" },
      { mode: "ValidationBlocking", cause: "Proposal contains pricing or missing disclaimer", mitigation: "Set status DRAFT, exportReady false, record error codes", severity: "BLOCKING" },
      { mode: "RegenerateRace", cause: "Optimistic lock fails on updatedAt", mitigation: "Throw concurrency error, client must refetch latest version", severity: "WARNING" },
    ],
    validationGates: ["Must contain LEGAL_DISCLAIMER", "Must contain human approval line", "BoQ amount cells blank", "18 sections present", "No invented KPIs/superlatives (prompt)", "evidence IDs from approved list"],
    modifiability: {
      configFile: "src/lib/validation-gate.ts, src/lib/constants.ts AGENTS, src/lib/text-quality.ts isPlaceholderCompanyName",
      promptFile: "src/lib/agents/prompts.ts SYSTEM_DRAFTING, draftingUserPrompt, WINNING_TENDER_CRAFT, NO_PRICING_RULE, REGULATORY_PRECISION_RULE",
    },
    auditFields: ["contentMd full", "provider/model/tokensUsed/fallback", "validation report", "artifactsJson", "coveragePercent, coveredCount, gapCount, strengths, winStrategyNotes, missingEvidenceTasks", "knowledgeFindings"],
  },

  LAW_CONTRACT: {
    id: "LAW_CONTRACT",
    nameEn: "Law Contract Counsel Drafter",
    nameAr: "مستشار صياغة العقود القانونية",
    purpose: "Research Saudi frameworks from registry then draft bilingual EN|AR front-to-front contract with 14 standard articles + research summary + sources + signatures. Never claim 100% legal certainty, disclaimer mandatory. Operative clauses grounded in tender-explicit facts, registry-backed findings, or REQUIRES_COUNSEL recommendations only. No pricing.",
    purposeAr: "البحث في الأطر السعودية من السجل ثم صياغة عقد ثنائي اللغة مع مقالات تشغيلية وبحث ومصادر وتوقيعات مع إخلاء قانوني إلزامي.",
    inputs: ["projectTitle, etimadRef, entities (scope, milestones, sla), complianceRows, brandName/nameAr, clientName/nameAr, restrictions, locale"],
    outputs: ["BilingualContractDraft { contentMd with # DRAFT CONTRACT | مسودة عقد, > NOT LEGAL ADVICE, # RESEARCH SUMMARY | موجز البحث, # OPERATIVE ARTICLES | البنود النافذة (### Article N — Title | المادة N — العنوان), :::en ... :::ar ... blocks, # SIGNATURES | التوقيعات, disclaimer, articles[] ContractArticle { number, titleEn/Ar, bodyEn/Ar, sourceIds[] }, research { findings[] { topicEn/Ar, certainty TENDER_EXPLICIT|REGISTRY_BACKED|REQUIRES_COUNSEL, statementEn/Ar }, sources[] { instrumentEn/Ar, version, reviewDate, sourceReference }, researchedAt, updatePostureEn/Ar }, provider/model/tokensUsed/fallback, locale bilingual }"],
    decisionRules: [
      {
        ruleId: "registry-research-first",
        sourceCategory: "REGULATORY_CANDIDATE",
        description: "researchSaudiLawForContract({ entities, complianceRows, projectTitle, restrictions }) scans complianceRows and entities for tender anchors, matches against Saudi Law registry (governing-law, pdpl, procurement-context, sla-tender...). Returns research brief with findings (each with certainty enum), sources (instrumentEn/Ar, version, reviewDate, sourceReference), researchedAt ISO, updatePosture for counsel verification. No external live browse; registry snapshot persisted.",
        descriptionAr: "بحث أول من سجل تنظيمي داخلي دون تصفح حي خارجي.",
        inputs: ["entities, complianceRows, projectTitle"],
        output: "SaudiLawResearchBrief",
        auditEvidence: "findings[].certainty in [TENDER_EXPLICIT,REGISTRY_BACKED,REQUIRES_COUNSEL], sources[].reviewDate",
        configurableParams: ["saudi-law-research.ts registry data"],
      },
      {
        ruleId: "deterministic-contract-14-articles",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "buildDeterministicContract() creates 14 articles: 1 Parties, 2 Definitions, 3 Scope of work, 4 Term, 5 Contractor obligations, 6 Client obligations, 7 Confidentiality, 8 Personal data protection, 9 Delay remedies (uses tender SLA only: perWeek% weekly, capped max%, statutory candidates excluded), 10 Liability (draft placeholder requiring counsel), 11 Termination, 12 Governing law and disputes (KSA courts), 13 General, 14 Human legal review gate (LEGAL_DISCLAIMER + registry-only note + no 100% certainty). Each article titleEn/Ar, bodyEn/Ar, sourceIds[]. Research bullets and Sources block from research findings. Signatures table. Scope: first 1200 chars of entities.scope or placeholder with project title.",
        descriptionAr: "بناء عقد حتمي بـ 14 مادة مرتبطة بمصادر محددة.",
        inputs: ["projectTitle, etimadRef, parties, entities.sla, research"],
        output: "contentMd + articles[]",
        auditEvidence: "contentMd contains '# DRAFT CONTRACT | مسودة عقد' and 14 ### Article headers",
        safetyGuard: "No pricing, no invented statutes/article numbers/gazette updates, no 100% certainty",
      },
      {
        ruleId: "llm-refine-bilingual-preserve",
        sourceCategory: "LLM_ENRICHMENT",
        description: "generateCompletion with SYSTEM_LAW_CONTRACT: hard rules: LEGAL_DISCLAIMER mandatory, REGULATORY_PRECISION_RULE, NO_PRICING_RULE, never claim 100% certainty, research FIRST, every operative clause grounded in (a) tender-explicit facts, (b) registry-backed findings REGISTRY_BACKED/TENDER_EXPLICIT, or (c) labeled REQUIRES_COUNSEL. Output MUST preserve bilingual front-to-front format exactly: ### Article N — English Title | المادة N — العنوان العربي + :::en + :::ar markers. User prompt includes research JSON 14000 chars + deterministic draft 12000 chars. Refine operative language for formality only. Parse articles via parseContractArticles. If <8 articles, fallback to deterministic.",
        descriptionAr: "تحسين لغوي مع الحفاظ على التنسيق الثنائي.",
        inputs: ["research brief JSON, deterministic draft"],
        output: "refined Md + parsed articles",
        auditEvidence: "provider/model/tokensUsed/fallback boolean, articles length >=8 else fallback true",
        configurableParams: ["SYSTEM_LAW_CONTRACT prompt, maxTokens 8192, temperature 0.15, engine LAW"],
      },
      {
        ruleId: "contract-validation-blocking",
        sourceCategory: "DETERMINISTIC_CALC",
        description: "validateContractDraft(): Checks: non-empty, contains NOT LEGAL ADVICE/ليست استشارة قانونية, no 100% certainty regex (/100%\\s*(certain|certainty|sure|guaranteed).../), no pricing suggestion via detectPricingSuggestion/Request, RESEARCH SUMMARY + Sources markers present, bilingual structure via validateBilingualArticleStructure (headers must contain paired EN|AR titles via BILINGUAL_ARTICLE_HEADER_RE, exactly one :::en and one :::ar per article, parseContractArticles validates number matches). Asymmetric detection: if article has body in only one language → error. If articles <5 → warning. Returns { ok, blocking, issues[] }.",
        descriptionAr: "بوابة تحقق ثنائية اللغة تمنع التصدير عند أخطاء حرجة.",
        inputs: ["contentMd"],
        output: "validation report + contractStatus DRAFT/GENERATED",
        auditEvidence: "issues[] codes: empty_contract, missing_legal_disclaimer, false_certainty, pricing_language, missing_research_sources, bilingual_structure, bilingual_asymmetry, insufficient_articles",
        safetyGuard: "Force disclaimer presence, no false certainty, no pricing",
      },
      {
        ruleId: "contract-persistence-with-audit",
        sourceCategory: "APPROVED_KNOWLEDGE",
        description: "Contract saved as GeneratedProposal type CONTRACT version 1 locale ar. artifactsJson: first element raw research data + 2 downloadable artifacts HTML/PDF with downloadPath placeholders replaced. ProposalVersion row with changeLog 'Law agent: Saudi registry research + bilingual draft'. Then prior AgentRun finalArtifact JSON merged with contractId, contractValidation, contractResearchAt. Two audit() calls: one for CONTRACT (provider, articles), one for main proposal (score, provider).",
        descriptionAr: "حفظ مسودة العقد مع أثر تدقيق كامل.",
        inputs: ["contract.id, validation, research.researchedAt"],
        output: "DB rows + audit logs",
        auditEvidence: "audit AUDIT_ACTIONS.PROPOSAL_GENERATE resource GeneratedProposal contract.id + details provider articles",
      },
    ],
    failureModes: [
      { mode: "LLMEmpty", cause: "Law LLM fails or returns <8 articles", mitigation: "Use deterministic contract, mark fallback true", severity: "WARNING" },
      { mode: "MissingResearchMarkers", cause: "LLM omits RESEARCH SUMMARY or Sources", mitigation: "Validation issues missing_research_sources blocks export (DRAFT)", severity: "BLOCKING" },
      { mode: "No100CertaintyAllowed", cause: "Model claims guaranteed enforceability", mitigation: "Validation catches false_certainty error, forces human review", severity: "BLOCKING" },
    ],
    validationGates: ["Disclaimer present", "No 100% certainty", "No pricing language", "RESEARCH SUMMARY + Sources markers", "Bilingual article headers paired EN|AR", "Exactly one :::en ::ar per article", "No bilingual asymmetry"],
    modifiability: {
      configFile: "src/lib/saudi-law-research.ts, src/lib/contract-format.ts articleBlock/parseContractArticles, src/lib/procurement-rules.ts LEGAL_DISCLAIMER",
      promptFile: "src/lib/agents/law-contract.ts SYSTEM_LAW_CONTRACT",
    },
    auditFields: ["contentMd with research bullets + sources block", "articles[] number/titleEn/Ar/bodyEn/Ar/sourceIds[]", "research researchedAt + findings[{topicEn/Ar, certainty, statement}] + sources[{instrument, version, reviewDate, reference}]", "validation issues[]", "audit logs"],
  },
};

export type AgentRegistryKey = keyof typeof AGENT_REGISTRY;

/** Helper to list all agents in execution order */
export const AGENT_EXECUTION_ORDER: AgentId[] = ["INGESTION", "COMPLIANCE_REGULATORY", "TECHNICAL_ARCHITECT", "FINANCIAL_QUALIFICATION", "PROPOSAL_DRAFTING", "LAW_CONTRACT"] as const;

/** Transparency checklist for auditors */
export const AUDIT_CHECKLIST = [
  "Every Compliance row has sourceCategory EXPLICIT_TENDER | REGULATORY_CANDIDATE | INFERRED_APPLICABILITY | INTERNAL_RECOMMENDATION",
  "Every SLA penalty preservation keeps originalWording and separate statutory candidate",
  "Local content preference only when tender-stated (EXPLICIT_TENDER)",
  "No NORA principle ID invented — only from tender or approved registry",
  "QLR formula transparent, pass/fail only when tender threshold explicit",
  "BoQ structure only, unitPrice/total always null",
  "Proposal contains 18 sections + LEGAL_DISCLAIMER + human final author line",
  "Contract contains 14 articles bilingual :::en :::ar + RESEARCH SUMMARY + Sources + disclaimer + no 100% certainty + no pricing",
  "All LLM enrichments have fallback and provider audit trail",
  "AgentRun.agentStates JSON includes startedAt/completedAt per agent + findings + output",
  "ProposalVersion history tracks regenerate mode version/fork with optimistic locking",
  "Validation gates block export-ready when critical issues present",
  "Audit logs via audit() for proposal and contract with provider/article counts",
] as const;
