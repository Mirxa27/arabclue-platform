# ArabClue Voice Agent — Chrome Extension (MV3)

Futuristic side-panel companion that **strengthens** the ArabClue Voice Mission Control agent by capturing any browser tab (selection, full page text, or screenshot) and beaming it into the platform.

Research baseline: **Chrome Manifest V3 + Side Panel API** (Chrome 116+, sidePanel enhancements through 2025–2026).

## Install

### Smart Install (recommended)

While signed in to ArabClue → **Mission Control**, use **Smart Install**:

1. Click **Smart install** (or accept the auto-prompt when the extension is missing)
2. Download the ZIP from ArabClue
3. Unzip → open `chrome://extensions` → Developer mode → **Load unpacked** → select the `arabclue-agent` folder
4. Return to Mission Control — it detects the link automatically

### Load unpacked (manual)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder:
   ```
   extensions/arabclue-agent
   ```
4. Pin the extension and click the icon to open the **side panel**
5. Sign in at [https://arabclue.com](https://arabclue.com) in the same browser profile
6. On any tab: **Capture page** / **Send selection** / **Screenshot → agent**

Optional: for local development, set **API base** in the side panel to your local ArabClue origin and approve the optional host permission when Chrome prompts.

## What it does

| Action | Effect |
| --- | --- |
| Capture page | Extracts title, URL, headings, body text → Mission Control ingest + classify/autopilot |
| Send selection | Beams highlighted text only |
| Screenshot | `captureVisibleTab` PNG → staged as browser attachment |
| Context menu | Right-click page/selection → send to agent |
| Glitter FX | Custom cursor + particle field while performing |

Uplink endpoint: `POST /api/platform-agent/extension/ingest` (session cookie auth).

## Permissions (least privilege)

- `sidePanel`, `activeTab`, `scripting`, `storage`, `contextMenus`
- Host: `arabclue.com`
- Optional broader hosts if you grant them for local/dev or more sites

No API secrets ship in the extension. Auth uses your ArabClue browser session.

## Folder

```
extensions/arabclue-agent/
  manifest.json
  background/service-worker.js
  sidepanel/{sidepanel.html,sidepanel.css,sidepanel.js}
  content/arabclue-bridge.js
  shared/messages.js
  assets/icons/
```

## Web Store

Zip this directory (not the parent). Keep permissions minimal and explain host access in the listing. For a stable extension ID used by `externally_connectable`, upload once and pin the public `key` in the manifest.
