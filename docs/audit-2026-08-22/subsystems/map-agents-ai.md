# ArabClue — Agents / AI Subsystem Audit

**Repo:** `/Users/abdullahmirxa/Documents/GitHub/arabclue-platform`
**Scope:** `src/app/api/agents/**`, `src/app/api/ai/**`, `src/app/api/platform-agent/**`, `src/lib/agents/**`, `src/lib/ai/**`, `src/lib/llm/**`, top-level `src/lib/*{agent,ai,llm,provider,prompt}*.ts`, `docs/AGENT_DECISION_LOGIC.md`
**Stack:** Next.js 16 App Router, React 19, TS, Prisma 6 + Postgres, Vercel AI SDK (`ai` v7), Zod v4, bun
**Method:** full reads of every in-scope file; `rg`/glob for importers, `fetch("/api/...")` call sites, and cross-references. No files modified outside `/tmp/acp-audit/`. No builds, no DB writes, no LLM calls.

---

## 0. Scope inventory

| Group | Files | Total LOC (approx) |
|---|---|---|
| `src/app/api/agents/**` | 4 | 557 |
| `src/app/api/ai/**` | 4 | 276 |
| `src/app/api/platform-agent/**` | 12 | 1,138 |
| `src/lib/agents/**` (root) | 17 | 4,610 |
| `src/lib/agents/platform/**` | 19 | 4,022 |
| `src/lib/ai/**` | 4 | 2,015 |
| `src/lib/llm/**` | 4 | 1,215 |
| top-level `src/lib` matches | 4 | 384 |
| docs | 1 | 107 |

---

# 1. File-by-file map

## 1.1 `src/app/api/agents/**` — run lifecycle HTTP surface

### `src/app/api/agents/run/route.ts` — 271 LOC
- **Purpose:** Start a multi-agent pipeline for a project. Idempotent per project.
- **Exports:** `POST`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`.
- **Key imports:** `getServerSession`, `getTenantContext`, `assertWithinQuota`, `runPreflight` (`@/lib/agents/run-preflight`), `scheduleAgentPipeline`, `db`.
- **Consumers:** `src/components/dashboard/agents-panel.tsx`, `projects-panel.tsx` (`fetch("/api/agents/run")`); indirectly via `tools.ts:startAgentPipeline`.
- **Contract:** in `{ projectId: string, regenerateMode?: "create"|"revise" }` → out `{ runId, status, alreadyRunning? }` / `{ error, code }`.
- **Handled:** unauthenticated (401), no tenant (403), quota (`assertWithinQuota(userId,"proposal")` → 402), project not in workspace (404), zero-document preflight (422), concurrent run for same project returns existing `runId`, stale `RUNNING`/`QUEUED` rows older than the stale threshold are marked `FAILED` before a new run is created.
- **Not handled:** no per-workspace concurrency cap (only per-project); no rate limit; the stale sweep is best-effort and racy under concurrent requests; `err.message` from downstream is returned verbatim (see Defect 14).

### `src/app/api/agents/status/route.ts` — 150 LOC
- **Purpose:** Poll one run's status; opportunistically resume a stale run.
- **Exports:** `GET`, `runtime`, `dynamic`.
- **Key imports:** `getTenantContext`, `serializeAgentRun` (`@/lib/agent-runs`), `scheduleAgentPipeline`, module-level `resumeLocks: Set<string>`.
- **Consumers:** `agents-panel.tsx` polling loop; `mission-control` panels.
- **Contract:** in `?runId=` → out serialized `AgentRunDto` (`{ id, status, overallProgress, agents[], errorMessage, ... }`).
- **Handled:** 401/403/404; workspace scoping on the `agentRun` lookup; stale-run detection by `updatedAt` age.
- **Not handled:** `resumeLocks` is per-process in-memory — useless across serverless instances (Defect 11); resume resets `overallProgress` to 0 without resetting `agentStates`, so the UI briefly shows completed agents at 0% overall.

### `src/app/api/agents/cancel/route.ts` — 99 LOC
- **Purpose:** Cancel a `QUEUED`/`RUNNING` run.
- **Exports:** `POST`, `runtime`, `dynamic`.
- **Contract:** in `{ runId }` → out `{ ok: true, status: "CANCELLED" }`.
- **Handled:** writer-role check, workspace scoping, already-terminal runs return a no-op.
- **Not handled:** **flips a DB column only** — no `AbortController`, so an in-flight provider call keeps running and keeps billing (Defect 5).

### `src/app/api/agents/runs/route.ts` — 37 LOC
- **Purpose:** List latest workspace runs for the dashboard.
- **Contract:** `GET` → `{ runs: AgentRunDto[] }`, `take: 20`, ordered `createdAt desc`.
- **Handled:** workspace scoping. **Not handled:** no pagination cursor.

### `src/lib/agents/schedule-pipeline.ts` — 40 LOC
- **Purpose:** Run `runAgentPipeline` after the response flushes.
- **Exports:** `scheduleAgentPipeline(opts)`.
- **Key detail:** uses `after()` from `next/server` when available, else a fire-and-forget `void promise.catch(...)`. This is the **only** correct scheduling path; three other call sites bypass it (Defect 6).

### `src/lib/agents/run-preflight.ts` — 25 LOC
- **Purpose:** Pure guard — a run needs ≥1 uploaded document.
- **Exports:** `runPreflight({ documentCount })` → `{ ok } | { ok:false, code:"NO_DOCUMENTS", ... }`. Fully unit-testable, no I/O. Clean.

### `src/lib/agent-runs.ts` — 64 LOC
- **Purpose:** DB row → `AgentRunDto`; derive `currentAgent`.
- **Exports:** `serializeAgentRun`, `AgentRunDto`.
- **Edge:** `JSON.parse(agentStates)` is wrapped in try/catch returning `[]`, so a corrupt column degrades instead of 500-ing. Good.

---

## 1.2 `src/lib/agents/**` — the deterministic pipeline

### `src/lib/agents/orchestrator.ts` — 1,474 LOC ⚠️ *the core*
- **Purpose:** Execute all six agents in sequence, persisting state after every transition.
- **Exports:** `runAgentPipeline(opts)`, `ensurePipelineStarted(runId)` *(dead — zero consumers)*, `PipelineCancelledError`, `OrchestratorResult`.
- **Key imports:** `db`, `extractText`/`parseTender` (`./ingestion`), `evaluateCompliance`, `buildTechnicalPlan`, `buildFinancialModel`, `computeCoverage`, `draftProposal`, `draftLawContract`, `enrich*WithAi`, `embedText`, `AgentMetricsTracker`, `createDecisionLogger`.
- **Consumers:** `schedule-pipeline.ts`, `platform/tools.ts:183`, `platform/autopilot.ts:285`, `missions/[id]/autopilot/route.ts:209`.
- **Control flow:** `persist("RUNNING")` → load project (l.169) + docs (l.174) → INGESTION (parallel extraction, `maxParallelExtractions=3`) → COMPLIANCE (`evaluateCompliance` + optional AI row updates + per-row upsert loop l.410) → TECHNICAL (RAG over past projects via `embedText`) → FINANCIAL → coverage → DRAFTING (`draftProposal`, writes `GeneratedProposal`, increments `tokensUsed`) → LAW_CONTRACT → `persist("COMPLETED")`.
- **Handled:** cancellation checkpoints between agents; `PipelineCancelledError` is distinguished from a real failure in the catch; per-agent metrics; structured decision logs; deterministic fallback at every AI step.
- **Not handled:** no `workspaceId` filter on the project/document reads (l.169/174) — the caller is trusted (Defect 1); AI-supplied `rowUpdates` are cast, not validated (Defect 3); the compliance upsert is an N+1 loop outside a transaction (Defect 16); embeddings are computed serially per past project (l.557).

### `src/lib/agents/ingestion.ts` — 528 LOC
- **Purpose:** Text extraction (PDF via `pdf-parse`, DOCX via `mammoth`, XLSX via `xlsx`, ZIP walk, images via `./ocr-image`) plus `parseTender` entity extraction and `sanitizeText`.
- **Exports:** `extractText`, `parseTender`, `sanitizeText`, `IngestionEntities` helpers.
- **Handled:** unknown MIME → empty string; ZIP recursion depth limits; OCR size cap.
- **Not handled:** no total extracted-text byte cap before it is concatenated into a prompt corpus; a zip-bomb-ish set of large docs inflates prompt size and cost.

### `src/lib/agents/compliance.ts` — 331 LOC
- **Purpose:** `evaluateCompliance` — deterministic, evidence-based matrix over `COMPLIANCE_FRAMEWORKS` (PROCUREMENT_LAW, PDPL, NORA, SLA penalties, NCA). Keyword-hit scoring; never blanket-`COMPLIANT`; every row carries `sourceCategory` + `legalReviewStatus`; pushes `LEGAL_DISCLAIMER` as finding #1. Pure function, no I/O. Well-built.

### `src/lib/agents/technical.ts` / `financial.ts` / `coverage.ts` — 388 / 402 / 196 LOC
- Deterministic planners: WBS/staffing/risk matrix; BoQ + Saudization/local-content modelling with **no unit pricing** (hard rule); requirement-coverage matrix feeding the drafting validation gate. All pure.

### `src/lib/agents/drafting.ts` — 446 LOC
- **Purpose:** `draftProposal(...)` — assembles the mega-prompt from all upstream outputs, calls `generateCompletion`, falls back to `buildDeterministicProposal` when the model errors or returns empty.
- **Returns:** `{ contentMd, provider, model, tokensUsed, fallback, locale, validation, artifacts }`.
- **Handled:** empty-output fallback; validation gate blocks export on errors. **Not handled:** no output length cap before persisting `contentMd`.

### `src/lib/agents/law-contract.ts` — 401 LOC
- Bilingual EN|AR contract drafting with registry-backed "certainty" tiers and a mandatory not-legal-advice disclaimer; deterministic fallback with `tokensUsed: 0`. Its `tokensUsed` is logged but **never added to the subscription counter** (Defect 18).

### `src/lib/agents/enrich.ts` — 73 LOC
- **Purpose:** `enrichIngestionWithAi`, `enrichComplianceWithAi`, `enrichTechnicalWithAi`, `enrichFinancialWithAi` — thin `generateCompletion` + `JSON.parse` wrappers returning `{ data: Record<string,unknown>|null, provider, tokensUsed, fallback }`.
- **Not handled:** the parsed object is returned as an untyped bag with **no Zod schema**; the orchestrator then casts it (Defect 3).

### `src/lib/agents/prompts.ts` — 184 LOC
- System/user prompt builders. Contains `NO_PRICING_RULE`, `REGULATORY_PRECISION_RULE`, `NO_INVENTED_IDENTIFIERS_RULE`. Untrusted tender text is interpolated directly into the user turn with **no delimiter/escaping convention** (Defect 2).

### `src/lib/agents/agent-config.ts` — 148 LOC
- Central thresholds: `PERFORMANCE.maxParallelExtractions`, stale-run window, coverage thresholds, autopilot confidence floors, `SAFETY` invariants that assert stricter values in production. Genuinely good design.

### `src/lib/agents/agent-registry.ts` — 638 LOC
- Machine-readable documentation of every agent's rules, inputs, outputs, failure modes, and audit evidence. Consumed by the admin transparency panel. No runtime behaviour.

### `src/lib/agents/decision-logger.ts` — 171 LOC
- `createDecisionLogger`, `decision()`, `truncateForLog`, timers. Writes `AgentDecisionLog` rows. `truncateForLog` caps field length — the main defence against logging whole documents.

### `src/lib/agents/agent-metrics.ts` — 108 LOC
- Per-agent duration/success/quality tracking, flushed to `AgentQualityMetric`.

### `src/lib/agents/ocr-image.ts` — 66 LOC
- Tesseract eng+ara with optional `sharp` preprocessing; 25 MB cap; worker always terminated in `finally`. Clean.

---

## 1.3 `src/lib/agents/platform/**` — the copilot

### `src/lib/agents/platform/tools.ts` — 1,652 LOC ⚠️ *largest attack surface*
- **Purpose:** the entire tool catalogue. `buildPlatformTools(ctx: PlatformAgentContext)` returns ~40 tools.
- **Privilege tiers:** read-only (`explainFeature`, `navigate`, `listProjects`, `getProjectDetail`, `missionPulse`, …); writer-gated via `denyWrite(ctx)` (`createProject`, `uploadIntent`, `startAgentPipeline`, `submitForReview`, `decideReview`, `routeAttachment`, `undoLastRouting`); admin-gated via `denyAdmin(ctx)` (billing/plan/user tools).
- **Arg validation:** each tool declares a Zod `inputSchema`. **This only binds when the AI SDK invokes the tool** — the SDK validates before `execute`. The realtime path calls `execute` directly and therefore skips it entirely (Defect 4).
- **Notable:** `startAgentPipeline` at l.183 calls `void runAgentPipeline(...)` directly instead of `scheduleAgentPipeline` (Defect 6). `undoLastRouting` updates `copilotAttachment` by mission-derived id without a `workspaceId` predicate (Defect 8).

### `src/lib/agents/platform/main-agent.ts` — 82 LOC
- Builds the `ToolLoopAgent`: resolved model, `buildPlatformTools(ctx)`, `buildPlatformAgentInstructions(ctx)`, `stopWhen: stepCountIs(28)`, `temperature: 0.3`. No token budget, no cost ceiling (Defect 12).

### `src/lib/agents/platform/model.ts` — 102 LOC
- `resolvePlatformAgentModel()`: prefers Vercel AI Gateway (`"provider/model"` string) then the active tenant `AIProviderConfig` + decrypted key. Never hardcodes a model id. Throws with the `apiKeyEnvKey` **name** in the message — which then reaches the client (Defect 14).

### `src/lib/agents/platform/instructions.ts` — 121 LOC
- Identity, delegation hierarchy, product map, mission-control rules, and hard constitutional rules (no pricing, no invented identifiers, no legal certainty). Untrusted mission attachment text is *not* in the system prompt — good — but reaches the model as tool output (Defect 2).

### `src/lib/agents/platform/context.ts` — 46 LOC
`PlatformAgentContext` (`userId`, `workspaceId`, `role`, `locale`, `missionId`, `activeProjectId`, …) and `DASHBOARD_VIEWS`.

### `src/lib/agents/platform/mission.ts` — 124 LOC
- `getOrCreateMission(userId, workspaceId)` (workspace-scoped), `touchMission`, `appendMissionMessage` *(dead — zero consumers)*, `recordMissionAction` (stamps `workspaceId`), `completeMissionAction` (by action id only), `loadMissionBundle(missionId, workspaceId)` (correctly scoped).

### `src/lib/agents/platform/mission-transcript.ts` — 100 LOC
- `syncMissionTranscript({ missionId, messages })` — **deletes all rows then re-inserts** from the caller-supplied array; `hydrateUiMessages` rebuilds `UIMessage[]`. The delete-all semantics cause the extension data loss (Defect 7) and make the client the source of truth for an audit surface.

### `src/lib/agents/platform/connectors.ts` — 169 LOC
- `MISSION_CONNECTORS`, `assertSafeExternalUrl(raw)` (l.115), `fetchUrlAsAttachment(rawUrl)` (l.144, `redirect: "follow"`). Blocklist is string/hostname based and misses bracketed IPv6, decimal/octal IPv4, and DNS-rebinding; redirects are followed (Defect 9).

### `src/lib/agents/platform/classify-attachment.ts` — 201 LOC
- Heuristic keyword/length classifier → `{ category, confidence, shouldCreateProject, runPipeline }`. Operates on untrusted text; drives autopilot.

### `src/lib/agents/platform/autopilot.ts` — 303 LOC
- `buildAutopilotProjectCreateData` (pure, unit-tested), `maybeAutopilotAfterIngest`. Gates on `canWrite` + confidence ≥ `AGENT_CONFIG` floor. Calls `void runAgentPipeline(...)` at l.285 (Defect 6). Project title/summary/sector come from parsed untrusted content (Defect 2).

### `src/lib/agents/platform/stage-attachment.ts` — 127 LOC
- Quota check → `classifyAttachment` → `ingestDocumentForWorkspace` → `recordMissionAction` → `maybeAutopilotAfterIngest`.

### `src/lib/agents/platform/ingest-document.ts` — 167 LOC
- Bytes → storage → `extractText` → `parseTender` → chunk + `embedText` → `KnowledgeChunk` rows → `subscription.storageUsedBytes`/`documentsUsed` increments.

### `src/lib/agents/platform/realtime.ts` — 180 LOC
- `getVoiceLiveConfig()` (provider/model/voice resolution), `mintVoiceLiveSession()`, `executeVoiceLiveTool(toolName, args, opts)` — **l.203-207 `const tool = tools[toolName]; return tool.execute(args, {...})`** (Defect 4).

### `src/lib/agents/platform/realtime-session-config.ts` (27) / `voice-options.ts` (131) / `voice-types.ts` (15)
Client session defaults, the voice/style catalogue, and shared types. No privileged behaviour.

### `src/lib/agents/platform/mission-pulse.ts` (178) / `mission-tool-parts.ts` (109) / `delegation.ts` (181) / `regulatory-synthesis.ts` (129)
Live mission analytics (pure `computeMissionPulse`, unit-tested), AI-SDK tool-part extraction for the "theater" UI, role-parity capability map, and the regulatory matrix↔DB mapper.

### `src/lib/agents/platform/realtime-audio-capture.ts` — 204 LOC
Browser-only `AudioWorklet` mic capture + `RealtimePcmBatcher`. Correct buffer copying, full teardown in `stop()`. Clean.

---

## 1.4 `src/app/api/platform-agent/**`

| Route | LOC | Contract | Notes |
|---|---|---|---|
| `chat/route.ts` | 119 | `POST {messages}` → UI message stream | `maxDuration=300`; `abortSignal: req.signal`; pricing guardrail on the last user turn; pre-persists transcript from client array |
| `missions/route.ts` | 53 | `GET`/`POST` → mission bundle | workspace-scoped ✅ |
| `missions/[id]/route.ts` | 25 | `GET` → bundle | `loadMissionBundle(id, workspaceId)` ✅ |
| `missions/[id]/pulse/route.ts` | 24 | `GET` → pulse | workspace-scoped ✅ |
| `missions/[id]/attachments/route.ts` | 131 | multipart / URL / text | `getOrCreateMission` + `mission.id !== missionId → 404` ✅ |
| `missions/[id]/autopilot/route.ts` | 228 | `POST {etimadRef?, activeProjectId?}` | **`activeProjectId` never re-validated** (Defect 1); `void runAgentPipeline` l.209 |
| `realtime/setup/route.ts` | 61 | `GET ?voice&style` → `{provider, modelId, token, ...}` | mints ephemeral provider token |
| `realtime/tools/route.ts` | 72 | `POST {toolName, args, missionId?, activeProjectId?}` | **unvalidated `args` → `tool.execute`** (Defect 4) |
| `extension/route.ts` | 60 | install metadata | benign |
| `extension/config/route.ts` | 104 | remote config + auth probe | **public** (allow-listed in `proxy.ts:48`); returns `authenticated:false` when unsigned, but leaks workspace-derived match criteria once signed |
| `extension/ingest/route.ts` | 220 | `POST {kind, text/html/screenshot, url, ...}` | untrusted page content → classify → autopilot (Defect 2) |
| `extension/copilot/route.ts` | 121 | `POST {text, missionId?, activeProjectId?}` | **transcript wipe** (Defect 7); unvalidated `missionId` |
| `extension/download/route.ts` | 52 | authed ZIP download | returns `error.message` detail on failure (path disclosure, minor) |

---

## 1.5 `src/app/api/ai/**` — one-shot AI utilities

All four share the same shape: `getServerSession` → Zod-validated body → library call → JSON. **None calls `assertWithinQuota`, none is rate limited** (Defect 13).

| Route | LOC | Library |
|---|---|---|
| `compliance-analyze/route.ts` | 63 | `generateComplianceScorecard` |
| `vendor-match/route.ts` | 81 | `matchVendorsWithPrediction` |
| `proposal-optimize/route.ts` | 61 | `optimizeProposal` |
| `contract-draft/route.ts` | 71 | `draftContractWithAi` |

## 1.6 `src/lib/ai/**`

- **`compliance-analyzer.ts` — 597 LOC.** `scanCompliance`, `analyzeComplianceGaps`, `detectRegulatoryUpdates`, `generateComplianceScorecard`. The scorecard calls both sub-functions and each independently recomputes `deterministicFindings` → `evaluateCompliance` runs **three times** per request (Defect 17).
- **`contract-drafting-assistant.ts` — 679 LOC.** Bilingual clause generation, variable inference, risk flagging, EN/AR consistency validation, deterministic fallback library.
- **`proposal-optimizer.ts` — 421 LOC.** Section scoring, win-theme suggestions, readability; deterministic fallback.
- **`vendor-matching-engine.ts` — 318 LOC.** Embedding + rule-based vendor scoring with win-probability prediction.

## 1.7 `src/lib/llm/**`

### `src/lib/llm/index.ts` — 519 LOC ⚠️
- **Exports:** `getActiveProvider` *(dead)*, `getProviderForEngine`, `generateCompletion`, `embedText`, `localEmbedText`, `estimateTokens`.
- **`generateCompletion` flow:** deterministic env override → provider resolution → input guardrails (`detectPricingRequest` → refusal, PII scrub) → provider dispatch (`callOpenAiCompatible` / `callAnthropic` / Mistral / ZAI) with a raw `setTimeout` + `AbortController` (`provider.timeoutMs`, default 60 s) → output guardrails (`detectPricingSuggestion`, toxicity, hallucination) → on any throw, `buildDeterministicFallback` with `fallback:true`.
- **Provider resolution (l.~40-60):** engine-specific active provider → `DEFAULT` engine → **`actives[0]`**, which can return a provider that serves neither the requested engine nor DEFAULT (Defect 10).
- **Embeddings:** remote `/embeddings` when the provider supports it, else `localEmbedText` (deterministic hashed bag-of-words). Graceful.
- **No-key path:** every entry point degrades to deterministic output; the product remains usable. This is genuinely well done.

### `src/lib/llm/model-catalog.ts` — 398 LOC
Provider connection metadata, `AgentEngine` union (`DEFAULT | DRAFTING | COMPLIANCE | TECHNICAL | FINANCIAL | EMBEDDING | VOICE`), capability inference from model ids.

### `src/lib/llm/fetch-models.ts` — 246 LOC
Live model-list fetch per provider; `preferVoiceLiveModels` filters to `*realtime*`/`*live*` ids for the VOICE engine. Requires a key; returns `[]` on failure.

### `src/lib/llm/provider-engines.ts` — 52 LOC
`deactivateConflictingProviders` — enforces one active provider per engine.

## 1.8 Top-level `src/lib` matches

- **`src/lib/provider-timeout.ts` — 150 LOC.** `withProviderDeadline` / `callProviderWithDeadline`: hard deadline + `AbortSignal` + typed timeout error. **Used by billing/email/analytics providers only — never by any LLM call** (Defect 15).
- **`src/lib/env-settings.ts` — 42 LOC.** `getEnvSetting(key)`: `process.env` first, then `EnvSetting.valueEncrypted` via `decryptValue`. Keys **are** encrypted at rest; only the *env-key name* (`AIProviderConfig.apiKeyEnvKey`) is plaintext.
- **`src/lib/api-failure.ts` (78) / `api-failure-message.ts` (46).** Bilingual `ApiFailure` contract + code→message mapper. Available but **not used** by the in-scope AI/agent catch blocks, which return raw `err.message` instead.
- **`src/lib/guardrails.ts` — 206 LOC.** `detectPricingRequest`, `detectPricingSuggestion`, `scrubPii`, toxicity + hallucination heuristics. Regex-based; Arabic coverage is thinner than English.

## 1.9 `docs/AGENT_DECISION_LOGIC.md` — 107 LOC
Accurately describes the deterministic-first design, per-agent decision transparency, and audit evidence. **Divergences from the code:** it claims cancellation stops work (it only polls a DB flag), and it does not mention that LLM `rowUpdates` can override deterministic compliance statuses without validation.

---

# 2. Architecture narrative

## 2.1 Agent run lifecycle

`POST /api/agents/run` authenticates, resolves the tenant, checks the proposal quota, verifies the project belongs to the workspace, runs `runPreflight` (≥1 document), sweeps stale rows to `FAILED`, and — if no live run exists for that project — creates an `AgentRun` row in `QUEUED`. It then calls `scheduleAgentPipeline`, which wraps `runAgentPipeline` in `after()` so the work continues on the same invocation after the response flushes, and returns `{ runId }` immediately. `maxDuration = 300` bounds the whole invocation.

The client polls `GET /api/agents/status?runId=`. That handler also acts as a watchdog: if a run is `RUNNING`/`QUEUED` but `updatedAt` is older than the stale window, it re-schedules the pipeline, guarded by an in-process `Set`. `GET /api/agents/runs` backs the workspace-wide history list. There is **no SSE or WebSocket for agent runs** — status is pure polling. (SSE exists only for the copilot chat.)

`POST /api/agents/cancel` sets `status = "CANCELLED"`. The orchestrator notices at its next checkpoint.

## 2.2 Orchestrator control flow

`runAgentPipeline` keeps an in-memory `states: AgentState[]` array. Two helpers mediate every transition: `mark(agentId, patch)` mutates one agent's state, and `persist(status)` recomputes `overallProgress` as the mean agent progress and writes `{status, overallProgress, agentStates: JSON, errorMessage}`. Both call `assertNotCancelled()` first, which re-reads `AgentRun.status` and throws `PipelineCancelledError` when cancelled. So cancellation granularity equals the gap between two `mark`/`persist` calls — coarse, and a single long model call is uninterruptible.

The six stages run strictly in sequence: INGESTION (document extraction, bounded to 3 concurrent extractions, then `parseTender`) → COMPLIANCE (`evaluateCompliance` deterministically, then optional LLM `rowUpdates`, then a per-control upsert loop) → TECHNICAL (RAG: embed each past project, cosine-rank, build WBS) → FINANCIAL (BoQ, Saudization, local content — never unit prices) → coverage computation → DRAFTING (`draftProposal` → `GeneratedProposal` row → `tokensUsed` increment) → LAW_CONTRACT (bilingual draft). Terminal states are `COMPLETED` or `FAILED`; `PipelineCancelledError` is caught separately and leaves the row `CANCELLED`.

There are **no retries** anywhere. Each agent's resilience comes from its deterministic fallback rather than from re-attempting the model. Concurrency is capped at one run per project by the run route's idempotency check; there is no workspace-level or global cap.

## 2.3 Platform agent: tools and execution

`POST /api/platform-agent/chat` resolves the session and tenant, applies the pricing guardrail to the newest user message, gets or creates the copilot mission, builds a `ToolLoopAgent` (`main-agent.ts`) with `resolvePlatformAgentModel()`, `buildPlatformTools(ctx)`, `buildPlatformAgentInstructions(ctx)`, `stopWhen: stepCountIs(28)`, and streams a UI message response with `abortSignal: req.signal`.

`ctx` is the security boundary: `workspaceId` and `role` come from the server-side session, not from the request. Tools consult `denyWrite(ctx)` / `denyAdmin(ctx)` and scope their Prisma queries by `ctx.workspaceId`. Argument validation comes from each tool's Zod `inputSchema`, which the AI SDK enforces before calling `execute`.

That guarantee holds **only on the SDK path**. The realtime voice endpoint looks the tool up by name and calls `execute(args, ...)` itself, so `inputSchema` never runs.

## 2.4 Provider selection and the deterministic path

`getProviderForEngine(engine)` reads active `AIProviderConfig` rows: exact engine match, then `DEFAULT`, then any active provider. The API key name lives on the row (`apiKeyEnvKey`); the value comes from `getEnvSetting`, which prefers `process.env` and otherwise decrypts `EnvSetting.valueEncrypted`. The platform agent additionally prefers Vercel AI Gateway `"provider/model"` strings when a gateway key is present.

With **no provider configured at all**, everything still works: `generateCompletion` returns `buildDeterministicFallback(...)` with `fallback: true`, and each caller substitutes its rule-based output — deterministic proposal, rule-only compliance matrix, `localEmbedText` embeddings. This is the strongest part of the system.

## 2.5 Autopilot

Ingest → `classifyAttachment` (keyword + length heuristics) → `{category, confidence, shouldCreateProject, runPipeline}` → `maybeAutopilotAfterIngest`. Gates: the caller must pass `canWrite`, and confidence must clear the `AGENT_CONFIG` floor. When both hold, a `TenderProject` is created from `buildAutopilotProjectCreateData` and the pipeline starts. **There is no human approval step** — the only gate is a heuristic score computed over attacker-influenceable text.

## 2.6 Extension bridge

The Chrome extension authenticates with the ordinary NextAuth session cookie; `proxy.ts` requires a session for every `/api/platform-agent/*` path except `extension/config`, which is a deliberate unauthenticated probe. `extension/ingest` accepts page text, HTML, selections, screenshots, or structured tender data and funnels them through `stageAttachment` into the same autopilot path. `extension/copilot` is a non-streaming JSON chat that re-syncs the mission transcript on every call.

## 2.7 Realtime voice

`GET /api/platform-agent/realtime/setup` resolves the VOICE-engine provider, builds instructions and tool *definitions* (names + JSON schemas only), and asks the provider for an ephemeral session token, returning `{provider, modelId, token, voice, instructions, tools}`. The long-lived provider key stays server-side; only the short-lived token reaches the browser. Tool *execution* is proxied back through `POST /api/platform-agent/realtime/tools`, which is where the schema check is lost.

---

# 3. Cross-cutting observations

**Prompt injection.** Untrusted text reaches models on four paths: uploaded documents → `extractText` → `parseTender` → agent prompts; extension page content → `stageAttachment`; mission URL fetches → `fetchUrlAsAttachment`; and user chat. Three of those then drive privileged writes. The sharpest path is compliance: injected tender text can persuade the model to emit `rowUpdates` that flip control statuses to `COMPLIANT`, and the orchestrator writes them to `ComplianceCheck` unvalidated. The second is autopilot: ingested page content can cause project creation and a full pipeline run. Prompts interpolate untrusted text without delimiters or an explicit "treat as data" instruction.

**Tool abuse / confused deputy.** Within the SDK path, tools are well-scoped: `ctx.workspaceId` comes from the session and most queries filter on it. Two holes: the realtime endpoint bypasses Zod entirely, and `undoLastRouting` updates by mission-derived id without a workspace predicate. Separately, the orchestrator itself trusts its `projectId` argument, so any caller that fails to validate a client-supplied project id turns into a cross-tenant read — which `missions/[id]/autopilot` does.

**Secrets.** Provider API key *values* are encrypted at rest (`EnvSetting.valueEncrypted` + `decryptValue`) and are never serialized into a response. No `NEXT_PUBLIC_*` variable carries a provider key. Realtime mints short-lived tokens rather than shipping the real key. The residual leaks are indirect: error messages that embed `apiKeyEnvKey` names and raw provider HTTP bodies flow to the client through several catch blocks.

**Cost / abuse.** `stepCountIs(28)` caps tool-loop depth and `maxTokensPerMonth` exists on every plan — but `assertWithinQuota(userId, "tokens", …)` is called **only from tests**. Token usage is incremented once per pipeline for the proposal draft, omitting the law-contract draft, all four enrichment calls, the platform agent, and every `/api/ai/*` route. There is no rate limiting anywhere in scope and no per-workspace run concurrency cap.

**Timeouts and serverless limits.** `maxDuration = 300` is set on the run and chat routes. `scheduleAgentPipeline` correctly uses `after()`. Three other call sites use bare `void runAgentPipeline(...)`, which on Vercel is terminated when the response completes. Per-provider timeouts use an ad-hoc `setTimeout`, not the purpose-built `withProviderDeadline`.

**Cancellation.** DB-flag only. No `AbortSignal` is threaded from `/api/agents/cancel` into `generateCompletion`, so a cancelled run can keep a 60-second model call alive and still be billed for it.

**Determinism / fallback.** Excellent. Every AI step has a rule-based counterpart, `fallback: true` is propagated and surfaced, and the product is fully usable with zero API keys.

**Error handling.** Weak in scope. Several handlers return `err.message` verbatim, and `callOpenAiCompatible` throws with the first 200 characters of the provider's error body. The bilingual `ApiFailure` contract exists in `src/lib/api-failure.ts` but is unused here.

**Streaming.** The chat route is correct: `createAgentUIStreamResponse` with `abortSignal: req.signal` means a client disconnect aborts the model call. The caveat is that the transcript is pre-persisted from the client-supplied `messages` array via a delete-all-then-insert, so the client — not the server — determines stored history.

---

# 4. Gaps and defects

### 1. Cross-tenant project + document read via unvalidated `activeProjectId`
- **Severity:** Critical — **Category:** security
- **`src/app/api/platform-agent/missions/[id]/autopilot/route.ts:84`** (with `src/lib/agents/orchestrator.ts:169,174`)
```ts
const projectId = body.activeProjectId?.trim() || mission.activeProjectId || (await createFromEtimad(...));
// ...
void runAgentPipeline({ runId, projectId, workspaceId: tenant.workspace.id, userId });
```
```ts
const project = await db.tenderProject.findUnique({ where: { id: opts.projectId } });
const docs = await db.uploadedDocument.findMany({ where: { projectId: opts.projectId } });
```
- **Why:** `body.activeProjectId` is never checked against `tenant.workspace.id`, and the orchestrator's project/document reads carry no workspace predicate. An authenticated user in workspace A who learns (or brute-forces) a project id in workspace B triggers a pipeline that extracts B's document text and writes the resulting proposal, compliance matrix, and contract into A's `AgentRun`. Full document-content exfiltration across tenants.
- **Fix:** validate before scheduling — `const project = await db.tenderProject.findFirst({ where: { id: projectId, workspaceId: tenant.workspace.id } }); if (!project) return 404;` — and independently add `workspaceId: opts.workspaceId` to both orchestrator queries so the boundary is enforced at the sink, not only at the caller.

### 2. Untrusted ingested content drives project creation and pipeline execution with no approval gate
- **Severity:** Critical — **Category:** security
- **`src/app/api/platform-agent/extension/ingest/route.ts:98`** → **`src/lib/agents/platform/autopilot.ts:159,285`**
```ts
const staged = await stageAttachment({ ...body, activeProjectId: body.activeProjectId ?? mission.activeProjectId, ... });
```
```ts
data: buildAutopilotProjectCreateData({ entities, classification, ... })
// ...
void runAgentPipeline({ runId, projectId, workspaceId, userId });
```
- **Why:** arbitrary web-page text is classified by keyword heuristics and, above a confidence floor, creates a `TenderProject` whose title/summary/sector/deadline come straight from attacker-controlled content, then consumes quota and LLM spend running a six-agent pipeline over it. A hostile page can seed a workspace with fabricated tenders and burn budget. Nothing requires a human to confirm.
- **Fix:** never auto-create-and-run from `extension/ingest`. Stage the attachment and emit a pending `CopilotAction` requiring explicit user confirmation; keep automatic execution for content the user uploaded deliberately. Additionally wrap all untrusted text in explicit data delimiters in `src/lib/agents/prompts.ts` with an instruction that its contents are never instructions.

### 3. LLM output overwrites deterministic compliance statuses without schema validation
- **Severity:** High — **Category:** security / correctness
- **`src/lib/agents/orchestrator.ts:380-396`**
```ts
const updates = (complianceAi.data.rowUpdates as Array<{ controlId: string; evidence?: string; status?: string; ... }>) ?? [];
// ...
status: (u.status as typeof r.status) || r.status,
```
- **Why:** `enrich.ts` returns an unvalidated `Record<string, unknown>` from `JSON.parse`. The double cast means any string the model emits becomes a `ComplianceCheck.status`, which is then persisted at l.410-439 and folded into the score at l.405. Injected tender text can flip controls to `COMPLIANT` in a regulatory-compliance product — and `docs/AGENT_DECISION_LOGIC.md` claims statuses are evidence-based.
- **Fix:** parse with Zod: `z.object({ rowUpdates: z.array(z.object({ controlId: z.string(), evidence: z.string().max(2000).optional(), status: z.enum(["COMPLIANT","PARTIAL","NON_COMPLIANT","NOT_APPLICABLE"]).optional(), remediation: z.string().max(2000).nullish() })).max(50), findings: z.array(z.string().max(500)).max(20) })`, drop unknown `controlId`s, and only allow AI to *add evidence*, never to upgrade a status.

### 4. Realtime tool endpoint bypasses all Zod argument validation
- **Severity:** High — **Category:** security
- **`src/lib/agents/platform/realtime.ts:203-207`**, called from `src/app/api/platform-agent/realtime/tools/route.ts:58`
```ts
const tool = tools[toolName];
if (!tool?.execute) throw new Error(`Unknown tool: ${toolName}`);
return tool.execute(args, { toolCallId: `voice-${Date.now()}`, messages: [] });
```
- **Why:** `tool()` from `@ai-sdk/provider-utils` is an identity function — `inputSchema` is only enforced by the SDK's own call path. Invoking `execute` directly hands raw `args` from the request body to every handler. This turns the endpoint into an unvalidated RPC over the full ~40-tool catalogue, including writer and admin tools: unexpected types reach Prisma, and any handler that trusts its declared arg shape can be driven outside it.
- **Fix:** validate before dispatch — `const parsed = await tool.inputSchema.validate?.(args) ?? tool.inputSchema.parse(args)` (or `safeParseAsync` on the Zod schema) and return 400 on failure. Also allow-list which tools voice may call rather than exposing the whole registry.

### 5. Cancel only flips a DB flag; in-flight model calls keep running
- **Severity:** High — **Category:** cost / reliability
- **`src/app/api/agents/cancel/route.ts:70`** with **`src/lib/agents/orchestrator.ts:125-133`**
```ts
const assertNotCancelled = async () => {
  const row = await db.agentRun.findUnique({ where: { id: opts.runId }, select: { status: true } });
  if (row?.status === "CANCELLED") throw new PipelineCancelledError();
};
```
- **Why:** cancellation is observed only between agents. A `generateCompletion` already in flight runs to its full `provider.timeoutMs` (60 s default) with `maxTokens` up to 8192, and the tokens are billed. `generateCompletion` accepts no `AbortSignal` parameter, so there is no way to propagate the cancel.
- **Fix:** add `signal?: AbortSignal` to `generateCompletion` and forward it into every provider `fetch` (composing with the existing timeout controller). In the orchestrator create one `AbortController` per run, abort it from `assertNotCancelled`, and pass its signal into every agent's model call.

### 6. Background pipelines started without `after()` are killed when the response returns
- **Severity:** High — **Category:** reliability
- **`src/lib/agents/platform/tools.ts:183`**, **`src/lib/agents/platform/autopilot.ts:285`**, **`src/app/api/platform-agent/missions/[id]/autopilot/route.ts:209`**
```ts
void runAgentPipeline({ runId, projectId, workspaceId, userId, locale });
```
- **Why:** on Vercel Fluid Compute, work not registered with `after()` (or awaited) has no guarantee of surviving response completion. `schedule-pipeline.ts` exists precisely to handle this and is used only by `/api/agents/run`. These three paths leave runs stranded in `RUNNING` until the status-route watchdog happens to notice — which itself is unreliable (Defect 11).
- **Fix:** replace all three with `scheduleAgentPipeline({...})`.

### 7. Extension copilot destroys the entire mission transcript on every message
- **Severity:** High — **Category:** correctness (data loss)
- **`src/app/api/platform-agent/extension/copilot/route.ts:71`** with **`src/lib/agents/platform/mission-transcript.ts`**
```ts
await syncMissionTranscript({ missionId: mission.id, messages: [userMessage] });
```
- **Why:** `syncMissionTranscript` deletes all `CopilotMessage` rows for the mission and re-inserts the supplied array. Passing a single message wipes the whole Mission Control conversation history — every prior turn from the web copilot is permanently lost the first time the user sends anything from the extension.
- **Fix:** use an append-only write for incremental turns (`appendMissionMessage` already exists at `mission.ts:52` and is currently dead code), and reserve `syncMissionTranscript` for the full-history replace the chat route performs.

### 8. `undoLastRouting` mutates attachments without a workspace predicate
- **Severity:** Medium — **Category:** security
- **`src/lib/agents/platform/tools.ts`** (`undoLastRouting` handler)
```ts
await db.copilotAttachment.update({ where: { id: attachment.id }, data: { projectId: null, ... } });
```
- **Why:** the attachment is located via the mission-derived id chain rather than a `workspaceId` filter, so the query relies entirely on upstream scoping being correct everywhere. `CopilotAttachment` carries `workspaceId`; not using it means any future caller that supplies a foreign `missionId` (the extension routes already accept an unvalidated one) gets a cross-tenant mutation.
- **Fix:** switch to `updateMany({ where: { id: attachment.id, workspaceId: ctx.workspaceId }, ... })` and treat `count === 0` as not-found. Apply the same predicate to `completeMissionAction`.

### 9. SSRF: incomplete blocklist and followed redirects in URL ingestion
- **Severity:** Medium — **Category:** security
- **`src/lib/agents/platform/connectors.ts:115,144-146`**
```ts
export function assertSafeExternalUrl(raw: string): URL { /* hostname string blocklist */ }
// ...
const res = await fetch(url, { redirect: "follow", ... });
```
- **Why:** the blocklist is hostname-string based, so `http://[::1]/x`, decimal/octal IPv4 (`http://2130706433/`), and any hostname that resolves to a private address slip through. `redirect: "follow"` means even a validated public URL can bounce to `169.254.169.254` or an internal service. The response body is stored as a mission attachment, so it is exfiltrated back to the user.
- **Fix:** set `redirect: "manual"` and re-validate each hop; resolve the hostname with `dns.lookup` and reject any result in a private/link-local/loopback/CGNAT range (including IPv6 `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped forms); cap response size and content types.

### 10. Provider fallback can select a provider that serves neither the requested engine nor `DEFAULT`
- **Severity:** Medium — **Category:** correctness / cost
- **`src/lib/llm/index.ts`** (`getProviderForEngine`, final line)
```ts
return actives[0] ?? null;
```
- **Why:** with, say, only an EMBEDDING-only provider configured, a DRAFTING request silently receives it and calls a chat endpoint with an embedding model id. Worse, `getVoiceLiveConfig` uses the same resolver: a plain OpenAI chat provider satisfies the `actives[0]` fallback, so the UI reports live voice as *enabled* and then fails at token-mint time with a provider error.
- **Fix:** drop the `actives[0]` fallback and return `null` when neither an engine-specific nor a `DEFAULT` provider exists, letting callers take their deterministic path. For VOICE specifically, additionally require the model id to match the realtime/live filter already implemented in `preferVoiceLiveModels`.

### 11. Stale-run resume lock is per-process and cannot prevent duplicate pipelines
- **Severity:** Medium — **Category:** reliability
- **`src/app/api/agents/status/route.ts:15,110`**
```ts
const resumeLocks = new Set<string>();
// ...
if (!resumeLocks.has(runId)) { resumeLocks.add(runId); scheduleAgentPipeline({...}); setTimeout(() => resumeLocks.delete(runId), ...); }
```
- **Why:** module state is per-instance. With several serverless instances polling the same run, each takes the lock locally and schedules its own pipeline. Two orchestrators then write the same `AgentRun` and create duplicate `GeneratedProposal` rows and duplicate `tokensUsed` increments.
- **Fix:** make the claim atomic in the database — `updateMany({ where: { id: runId, status: "RUNNING", updatedAt: { lt: staleBefore } }, data: { status: "QUEUED", updatedAt: new Date() } })` and only schedule when `count === 1`.

### 12. No token or spend ceiling on the platform agent tool loop
- **Severity:** Medium — **Category:** cost
- **`src/lib/agents/platform/main-agent.ts`**
```ts
stopWhen: stepCountIs(28),
temperature: 0.3,
```
- **Why:** 28 steps is the only bound. Each step resends the full transcript plus every tool result, so context grows superlinearly and a single conversation can cost orders of magnitude more than a normal turn. Nothing counts the tokens spent, nothing charges them to the subscription, and nothing rate-limits the endpoint.
- **Fix:** add a cumulative token budget via `onStepFinish` (abort when `usage.totalTokens` exceeds a per-request cap), record the usage against the subscription, and rate-limit `/api/platform-agent/chat` per user.

### 13. Token quota is implemented but never enforced; `/api/ai/*` has no quota at all
- **Severity:** Medium — **Category:** cost
- **`src/lib/quotas.ts:71-75`** vs. **`src/app/api/ai/{compliance-analyze,vendor-match,proposal-optimize,contract-draft}/route.ts`**
```ts
if (plan.maxTokensPerMonth > 0) { if (sub.tokensUsed + added > plan.maxTokensPerMonth) throw new QuotaExceededError(...); }
```
- **Why:** `assertWithinQuota(userId, "tokens", …)` appears only in `src/lib/__tests-isolated/quotas.test.ts` — no production call site. The four `/api/ai/*` routes call no quota function of any kind, so an authenticated user on the smallest plan can issue unlimited LLM requests. The billing UI displays a token meter that never gates anything.
- **Fix:** call `assertWithinQuota(userId, "tokens", { tokens: estimateTokens(prompt) })` before every `generateCompletion` entry point and record actual usage after, returning 402 with the existing `QuotaExceededError` mapping.

### 14. Raw provider errors and internal env-key names are returned to clients
- **Severity:** Medium — **Category:** security (information disclosure)
- **`src/app/api/platform-agent/chat/route.ts:114`**, `realtime/setup/route.ts`, `realtime/tools/route.ts`, `agents/run/route.ts`; source at **`src/lib/llm/index.ts`** (`callOpenAiCompatible`) and **`src/lib/agents/platform/model.ts`**
```ts
return NextResponse.json({ error: err instanceof Error ? err.message : "Chat failed" }, { status: 500 });
```
```ts
throw new Error(`${provider.provider} HTTP ${res.status}: ${errText.slice(0, 200)}`);
```
- **Why:** the client receives the provider's raw error body (which can echo request fragments, org ids, and rate-limit internals) and, from `resolvePlatformAgentModel`, the exact `apiKeyEnvKey` name configured for the tenant. That is a free map of the internal secret namespace.
- **Fix:** log the detailed error server-side with the run id and return a stable code through the existing `src/lib/api-failure.ts` contract (`AI_PROVIDER_UNAVAILABLE`, `AI_PROVIDER_NOT_CONFIGURED`) with no provider text.

### 15. `withProviderDeadline` is never applied to LLM calls
- **Severity:** Medium — **Category:** reliability
- **`src/lib/provider-timeout.ts:1`** (unused by LLM) vs. **`src/lib/llm/index.ts`** (ad-hoc timeout)
```ts
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), provider.timeoutMs ?? 60_000);
```
- **Why:** the repo has a tested deadline abstraction with typed timeout errors and consistent cleanup, used by billing/email/analytics — but the highest-latency, highest-cost calls in the product use a hand-rolled version instead. The platform agent's `streamText` path has **no timeout at all**, bounded only by `maxDuration = 300`.
- **Fix:** route all provider calls in `src/lib/llm/index.ts` through `callProviderWithDeadline`, and pass an `AbortSignal.timeout(...)` composed with `req.signal` into the platform agent's stream.

### 16. Compliance upsert is an unbatched N+1 loop outside a transaction
- **Severity:** Medium — **Category:** performance / reliability
- **`src/lib/agents/orchestrator.ts:410-439`**
```ts
for (const row of rows) {
  const existing = await db.complianceCheck.findFirst({ where: { projectId: opts.projectId, controlId: row.controlId } });
  if (existing) { await db.complianceCheck.update({...}); } else { await db.complianceCheck.create({...}); }
}
```
- **Why:** two sequential round trips per control across every framework — dozens to low hundreds of queries on the critical path of a 300-second budget. Because it is not transactional, a mid-loop failure leaves the matrix half-updated with an inconsistent score.
- **Fix:** add a unique index on `(projectId, controlId)` and replace the loop with `db.$transaction(rows.map(r => db.complianceCheck.upsert({ where: { projectId_controlId: {...} }, create: {...}, update: {...} })))`.

### 17. `generateComplianceScorecard` recomputes the deterministic matrix three times
- **Severity:** Low — **Category:** performance
- **`src/lib/ai/compliance-analyzer.ts`** (`scanCompliance`, `analyzeComplianceGaps`, `generateComplianceScorecard`)
```ts
const findings = deterministicFindings(input); // called independently in each function
```
- **Why:** the scorecard calls both sub-functions, and each one independently calls `deterministicFindings`, which calls `evaluateCompliance` over every framework control. Three identical full evaluations per request.
- **Fix:** compute the deterministic result once in `generateComplianceScorecard` and pass it into both sub-functions as an optional parameter.

### 18. Token accounting covers only the proposal draft
- **Severity:** Low — **Category:** cost / correctness
- **`src/lib/agents/orchestrator.ts:1096`**
```ts
tokensUsed: { increment: draft.tokensUsed },
```
- **Why:** the law-contract draft (`lawDraft.tokensUsed`, logged at l.1272), all four `enrich*WithAi` calls, the platform agent, and every `/api/ai/*` route contribute nothing to `Subscription.tokensUsed`. The billing meter under-reports actual consumption by a wide and variable margin.
- **Fix:** accumulate a per-run token total across every `generateCompletion` result and apply one increment at the end of the pipeline; add the same accounting to the chat and `/api/ai/*` paths.

### 19. Dead exported code
- **Severity:** Low — **Category:** maintainability
- **`src/lib/agents/orchestrator.ts:1435`** `ensurePipelineStarted` (~40 LOC, zero consumers), **`src/lib/agents/platform/mission.ts:52`** `appendMissionMessage` (zero consumers), **`src/lib/llm/index.ts:32`** `getActiveProvider` (zero consumers).
- **Why:** `ensurePipelineStarted` looks like the intended fix for Defect 11 and `appendMissionMessage` like the intended fix for Defect 7 — dead code that duplicates the behaviour of live code invites divergence, and here it hides that the safe path was written but never wired up.
- **Fix:** wire `appendMissionMessage` into the extension copilot route (Defect 7); either adopt `ensurePipelineStarted` in the status route or delete it; delete `getActiveProvider`.

### 20. Deterministic fallback text leaks internal guardrail configuration
- **Severity:** Low — **Category:** security (information disclosure)
- **`src/lib/llm/index.ts`** (`buildDeterministicFallback`)
```ts
`[Generated under guardrails: toxicity=${...}, pii=${...}, hallucination_guard=${...}, confidence_threshold=${...}]`
```
- **Why:** the fallback string embeds the provider name, model id, and guardrail thresholds. Most callers replace it with their own deterministic output, but any path that surfaces `result.content` directly puts internal configuration into user-visible text — and into a document intended for a government tender submission.
- **Fix:** keep the diagnostic fields on the returned object (`{ content, provider, model, fallback, diagnostics }`) and out of `content`.

---

## Needs verification (not confirmed)

1. **CSRF on state-changing `/api/platform-agent/*` routes.** These accept JSON `POST` with no CSRF token; NextAuth's default `SameSite=Lax` session cookie should block cross-site form posts, but I did not confirm the cookie configuration in `src/lib/auth.ts` or test a `chrome-extension://`-origin request. If `SameSite` is relaxed for the extension, `extension/ingest` becomes remotely triggerable.
2. **`extension/config` unauthenticated exposure.** It is allow-listed as public in `proxy.ts:48` and returns `authenticated:false` when unsigned — but I did not verify that every branch of the workspace-derived `matchCriteria` is suppressed in the unauthenticated response.
3. **Prisma `contentMd` size limits.** No cap is enforced before persisting model output; whether Postgres/Prisma rejects or silently truncates very large drafts was not tested.
4. **Guardrail regex coverage for Arabic.** `detectPricingRequest`/`detectPricingSuggestion` are visibly English-weighted; whether Arabic pricing phrasing evades the `NO_PRICING_RULE` needs adversarial testing rather than reading.
5. **`after()` availability under Turbopack dev vs. Vercel production.** `schedule-pipeline.ts` has a fallback branch; I did not verify which path actually executes in each environment.
6. **Screenshot ingestion path.** `extension/ingest` accepts a screenshot payload routed to OCR; I traced the code path but did not confirm the base64 size limit is enforced before the 25 MB OCR check.
