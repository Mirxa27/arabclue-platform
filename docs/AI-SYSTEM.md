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

## Voice Platform Copilot (main agent)

Dashboard **Voice Copilot** (`?view=copilot`) is an AI SDK `ToolLoopAgent` that operates the full product for the signed-in user:

- **Stack:** `ai` + `@ai-sdk/react` (`useChat` + `DefaultChatTransport`), streaming via `createAgentUIStreamResponse` at `POST /api/platform-agent/chat`.
- **Model:** Vercel AI Gateway when `AI_GATEWAY_API_KEY` / OIDC is present; otherwise the active Admin **DEFAULT** provider (OpenAI-compatible or Anthropic) with the admin-selected live `modelId`.
- **Voice:** browser Speech Recognition (STT) and Speech Synthesis (TTS); live tool-execution feed so users watch actions as they run.
- **Tools:** workspace overview, projects CRUD, documents, proposals/contracts, compliance, start/cancel/poll the 6-agent pipeline, reviews, billing status, account/onboarding, admin overview/providers/audit (role-gated), UI navigation hints.
- **Guardrails:** tenant RBAC, pricing-input refuse (422), constitution instructions (no pricing strategy, no 100% legal certainty, human final author).

Code: `src/lib/agents/platform/*`, `src/components/dashboard/platform-agent-console.tsx`.

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
