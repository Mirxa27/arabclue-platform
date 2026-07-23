# Voice Mission Control Design

**Date:** 2026-07-23  
**Status:** Approved for implementation (user: “Continue completing n execute all”)  
**Product:** ArabClue Voice Platform Copilot

## Decisions locked

| Decision | Choice |
| --- | --- |
| Autonomy | Maximum: execute every RBAC-permitted action automatically (no confirmation dialogs) |
| File routing | Intelligent auto-routing with visible classification + Undo |
| Tender trigger | Adaptive autopilot: high confidence → create project + ingest + full agent pipeline; low confidence → ask one focused question |
| Inputs | Full multimodal surface: files, ZIPs, images, pasted text, URLs, email, cloud drives, camera, browser-page capture |
| Architecture | Durable Mission Control (Approach 2) |

## Goal

Turn Voice Copilot into a futuristic **Mission Control** where the signed-in user can speak, type, drop files, paste URLs/text, capture camera/browser content, or connect external sources — and the main agent autonomously operates ArabClue (projects, documents, agents, proposals, contracts, compliance, reviews, billing, admin) under tenant RBAC and product constitution.

## Non-goals (this release)

- Generic arbitrary HTTP/API executor
- Pricing strategy or bid amount suggestions
- Claiming 100% legal certainty
- Replacing the human as final author of exported proposals/contracts
- A separate microservice/queue runtime

## Architecture

```
UI Mission Control
  ├─ Composer (voice / text / drop / paste / capture / connectors)
  ├─ Attachment tray (classification chips + Undo)
  ├─ Execution feed (live tool/run timeline)
  └─ Conversation (persisted)
        │
        ▼
Mission session API (authoritative context)
        │
        ├─ Browser chat → ToolLoopAgent
        └─ Live voice → Realtime tools route
                │
                ▼
Unified platform services (audited, RBAC)
  ingestDocument · classifyAndRoute · createProject
  start/cancel/status AgentRun · reviews · docs · billing
```

### Durable mission

- `CopilotMission` — one active mission per user+workspace (reopenable)
- `CopilotMessage` — persisted transcript parts
- `CopilotAttachment` — uploaded/captured/imported items linked to mission and optionally project
- `CopilotAction` — audit of autonomous tool executions for the feed/Undo

### Context extensions

`PlatformAgentContext` gains:
- `missionId`
- `activeProjectId` (server-validated)
- `attachmentIds` (server-owned set)

Clients never pass raw file bytes into the LLM. They upload first; tools receive document/attachment IDs.

## Multimodal inputs

| Source | Behavior |
| --- | --- |
| File / folder ZIP | Upload → extract → classify → route |
| Image / screenshot | Store + vision/OCR summary when available; else `NEEDS_OCR` |
| Pasted text | Stage as text attachment |
| URL | Fetch allowed hosts → extract → classify |
| Camera | Capture frame → image attachment |
| Browser page | Capture selected tab HTML/text via client capture API |
| Email / Drive | Connector adapters (OAuth stubs + manual paste/import fallback in v1) |

### Intelligent routing

Classifier outputs `{ category, confidence, suggestedProjectId?, createProject?, runPipeline? }`.

High confidence tender (≥0.78):
1. Create/select project
2. Attach documents
3. Start full agent pipeline
4. Navigate UI to Agents/Documents so the user watches

Low confidence:
- Ask one clarifying question (project vs library vs brand vs financial)
- Still store the attachment as staged

Undo window: 30 seconds for last routing action (relink/delete staging) when reversible.

## Autonomy & safety

- No interactive approval cards
- Every write still checked by existing RBAC (`canWrite`, admin gates, quotas, onboarding readiness)
- Pricing-input refuse remains
- Constitution instructions remain
- Every tool execution records `CopilotAction` + audit log
- Destructive deletes prefer soft-delete/archive when available; otherwise RBAC-only

## UI (Mission Control)

One composition for Copilot:
1. Brand/status strip (mode live/browser, mission id short, active project)
2. Dominant conversation + execution feed (not a dashboard grid)
3. Attachment tray above composer
4. Composer with mic, send, attach, capture, paste-url, connectors

Visual language: existing ArabClue tokens; motion on tool cards (running → success); avoid purple glow / card spam. Tool cards show structured summaries, not only truncated JSON.

## Testing

- Bun unit tests: classifier, routing decisions, mission helpers, tool RBAC denies
- API smoke: attachment upload + classify
- Desktop/browser: drop RFP → project created → pipeline started when confidence high

## Phased delivery

1. Schema + mission session + attachment ingest + classifier + expanded tools + Mission Control UI
2. Adaptive autopilot (pipeline auto-start) + Undo + richer execution feed
3. Connector adapters (URL/camera/browser capture first; email/drive stubs with import UX)
