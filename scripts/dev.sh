#!/usr/bin/env bash
# Canonical dev launcher for subx (frontend + backend, one command).
#
# Why this exists: `tauri dev`'s file watcher only covers src-tauri/, and its
# process tree (tauri CLI -> vite -> cargo -> target/debug/subx) survives when
# only the outer command is killed. A surviving stale app process re-serves an
# old webview session, so newly merged code never appears even after restarts.
# This script guarantees exactly one dev instance, always running the latest
# code: it sweeps ALL leftovers from any previous dev session BEFORE launching.
# Do NOT add an EXIT/TERM trap that sweeps again on shutdown: a dying instance
# sweeping globally races with and kills the successor instance (observed in
# this repo: launch N+1 killed launch N via launch N's exit trap).
#
# After launch: frontend changes hot-reload via vite HMR (vite watches src/);
# backend changes rebuild + restart the app via tauri's src-tauri watcher.
set -uo pipefail
cd "$(dirname "$0")/.."

sweep() {
  # Compiled debug app (main tree and any worktree), tauri CLI, vite servers.
  pkill -f 'target/debug/subx' 2>/dev/null
  pkill -f 'tauri dev' 2>/dev/null
  pkill -f 'node_modules/\.bin/vite' 2>/dev/null
  fuser -k 1420/tcp 2>/dev/null
  # Wait until the dev-server port is actually free (IPv4 + IPv6, TIME_WAIT ok).
  for _ in $(seq 1 20); do
    fuser 1420/tcp >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  echo "[dev.sh] WARNING: port 1420 still busy after sweep" >&2
}

echo "[dev.sh] sweeping leftovers from previous dev sessions..."
sweep
echo "[dev.sh] launching tauri dev (vite + rust watch)..."
npm run tauri dev
