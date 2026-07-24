import { EXECUTION_METHODOLOGY, VISION_2030_PILLARS } from "../constants";
import { retrieveRelevant, formatRagContext, type RagDocument } from "../rag";
import type { IngestionEntities, TechnicalArchitectOutput } from "../types";
import {
  isQualityMilestoneName,
  isQualityPastProjectTitle,
  isQualityScopeText,
  sanitizeMilestonesForBoq,
} from "../text-quality";

/**
 * Technical & Solution Architecture Agent — senior tender architect.
 * Builds evaluation-aligned delivery narrative from approved evidence only.
 */
export function runTechnicalArchitect(opts: {
  entities: IngestionEntities | null;
  pastProjects: RagDocument[];
  tenderCorpus?: RagDocument[];
  vision2030Alignment?: string | null;
  queryEmbedding?: number[] | null;
  locale?: "ar" | "en";
}): TechnicalArchitectOutput & {
  findings: string[];
  ragContext: string;
  tenderContext: string;
} {
  const ar = opts.locale === "ar";
  const scopeOk = isQualityScopeText(opts.entities?.scope);
  const scopeSnippet = scopeOk
    ? (opts.entities!.scope as string).slice(0, 160)
    : ar
      ? "نطاق العمل كما في كراسة الشروط (يُستكمل بشرياً عند الحاجة)"
      : "tender SOW (complete manually where needed)";

  const query = [
    scopeOk ? opts.entities?.scope ?? "" : "",
    ...(opts.entities?.milestones
      .filter((m) => isQualityMilestoneName(m.name))
      .map((m) => m.name) ?? []),
  ].join(" ");

  const defaultQuery =
    query.trim() || "government digital transformation Saudi Arabia Etimad";

  const pastHits = retrieveRelevant(defaultQuery, opts.pastProjects, {
    topK: 5,
    queryEmbedding: opts.queryEmbedding,
  }).filter(
    (h) => isQualityPastProjectTitle(h.title) && h.score >= 0.18
  );

  const tenderHits = retrieveRelevant(defaultQuery, opts.tenderCorpus ?? [], {
    topK: 8,
    queryEmbedding: opts.queryEmbedding,
  });

  const methodology = EXECUTION_METHODOLOGY.map((phase) => {
    const focus = ar
      ? `تركّز المرحلة على ${phase.nameAr} (${phase.pmi} / ${phase.agile}) مع معايير دخول/خروج قابلة للقياس.`
      : `Phase focus: ${phase.name} maps PMI ${phase.pmi} with Agile ${phase.agile}; entry/exit criteria are measurable.`;
    const scopeLine = ar
      ? `يربط المخرجات بنطاق المناقصة: ${scopeSnippet}.`
      : `Tied to tender outcomes: ${scopeSnippet}.`;
    return {
      id: phase.id,
      name: phase.name,
      nameAr: phase.nameAr,
      rationale: `${focus} ${scopeLine}`,
    };
  });

  const matchedProjects = pastHits.map((h) => ({
    id: h.id,
    title: h.title,
    score: h.score,
    why: ar
      ? `درجة الصلة ${h.score.toFixed(2)} — ${h.summary.slice(0, 160)}`
      : `Relevance ${h.score.toFixed(2)} — ${h.summary.slice(0, 160)}`,
    experienceClass: (h.score >= 0.45
      ? "exact"
      : h.score >= 0.22
        ? "analogous"
        : "proposed") as "exact" | "analogous" | "proposed",
  }));

  const pillar =
    VISION_2030_PILLARS.find((p) => p.id === opts.vision2030Alignment) ??
    VISION_2030_PILLARS[1];

  const tenderSnippets = tenderHits
    .slice(0, 4)
    .map((h) => h.summary.slice(0, 180))
    .filter((s) => s && !s.trim().startsWith("،") && !s.includes("|"))
    .join(" | ");

  const techW = opts.entities?.evaluation.technical ?? 70;
  const finW = opts.entities?.evaluation.financial ?? 30;
  const cleanMilestones = sanitizeMilestonesForBoq(
    opts.entities?.milestones,
    ar ? "ar" : "en"
  );

  const solutionApproach = ar
    ? [
        "تُنظَّم المعمارية وفق تغطية متطلبات المناقصة وليس بلغة تسويقية عامة.",
        scopeOk
          ? `فهم المشروع: ${opts.entities!.scope!.slice(0, 500)}`
          : "يُستمد فهم المشروع من كراسة الشروط المرفوعة ويُستكمل يدوياً عند نقص الاستخراج.",
        tenderSnippets
          ? `قيود مستندة إلى نص المناقصة: ${tenderSnippets.slice(0, 400)}`
          : "تُستكمل قيود المناقصة من المقاطع المستخرجة بعد مراجعة بشرية.",
        matchedProjects.length
          ? `خبرات مدعومة بالأدلة: ${matchedProjects
              .map((p) => `${p.title} [${p.experienceClass}]`)
              .join("؛ ")}.`
          : "لا توجد مشاريع سابقة معتمدة بدرجة صلة كافية — يبقى الحل معيارياً دون ادّعاء إنجاز.",
        "تُطبَّق مبادئ أقل صلاحية وSDLC الآمن ومعايير قبول قابلة للقياس عند دعمها بنص المناقصة أو سياسات المستأجر المعتمدة.",
      ].join("\n\n")
    : [
        "Solution architecture is tender-specific and organized by requirement coverage, not generic marketing language.",
        scopeOk
          ? `Project understanding: ${opts.entities!.scope!.slice(0, 500)}`
          : "Project understanding is derived strictly from the uploaded RFP / conditions booklet.",
        tenderSnippets
          ? `Tender-grounded constraints: ${tenderSnippets.slice(0, 400)}`
          : "Tender corpus RAG pending richer chunks — architecture uses parsed entities.",
        matchedProjects.length
          ? `Evidence-backed experience: ${matchedProjects
              .map((p) => `${p.title} [${p.experienceClass}]`)
              .join("; ")}.`
          : "No sufficiently similar approved past projects ranked — solution remains standards-based and proposed approach only.",
        "Architecture principles applied only when supported by tender text or approved tenant policies: least privilege, secure SDLC, measurable acceptance criteria, and KSA-aligned hosting posture where configured.",
      ].join("\n\n");

  const deliveryModel = ar
    ? [
        "نموذج تسليم هجين يجمع تكرارات Agile مع بوابات PMI للمراحل التعاقدية.",
        `المعالم التعاقدية: ${cleanMilestones
          .map((m) => `${m.name} (${m.weeks} أسابيع)`)
          .join("، ")}.`,
        "مسارات عمل بـ RACI: إدارة البرنامج، المعمارية، الهندسة، الجودة، الأمن، إدارة التغيير، والانتقال.",
      ].join(" ")
    : [
        "Hybrid delivery model combining Agile iterations for build/change streams with PMI stage-gates for contractual milestones.",
        `Contractual milestones reflected: ${cleanMilestones
          .map((m) => `${m.name} (${m.weeks}w)`)
          .join(", ")}.`,
        "RACI-defined workstreams: Program Management, Solution Architecture, Engineering, QA, Security, Change Management, and Transition.",
      ].join(" ");

  const governance = ar
    ? "مجلس حوكمة شهري، توجيه مشروع كل أسبوعين، ووقوف يومي مع سجل قرارات. مسار التصعيد: قائد التسليم → مدير البرنامج → الراعي. الالتزامات التعاقدية تتطلب اعتماداً بشرياً مخوّلاً قبل التقديم."
    : [
        "Governance board (monthly), project steering (bi-weekly), and delivery stand-ups (daily) with formal decision logs.",
        "Escalation path: Delivery Lead → Program Manager → Sponsor / Client Authority.",
        "All contractual commitments require authorized human approval before submission; drafts are assistive only.",
      ].join(" ");

  const qualityPlan = ar
    ? "إدارة الجودة تشمل مراجعات تصميم وقائية واختبارات وUAT مربوطة بمخرجات المناقصة، مع تتبّع: متطلب → تصميم → اختبار → دليل قبول."
    : [
        "Quality management integrates preventive reviews, peer design reviews, automated tests where applicable, and UAT acceptance mapped to tender deliverables.",
        "Defect triage with severity classes and release readiness checklist prior to each contractual milestone.",
        "Traceability: requirement ID → design artifact → test case → evidence of acceptance.",
      ].join(" ");

  const riskPlan = ar
    ? "سجل مخاطر باحتمال/أثر وملاك وإجراءات تخفيف. مخاطر شائعة: ضغط الجدول، اعتماد بيانات العميل، التكامل، التصاريح الأمنية، واستمرارية الموارد."
    : [
        "Risk register maintained with probability/impact scoring, owners, and mitigation actions.",
        "Typical tender risks addressed: schedule compression, dependency on client data, integration interfaces, security clearance, and resource continuity.",
        "Issues and risks reported in governance packs; no risk is closed without residual-risk acceptance by authority.",
      ].join(" ");

  const securityPrivacy = ar
    ? "تُعالج الاستجابة الأمنية الضوابط المثبتة في مصفوفة الامتثال (NCA/PDPL حسب الانطباق) دون اختراع شهادات. معالجة البيانات الشخصية وفق ملاحظات PDPL وسياسة المستأجر — يلزم مراجعة قانونية عند غموض الإقامة/النقل."
    : [
        "Security response addresses controls evidenced in the compliance matrix (NCA/PDPL as applicable) without inventing certifications.",
        "Secure-by-design practices: threat modeling for in-scope components, secrets management, least privilege, and audit logging.",
        "Personal data handling follows PDPL evaluation notes and tenant policy — not blanket legal assumptions. Legal review required where transfer/residency language is ambiguous.",
      ].join(" ");

  const serviceManagement = ar
    ? opts.entities?.sla
      ? `تستخدم استجابة SLA صيغة الغرامة الواردة في المناقصة (${opts.entities.sla.perWeek}% أسبوعياً، حد ${opts.entities.sla.maxPercent}%) دون إعادة كتابة المرشحات النظامية كحقائق مناقصة. إدارة الخدمة تشمل الحوادث والمشكلات والتغيير والطلبات.`
      : "تُطابق استجابة SLA بنود المناقصة بعد الاستخراج والمراجعة."
    : [
        opts.entities?.sla
          ? `SLA response uses tender-stated penalty terms (${opts.entities.sla.perWeek}%/week, max ${opts.entities.sla.maxPercent}%) without rewriting statutory candidates into tender facts.`
          : "SLA response will mirror tender clauses exactly once extracted.",
        "Service management includes incident, problem, change, and request fulfillment processes with measurable KPIs where the tender defines them.",
        "Reporting cadence and service review meetings align to governance calendar.",
      ].join(" ");

  const trainingTransition = ar
    ? "خطة تدريب للمسؤولين والمستخدمين، ونقل معرفة عبر أدلة تشغيل وفترة مرافقة، مع معايير قبول انتقال صريحة."
    : [
        "Training plan covers administrator and end-user enablement with materials in Arabic and English as required by the tender.",
        "Knowledge transfer includes runbooks, operational handover checklist, and shadow-support period.",
        "Transition acceptance criteria are explicit and measurable.",
      ].join(" ");

  const continuity = ar
    ? "التزامات الاستمرارية والتعافي محدودة بأصول BCP/DR المعتمدة ومتطلبات المناقصة. لا تُختلق أرقام RPO/RTO."
    : [
        "Business continuity and disaster recovery commitments are limited to approved tenant BCP/DR assets and tender requirements.",
        "Backup, RPO/RTO, and failover statements appear only when evidenced in approved methodologies or tender text.",
        "Missing continuity evidence is listed as a gap for human completion — never fabricated.",
      ].join(" ");

  const evaluationAlignment = ar
    ? [
        `الوزن الفني ${techW}%: تُركّز السردية على المتطلبات الإلزامية والمعمارية والمنهجية والفريق والأمن والامتثال.`,
        `الوزن المالي ${finW}%: يوفّر هذا العطاء هيكل التأهيل ونماذج BoQ بدون تسعير — يُدخل الفريق التجاري المعتمد الأسعار.`,
        "كل قسم رئيسي قابل للتقييم؛ تربط مصفوفة التغطية الاستجابات ببنود المناقصة.",
      ].join(" ")
    : [
        `Technical evaluation weight: ${techW}%. Narrative density prioritizes mandatory technical requirements, architecture, methodology, team, security, and compliance.`,
        `Financial evaluation weight: ${finW}%. This proposal provides qualification structure and unpriced BoQ forms only — commercial pricing is entered by the client's authorized commercial team.`,
        "Each major section is written to be scorable against evaluation criteria; requirement coverage matrix links responses to tender clauses.",
      ].join(" ");

  const vision2030Notes = ar
    ? opts.vision2030Alignment
      ? `المواءمة مع ركيزة رؤية 2030 «${pillar.nameAr}» مدعومة فقط عند توفر إعداد العلامة أو دليل مسترجع — دون ادعاءات أثر وطني غير مدعومة.`
      : `تُذكر رؤية 2030 فقط عند دعم نص المناقصة أو إعداد العلامة (مرشح: ${pillar.nameAr}).`
    : opts.vision2030Alignment
      ? `Alignment with Vision 2030 pillar "${pillar.name}" / "${pillar.nameAr}" is supportable via brand configuration and retrieved evidence only. No unsupported national-impact claims.`
      : `Vision 2030 references are included only when brand alignment or tender text supports them (pillar candidate: ${pillar.name}).`;

  const findings = [
    `Retrieved ${pastHits.length} approved past project(s) via tenant RAG`,
    `Retrieved ${tenderHits.length} tender chunk(s)`,
    ...matchedProjects
      .slice(0, 3)
      .map(
        (p) =>
          `Match: ${p.title} (${p.experienceClass}, score ${p.score.toFixed(3)})`
      ),
    evaluationAlignment,
    vision2030Notes,
  ];

  return {
    methodology,
    matchedProjects,
    solutionApproach,
    deliveryModel,
    governance,
    qualityPlan,
    riskPlan,
    securityPrivacy,
    serviceManagement,
    trainingTransition,
    continuity,
    evaluationAlignment,
    vision2030Notes,
    findings,
    ragContext: formatRagContext(pastHits),
    tenderContext: formatRagContext(tenderHits),
  };
}
