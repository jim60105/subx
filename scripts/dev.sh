#!/usr/bin/env bash
# Copyright (C) 2026 Jim Chen <Jim@ChenJ.im>, licensed under GPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
# ==================================================================
#
# dev.sh — canonical dev launcher for subx (frontend + backend, one command).
#
# Usage:  npm run dev:app          (from the repository root)
#         DEV_PORT=NNNN npm run dev:app   to sweep an extra port (the dev
#         server port itself is fixed by devUrl in src-tauri/tauri.conf.json)
#
# Why this exists: `tauri dev`'s file watcher only covers src-tauri/, and its
# process tree (tauri CLI -> vite -> cargo -> target/debug/subx) survives when
# only the outer command is killed. A surviving stale app process re-serves an
# old webview session, so newly merged code never appears even after restarts.
# This script guarantees exactly one dev instance, always running the latest
# code: it sweeps ALL leftovers from any previous dev session BEFORE launching.
#
# Do NOT add an EXIT/TERM trap that sweeps again on shutdown: a dying instance
# sweeping globally races with and kills the successor instance (observed in
# this repo: launch N+1 killed launch N via launch N's exit trap).
#
# After launch: frontend changes hot-reload via vite HMR (vite watches src/);
# backend changes rebuild + restart the app via tauri's src-tauri watcher.

# ------------------------------------------------------------------
# 1. Utility functions
# ------------------------------------------------------------------

RED='\033[0;31m'; YELLOW='\033[1;33m'; GRAY='\033[0;90m'; RESET='\033[0m'

log_info() { printf '%b[dev] %b\n' "${GRAY}" "$*${RESET}"; }
log_warn() { printf '%bWARNING: %b\n' "${YELLOW}" "$*${RESET}" >&2; }
log_error() { printf '%bERROR: %b\n' "${RED}" "$*${RESET}" >&2; }

check_dependencies() {
  local tool
  for tool in npm pkill fuser; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      log_error "$tool is required but not installed"
      exit 1
    fi
  done
}

# ------------------------------------------------------------------
# 2. Core logic
# ------------------------------------------------------------------

# Wait until the dev-server port has no active listener.
# Returns 0 once free; returns 1 if still busy after ~10 seconds.
wait_for_port() {
  local port="$1" attempt
  for attempt in {1..20}; do
    fuser "${port}/tcp" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  return 1
}

# Kill every leftover dev process from any previous session: the compiled
# debug app (main tree and any worktree), the tauri CLI, vite servers, and
# anything still holding the dev-server port.
sweep_leftovers() {
  local port="$1"
  pkill -f 'target/debug/subx' 2>/dev/null
  pkill -f 'tauri dev' 2>/dev/null
  pkill -f 'node_modules/\.bin/vite' 2>/dev/null
  fuser -k "${port}/tcp" 2>/dev/null
  wait_for_port "$port" || return 1
  return 0
}

# ------------------------------------------------------------------
# 3. Main execution
# ------------------------------------------------------------------

main() {
  local repo_root port
  repo_root="$(cd "$(dirname "$0")/.." && pwd)"
  cd "$repo_root" || { log_error "cannot enter repository root $repo_root"; exit 1; }

  check_dependencies

  port="${DEV_PORT:-1420}"
  log_info "sweeping leftovers from previous dev sessions..."
  if ! sweep_leftovers "$port"; then
    log_warn "port $port still busy after sweep; the old instance may survive"
  fi

  log_info "launching tauri dev (vite + rust watch)..."
  npm run tauri dev
}

# ------------------------------------------------------------------
# 4. Entrypoint (no parameters; configuration via DEV_PORT env var)
# ------------------------------------------------------------------

main "$@"
