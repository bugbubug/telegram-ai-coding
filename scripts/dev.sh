#!/bin/bash
set -euo pipefail

if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  echo "Redis is unavailable; continuing with in-memory queue fallback"
fi

exec pnpm dev
