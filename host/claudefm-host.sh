#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

HOME="${HOME:-$(eval echo "~")}"
ORIGINAL_PATH="${PATH:-}"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.npm-global/bin:${HOME}/.local/bin:${HOME}/.bun/bin:${HOME}/.cargo/bin:${ORIGINAL_PATH}"

if [ "$(uname -s)" = "Darwin" ]; then
  LOG_DIR="${HOME}/Library/Logs"
else
  LOG_DIR="${XDG_STATE_HOME:-${HOME}/.local/state}/Claudefm"
fi
LOG_FILE="${LOG_DIR}/ClaudefmHost.log"
mkdir -p "${LOG_DIR}" >/dev/null 2>&1 || true

if [ -z "${CLAUDE_BIN:-}" ]; then
  if command -v claude >/dev/null 2>&1; then
    CLAUDE_BIN="$(command -v claude)"
  elif command -v zsh >/dev/null 2>&1; then
    CLAUDE_BIN="$(zsh -lc 'command -v claude 2>/dev/null || true')"
  elif command -v bash >/dev/null 2>&1; then
    CLAUDE_BIN="$(bash -lc 'command -v claude 2>/dev/null || true')"
  else
    CLAUDE_BIN=""
  fi
fi
export CLAUDE_BIN

PY_BIN="${PY_BIN:-}"
if [ -z "${PY_BIN}" ]; then
  if command -v python3 >/dev/null 2>&1; then PY_BIN="$(command -v python3)"; fi
fi

if [ -n "${PY_BIN}" ] && [ -f "${DIR}/host.py" ]; then
  exec "${PY_BIN}" "${DIR}/host.py" 2>>"${LOG_FILE}"
fi

NODE_BIN="${NODE_BIN:-}"
if [ -z "${NODE_BIN}" ]; then
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"; fi
fi
if [ -z "${NODE_BIN}" ] && [ -x "/opt/homebrew/bin/node" ]; then NODE_BIN="/opt/homebrew/bin/node"; fi
if [ -z "${NODE_BIN}" ] && [ -x "/usr/local/bin/node" ]; then NODE_BIN="/usr/local/bin/node"; fi
if [ -z "${NODE_BIN}" ] && [ -x "/usr/bin/node" ]; then NODE_BIN="/usr/bin/node"; fi

if [ -z "${NODE_BIN}" ]; then
  echo "ClaudefmHost: node not found. Please install Node.js (>=18) and retry." 1>&2
  exit 127
fi

exec "${NODE_BIN}" "${DIR}/host.cjs" 2>>"${LOG_FILE}"
