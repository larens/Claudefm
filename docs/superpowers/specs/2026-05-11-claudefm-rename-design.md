# Claudefm Full Rename Design

## Background

The repository root already uses `Claudefm`, but many internal identifiers still use the old brand `Claudefm`.

These old names currently appear in:

- extension display name and description
- native messaging host name and manifest file name
- shell and batch launcher file names
- default runtime data directory names
- log file names
- environment variable prefixes
- package names, prompt text, and exported markdown headings
- existing design documentation and README files

The user requested a full rename from `Claudefm` to `Claudefm`, including files, protocol names, generated artifacts, and default local storage locations.

## Goals

- Replace all active product-facing and implementation-facing `Claudefm` identifiers with `Claudefm`
- Rename protocol and installation artifacts, not just UI text
- Rename launcher files and generated manifest names
- Rename default runtime data directories and log file names
- Keep the repository internally consistent after the rename

## Non-Goals

- No backward compatibility layer for old `Claudefm` installations
- No fallback to old host names, old registry keys, or old data directories
- No automatic migration from old local data paths
- No attempt to preserve old native messaging registrations

## Naming Rules

The rename must be done consistently in these forms:

- display brand: `Claudefm`
- lowercase identifier: `claudefm`
- environment variable prefix: `CLAUDEFM`
- native messaging host name: `com.claudefm.host`

Anything still using `Claudefm`, `claudefm`, or `CLAUDEFM` after the change is considered a bug unless it is in git history or an intentionally preserved historical note.

## Scope

### 1. Extension Surface

Update the extension-facing brand everywhere:

- extension manifest display name
- description text
- browser action title
- in-panel and background status messages
- user-visible initialization messages

### 2. Native Host Protocol

Use the new protocol identity everywhere:

- native messaging host name: `com.claudefm.host`
- generated manifest file name: `com.claudefm.host.json`
- Windows registry target keys updated to the new host name
- allowed origins manifest content preserved, but attached to the new host name

This is intentionally breaking. Users must reinstall the native host after the rename.

### 3. Launcher Files And Host Artifacts

Use these active launcher file names:

- `host/claudefm-host.sh`
- `host/claudefm-host.cmd`

Use these app and host-branded artifact names where they are part of the active repo surface:

- `host/ClaudefmHost.swift`
- `host/ClaudefmHost.app`

Any references to those old file names in installer logic, docs, and local absolute paths must be updated together.

### 4. Runtime Data Paths

Use these default runtime storage directories:

- macOS: `~/Documents/Claudefm`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/Claudefm`
- Windows: `%APPDATA%\Claudefm`

Use these associated log destinations:

- macOS: `~/Library/Logs/ClaudefmHost.log`
- Linux: `${XDG_STATE_HOME:-~/.local/state}/Claudefm/ClaudefmHost.log`
- Windows: `%TEMP%\ClaudefmHost.log`

No compatibility or migration behavior will be added. The new runtime will use only the new paths.

### 5. Code Identifiers

Use the new branded code symbols and constants consistently:

- helper names such as `getClaudefmFolder()`
- default path helpers
- host names and installer constants
- log constants
- prompt text headings such as `Claudefm Memory`
- user-agent strings using the old product name

Use these environment variable names:

- `CLAUDEFM_DATA_DIR`
- `CLAUDEFM_TTS_MODEL`

Because this is a breaking rename, old env vars are not read.

### 6. Documentation

Update all active docs to the new brand:

- `README.md`
- `README.en.md`
- current spec documents that describe active architecture or install behavior

The content should describe only `Claudefm`, not mixed branding.

## Files To Rename

The implementation is expected to rename at least these tracked paths:

- `host/claudefm-host.sh`
- `host/claudefm-host.cmd`
- `host/ClaudefmHost.swift`
- `host/ClaudefmHost.app`

Additional files may need renaming if they embed the old brand directly in a tracked filename or active bundle directory.

Generated and ignored files should also switch naming conventions:

- `host/runtime-config.json` remains generic and can stay as-is
- generated manifest file name changes to `com.claudefm.host.json`

## Installer Changes

The installer must be updated so that:

- the default host launcher path points at the renamed launcher files
- the written manifest uses the new host name
- the generated manifest filename uses the new host name
- the printed installation summary says `Claudefm`
- the default runtime directory points at `Claudefm`
- the environment variable override key uses `CLAUDEFM_DATA_DIR`

On Windows, the registry key path must use:

- `HKCU\Software\...\NativeMessagingHosts\com.claudefm.host`

## Runtime Changes

All runtime entry points must agree on the new naming:

- `host/install.mjs`
- `host/host.cjs`
- `host/host.js`
- `host/host.py`
- shell/batch launchers
- extension background integration

This prevents install/runtime mismatch after the rename.

## Expected Breaking Changes

After implementation:

- old browser native host registrations stop working
- users must run the installer again
- old local data directories are no longer read
- users who want old data must move it manually to the new `Claudefm` directory
- old custom automation that references old file names or host names will break until updated

These are intentional outcomes of the chosen scope.

## Validation Plan

### Repository Checks

- search the repo for remaining `Claudefm`, `claudefm`, and `CLAUDEFM`
- verify only historical notes or intentionally untouched non-active artifacts remain, if any

### Static Checks

- `node --check host/install.mjs`
- `node --check host/host.cjs`
- `node --check host/host.js`
- `python3 -m py_compile host/host.py`

### Functional Checks

- run `node host/install.mjs`
- confirm the generated manifest file is `com.claudefm.host.json`
- confirm default output paths use `Claudefm`
- confirm the extension host name matches the installer-generated host name

### Manual Consistency Checks

- README examples use only the new names
- extension manifest display strings use only the new names
- launcher file references match their renamed filenames
- log names and user-agent strings use the new names

## Acceptance Criteria

- The active codebase no longer uses `Claudefm` naming for product identity or runtime protocol
- Native Messaging host name is `com.claudefm.host`
- Default runtime data directories use `Claudefm`
- Log files use `ClaudefmHost.log`
- Launcher filenames use `claudefm-host.*`
- Extension manifest and UI display `Claudefm`
- README files and active spec docs use `Claudefm`
- Static validation passes after the rename

## Implementation Order

1. Rename protocol constants and installer outputs
2. Rename runtime path helpers and env vars
3. Rename launcher files and bundle/app references
4. Rename extension display strings and host integration references
5. Rewrite docs and specs
6. Run full validation and repo-wide search

## Risk Notes

- File renames are the highest-risk part because installer defaults and doc examples depend on them
- Renaming the host name is the highest external breaking change
- Renaming data directories without migration is the highest user-impacting behavior change

Those risks are acceptable because the user explicitly chose full rename with no compatibility.
