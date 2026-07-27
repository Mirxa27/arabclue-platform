# ArabClue Etimad Agent — Chrome Extension (MV3)

Intelligent Etimad tender discovery and automated proposal preparation for ArabClue. Scans the Saudi Etimad procurement portal, finds tenders matching your criteria, downloads documents, and triggers ArabClue's AI proposal pipeline.

## What it does

| Feature | Description |
| --- | --- |
| **Scan Etimad** | Automatically browses tenders.etimad.sa, extracts structured tender data |
| **Smart Matching** | Multi-factor scoring: category, keywords (AR/EN), value range, deadline, entity |
| **Download Documents** | Fetches RFPs, specs, terms, qualifications from tender pages |
| **Prepare Proposal** | One-click triggers ArabClue's AI agent pipeline for proposal generation |
| **Auto-scan** | Background scanning every N minutes with Chrome notifications |
| **Bilingual UI** | Full Arabic (RTL) and English side panel |
| **Offline Queue** | Failed ingestions retry automatically |
| **Keyboard Shortcuts** | `Ctrl+Shift+E` scan, `Ctrl+Shift+P` prepare proposal |

## Install

### Development (Load unpacked)

1. Install dependencies and build:
   ```bash
   cd extensions/arabclue-agent
   bun install
   bun run build
   ```
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select `extensions/arabclue-agent`
5. Pin the extension and click to open the **side panel**
6. Sign in at [https://arabclue.com](https://arabclue.com)

### Smart Install (from platform)

While signed in to ArabClue → **Mission Control**, use **Optional install**:
1. Download the ZIP
2. Unzip → Load unpacked → select `arabclue-agent` folder
3. Refresh the ArabClue tab

## Usage

1. **Set Criteria** — Click ⚙️ in the side panel, add keywords (AR/EN), categories, value range
2. **Scan** — Click "Scan Etimad" or press `Ctrl+Shift+E`
3. **Review Matches** — Tenders are scored and sorted by relevance
4. **Prepare Proposal** — Click "Prepare Proposal" on any tender card
5. **Auto-mode** — Enable auto-scan + auto-download + auto-proposal in Settings

## Architecture

```
src/
├── types.ts              # TypeScript type system
├── constants.ts          # Message types, Etimad URLs, storage keys
├── i18n.ts              # Bilingual AR/EN strings
├── utils.ts             # Date parsers, SAR parser, helpers
├── background/
│   ├── service-worker.ts # Message router, alarms, context menus
│   ├── scanner.ts       # Etimad scanning orchestrator
│   ├── matcher.ts       # Multi-factor tender matching engine
│   ├── downloader.ts    # Document download manager
│   ├── ingest.ts        # ArabClue API uplink
│   ├── queue.ts         # Offline retry queue
│   └── notifications.ts # Chrome notifications
├── content/
│   ├── bridge.ts        # ArabClue ↔ extension bridge
│   ├── etimad-parser.ts # Listing page parser
│   ├── etimad-detail-parser.ts # Detail page parser
│   ├── etimad-navigator.ts     # Page navigation/filters
│   └── etimad-document-extractor.ts # Document link extraction
└── sidepanel/
    ├── sidepanel.ts     # Panel controller + view routing
    └── fx.ts            # Visual effects
```

## Build

```bash
bun install          # Install esbuild + typescript
bun run build        # Build all entry points
bun run watch        # Watch mode for development
bun run typecheck    # Type-check without emitting
```

Output files:
- `background/service-worker.js`
- `content/arabclue-bridge.js`
- `content/etimad-parser.js` (+ detail, navigator, document-extractor)
- `sidepanel/sidepanel.js`
- `shared/messages.js`

## Permissions

- `sidePanel`, `activeTab`, `scripting`, `storage`, `contextMenus`, `alarms`, `notifications`, `downloads`, `tabs`
- Host: `arabclue.com`, `tenders.etimad.sa`
- Optional broader hosts for dev

## API Endpoint

Uplink: `POST /api/platform-agent/extension/ingest`

Supports `mode: "tender"` with structured `EtimadTender` data for automated proposal pipeline triggering.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+E` (Mac: `MacCtrl+Shift+E`) | Scan Etimad |
| `Ctrl+Shift+P` (Mac: `MacCtrl+Shift+P`) | Prepare proposal |
