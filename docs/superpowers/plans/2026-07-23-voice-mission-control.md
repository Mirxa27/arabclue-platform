# Voice Mission Control Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Ship a durable multimodal Voice Mission Control that auto-routes files, runs RBAC-permitted platform actions without confirmation, and adaptively launches agent pipelines.

**Architecture:** Persist Copilot missions/messages/attachments/actions; unify ingest+classify services; expand platform tools; upgrade Copilot UI into Mission Control with drop/capture/URL/connectors.

**Tech Stack:** Next.js App Router, Prisma/Postgres, AI SDK ToolLoopAgent + Realtime, existing storage/ingest/audit/quota layers, Bun tests.

## Global Constraints

- Maximum autonomy under RBAC (no approval dialogs)
- Intelligent file routing + Undo
- Adaptive autopilot for high-confidence tenders
- No pricing strategy; no 100% legal certainty; human final author
- Branch: `cursor/voice-mission-control-ab64`

---

### Task 1: Schema + mission domain models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/*_copilot_mission/`
- Create: `src/lib/agents/platform/mission.ts`
- Test: `src/lib/__tests__/mission-control.test.ts`

- [ ] Add `CopilotMission`, `CopilotMessage`, `CopilotAttachment`, `CopilotAction` models with workspace/user indexes and optional `projectId` / `documentId` links
- [ ] Add helpers: `getOrCreateMission`, `appendMissionMessage`, `recordMissionAction`
- [ ] Write failing tests for get-or-create and action recording
- [ ] Implement helpers until green
- [ ] Commit

### Task 2: Ingest + classify services

**Files:**
- Create: `src/lib/agents/platform/ingest-document.ts`
- Create: `src/lib/agents/platform/classify-attachment.ts`
- Modify: `src/app/api/documents/route.ts` (call shared ingest)
- Test: `src/lib/__tests__/classify-attachment.test.ts`

- [ ] Extract upload/parse/index path into `ingestDocumentForWorkspace`
- [ ] Heuristic classifier (filename/MIME/text cues → category + confidence + autopilot flags)
- [ ] Unit tests for RFP vs brand vs financial vs ambiguous
- [ ] Commit

### Task 3: Mission attachment API

**Files:**
- Create: `src/app/api/platform-agent/missions/route.ts`
- Create: `src/app/api/platform-agent/missions/[id]/attachments/route.ts`
- Create: `src/app/api/platform-agent/missions/[id]/route.ts`

- [ ] GET/POST mission (get-or-create)
- [ ] POST multipart attachments → ingest + classify + optional auto-route
- [ ] GET mission with messages/attachments/actions
- [ ] Commit

### Task 4: Expand platform tools

**Files:**
- Modify: `src/lib/agents/platform/tools.ts`
- Modify: `src/lib/agents/platform/context.ts`
- Modify: `src/lib/agents/platform/instructions.ts`
- Modify: `src/lib/agents/platform/main-agent.ts`
- Modify: `src/app/api/platform-agent/chat/route.ts`
- Modify: `src/app/api/platform-agent/realtime/tools/route.ts`
- Test: `src/lib/__tests__/platform-agent.test.ts`

- [ ] Extend context with missionId/activeProjectId
- [ ] Add tools: `ingestDroppedFile`, `classifyAndRouteAttachment`, `ingestUrl`, `searchDocumentChunks`, `listMissionAttachments`, `undoLastRouting`, `captureClientArtifact` (camera/browser staged), `importExternalSource` (email/drive stub)
- [ ] Ensure `startAgentPipeline` usable by autopilot path
- [ ] Update instructions for Mission Control autonomy + adaptive autopilot
- [ ] Commit

### Task 5: Adaptive autopilot orchestrator

**Files:**
- Create: `src/lib/agents/platform/autopilot.ts`
- Test: `src/lib/__tests__/autopilot.test.ts`

- [ ] `maybeAutopilotAfterIngest(decision)` creates/selects project, links docs, starts pipeline when confidence high
- [ ] Low confidence returns one clarifying question payload
- [ ] Commit

### Task 6: Mission Control UI

**Files:**
- Modify: `src/components/dashboard/platform-agent-console.tsx`
- Create: `src/components/dashboard/mission-attachment-tray.tsx`
- Create: `src/components/dashboard/mission-execution-feed.tsx`
- Create: `src/components/dashboard/mission-composer.tsx`
- Modify: `src/components/dashboard/live-voice-session.tsx` (missionId awareness if needed)
- Modify: `src/lib/i18n.ts` (strings)

- [ ] Drop zone + file picker + URL paste + camera capture + browser text capture buttons
- [ ] Attachment chips with category/confidence/Undo
- [ ] Execution feed from tools + mission actions
- [ ] Persist/load mission messages when opening Copilot
- [ ] Futuristic but on-brand composition (one hero area, motion on running tools)
- [ ] Commit

### Task 7: Connector stubs

**Files:**
- Create: `src/lib/agents/platform/connectors.ts`
- Create: `src/components/dashboard/mission-connectors.tsx`

- [ ] Connector registry: url, camera, browser, email, google_drive, onedrive
- [ ] Working: url/camera/browser; stubs with clear UX for email/drive
- [ ] Commit

### Task 8: Verify & ship

- [ ] `bun test`, `bunx tsc --noEmit`, `bun run lint`, `bun run build`
- [ ] Desktop smoke: login → Copilot → drop TXT RFP → autopilot/project path
- [ ] Push branch + open/update PR
