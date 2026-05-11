# Claudefm Music Assistant

English · [中文](./README.md)

Claudefm is a Chromium Side Panel extension that turns chat, playlist recommendations, and autoplay into a local-first DJ-style music assistant.

- Chat and recommendations: via Native Messaging to your local Claude Code CLI
- Local data: stored by the host on disk, while extension state stays in `chrome.storage.local`

## Repo Layout

- `extension/`: Chrome extension and Side Panel UI
- `host/`: Native Messaging host, installer, and platform config templates
- `docs/`: templates and design notes

## Features

- Instant chat feedback with semantic confirmation before recommending playlists
- DJ segue editing, push, and autoplay
- Like/Dislike loop that affects future recommendations
- History playback list with detail view
- Local track and cover cache
- TTS voice selection and lyric interlude generation
- Soul panel backed by a local music memory file

## Architecture

```text
┌──────────────┐      Native Messaging      ┌─────────────────────────────┐
│ Side Panel UI│  ───────────────────────▶ │ Claudefm Host              │
│ extension/   │                           │ host.py / host.cjs          │
└──────┬───────┘                           └───────────┬─────────────────┘
       │                                              │
       │ chrome.runtime.sendMessage / port            │ claude --bare
       │                                              │ + local files/cache
┌──────▼────────────────────┐                          │
│ Background Service Worker │                          │
│ extension/background.js   │                          │
└──────────┬─────────────────┘                          │
           │                                            │
           │ Provider Tab / Fetch                        │
           ▼                                            ▼
      https://music.pjmp3.com/*                  Claudefm data dir
```

## Quick Start

### Prerequisites

- Chrome / Edge / Brave / Arc / Chromium
- Node.js `>=18`
- Python 3, optional but preferred when available
- Claude Code CLI available as `claude`

### 1. Load The Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `extension/` directory
5. Copy the extension ID

### 2. Configure The Installer

You can also pass values through CLI arguments:

```bash
node host/install.mjs --extensionId <YOUR_EXTENSION_ID>
```

Advanced examples:

```bash
node host/install.mjs --config host/install-linux.json
node host/install.mjs --extensionId <YOUR_EXTENSION_ID> --dataDir /absolute/path/to/data
```

You can also edit the platform-specific config file:

- macOS: `host/install-macos.json`
- Linux: `host/install-linux.json`
- Windows: `host/install-windows.json`

Minimal example:

```json
{
  "extensionId": "YOUR_EXTENSION_ID"
}
```

Optional fields:

```json
{
  "extensionId": "YOUR_EXTENSION_ID",
  "dataDir": "/absolute/path/to/Claudefm-data",
  "hostAbsolutePath": "/absolute/path/to/claudefm-host.sh"
}
```

### 3. Install The Native Host And Generate Init Files

```bash
cd host
node install.mjs
```

The installer will:

- install the Native Messaging manifest
- write `host/runtime-config.json`
- create the local data directory
- create `music.md`
- create `list.md`
- create `cache/`, `cache/tracks/`, and `cache/covers/`

### 4. Open The Side Panel

Click the extension icon and open Side Panel → Claudefm.

## Default Local Data Directories

- macOS: `~/Documents/Claudefm`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/Claudefm`
- Windows: `%APPDATA%\Claudefm`

Typical contents:

- `music.md`: user music memory profile
- `list.md`: playlist history
- `cache/`: cached tracks and covers

## Platform Notes

### macOS

- Config file: `host/install-macos.json`
- Log file: `~/Library/Logs/ClaudefmHost.log`
- Native Messaging manifests: under Chromium browser `Library/Application Support/.../NativeMessagingHosts`

### Linux

- Config file: `host/install-linux.json`
- Log file: `${XDG_STATE_HOME:-~/.local/state}/Claudefm/ClaudefmHost.log`
- Native Messaging manifests: under browser-specific `~/.config/.../NativeMessagingHosts`

### Windows

- Config file: `host/install-windows.json`
- Log file: `%TEMP%\ClaudefmHost.log`
- Native Messaging registration: installer writes current-user registry keys under `HKCU\Software\...\NativeMessagingHosts`

## Troubleshooting

- `forbidden` or `Not allowed`
- Make sure the `extensionId` in the install config matches `chrome://extensions`
- Re-run `node host/install.mjs`
- Fully quit and restart the browser

- `claude` not found
- Install Claude Code CLI and ensure `claude` is available in `PATH`
- Or set `CLAUDE_BIN` to the absolute executable path

- Need a custom data directory
- Set `dataDir` in the install config
- Or pass `--dataDir` to the installer

- Core files were deleted
- Re-run `node host/install.mjs`
- The host also keeps lightweight runtime safeguards for missing core files

## License

No license file is declared in this repository yet.
