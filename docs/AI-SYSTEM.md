# AI System

## Pipeline

Durable in-process workflow with persisted `AgentRun` state, progress, cancel, and final artifacts.

Each agent is a **principal tender engineer** role (not a generic chatbot). Craft rules live in `WINNING_TENDER_CRAFT` (`src/lib/agents/prompts.ts`): complete requirement coverage, evaluation alignment, explicit gaps, evidence-only claims, no pricing, human final author.

1. **Ingestion (Agent 1)** — Principal Tender Ingestion & Requirements Engineer. Parse tender text; extract SOW, evaluation weights, SLA clauses exactly as written, milestones, and requirement rows with section/page refs.
2. **Compliance (Agent 2)** — Principal Compliance & Regulatory Matrix Engineer. Evidence-based matrix with `sourceCategory` + legal-review statuses; remediation tasks for gaps (not legal advice).
3. **Technical (Agent 3)** — Principal Technical & Solution Architecture Engineer. RAG over **approved/valid tenant corpus only**. Produces delivery model, governance, quality, risk, security/privacy, SLA/service management, training/transition, continuity, and evaluation-alignment narratives. Experience is classified `exact` | `analogous` | `proposed` — never invented.
4. **Financial (Agent 4)** — Principal Qualification & Financial Forms Structuring Engineer. QLR only from uploaded statements; pass/fail only with tender threshold; BoQ structure-only (blank amounts).
5. **Coverage planner** — `buildCoveragePlan` maps every requirement to approved evidence (`COVERED` / `PARTIAL` / `GAP` / `NEEDS_USER_INPUT`), computes coverage %, strengths, missing-evidence tasks, and ethical win-strategy notes (coverage-based, never commercial pricing strategy). Statuses sync to `TenderRequirement` rows.
6. **Drafting (Agent 5)** — Principal Proposal Documentation Engineer. Bilingual 18-section evaluator-scorable package driven by the coverage plan; restrictions enforced.
7. **Law & Contract (Agent 6)** — Researches the Saudi regulatory registry + tender anchors (`src/lib/saudi-law-research.ts`), then drafts a **front-to-front EN|AR contract** (`GeneratedProposal.type = CONTRACT`). Never claims 100% legal certainty; counsel review is mandatory. Studio: dashboard **Contracts** view; export: bilingual HTML/PDF.
8. **Validation gate** — blocks proposal export on policy violations (pricing language, invented NORA IDs, AI-priced BoQ, placeholders). Contract export uses `validateContractDraft` (disclaimer required; false-certainty language blocked).

## Voice Platform Copilot (Mission Control)

Dashboard **Voice Mission Control** (`?view=copilot`) is an AI SDK agent that operates the full product for the signed-in user with durable missions, multimodal drops, and adaptive autopilot.

### Modes

1. **Live voice (preferred)** — OpenAI Realtime API or Gemini Live API speech-to-speech via AI SDK `experimental_useRealtime` + ephemeral tokens.
   - Configure under **Admin → AI Providers → Voice live (VOICE) engine**.
   - Presets: **OpenAI Realtime (voice live)** and **Gemini Live (voice live)**.
   - Admin fetches live model lists (no hardcoded IDs), selects e.g. a `gpt-realtime-*` or Gemini `*-live*` id, activates the connection.
   - Setup: `GET/POST /api/platform-agent/realtime/setup` (token mint), tools: `POST /api/platform-agent/realtime/tools`.
2. **Browser mode (fallback)** — Web Speech STT/TTS + `ToolLoopAgent` chat stream at `POST /api/platform-agent/chat` when no VOICE provider is active.

### Mission Control

- Durable `CopilotMission` / messages / attachments / actions (Prisma).
- Drop zone + URL/camera/browser/email-Drive paste via `POST /api/platform-agent/missions/:id/attachments`.
- Heuristic classify → route → high-confidence RFP starts the 6-agent pipeline (`maybeAutopilotAfterIngest`).
- Tools: `ingestDroppedFile`, `classifyAndRouteAttachment`, `ingestUrl`, `captureClientArtifact`, `listMissionAttachments`, `searchDocumentChunks`, `undoLastRouting`, `importExternalSource`, plus existing platform tools.
- Shared ingest: `ingestDocumentForWorkspace` used by Documents API and Mission Control.

### Guardrails

Tenant RBAC, pricing-input refuse, constitution instructions (no pricing strategy, no 100% legal certainty, human final author). Maximum autonomy under RBAC (no confirm dialogs); Undo within 30s for routing.

Code: `src/lib/agents/platform/*`, `src/components/dashboard/platform-agent-console.tsx`, `src/components/dashboard/mission-*.tsx`, `src/components/dashboard/live-voice-session.tsx`.

## 18-section proposal package

1. Executive Summary  
2. Project Understanding  
3. Evaluation Alignment  
4. Requirement Coverage Matrix  
5. Execution Methodology  
6. Solution Architecture & Delivery Model  
7. Governance & Quality  
8. Risk Management  
9. Security & Privacy Response  
10. SLA & Service Management  
11. Team & Qualifications  
12. Relevant Experience  
13. Compliance Commitments  
14. Training, Transition & Continuity  
15. Financial Forms Structure  
16. Assumptions, Exclusions & Clarifications  
17. Vision 2030 Alignment  
18. Closing  

Deterministic fallback (`buildDeterministicProposal`) always emits the full structure when the LLM is unavailable.

## Winning posture (what “elite” means here)

Winning is **evaluator score through coverage**, not fabrication:

- Every claim cites tender text or approved tenant evidence
- Gaps are explicit completion tasks for the human team
- Technical evaluation weight drives narrative density
- Commercial pricing is out of band (authorized commercial team only)
- User remains final author of record

## Provider abstraction

`src/lib/llm/index.ts` + `AIProviderConfig` per engine (INGESTION, COMPLIANCE, TECHNICAL, FINANCIAL, DRAFTING, EMBEDDING, REWRITE, LAW, DEFAULT).

## Guardrails

See `docs/GUARDRAILS.md`.

## RAG

- Chunking: `document-chunks.ts`
- Tenant filter on `DocumentChunk.workspaceId`
- Knowledge eligibility: approved + valid-only (`knowledge-eligibility.ts`)
- Local embeddings fallback when no embedding provider configured

## Artifacts

`AgentRun.finalArtifact` includes coverage matrix summary, technical package metadata, validation report, `exportReady`, and `contractId` for the bilingual draft.

## Proposal Document Studio

Live editing, redesign, and release loop:

| Capability | Endpoint / UI |
| --- | --- |
| Skills (rewrite, expand, condense, translate, redesign, section) | `POST /api/proposals/[id]/rewrite` (`skill`, `apply`) |
| Validation + export readiness | `GET /api/proposals/[id]/validate` |
| Version compare | `GET /api/proposals/[id]/versions/compare?a=&b=` |
| Version revert | `POST /api/proposals/[id]/versions/[version]/revert` |
| Regenerate as version or fork | `POST /api/agents/run` with `regenerateMode` + `targetProposalId` |
| Final export policy | Approval required when policy exists; ZIP marks `EXPORTED` |

## Contract studio

| Capability | Location |
| --- | --- |
| Bilingual front-to-front viewer | Dashboard → Contracts |
| Pre-draft research panel | Registry findings + certainty tags |
| HTML / PDF export | `GET /api/proposals/:id/download?format=html\|pdf` (type `CONTRACT`) |
