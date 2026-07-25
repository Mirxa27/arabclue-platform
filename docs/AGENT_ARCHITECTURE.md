# ArabClue Agent Architecture – Transparent, Auditable, Modifiable

> This document makes the underlying logic of all 6 + orchestrator agents fully transparent, auditable, and easy to modify.
> It is the canonical reference for security reviews, compliance audits, and engineering changes.

## 1. Overview

ArabClue runs a **deterministic-first, LLM-enriched** pipeline for Saudi Etimad tender automation.

### Execution Order (strictly sequential)

```
1. INGESTION → 2. COMPLIANCE_REGULATORY → 3. TECHNICAL_ARCHITECT → 4. FINANCIAL_QUALIFICATION → 5. PROPOSAL_DRAFTING → 6. LAW_CONTRACT
```

- No parallel agent execution: data dependency is enforced.
- Every agent can run in **deterministic mode** (fallback) without LLM.
- Orchestrator handles cancellation, progress, transactional versioning, audit logging, metrics, and decision tracing.

### Safety Invariants (hard rules, never configurable off)

- **NO_PRICING_RULE**: Never suggest, calculate, adjust, or comment on bid prices, unit prices, discounts, margins. Financial forms only structure (item/unit/qty) with blank amounts.
- **REGULATORY_PRECISION_RULE**: Never inject default penalty % as tender fact; never assume blanket local-content/SME %; do not state PDPL universally requires 100% KSA residency; do not invent NORA principle IDs.
- **LEGAL_DISCLAIMER**: Every compliance/regulatory/legal output includes “Not legal advice – authorized human approval required” (EN/AR).
- **BoQ blank guarantee**: `unitPrice` and `total` always `null`.
- **Contract bilingual structure**: `### Article N — Title | المادة N — العنوان`, exactly one `:::en` and one `:::ar` per article, asymmetry check blocks export.
- **Disclaimer presence**: Missing disclaimer → BLOCKING validation error.

---

## 2. Agent Specifications

All specs are also in code: `src/lib/agents/agent-registry.ts` (`AGENT_REGISTRY`) and configurable via `src/lib/agents/agent-config.ts`.

### 2.1 ORCHESTRATOR – Pipeline Orchestrator

**Purpose**: Execute 6 agents sequentially, track progress, handle cancellation, ensure transactional proposal versioning.

**Decision Rules**:
- `orchestration-order`: Sequential state machine, order from `AGENTS` constant.
- `cancellation-check`: Before every `mark`/`persist`, check `AgentRun.status === CANCELLED`. If true, throw `PipelineCancelledError`.
- `zero-doc-fail-fast`: If `docs.length===0 && combined==""`, fail INGESTION 100% with finding “Upload at least one RFP”.
- `transactional-versioning`: `version` mode optimistic locks on `(status, version, updatedAt)`. `fork` mode sets `parentProposalId`. Uses Prisma `$transaction`.

**Failure Modes**:
- NoDocuments → FAIL FAST DRAFT with actionable message.
- Cancelled → Persist CANCELLED, release poller.
- ConcurrentMutation → Throw, client must refetch.

**Audit Fields**: `agentStates JSON`, `overallProgress`, `startedAt/completedAt`, `finalArtifact.validation`, `audit()` logs.

**Modifiability**: `src/lib/constants.ts` (AGENTS order), env `LLM_PROVIDER`, prompts `src/lib/agents/prompts.ts`.

**New in this iteration**:
- `DecisionLogger` captures every rule firing with `ruleId`, `sourceCategory`, timestamp, evidence.
- `MetricsTracker` captures timing, retries, token usage, fallback rate.
- Extraction now concurrent (configurable `maxParallelExtractions` default 3) with per-file error tracking.
- Decision log persisted in `finalArtifact.decisionLog` (last 100 entries) + full evidence chain in `findings`.

---

### 2.2 AGENT 1 – INGESTION – Tender Ingestion & Requirements Engineer

**Purpose**: Extract structured requirements from heterogeneous tender files.

**Routing**:
- `text/*` → UTF-8 sanitized via `sanitizeText` (strips C0 `\u0000-\u0008` etc).
- `image/*` → OCR via tesseract/sharp (`ocr-image.ts`).
- `application/pdf` → `pdf-parse`.
- `...wordprocessingml` → `mammoth`.
- `spreadsheet/excel` → `exceljs`.
- `zip` → `safe-zip` with ZIP-slip + bomb protection, max entries configurable.
- else → empty (flag gap).

**Field Extraction**:
- `firstLabeledValue(labelPatterns[])` regex for bilingual labels: `tender name|اسم المنافسة`, `Etimad ref|رقم المنافسة`, `submission deadline|آخر موعد`, etc.
- `cleanFieldValue` trims punctuation, limits 500 chars.
- Budget: regex `/(\d[\d,]*)\s*(million|m)?/`, multiplier, currency detection (SAR/USD/EUR).
- Deadline: ISO `YYYY-MM-DD` or DMY `DD/MM/YYYY` → UTC ISO, null if invalid.
- Saudization: `/saudization|نطاقات.*(\d{1,3})%/`.

**Evaluation Weights**:
- Technical % via `/technical[^%\d]{0,40}(\d{1,3})%/`, Arabic `/فني...%/`. Fallback to `TENDER_TYPES[].evaluationSplit.technical`. Push evidence if differs.

**SLA Preservation (critical safety)**:
- Weekly raw: `/(\d+% )\s*per week|penalty...%/`. Max raw: `/max...%/`, Arabic `/سقف %/`.
- Preserve `originalWording` substring 120 chars.
- Do NOT rewrite with statutory candidate. Separately compute `SLA_PENALTY_RULES.statutoryCandidate(category)` → `maxCandidate` + `sourceReference`. Evidence logs both: tender clause `(EXPLICIT_TENDER)` and statutory candidate `(REGULATORY_CANDIDATE)`.

**Local Content**:
- `extractLocalContentPreference()` returns `preferencePercent` only if found in tender + `originalWording`. Never assume 10%/15%/20%. Evidence: “Local-content preference X% extracted (EXPLICIT_TENDER)”.

**NORA**:
- `noraPrinciplesFromTender()` scans tender for NORA IDs present in tender text only.

**Milestones**:
- 3 patterns: `milestone: name weeks`, `name: weeks`, `weeks: name`. Dedup lowercased, quality via `isQualityMilestoneName`, limit 10, `weekMax 260`. Fallback `STANDARD_DELIVERY_MILESTONES`.

**Scope**:
- Regex `/(scope of work|نطاق العمل|SOW)[: 40,600]/`, first paragraph, `isQualityScopeText`. Else first quality paragraph, else placeholder AR “نطاق العمل يُستكمل من كراسة الشروط…” and gap evidence.

**AI Enrichment Optional**:
- `enrichIngestionWithAi({ deterministic, excerpt 6000 })` may refine `scope` >40 chars, merge evidence up to 20, add `refinementNotes`. Deterministic numbers preserved. Logs provider/fallback.

**Outputs**: `IngestionEntities { scope, project { title, titleAr, etimadRef, category, budget, currency, submissionDeadline, saudizationTarget, localContentTarget }, evaluation { technical, financial }, sla { perWeek, maxPercent, capped, originalWording, statutoryCandidateMaxPercent, statutoryCandidateSource }, milestones[], evidence[], rawTextExcerpt 2000, localContentPreferencePercent, localContentOriginalWording, noraPrinciplesFromTender[] }`

**Validation**: Scope length >=40 or gap flagged; milestones quality; budget non-negative; deadline ISO parsable.

**Modifiability**: `text-quality.ts` quality functions, `constants.ts` TENDER_TYPES, `procurement-rules.ts` SLA_PENALTY_RULES.

**Audit**: `parsedSummary`, `extractedEntities JSON`, `evidence[]` with source labels, `sla.originalWording`.

**Performance Improvements**:
- Parallel extraction (3 workers) with error isolation.
- Caching of text extraction (future: contentHash)

---

### 2.3 AGENT 2 – COMPLIANCE_REGULATORY

**Purpose**: Build evidence-based compliance matrix from frameworks, never blanket COMPLIANT.

**Frameworks**: `COMPLIANCE_FRAMEWORKS` – PDPL, NCA ECC/CCC, LOCAL_CONTENT, NORA/EA_, PROCUREMENT_LAW.

**Inputs**: tenderText, entities, category, saudizationTarget, localContentTarget.

**Core Logic**:
- `corpus = tenderText + scope + JSON(entities)`.
- Iterate each framework control.
- For PDPL residency keyword: `textMentions(residency, ksa, NDMO, data residency, داخل المملكة)`. If hit → COMPLIANT, evidence includes `PLATFORM_DATA_POSTURE.defaultHostingRegion` + `PDPL_RULES.residencyEvaluationNote`. If cross-border language → LEGAL_REVIEW_REQUIRED + remediation. Else CLARIFICATION_REQUIRED, never assume 100%.
- LOCAL_CONTENT: If `preferencePercent != null` (tender-stated) → COMPLIANT EXPLICIT_TENDER, citation `PROCUREMENT_LAW.citation`. If hit or target != null but no % → PARTIAL. Else NOT_APPLICABLE. Findings log exact. **Safety: no blanket preference.**
- NORA: Only from tender (`tenderNora`) or approved registry (`NORA_PRINCIPLES` with `humanApprovalStatus APPROVED`). If from tender → COMPLIANT EXPLICIT_TENDER. If approved registry + mention → COMPLIANT/PARTIAL REGULATORY_CANDIDATE. Else NOT_APPLICABLE/CLARIFICATION_REQUIRED with note “ArabClue does not invent NORA IDs”. **Safety: no invented IDs.**
- NCA: `controlKeywordHits(ctrl)` tokenizes controlId+title+requirement lowercased, strip non-LP, filter >3 chars, not common words, top 10. `frameworkHit` via mentions nca/ecc/ccc/cybersecurity/الأمن السيبراني. If hitCount>=3 && frameworkHit → COMPLIANT, >=1 or frameworkHit → PARTIAL, else EVIDENCE_MISSING. SourceCategory EXPLICIT_TENDER if frameworkHit else REGULATORY_CANDIDATE. Remediation explicit.
- Others: hitCount>=2 → COMPLIANT else PARTIAL.

**SLA Rows**:
- `SLA-TENDER`: tender clause EXPLICIT_TENDER COMPLIANT preserved.
- `SLA-STATUTORY-CANDIDATE`: REGULATORY_CANDIDATE, LEGAL_REVIEW_REQUIRED if exceeds candidate, sourceReference.
- `SLA-CAP`: backward-compat reflects tender clause status, evidence includes statutory note.

**Outputs**: `rows[] { frameworkId, controlId, title, status (COMPLIANT|NON_COMPLIANT|PARTIAL|NOT_APPLICABLE|EVIDENCE_MISSING|CLARIFICATION_REQUIRED|LEGAL_REVIEW_REQUIRED), evidence, remediation, sourceCategory, legalReviewStatus NOT_LEGAL_ADVICE|REQUIRED, policyVersionId }`, `findings[]`, `score = compliant/total*100`.

**Validation**: Every row has `sourceCategory`, no COMPLIANT without evidence, `LEGAL_DISCLAIMER` in findings.

**Modifiability**: `constants.ts` COMPLIANCE_FRAMEWORKS, `procurement-rules.ts` PDPL_RULES, NCA_FRAMEWORKS, NORA_PRINCIPLES, SLA_PENALTY_RULES, PROCUREMENT_LAW, PLATFORM_DATA_POSTURE; prompt `SYSTEM_COMPLIANCE`.

**Audit**: `ComplianceCheck` DB rows, `complianceScore %`, findings with disclaimer, `sourceCategory` separation.

**Improvements**:
- Keyword hit logic now logs evidence snippet.
- Decision logger records PDPL, NCA, NORA, SLA decisions with sourceCategory.
- Metrics: complianceScore, evidenceCount.

---

### 2.4 AGENT 3 – TECHNICAL_ARCHITECT

**Purpose**: Build evaluation-aligned delivery narrative from approved RAG only, distinguish exact/analogous/proposed, no staff/cert invention.

**Inputs**: entities scope/milestones, pastProjects RagDocument[] with embeddings, tenderCorpus, vision2030Alignment, queryEmbedding, locale.

**RAG**:
- Query = `scope + milestones names` or fallback "government digital transformation Saudi Arabia Etimad".
- `retrieveRelevant(query, pastProjects, topK 5, embedding, threshold 0.18)` + `isQualityPastProjectTitle` filter.
- TenderCorpus topK 8.
- Score → experienceClass: >=0.45 exact, >=0.22 analogous, else proposed.
- Embedding cache: if `pastProject.embeddingJson` null, `embedText(title+summary+sector+tags)` on fly, cache in DB.

**Methodology**:
- `EXECUTION_METHODOLOGY` PMI phases mapped to Agile, each phase rationale ties `scopeSnippet` first 160 chars.

**Narratives** (9):
- `solutionApproach`: tender-specific, not marketing; includes scopeOk? scope 500 chars else placeholder; tenderSnippets from RAG tender hits 4 max 180 chars filtered; matchedProjects list `[exact]/[analogous]/[proposed]` or gap statement.
- `deliveryModel`: hybrid Agile iterations + PMI stage-gates, contractual milestones list, RACI.
- `governance`: board monthly, steering bi-weekly, stand-ups daily, escalation path, authorized human approval required.
- `qualityPlan`: preventive reviews, peer reviews, automated tests, UAT mapped to deliverables, defect triage, traceability requirement→design→test→evidence.
- `riskPlan`: register probability/impact, typical risks: schedule compression, client data dependency, integration, security clearance, resource continuity.
- `securityPrivacy`: NCA/PDPL controls evidenced in compliance matrix, threat modeling, secrets management, least privilege, audit logging, no cert invention.
- `serviceManagement`: SLA uses tender-stated penalty `perWeek%/max%` without rewriting, incident/problem/change/request, KPIs where tender defines.
- `trainingTransition`: admin+end-user training AR/EN, runbooks, shadow period, acceptance criteria.
- `continuity`: BCP/DR limited to approved tenant assets + tender requirements, no invented RPO/RTO.

**Evaluation Alignment**:
- Technical weight prioritizes mandatory requirements, architecture, methodology, team, security, compliance. Financial weight explains BoQ structure only.

**Vision2030**:
- Only if `vision2030Alignment` set or tender mentions, otherwise candidate note.

**Outputs**: `TechnicalArchitectOutput { methodology[], matchedProjects[], solutionApproach, deliveryModel, governance, qualityPlan, riskPlan, securityPrivacy, serviceManagement, trainingTransition, continuity, evaluationAlignment, vision2030Notes, findings, ragContext, tenderContext }`.

**AI Enrichment**: `enrichTechnicalWithAi` refines 9 narratives >20 chars, preserves facts, adds findings provider/fallback.

**Validation**: Quality title filter, milestone filter, `sanitizeMilestonesForBoq`.

**Modifiability**: `constants.ts` EXECUTION_METHODOLOGY, VISION_2030_PILLARS; `rag.ts` thresholds; `text-quality.ts`.

**Audit**: matchedProjects score+class, ragContext, tenderContext, findings retrieval counts.

**Improvements**:
- Metrics: evidenceCount, enriched flag, fallback, provider, tokens.
- Decision logger for RAG retrieval.

---

### 2.5 AGENT 4 – FINANCIAL_QUALIFICATION

**Purpose**: Extract qualification figures only, compute QLR, structure-only BoQ blank, never price.

**QLR**:
- `findAmount` via regex labels: cash equivalents (`cash & equivalents, نقدية`), AR (`accounts receivable, ذمم مدينة`), current liabilities (`current liabilities, التزامات متداولة`). Each label regex.
- If all three present: `computeQuickLiquidityRatio({ cash, AR, CL }, qlrThreshold)` returns `ratio, passes, formula`. `qlrThreshold` via `extractQlrThreshold(tenderCorpus)` only if tender states explicit threshold. If threshold null, do NOT interpret PASS/FAIL as tender outcome, only calculation. Note includes values.
- Findings: QLR = X via formula (no threshold) or vs threshold → PASS/FAIL.
- Notes: Cash, AR, CL values.

**BoQ**:
- `sanitizeMilestonesForBoq` → `boqItems[] { item=name, unit=LS, qty=1, unitPrice=null, total=null }` always blank. Max 50 lines. Notes: “ArabClue does not price bids”.

**Local Content Note**:
- Preference from entities or `extractLocalContentPreference(tenderCorpus)`. If % from entities → note evaluation preference X% stated in tender, not bid price suggestion. Else note no blanket preference.

**Outputs**: `FinancialExtract`.

**Safety**: `NO_PRICING_RULE` hard, `allowPricePopulation=false` in config verified, BoQ blank guarantee in validation gate, `detectPricingRequest/Suggestion` guardrails.

**Modifiability**: `procurement-rules.ts` QLR helpers; `text-quality.ts`.

**Improvements**: Metrics timing, log QLR + BoQ lines.

---

### 2.6 AGENT 5 – PROPOSAL_DRAFTING

**Purpose**: Compose evaluator-ready proposal Markdown 18 sections, coverage matrix, BoQ blank, compliance, methodology, team only approved, experience classification, no superlatives, human final author, disclaimer.

**Prompt Construction**:
- complianceJson 50 max: control, status, sourceCategory, evidence 220 chars, remediation.
- coverageJson: coveragePercent, coveredCount, gapCount, evaluationWeights, winStrategyNotes, missingEvidenceTasks 15 max, rows 40 max (id, text 200 chars, status, section, evidenceTitles, outline, sectionRef, pageRef).
- ingestionJson 8000 chars, technicalJson 9 narratives + methodology + matchedProjects + deliveryModel..., financialJson full, ragContext, restrictions.
- Deterministic serialization.

**System Prompt**:
- `systemDrafting(locale)`: AR → primary MSA Arabic, bilingual headings Arabic first, English terms for NCA/PDPL kept Latin. EN → professional English with Arabic titles in parentheses. Tone government-formal, precise, scannable headings, tables, requirement IDs. Must include 18 sections: 1 Executive Summary, 2 Understanding, 3 Evaluation Alignment, 4 Requirement Coverage Matrix (table), 5 Methodology, 6 Architecture & Delivery, 7 Governance & Quality, 8 Risk, 9 Security & Privacy, 10 SLA & Service Management, 11 Team & Qualifications (ONLY approved), 12 Relevant Experience (classify exact/analogous/proposed, NEVER invent), 13 Compliance Commitments (not legal advice, disclaimer), 14 Training/Transition/Continuity, 15 Financial Forms Structure (QLR narrative + BoQ blank), 16 Assumptions/Exclusions/Clarifications, 17 Vision 2030 Alignment, 18 Closing (human approval required). Include verbatim `LEGAL_DISCLAIMER` and “Draft pending authorized human approval – user is final author of record.” Enforce `NO_PRICING_RULE` + `REGULATORY_PRECISION_RULE`.

**LLM Call**:
- `generateCompletion([system, user], { maxTokens 8192, temperature 0.28, engine DRAFTING })`. Strip ``` fences. If empty or fallback → `buildDeterministicProposal()`.

**Deterministic Fallback**:
- All 18 sections templated per locale, `coverageTable()` generates markdown table 40 max, `complianceBlock` 25 rows, QLR label mapping, BoQ blank 20 max, experienceBlock classified, brand placeholder detection, gaps 12 max, strengths, winStrategyNotes, humanNotice, LEGAL_DISCLAIMER. No experience invented, gaps flagged.

**Validation Gate**:
- `validateProposalOutput({ contentMd, financial, entities, complianceRows, restrictions, approvedEvidenceIds })` returns `{ blocking, issues[] }`. If blocking → status DRAFT not GENERATED, exportReady false. Issues stored in finalArtifact.validation.

**Artifacts**:
- TitleEn `Technical & Financial Proposal — {title}`, TitleAr Arabic. `financialFormsJson` BoQ structure source `agent_structure_only`. Artifacts list: PDF, PPTX, HTML slides, EA matrix XLSX, BoQ XLSX, ZIP. Initially PLACEHOLDER path replaced with proposal.id after create. Transaction creates proposal + ProposalVersion changeLog.

**Outputs**: Markdown, provider/model/tokensUsed/fallback, artifactsJson, financialFormsJson, complianceScore, proposalVersion, finalArtifact validation coverage provider knowledgeFindings exportReady slidesMetrics (QLR, qlrPasses, saudization%, complianceScore, localContentPreference, coveragePercent).

**Failure Modes**: EmptyLLM → deterministic fallback; ValidationBlocking → DRAFT status; RegenerateRace → optimistic lock error.

**Validation Gates**: Must contain LEGAL_DISCLAIMER, human approval line, BoQ blank, 18 sections, no invented KPIs, evidence IDs approved.

**Modifiability**: `validation-gate.ts`, `constants.ts AGENTS`, `text-quality.ts`, prompts file.

**Improvements**:
- Metrics: coveragePercent, complianceScore, gapCount, evidenceCount, token count, provider.
- Decision logger records validation blocking.

---

### 2.7 AGENT 6 – LAW_CONTRACT – Law Contract Counsel Drafter

**Purpose**: Research Saudi frameworks from registry then draft bilingual EN|AR contract 14 articles + research summary + sources + signatures. No 100% certainty, disclaimer mandatory, operative clauses grounded in tender-explicit, registry-backed, or REQUIRES_COUNSEL only.

**Research**:
- `researchSaudiLawForContract({ entities, complianceRows, projectTitle, restrictions })` scans complianceRows + entities for tender anchors, matches against Saudi Law registry (governing-law, pdpl, procurement-context, sla-tender...). Returns brief: findings `{ topicEn/Ar, certainty TENDER_EXPLICIT|REGISTRY_BACKED|REQUIRES_COUNSEL, statementEn/Ar }`, sources `{ instrumentEn/Ar, version, reviewDate, sourceReference }`, researchedAt ISO, updatePosture for counsel verification. No live browse.

**Deterministic 14 Articles**:
1 Parties, 2 Definitions, 3 Scope (first 1200 chars scope), 4 Term (milestones), 5 Contractor obligations, 6 Client obligations, 7 Confidentiality, 8 Personal data protection, 9 Delay remedies (tender SLA only perWeek% weekly capped max%, statutory candidates excluded), 10 Liability placeholder requiring counsel, 11 Termination, 12 Governing law and disputes (KSA courts), 13 General, 14 Human legal review gate (LEGAL_DISCLAIMER + registry-only note + no 100% certainty). Each: titleEn/Ar, bodyEn/Ar, sourceIds[].

ContentMd: `# DRAFT CONTRACT | مسودة عقد` > NOT LEGAL ADVICE, **Project/Reference/Researched at**, `# RESEARCH SUMMARY | موجز البحث` with updatePostureEn/Ar, Findings bullets, Sources block, `# OPERATIVE ARTICLES | البنود النافذة` via `articleBlock()`, `# SIGNATURES | التوقيعات` table, disclaimer.

**LLM Refine**:
- `generateCompletion([SYSTEM_LAW_CONTRACT hard rules, user: research JSON 14000 + deterministic draft 12000], { engine LAW, temp 0.15, maxTokens 8192 })`. SYSTEM_LAW_CONTRACT: DISCLAIMER mandatory, REGULATORY_PRECISION_RULE, NO_PRICING_RULE, never claim 100% certainty, research FIRST, every operative clause grounded in (a) tender-explicit, (b) registry-backed REGISTRY_BACKED/TENDER_EXPLICIT, or (c) labeled REQUIRES_COUNSEL. Output MUST preserve bilingual format `### Article N — Title | المادة N — العنوان` + `:::en` + `:::ar`. Parse via `parseContractArticles`. If <8 articles, fallback to deterministic.

**Validation**:
- `validateContractDraft()`: non-empty, contains NOT LEGAL ADVICE, no 100% certainty regex, no pricing via `detectPricingSuggestion/Request`, RESEARCH SUMMARY + Sources markers presence, bilingual structure via `validateBilingualArticleStructure` (headers paired EN|AR via BILINGUAL_ARTICLE_HEADER_RE, exactly one :::en and one :::ar per article, parsed number matches header), asymmetry detection (bodyEn vs bodyAr), articles <5 warning. Returns `{ ok, blocking, issues[] }` codes: empty_contract, missing_legal_disclaimer, false_certainty, pricing_language, missing_research_sources, bilingual_structure, bilingual_asymmetry, insufficient_articles.

**Persistence**:
- Contract saved as GeneratedProposal type CONTRACT version 1 locale ar. `artifactsJson`: first raw research data + 2 downloadable HTML/PDF with placeholder replaced. `ProposalVersion` changeLog. Merge prior finalArtifact with `contractId, contractValidation, contractResearchAt`. Two `audit()` calls: CONTRACT (provider, articles) and main proposal (score, provider).

**Outputs**: `BilingualContractDraft`.

**Failure Modes**: LLMEmpty <8 → deterministic fallback; MissingResearchMarkers → BLOCKING DRAFT; FalseCertainty → BLOCKING.

**Validation Gates**: Disclaimer, no 100% certainty, no pricing, RESEARCH SUMMARY + Sources, bilingual headers paired, exactly one :::en ::ar, no asymmetry.

**Modifiability**: `saudi-law-research.ts` registry, `contract-format.ts`, `procurement-rules.ts` LEGAL_DISCLAIMER, prompt file.

**Audit**: contentMd with bullets + sources, articles[] number/titleEn/Ar/bodyEn/Ar/sourceIds[], research researchedAt + findings + sources, validation issues[], audit logs.

**Improvements**:
- Metrics: evidenceCount, enriched flag, tokens, provider.
- Decision logger for validation blocking.

---

## 3. Performance, Capability, Reliability Improvements (This Iteration)

### Performance
- Ingestion parallel extraction with concurrency limit 3 (configurable `AGENT_CONFIG.PERFORMANCE.maxParallelExtractions`), per-file error isolation, timing metrics.
- Embedding cache: past project embeddings stored in DB `embeddingJson`, computed once via `embedText`.
- Coverage plan computation isolated, failure logged not crashing pipeline.
- Proposal drafting prompt truncation limits (50 compliance rows, 40 coverage rows, 15 missing tasks, 8000 ingestion JSON) to stay within token budget.

### Capability
- DecisionLogger: every rule firing logged with `ruleId`, `sourceCategory`, timestamp, inputs truncated, evidence. Persisted last 100 entries in finalArtifact for UI.
- MetricsTracker: per-agent timing, quality (coverage, complianceScore, evidenceCount, gapCount, enriched, provider, tokens), reliability (retries, errors, blockedExports), totalDuration.
- Central registry `agent-registry.ts`: single source of truth for all agents, decision rules, failure modes, validation gates, modifiability.
- Config centralization `agent-config.ts`: thresholds, limits, safety invariants verified at startup.
- Audit checklist `AUDIT_CHECKLIST` for external auditors.
- Compliance sourceCategory separation strictly enforced and audited.

### Reliability
- Cancellation checks before every `mark`/`persist` with `PipelineCancelledError`.
- Optimistic locking for regenerate version/fork (status+version+updatedAt).
- Fallback deterministic proposals/contracts when LLM unavailable or returns <8 articles.
- Validation gates blocking export-ready when critical issues.
- Guardrails `detectPricingRequest/Suggestion` in financial + drafting + contract.
- Error isolation: each agent's failure does not corrupt previous agents' DB rows; overall status FAILED with errorMessage.
- Retry tracking via metrics (future: exponential backoff in enrich).
- Safety invariant verification at startup (financial blank pricing, etc).

---

## 4. PDF Premium Print-Ready Standards

### Paper & Margins
- Default A4 portrait, margins premium `20mm/20mm/18mm/18mm` (top/bottom/left/right).
- Narrow `14/16/12/12`, Wide `28/28/24/24`.
- Content width/height calculated via `calculateContentWidth/Height`.

### Typography (Professional)
- Families: IBM Plex Sans (EN), IBM Plex Sans Arabic (AR), Noto Sans fallback, IBM Plex Serif optional, IBM Plex Mono code.
- Embedded as data URLs WOFF2 from `@fontsource` / `@ibm/plex-sans` OFL packages, no remote Google Fonts.
- Weights 300/400/500/600/700, line-height normalized 1.6 (EN 1.6, AR 1.75), tight for headings 1.25.
- OpenType: `kern`, `liga`, `calt`, `clig`, `tnum/lnum` for tabular, `onum` optional.
- Kerning normal, optical sizing auto, ligatures common+contextual, hanging punctuation first/last, hyphens auto EN / none AR, hyphenate-limit 6/3/2.
- Arabic tracking remains normal to preserve connected forms, never letter-spacing hacked.
- Scale major second 1.125: xs 8pt, sm 9pt, base 11pt, lg 12.5pt, xl 14pt, 2xl 17pt, 3xl 21pt, 4xl 27pt.
- Headings semibold 600, tracking -0.01em, border bottom for h2 0.5pt.

### Consistent Formatting
- Header: flex space-between, border bottom 3pt primary, logo 40px, title 2xl bold primary color, font stack per locale.
- Footer: confidential badge, pagination `Page X of Y` + AR `صفحة`.
- PDF header/footer templates (Playwright): premium header includes “ArabClue – Premium Print-Ready · Bleed 3mm · Safety 5mm · sRGB + Embedded OFL” + color profile note, footer page numbers centered EN/AR + TAC note.
- Section divider hr 2pt secondary-200.
- Bilingual layout: grid ratio configurable, gap, screen 1fr fallback <768px, print avoid break-inside.

### Optimized Page Breaks
- `@page { orphans: 3; widows: 3; bleed: 3mm; marks: crop cross; }`
- Avoid inside: `.bilingual-pair, table, figure, blockquote, ul, ol, .keep-together` → `break-inside: avoid; page-break-inside: avoid`.
- Break before: `h1`.
- Keep with next: headings `h2/h3/h4/.section-title` → `break-after: avoid`.
- `h2 + *` break-before avoid.
- `thead { display: table-header-group }`, `tfoot` footer group, `tr` avoid inside.
- `figure` keep with caption, `figcaption` sm.
- `section > :last-child` break-after avoid.
- Print media: `a[href^=http]::after` shows URL, screen-only hidden, `.page-break { break-before: page }`.

### Accessibility Compliance
- Semantic HTML: single h1, proper h2-h6 hierarchy, `lang` per cell `data-language="en"/"ar"`, `dir rtl/ltr`, `<bdi dir>` isolation, no unsafe bidi controls (U+061C, U+200E/F, U+202A-E, U+2066-9/A-F stripped and diagnosed).
- Alt required for images: `validateAndNormalizeLogoImage` magic-byte, dimension, decode check; `img:not([alt])` outline red 2pt for QA.
- Table headers: `th[scope="col"|"row"]` font semibold.
- `sr-only` class for screen reader only.
- Focus visible: `outline: 2pt solid primary`.
- Contrast AA 4.5 minimum via `contrastRatio()` check, `bestForeground()` for brand colors, `resolveProposalPalette()` ensures AA for every fg/bg pairing.
- PDF tagging: `tagged: true` in Playwright `page.pdf()`, `outline: false` (structure via headings), `generateTaggedPdf: true`.
- Language: PDF metadata language field set (en/ar/bilingual), producer note includes print profile.
- Quality gate `inspectBilingualHtml`: checks layout markers pending/ready, both languages cells present, paired cells count equals pairCount, exactly one h1, no remote fonts, no unsafe bidi.

### Print-Specific: Bleed Zones, Margin Safety, CMYK

**Bleed**:
- Size 3mm per ISO 216 offset standard, marks crop cross enabled.
- CSS: `@page { bleed: 3mm; marks: crop cross; }`, `@page :bleed { margin:0 }`, `.full-bleed { margin: -3mm; padding: 3mm; width: calc(100% + 6mm) }`.
- Screen preview: `.bleed-preview { outline dashed + bleed offset }`.

**Margin Safety**:
- Safety zone 5mm inside trim: critical content (header/footer/h1-3) margin-inline `max(0mm, calc(5mm - 2mm))`.
- Body pseudo `body::before` fixed inset 5mm dashed rgba(0,0,0,0.08) visual guide in proof (print preview).
- `.safety-preview { outline dashed rgba(220,38,38,0.35) offset -5mm }`.
- Content width = paper width - left/right margins; ensures safe area respected.

**CMYK Adherence**:
- Chromium outputs sRGB IEC61966-2.1 (only color space Playwright supports). True CMYK requires post-process.
- We enforce CMYK-safe palette: rich black `#121212` (60,40,40,100) not pure #000; inkPrimary `#173f5f` (~90,60,30,20); paper white; gray ramp K-only; accent gold low TAC; error red safe `#b91c1c`; success green safe `#15803d`. TAC≤240% via palette design (no >240% ink coverage).
- Metadata: `PRINT_READY.color.iccProfile = "ISOcoated_v2_300_eci.icc or Coated_FOGRA39"`, `profileNote` explains conversion.
- Conversion recipe documented in `print-ready.ts` and CSS comment:
  ```
  gs -dPDFX -dBATCH -dNOPAUSE -dNOOUTERSAVE -sProcessColorModel=DeviceCMYK
     -sDEVICE=pdfwrite -sColorConversionStrategy=CMYK
     -sColorConversionStrategyForImages=CMYK
     -sOutputICCProfile=ISOcoated_v2_300_eci.icc
     -sOutputFile=output-cmyk.pdf input.pdf
  ```
- PDF generation embeds fonts (WOFF2 → data URL), vector text true, target raster 300 DPI, image resolution check ≥300 DPI effective (`effectiveDpi = width*96/renderedWidth`), aggregate image pixel limit 30M, total pixels tracked, 300 DPI requirement enforced with error `IMAGE_RESOLUTION_INSUFFICIENT`.
- Header/Footer templates include print metadata (bleed, safety, sRGB+embedded OFL, TAC) for physical proofing.

---

## 5. Modifiability Guide

| What to change | Where |
|---|---|
| Agent order / list | `src/lib/constants.ts` `AGENTS` + `AGENT_REGISTRY.AGENT_EXECUTION_ORDER` |
| Thresholds (RAG topK, scores, QLR formula, BoQ lines, token limits) | `src/lib/agents/agent-config.ts` |
| Safety rules | `src/lib/agents/prompts.ts` `NO_PRICING_RULE`, `REGULATORY_PRECISION_RULE`, `LEGAL_DISCLAIMER`; `src/lib/procurement-rules.ts` |
| Prompts | `src/lib/agents/prompts.ts` `SYSTEM_*` + `src/lib/agents/law-contract.ts` `SYSTEM_LAW_CONTRACT` |
| Compliance controls | `src/lib/constants.ts` `COMPLIANCE_FRAMEWORKS` + `src/lib/procurement-rules.ts` `NCA_FRAMEWORKS`, `PDPL_RULES`, `NORA_PRINCIPLES` |
| Ingestion regex | `src/lib/agents/ingestion.ts` `firstLabeledValue`, `parse*` functions |
| Typography / print | `src/lib/pdf/print-ready.ts` `PRINT_READY`, `src/lib/bilingual-typography.ts` `BILINGUAL_FONT_PAIRS`, `src/lib/document-layout.ts` |
| PDF options | `src/lib/pdf/html-to-pdf.ts` `htmlToPdfOptionsSchema`, `src/lib/bilingual-pdf.ts` `generateBilingualPdf` |
| Layout sync | `src/lib/layout-sync.ts` `synchronizeLayout` |
| Validation gates | `src/lib/validation-gate.ts`, `src/lib/agents/law-contract.ts` `validateContractDraft` |

All changes should add tests in `src/lib/__tests__/`.

---

## 6. Audit Checklist (External)

- [ ] Every Compliance row has `sourceCategory` set and never COMPLIANT without evidence.
- [ ] SLA preservation: originalWording kept, statutory candidate separate.
- [ ] Local content % only when tender-stated (EXPLICIT_TENDER).
- [ ] No NORA ID invented.
- [ ] QLR formula transparent, PASS/FAIL only when tender threshold explicit.
- [ ] BoQ unitPrice/total always null, blank guarantee in validation.
- [ ] Proposal 18 sections + LEGAL_DISCLAIMER + human author line present.
- [ ] Contract 14 articles bilingual `:::en :::ar` + RESEARCH SUMMARY + Sources + disclaimer + no 100% certainty + no pricing.
- [ ] LLM enrichments have fallback + provider audit.
- [ ] AgentRun.agentStates JSON includes startedAt/completedAt per agent + findings + output.
- [ ] ProposalVersion history tracks regenerate version/fork with optimistic locking.
- [ ] Validation gates block export-ready when critical.
- [ ] Audit logs via `audit()` for proposal and contract.
- [ ] PDF: embedded OFL fonts, sRGB IEC61966-2.1, bleed 3mm, safety 5mm, crop marks, TAC≤240%, tagged PDF, semantic headings, lang/dir, alt required, orphans/widows 3.
- [ ] CMYK conversion recipe documented and color profile note in footer.

---

## 7. References

- `src/lib/agents/orchestrator.ts` – orchestration with decision logger + metrics
- `src/lib/agents/agent-registry.ts` – transparent spec
- `src/lib/agents/agent-config.ts` – centralized config + safety invariants
- `src/lib/agents/decision-logger.ts` – auditable trace
- `src/lib/agents/agent-metrics.ts` – timing/quality/reliability
- `src/lib/agents/*.ts` – individual agents
- `src/lib/agents/prompts.ts` – system prompts + hard rules
- `src/lib/pdf/print-ready.ts` – premium print standards
- `src/lib/bilingual-pdf.ts` – bilingual PDF adapter + premium CSS injection
- `src/lib/pdf/html-to-pdf.ts` – Chromium PDF with tagged, bleed, premium header/footer
- `src/lib/document-layout.ts` – premium print CSS generation
- `src/lib/bilingual-typography.ts` – safe text runs, bidi sanitization, font pairs
- `src/lib/layout-sync.ts` – pure layout engine for pagination and keep-with-next

---

*Generated by iterative improvement loop. No pricing hallucination, no invented legal facts. Human author is final authority.*
