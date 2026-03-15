#!/bin/bash
set -euo pipefail

command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required"; exit 1; }

if ! command -v redis-cli >/dev/null 2>&1; then
  echo "redis-cli not found; Redis availability check will be skipped"
elif ! redis-cli ping >/dev/null 2>&1; then
  echo "Redis is not reachable; the app will fall back to the in-memory queue"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is recommended for node-pty and better-sqlite3 native builds"
fi

pnpm install
mkdir -p src/config data .runtime

if [ ! -f .env ]; then
  cp .env.example .env
fi
