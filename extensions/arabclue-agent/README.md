# ArabClue Agent — Chrome Extension (MV3)

Futuristic AI browser agent for ArabClue Mission Control: **Etimad tender intelligence**, **universal page capture**, **copilot chat**, and **real document uplink**.

## What it does

| Feature | Description |
| --- | --- |
| **Scan Etimad** | Browses tenders.etimad.sa using real listing/detail parsers (IIFE content scripts) |
| **Smart Matching** | Multi-factor scoring: category, keywords (AR/EN), value range, deadline, entity |
| **Universal Capture** | Page text, selection, or screenshot from any tab (optional host permission) |
| **Document Uplink** | Multipart upload to `/api/platform-agent/missions/:id/attachments` |
| **Prepare Proposal** | Autopilot (`/missions/:id/autopilot`) with chat fallback |
| **Copilot** | Side-panel chat to `/api/platform-agent/extension/copilot` (JSON) with AI SDK stream fallback |
| **Remote Config** | Loads portals/categories/flags from `/api/platform-agent/extension/config` |
| **Offline Queue** | Failed tender **and** capture ingestions retry automatically; badge + sidepanel panel |
| **Bilingual UI** | Full Arabic (RTL) / English side panel via `i18n.ts` |

## Install

### Development (Load unpacked)

```bash
cd extensions/arabclue-agent
bun install
bun run build
bun run typecheck
```

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select `extensions/arabclue-agent`
4. Pin the extension and open the **side panel**
5. Sign in at [https://arabclue.com](https://arabclue.com) (or `http://localhost:3000` for local)

### Smart Install (from platform)

While signed in → **Mission Control** → optional install → download ZIP → Load unpacked.

## Usage

1. **Dashboard** — Scan Etimad, review matches, extract current page
2. **Capture** — Page / selection / screenshot into Mission Control
3. **Copilot** — Chat with the platform agent; open last mission link
4. **Criteria** — Keywords + category chips from remote config
5. **Settings** — API base, locale, theme (dark/light/system), remote sync

## Verify

```bash
cd extensions/arabclue-agent
bun install && bun run build && bun run typecheck
```

Manual checks:

1. Side panel shows **ArabClue Agent**, connection strip, and localized nav
2. On Etimad detail page: context menu **Extract** / shortcut **Ctrl+Shift+P** extracts + ingests/prepares
3. Capture view works after granting optional host permission
4. Unsigned session shows Connect CTA (401 from config/session)
5. Failed ingest increments queue badge and shows queue panel

## Architecture

```
src/
├── types.ts / constants.ts / i18n.ts / utils.ts
├── config/remote.ts          # Remote config + auth probe
├── background/
│   ├── service-worker.ts     # Message router
│   ├── scanner.ts / inject.ts
│   ├── ingest.ts / capture.ts / queue.ts
│   └── matcher.ts / downloader.ts / notifications.ts
├── content/                  # IIFE classic MV3 scripts
│   ├── bridge.ts / page-capture.ts
│   └── etimad-*.ts
└── sidepanel/
    ├── sidepanel.ts / fx.ts
```

Build formats (`esbuild.config.mjs`):

- Content scripts + bridge → **IIFE**
- Service worker + sidepanel + shared → **ESM**

## API

| Endpoint | Use |
| --- | --- |
| `GET /api/platform-agent/extension/config` | Remote config + `{ authenticated, user? }` |
| `POST /api/platform-agent/extension/copilot` | Non-streaming copilot `{ text, missionId? }` → `{ reply, missionId }` |
| `POST /api/platform-agent/extension/ingest` | Tender / page / selection / screenshot |
| `POST /api/platform-agent/missions/:id/attachments` | Multipart document upload |
| `POST /api/platform-agent/missions/:id/autopilot` | Proposal pipeline (404 → copilot fallback) |
| `POST /api/platform-agent/chat` | Stream fallback for copilot |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+E` | Scan Etimad |
| `Ctrl+Shift+P` | Extract + prepare proposal |
