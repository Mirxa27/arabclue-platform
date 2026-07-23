# ArabClue Voice Agent — Chrome Extension (MV3)

Futuristic side-panel companion that **strengthens** the ArabClue Voice Mission Control agent by capturing any browser tab (selection, full page text, or screenshot) and beaming it into the platform.

Research baseline: **Chrome Manifest V3 + Side Panel API** (Chrome 116+, sidePanel enhancements through 2025–2026).

## Install

### Smart Install (optional)

The extension is **optional** — Mission Control works fully without it.

While signed in to ArabClue → **Mission Control**, use **Optional install**:

1. Click **Optional install** (the wizard does not auto-force itself)
2. Download the ZIP from ArabClue
3. Unzip → open `chrome://extensions` → Developer mode → **Load unpacked** → select the `arabclue-agent` folder
4. **Refresh the ArabClue tab** so the content-script bridge can link
5. In the side panel, keep **API base** as `https://arabclue.com` (origin only — never `/app`) and stay signed in

Mission Control detects the link automatically after refresh.

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
| Offline queue | Failed text captures are saved locally and auto-retry every minute (badge shows pending count; side panel has Retry now) |
| Auto-update | Mission Control compares versions and offers a one-click Update flow when the platform ships a newer extension |

Uplink endpoint: `POST /api/platform-agent/extension/ingest` (session cookie auth).

## Permissions (least privilege)

- `sidePanel`, `activeTab`, `scripting`, `storage`, `contextMenus`, `alarms` (offline queue retry)
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
