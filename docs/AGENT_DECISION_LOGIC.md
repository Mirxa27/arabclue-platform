# Agent Decision Logic – Transparent Explanation (EN/AR)

This file explains each agent's decision-making in plain language for non-technical auditors.

## Why Deterministic-First?

- **Trust**: Saudi tender evaluators require traceable evidence. Deterministic rules can be tested, unit-tested, and audited.
- **Safety**: LLM can hallucinate penalties, prices, certifications. Deterministic extraction never invents numbers.
- **Fallback**: If LLM key missing or rate-limited, system still produces a valid draft via deterministic builder.

## Visual Flow

```
User uploads docs → extractTextFromStorage() per file (PDF/DOCX/XLSX/ZIP/Images OCR) → combined text
  → parseTenderText(): regex firstLabeledValue, scope, milestones, budget, deadline, eval weights, SLA preservation, local-content explicit only
  → evaluateCompliance(): build rows from COMPLIANCE_FRAMEWORKS, keyword hit scoring, sourceCategory separation
  → runTechnicalArchitect(): RAG retrieve approved past projects (cosine similarity), score thresholds, experience classification exact/analogous/proposed, 9 narratives from approved evidence only
  → runFinancialAgent(): findAmount cash/AR/CL, compute QLR = (Cash+AR)/CL, BoQ structure only (blank amounts)
  → buildCoveragePlan(): map requirements to evidence, evaluationWeights, strengths, gaps, win strategy
  → draftProposal(): LLM with 18 sections + deterministic fallback, validation gate blocks export if pricing/disclaimer/100% certainty/bidi controls
  → draftLawContract(): registry research Saudi frameworks, 14 bilingual articles EN|AR with :::en :::ar, sources, signatures, validation blocking
  → audit logs + metrics + decision log + proposal versioning + artifacts
```

## Decision Transparency per Agent

### Ingestion
- **What**: Text extraction + field parsing.
- **How**: `firstLabeledValue` looks for "Tender Title:" or "اسم المنافسة:" etc. `cleanFieldValue` trims. Budget regex with million multiplier. Deadline ISO or DMY. Evaluation weights via percent near keyword "technical"/"فني". SLA via percent near "per week"/"أسبوعي" + preserve originalWording 120 chars, never rewrite to statutory. Local content via `extractLocalContentPreference()` only if found. Milestones via 3 patterns, dedup, quality filter. Scope via SOW regex + quality filter.
- **Why auditable**: Every field has `originalWording` or `rawTextExcerpt`, evidence list logs where found.

### Compliance
- **What**: Matrix rows.
- **How**: Corpus = tenderText + scope + JSON entities. For each control, tokenize controlId+title+requirement >3 chars top 10 keywords, count hits in corpus → hitCount. Framework hit via mentions "nca"/"ecc"/"أمن سيبراني". Then:
  - PDPL residency: if mentions KSA residency → COMPLIANT with platform posture; if cross-border → LEGAL_REVIEW_REQUIRED; else CLARIFICATION_REQUIRED, never 100% mandate.
  - LOCAL_CONTENT: if explicit % → COMPLIANT EXPLICIT_TENDER; else if language or target → PARTIAL; else NOT_APPLICABLE.
  - NORA: only if from tender or approved registry APPROVED; else NOT_APPLICABLE with note no invent.
  - NCA: hitCount>=3 + frameworkHit → COMPLIANT; >=1 or hit → PARTIAL; else EVIDENCE_MISSING.
- **Safety**: SourceCategory EXPLICIT_TENDER vs REGULATORY_CANDIDATE vs INFERRED_APPLICABILITY vs INTERNAL_RECOMMENDATION separation.
- **SLA**: Two rows: tender clause preserved, statutory candidate separate.

### Technical
- **What**: Solution narrative from approved evidence.
- **How**: Query = scope + milestones. Retrieve past projects topK 5 score>=0.18 quality title filter; tender corpus topK 8. Score mapping: >=0.45 exact, >=0.22 analogous, else proposed. Methodology = EXECUTION_METHODOLOGY phases with rationale tying scopeSnippet. 9 narratives each include scope line + tenderSnippets 4 max + matchedProjects list or gap statement. Vision2030 only if brand config or tender mention.
- **Why not invent**: No project/staff/cert invented; missing evidence → explicit gap.

### Financial
- **What**: Qualification figures + BoQ structure.
- **How**: Find amounts for cash, AR, CL via regex labels. If all present: QLR = (Cash+AR)/CL, formula string, passes only if tender threshold extracted via `extractQlrThreshold`. BoQ: milestones sanitized → { item, unit LS, qty 1, unitPrice null, total null } always blank. Local content note evaluation preference only.
- **Hard rule**: `allowPricePopulation=false`, validation gate blocks if pricing language detected.

### Drafting
- **What**: 18-section Markdown.
- **How**: Prompt built from truncated contexts (50 compliance rows, 40 coverage rows, 15 missing tasks, 8000 ingestion JSON). System prompt per locale with mandatory phrases: legal disclaimer verbatim, human final author line. LLM maxTokens 8192 temp 0.28 engine DRAFTING. Strip fences. If empty/fallback → deterministic builder `buildDeterministicProposal()` templates all 18 sections, coverageTable 40, complianceBlock 25, QLR label, BoQ blank 20, experience classified, brand placeholder detection, gaps 12, disclaimer.
- **Gate**: `validateProposalOutput()` checks pricing blank, staff approved, compliance evidence, bidi controls, etc. If blocking → status DRAFT not GENERATED, exportReady false.

### Law Contract
- **What**: Bilingual contract 14 articles.
- **How**: Registry research `researchSaudiLawForContract()` matches complianceRows + entities against Saudi Law registry (governing-law, pdpl, procurement-context, sla-tender). Returns findings certainty TENDER_EXPLICIT|REGISTRY_BACKED|REQUIRES_COUNSEL, sources instrumentEn/Ar version reviewDate sourceReference. Deterministic contract 14 articles predefined with scope 1200 chars, SLA tender only, liability placeholder requiring counsel, etc. Research bullets + sources block. Signatures table. LLM refine with SYSTEM_LAW_CONTRACT hard rules: disclaimer mandatory, regulatory precision, no pricing, never 100% certainty, research first, operative clauses grounded only in (a) tender-explicit, (b) registry-backed, (c) REQUIRES_COUNSEL labeled. Output format ### Article N — Title | المادة N — العنوان + :::en + :::ar. Parse articles; if <8 fallback deterministic.
- **Gate**: `validateContractDraft()` checks non-empty, disclaimer, no 100% certainty regex, no pricing via guardrails, RESEARCH SUMMARY + Sources markers, bilingual header paired EN|AR regex, exactly one :::en ::ar per article, asymmetry detection, <5 articles warning.

### Orchestrator
- **What**: Sequential state machine with cancellation, progress, versioning.
- **How**: `states = initStates(locale)`, `assertNotCancelled()` checks DB status before every mark/persist, throws `PipelineCancelledError`. Persist calculates overall = mean(progress). `mark()` updates state + persist. Extraction parallel 3 workers with error isolation. DecisionLogger logs every rule firing with ruleId/sourceCategory/evidence. MetricsTracker tracks timing/quality/reliability. Coverage plan via `buildCoveragePlan()` + sync to requirements. Artifacts list with placeholder replaced after create. Transactional versioning: version mode optimistic lock on status+version+updatedAt, fork mode parentProposalId. Final artifact merges proposalId, contractId, validation, coverage, metrics, decisionLog (last 100), auditChecklist. Two audit() calls. Finally persist COMPLETED.

## Auditability

- **DecisionLogger**: entries array with timestamp, agentId, ruleId, sourceCategory, level, message, messageAr, inputs truncated, output, evidence snippet, configUsed, runId, blocking.
- **Metrics**: per-agent timing startedAt/completedAt/durationMs, quality coveragePercent complianceScore evidenceCount gapCount enriched fallback provider tokensUsed, reliability retries errors blockedExports, totalDuration.
- **FinalArtifact**: Includes metrics + decisionLog entries 100 + audit checklist + validation reports.
- **AgentRun.agentStates JSON**: per agent status progress findings output startedAt/completedAt.
- **ProposalVersion**: version, contentMd, changeLog, locale, createdBy.
- **ComplianceCheck DB rows**: controlId, status, evidence, remediation, sourceCategory, legalReviewStatus, framework, complianceLevel.
- **AuditLog**: via `audit()` for proposal generate with provider/articles/score.

## Modifiability (Where to Change)

- Agent order/list: `constants.ts` AGENTS + `agent-registry.ts` EXECUTION_ORDER.
- Thresholds: `agent-config.ts` (RAG topK, score thresholds, QLR formula, BoQ lines, token limits, concurrency).
- Safety: `prompts.ts` NO_PRICING_RULE, REGULATORY_PRECISION_RULE, LEGAL_DISCLAIMER; `procurement-rules.ts`.
- Prompts: `prompts.ts` SYSTEM_*, draftingUserPrompt, enrichUserPrompt; `law-contract.ts` SYSTEM_LAW_CONTRACT.
- Compliance controls: `constants.ts` COMPLIANCE_FRAMEWORKS + `procurement-rules.ts` NCA_FRAMEWORKS, PDPL_RULES, NORA_PRINCIPLES.
- Ingestion regex: `ingestion.ts` firstLabeledValue, parse* functions.
- Typography/print: `pdf/print-ready.ts` PRINT_READY, `bilingual-typography.ts` BILINGUAL_FONT_PAIRS.
- Validation gates: `validation-gate.ts`, `law-contract.ts` validateContractDraft.
- Layout: `layout-sync.ts`.

## Capability Improvements This Iteration

- Parallel ingestion, embedding cache, metrics, decision logging, audit checklist, safety invariant verification.
- Premium print-ready: embedded OFL fonts data URL, no remote fonts, 300 DPI check, aggregate pixel limit 30M, bleed 3mm, safety 5mm, crop marks, tagged PDF, semantic headings, lang/dir, alt required, orphans/widows 3, keep-with-next, CMYK-safe palette TAC≤240% + Ghostscript conversion recipe documented.

## Reliability Improvements

- Cancellation responsiveness before every persist.
- Optimistic locking for regenerate.
- Fallback deterministic drafts/contracts.
- Validation gates blocking export-ready.
- Guardrails pricing detection.
- Error isolation per file per agent.
- Retry tracking.
- Safety invariant verification at startup.

---

*This document is part of transparency requirement. All decisions are logged with sourceCategory and evidence. Human author remains final authority.*
