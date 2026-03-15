#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="telegram-ai-manager"
ENV_NAME="${ENV:-local}"
RUNTIME_ROOT="$PROJECT_ROOT/.runtime/$PROJECT_NAME/$ENV_NAME"
PID_FILE="$RUNTIME_ROOT/pids/app.pid"
LOG_FILE="$RUNTIME_ROOT/logs/app.log"
HEALTH_FILE="$RUNTIME_ROOT/state/health.env"

if [ -f "$HEALTH_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$HEALTH_FILE"
  set +a
fi

HEALTH_HOST="${RUNTIME_HEALTH_HOST:-127.0.0.1}"
HEALTH_PORT="${RUNTIME_HEALTH_PORT:-43117}"

if [ ! -f "$PID_FILE" ]; then
  echo "Status: stopped"
  echo "Logs:   $LOG_FILE"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "$PID" ] || ! kill -0 "$PID" >/dev/null 2>&1; then
  echo "Status: stale pid file"
  echo "Logs:   $LOG_FILE"
  exit 1
fi

echo "Status: running"
echo "PID:    $PID"
echo "Logs:   $LOG_FILE"
echo "Health: http://$HEALTH_HOST:$HEALTH_PORT/healthz"

if curl -fsS "http://$HEALTH_HOST:$HEALTH_PORT/healthz" >/dev/null 2>&1; then
  echo "Ready:  yes"
else
  echo "Ready:  no"
  exit 1
fi
