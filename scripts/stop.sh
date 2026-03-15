#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="telegram-ai-manager"
ENV_NAME="${ENV:-local}"
RUNTIME_ROOT="$PROJECT_ROOT/.runtime/$PROJECT_NAME/$ENV_NAME"
PID_FILE="$RUNTIME_ROOT/pids/app.pid"
LOG_DIR="$RUNTIME_ROOT/logs"
STOP_LOG_FILE="$LOG_DIR/stop.log"

mkdir -p "$LOG_DIR"

kill_pid() {
  local pid="$1"
  local signal="$2"
  kill "-$signal" "$pid" >/dev/null 2>&1 || return 1
}

wait_for_exit() {
  local pid="$1"
  local attempts="${2:-24}"
  local index
  for ((index = 0; index < attempts; index += 1)); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

stop_pid() {
  local pid="$1"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi

  kill_pid "$pid" TERM || true
  if ! wait_for_exit "$pid" 24; then
    kill_pid "$pid" KILL || true
    wait_for_exit "$pid" 8 || true
  fi
}

{
  printf '[%s] stopping project=%s env=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$PROJECT_NAME" "$ENV_NAME"
} >> "$STOP_LOG_FILE"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${PID:-}" ]; then
    echo "Stopping PID $PID"
    stop_pid "$PID"
  fi
  rm -f "$PID_FILE"
fi

STALE_PIDS="$(ps -Ao pid=,command= | awk -v root="$PROJECT_ROOT" '
  index($0, root) > 0 && ($0 ~ /src\/index\.ts/ || $0 ~ /dist\/index\.js/) { print $1 }
')"

if [ -n "$STALE_PIDS" ]; then
  while read -r pid; do
    if [ -z "$pid" ] || [ "$pid" = "$$" ]; then
      continue
    fi
    echo "Cleaning stale project process $pid"
    stop_pid "$pid"
  done <<< "$STALE_PIDS"
fi

echo "Stopped $PROJECT_NAME"
