# Claudefm Music Assistant

English · [中文](./README.md)

Claudefm is a Chromium Side Panel extension that turns DJ chat, playlist recommendations, and autoplay into a local-first music assistant.

- Chat and recommendations via Native Messaging to your local Claude Code CLI
- Local data stored by the host on disk; extension state in `chrome.storage.local`

<img src="https://github.com/larens/Claudefm/blob/main/docs/superpowers/specs/demo.png?raw=true" alt="Demo">


## Repo Layout

- `extension/`: Chrome extension and Side Panel UI
- `host/`: Native Messaging host, installer, and platform config templates
- `services/`: backend services (NeteaseCloudMusicApi, etc.)
- `docs/`: templates and design notes

## Features

- Instant chat feedback with semantic confirmation before recommending playlists
- Read-only recommendation card with push-to-play (configurable autoplay or manual confirmation)
- Like/Dislike loop that affects future recommendations and filtering
- History playlist with detail view, local track and cover cache
- **TTS synthesis**: supports MiMo TTS and Claude TTS model fallback; DJ segue audio is pre-generated and cached, served via a local HTTP server for fast playback
- **Document-to-Podcast**: send a URL or document text and the AI auto-splits it into multi-chapter podcast segments with TTS playback; chapter titles display as `(1/3) Topic Name`, progress bar syncs in real time, and chapters play continuously
- **Silent URL fetching**: web page content is fetched via direct HTTP request first (no visible tab); falls back to WebBridge browser rendering when content is insufficient
- **Playback mutex**: music recommendations do not interrupt an active podcast — recommendations are display-only during podcast playback; the podcast automatically takes over the play queue when started
- **Optimized DJ segue**: recommendation text focuses on emotion and atmosphere, no song or artist names embedded; split into multiple message bubbles by sentence segments, with per-character karaoke-style highlight synced to TTS playback progress
- **Persistent chat history**: recommendation text stays in the conversation until a new session is started
- **Chat avatars**: DJ avatar on the left side of assistant messages, user avatar on the right side of user messages, creating a radio-host conversation feel
- **Personal settings**: set "My name" and "My avatar"; DJ avatar and name are also customizable from the settings panel
- **Overlay masking**: settings, Soul, and history panels use a dark overlay that fully covers chat content, preventing text bleed-through
- Soul panel backed by a local music memory file
- Local AI tool auto-detection and invocation (Claude Code, etc.)
- Background playback: music continues playing after Side Panel is closed

## Architecture

```text
┌──────────────┐      Native Messaging      ┌─────────────────────────────┐
│ Side Panel UI│  ────────────────────────▶ │ Claudefm Host              │
│ extension/   │                            │ host.cjs / host.py         │
└──────┬───────┘                            └───────────┬────────────────┘
       │                                               │
       │ chrome.runtime.sendMessage / port             │ claude --bare
       │                                               │ + local files/cache
┌──────▼────────────────────┐         ┌────────────────▼────────────────┐
│ Background Service Worker │         │ TTS Local HTTP Server (lazy)   │
│ extension/background.js   │         │ 127.0.0.1:<random-port>/tts/   │
└──────────┬─────────────────┘         └────────────────────────────────┘
           │
           │ Fetch (cloudsearch + song/url)
           ▼
      http://localhost:3000/*             Claudefm data dir
      services/ncm-api/                  (music.md, list.md, cache/)
      (NeteaseCloudMusicApi)

  Podcast URL fetch priority:
  1. Direct HTTP fetch (silent, no visible tab)
  2. WebBridge browser rendering fallback (localhost:10086)
```

## Quick Start

### Prerequisites

- Chrome / Edge / Brave / Arc / Chromium
- Node.js `>=18` (recommended)
- Python 3 (optional, fallback when Node.js is unavailable)
- Claude Code CLI available as `claude`

### 1. Load The Extension

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click `Load unpacked`
4. Select the `extension/` directory
5. Copy the extension ID (looks like `abcdefghijklmnop`)

### 2. Install The Native Host

Run from the repo root (replace `<ID>` with your extension ID):

```bash
node host/install.mjs --extensionId <ID>
```

The installer will automatically:

- Install the Native Messaging manifest
- Write `host/runtime-config.json`
- Create the local data directory
- Create `music.md` and `list.md`
- Create `cache/`, `cache/tracks/`, `cache/covers/`, and `cache/tts/`

### 3. Start Music Source (NeteaseCloudMusicApi)

Music playback depends on a locally running [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) service. The project has integrated this service in `services/ncm-api/`.

```bash
# Install dependencies (first time only)
cd services/ncm-api && npm install

# Start the service
npm start
```

The service runs on `http://localhost:3000` by default. No additional configuration is needed — the extension connects automatically.

### 4. Configure TTS (DJ Voice)

DJ recommendation speech requires a TTS service. Configure MiMo TTS to enable voice playback.

Create `tts-config.json` in your local data directory:

- macOS: `~/Documents/Claudefm/tts-config.json`
- Linux: `~/.local/share/Claudefm/tts-config.json`
- Windows: `%APPDATA%\Claudefm\tts-config.json`

```json
{
  "provider": "mimo",
  "api_key": "your-api-key-here"
}
```

Only `api_key` is required; all other fields use sensible defaults. Restart the browser after configuration.

> When `api_key` is empty, MiMo TTS is skipped and the host falls back to Claude TTS models.

### 5. Open The Side Panel

Click the extension icon and open Side Panel → Claudefm.

## Settings

Click the gear icon in the top-right corner of the side panel to open settings:

| Setting | Description |
|---------|-------------|
| DJ Name | Customize the DJ persona name (max 8 chars) |
| DJ Avatar | Change the DJ avatar image, shown beside assistant messages |
| My Name | Set your display nickname (max 8 chars) |
| My Avatar | Upload your avatar, shown beside your messages |
| Keep session on close | Preserve chat history when side panel is closed |
| DJ auto-play | When ON, DJ recommendations play immediately; when OFF, shows confirm buttons before playing |
| NCM API Base URL | NeteaseCloudMusicApi service address, defaults to `http://localhost:3000` |
| Local AI Tool | Auto-detect or manually select a local AI CLI tool |

## TTS Voice Synthesis

DJ segue text is converted to speech via TTS (Text-to-Speech). The host retrieves audio in the following priority:

1. **Local cache**: served directly from `cache/tts/` via a local HTTP server (bypasses Native Messaging size limits)
2. **MiMo TTS API**: calls the Xiaomi MiMo TTS endpoint to generate speech
3. **Claude TTS model fallback**: uses a locally configured Claude TTS model

### MiMo TTS Full Configuration

```json
{
  "provider": "mimo",
  "api_key": "your-api-key-here",
  "endpoint": "https://api.xiaomimimo.com/v1/chat/completions",
  "model": "mimo-v2.5-tts",
  "voice": "Milo",
  "style": "Voice style prompt"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `provider` | Fixed to `mimo` | `mimo` |
| `api_key` | MiMo API key (required) | — |
| `endpoint` | API URL | `https://api.xiaomimimo.com/v1/chat/completions` |
| `model` | Model name | `mimo-v2.5-tts` |
| `voice` | Voice name | `Milo` |
| `style` | Voice style prompt | empty |

### Audio Cache

Generated TTS audio is automatically cached in `cache/tts/` with SHA-1 hashed filenames. Identical text will not re-trigger an API request. On startup the host lazily boots a local HTTP server (`127.0.0.1:<random port>`) to serve cached audio to the extension, bypassing Native Messaging message size limits.

## Advanced Install Options

By default `--extensionId` is all you need. For custom data directories or host paths:

### CLI Arguments

```bash
node host/install.mjs --extensionId <ID> --dataDir /absolute/path/to/data
node host/install.mjs --config host/install-linux.json
```

### Platform Config Files

- macOS: `host/install-macos.json`
- Linux: `host/install-linux.json`
- Windows: `host/install-windows.json`

Minimal config:

```json
{
  "extensionId": "YOUR_EXTENSION_ID"
}
```

Full config:

```json
{
  "extensionId": "YOUR_EXTENSION_ID",
  "dataDir": "/absolute/path/to/Claudefm-data",
  "hostAbsolutePath": "/absolute/path/to/claudefm-host.sh"
}
```

## Default Local Data Directories

- macOS: `~/Documents/Claudefm`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/Claudefm`
- Windows: `%APPDATA%\Claudefm`

Typical contents:

- `music.md`: user music memory profile
- `list.md`: playlist history
- `cache/`: cached tracks, covers, and TTS audio (`cache/tts/`)

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

- Songs won't play (music source issue)
- Confirm NeteaseCloudMusicApi is running, default address `http://localhost:3000`
- Check "NCM API Base URL" in settings matches your service address
- Some premium songs require a NetEase Cloud Music account to get playback URLs; most free songs work without login

- DJ recommendation speech has no sound
- Confirm `api_key` is set in `tts-config.json`
- Confirm the file is in the correct directory (macOS default: `~/Documents/Claudefm/tts-config.json`)
- Restart the browser to apply the configuration

- Document-to-Podcast generation fails
- URL content fetching tries direct HTTP first; most SSR pages work without extra setup
- For JS-heavy pages, start Kimi WebBridge (localhost:10086) as a fallback renderer
- Podcast TTS synthesis depends on the TTS config — confirm `tts-config.json` is set up

- Need a custom data directory
- Set `dataDir` in the install config
- Or pass `--dataDir` to the installer

- Core files were deleted
- Re-run `node host/install.mjs`
- The host also keeps lightweight runtime safeguards for missing core files

## License

[MIT](./LICENSE)
