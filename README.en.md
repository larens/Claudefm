# Claudiofm Chrome Extension

English · [中文](./README.md)

Claudiofm is a Chrome Side Panel (MV3) extension that turns chat + playlist recommendations into a “DJ-style radio” experience, with a local-first workflow.

- Chat & recommendations: via Native Messaging to your local Claude Code CLI (`claude --bare ...`)
- Audio source resolution: controlled Web Provider (currently `https://music.pjmp3.com/*`)
- Data & preferences: local files + `chrome.storage.local` (cloud sync is planned)

## Repo layout

- `extension/`: Chrome extension (Side Panel UI + background service worker)
- `host/`: Native Messaging Host for macOS (prefers Python, falls back to Node)
- `docs/`: internal notes and templates

## Features (current)

- Fast chat feedback: shows “Thinking…” immediately and replaces it when the real reply arrives
- Semantic recommendation policy: not every message triggers a playlist; the DJ can ask for confirmation first
- DJ “push playlist”: edit the DJ segue line, then push and start playing the new playlist
- First playlist in a new session: when the queue is empty, recommended tracks start playing automatically
- Like/Dislike loop: vote on tracks in the queue and history, affecting future recommendations and filtering
- History & detail view: reads `~/Documents/Claudiofm/list.md` (last 7 days); renders cached covers when available
- Local cache: Host caches tracks and cover art under `~/Documents/Claudiofm/cache/` for faster loads
- TTS & interludes: selectable TTS voice; optional “lyric mood interlude” segments
- Soul panel & context: reads local memory files; can request geolocation for better context

## How it works (architecture)

```
┌──────────────┐      Native Messaging      ┌────────────────────────┐
│ Side Panel UI │  ───────────────────────▶ │  Claudiofm Host (macOS) │
│ (extension/)  │                           │  host.py / host.cjs     │
└──────┬───────┘                           └───────────┬────────────┘
       │                                              │
       │  chrome.runtime.sendMessage / port            │  claude --bare
       │                                              │  + cache/files
┌──────▼────────────────────┐                          │
│ Background Service Worker  │                          │
│ (extension/background.js)  │                          │
└──────────┬─────────────────┘                          │
           │                                            │
           │ Provider Tab / Fetch                        │
           ▼                                            ▼
      https://music.pjmp3.com/*                    ~/Documents/Claudiofm/
```

## Quick start (macOS / Linux / Windows)

### Prerequisites

- Chrome / Arc (Chromium browser with Side Panel support)
- Node.js ≥ 18 (to install the native host; runtime optional)
- Python 3 (optional; if present, `host.py` is preferred)
- Claude Code CLI available as `claude` in your PATH (or set `CLAUDE_BIN`)

### 1) Load the extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select `extension/`
4. Copy the extension ID

### 2) Configure & install the native host

Edit `host/install-macos.json`:

```json
{
  "extensionId": "YOUR_EXTENSION_ID"
}
```

Install (cross-platform installer: macOS/Linux write NativeMessagingHosts; Windows writes registry keys; default entry is `host/claudiofm-host.sh` or `host/claudiofm-host.cmd`):

```bash
cd host
node install.mjs
```

Optional: use CLI args instead of editing JSON:

```bash
node host/install.mjs --extensionId <YOUR_EXTENSION_ID>
```

### 3) Open the side panel

Click the extension icon and open Side Panel → Claudiofm.

## Troubleshooting

- Host not allowed / forbidden:
  - Ensure `host/install-macos.json` has the correct `extensionId`
  - Re-run `node host/install.mjs`
  - Fully quit and restart the browser
- `claude` not found:
  - Install Claude Code CLI and make sure `claude` is in PATH
  - Or set `CLAUDE_BIN` to the absolute path of the binary
- Host logs:
  - `~/Library/Logs/ClaudiofmHost.log`

## Release notes (high-level)

Recent changes summarized from main branch commit messages:

- History cover cache rendering + Like/Dislike UI & recommendation filtering
- Fix: non-music chat always returns a text reply
- Prefer model TTS (fallback to browser TTS)
- Voice selection + lyric interlude
- History import + Soul panel
- Fix macOS host installation path and Claude CLI timeout handling

## License

No license is declared in this repository yet.
