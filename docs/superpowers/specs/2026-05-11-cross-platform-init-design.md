# Cross-Platform Init Design

## Background

Claudiofm already has a cross-platform native host installer entry at `host/install.mjs`, but the repository and runtime behavior still lean toward macOS assumptions:

- README text and examples are centered on macOS.
- The installer only reads `host/install-macos.json`.
- Runtime data paths are still hard-coded around `~/Documents/Claudiofm` in multiple places.
- Some initialization is done lazily during runtime, while some installation details are done up front.

The goal of this change is to keep the existing macOS experience working, while making Linux and Windows first-class supported targets in both documentation and initialization behavior.

## Goals

- Keep `node host/install.mjs` as the single recommended installation entry point.
- Add clear Linux and Windows setup documentation alongside macOS instructions.
- Generate required initialization files during installation instead of waiting for first runtime use.
- Move runtime data storage to platform-native default directories.
- Keep host runtime logic tolerant of missing files by retaining lightweight `ensure...` safeguards.

## Non-Goals

- No change to the extension UI or user-facing features.
- No new installer GUI or packaged desktop app.
- No migration of existing user data beyond a simple best-effort compatibility path.
- No change to the Claude prompt design beyond paths and initialization behavior needed for this work.

## User Experience

### Install Flow

The user will:

1. Load `extension/` as an unpacked extension.
2. Copy the extension ID.
3. Edit the platform-specific install config or pass `--extensionId`.
4. Run `node host/install.mjs`.
5. Receive a success summary showing:
   - native host manifest location
   - runtime data directory
   - files/directories created
   - any warnings or manual next steps

### First-Run Experience

After installation succeeds:

- the host manifest is already installed for the current platform
- the runtime data root already exists
- `music.md` already exists from the template
- `list.md` already exists
- `cache/`, `cache/tracks/`, and `cache/covers/` already exist

The first browser-side interaction should not need to create core files unless the user deleted them later.

## Platform Defaults

### Runtime Data Root

Default runtime data root will be:

- macOS: `~/Documents/Claudiofm`
- Linux: `$XDG_DATA_HOME/Claudiofm`, fallback `~/.local/share/Claudiofm`
- Windows: `%APPDATA%\Claudiofm`

This keeps macOS behavior unchanged while making Linux and Windows follow their native conventions.

### Override Strategy

The design will support an optional override for advanced users:

- environment variable: `CLAUDIOFM_DATA_DIR`
- install config field: `dataDir`
- install CLI arg: `--dataDir <absolute-path>`

Precedence:

1. CLI arg
2. config field
3. environment variable
4. platform default

The README should describe this as an advanced option, not the default path.

## Files To Add Or Update

### New Files

- `host/install-linux.json`
- `host/install-windows.json`
- `docs/superpowers/specs/2026-05-11-cross-platform-init-design.md`

Optional but recommended:

- a small generated `README.txt` or `README.md` inside the runtime data root to explain the purpose of the local files

### Updated Files

- `README.md`
- `README.en.md`
- `host/install.mjs`
- `host/host.js`
- `host/host.py`
- `host/claudiofm-host.sh`
- `host/claudiofm-host.cmd`

## Config Design

### Install Config Files

The installer will look for a config file in this order:

1. `--config <path>`
2. `host/install-<platform>.json`
3. backward-compatible fallback: `host/install-macos.json`

Supported fields:

```json
{
  "extensionId": "your_extension_id",
  "extensionIds": ["your_extension_id"],
  "hostAbsolutePath": "/absolute/path/to/launcher",
  "dataDir": "/absolute/path/to/runtime-data"
}
```

Notes:

- `extensionId` and `extensionIds` keep current compatibility.
- `hostAbsolutePath` remains available for advanced cases.
- `dataDir` is optional and mainly for development or power users.

## Installation Responsibilities

`host/install.mjs` will be refactored into explicit steps.

### Step 1: Resolve Inputs

- detect current platform
- load config file
- parse CLI args
- normalize extension IDs
- resolve host launcher path
- resolve runtime data directory

### Step 2: Prepare Runtime Data Root

Create the runtime data root and these children:

- `cache/`
- `cache/tracks/`
- `cache/covers/`

Create these files if missing:

- `music.md`
- `list.md`
- optional local data readme

Initialization rules:

- do not overwrite existing `music.md`
- do not overwrite existing `list.md`
- create missing directories idempotently
- print created vs reused items in the installer output

### Step 3: Install Native Messaging Manifest

Current platform-specific manifest writing behavior remains, with these updates:

- manifest path writing stays platform-native
- manifest `path` still points at the launcher script for the active platform
- installer output includes which browser locations were written successfully

### Step 4: Print Result Summary

The installer should end with a readable summary such as:

- platform
- config file used
- launcher path
- runtime data root
- created items
- skipped existing items
- warnings

## Runtime Path Design

### Shared Path Resolver

Both `host/host.js` and `host/host.py` need a single logical concept:

- `getClaudiofmDataDir()`

Each runtime implementation will resolve the data directory using the same precedence described above, with identical defaults per platform.

Helpers should then derive:

- `music.md`
- `list.md`
- `cache/`
- `cache/tracks/`
- `cache/covers/`
- per-platform log file path

### Logging Paths

Current logging is macOS-centric. Logging should become:

- macOS: `~/Library/Logs/ClaudiofmHost.log`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/Claudiofm/ClaudiofmHost.log`
- Windows: `%TEMP%\ClaudiofmHost.log`

Shell launchers should resolve log file locations consistently with the active platform.

## Compatibility Strategy

### macOS

- Preserve current default data location: `~/Documents/Claudiofm`
- Preserve current launcher behavior and install command
- Preserve current `install-macos.json` support

### Linux And Windows

- Document supported browsers and install locations explicitly
- Provide config templates so users do not need to guess file names
- Ensure install output tells the user where local data was created

### Existing Data Migration

To keep scope controlled, migration is intentionally minimal.

Behavior:

- if the new default data root exists, use it
- if it does not exist but a legacy macOS-style location exists on the same machine, optionally print a warning rather than auto-move
- do not silently copy or delete user data during this iteration

This avoids accidental data duplication or destructive moves.

## Error Handling

Installer errors should be explicit and actionable.

Cases to cover:

- missing `extensionId`
- invalid or relative `dataDir` when an absolute path is required
- unsupported platform launcher path
- registry write failures on Windows
- manifest write permission failures
- template file missing for `music.md`

Each error message should include:

- what failed
- the path involved, when relevant
- what the user can do next

Warnings are preferred over hard failure when:

- one browser manifest location fails but others succeed
- optional local data readme cannot be created

## Documentation Structure

`README.md` and `README.en.md` should move to a truly cross-platform structure:

1. repo overview
2. prerequisites
3. load unpacked extension
4. install native host
5. platform-specific notes
6. runtime data directory layout
7. troubleshooting

The install section should show:

- default config file names by platform
- `node host/install.mjs`
- optional `--extensionId`
- optional `--config`
- optional `--dataDir`

The troubleshooting section should list per-platform manifest and log locations.

## Validation Plan

### Manual Validation

- macOS:
  - run installer with `install-macos.json`
  - confirm manifest written
  - confirm `music.md`, `list.md`, and cache folders created
  - confirm host still launches

- Linux:
  - run installer with `install-linux.json`
  - confirm manifest paths under `.config/.../NativeMessagingHosts`
  - confirm runtime data root under XDG path or fallback

- Windows:
  - run installer with `install-windows.json`
  - confirm manifest file written locally
  - confirm registry keys created
  - confirm runtime data root under `%APPDATA%`

### Regression Checks

- existing macOS setup path still works without passing extra args
- runtime `ensureMusicFile`, `ensureListFile`, and cache creation remain safe if files are deleted later
- README examples match actual file names and installer behavior

## Acceptance Criteria

- `node host/install.mjs` works as the main install command on macOS, Linux, and Windows.
- Repository docs clearly describe all three platforms.
- Platform-specific install config templates exist for macOS, Linux, and Windows.
- Installer creates required runtime directories and baseline files during installation.
- Runtime code no longer hard-codes `~/Documents/Claudiofm` for Linux and Windows.
- macOS keeps its current default data path and remains backward-compatible.

## Implementation Notes

Recommended implementation order:

1. Refactor path resolution into shared logic in `host/install.mjs`, `host/host.js`, and `host/host.py`
2. Add installer-side runtime data initialization
3. Add Linux and Windows config templates
4. Update launcher logging paths
5. Rewrite Chinese and English README files

This order reduces documentation drift because code behavior is stabilized before the docs are finalized.
