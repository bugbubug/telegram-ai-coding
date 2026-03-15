#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_NAME="telegram-ai-manager"
ENV_NAME="${ENV:-local}"
RUNTIME_ROOT="$PROJECT_ROOT/.runtime/$PROJECT_NAME/$ENV_NAME"
PID_DIR="$RUNTIME_ROOT/pids"
LOG_DIR="$RUNTIME_ROOT/logs"
STATE_DIR="$RUNTIME_ROOT/state"
PID_FILE="$PID_DIR/app.pid"
LOG_FILE="$LOG_DIR/app.log"
START_LOG_FILE="$LOG_DIR/start.log"
HEALTH_FILE="$STATE_DIR/health.env"
MODE="dist"

for argument in "$@"; do
  case "$argument" in
    --mode=tsx)
      MODE="tsx"
      ;;
    --mode=dist)
      MODE="dist"
      ;;
    *)
      echo "Unknown argument: $argument" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$PID_DIR" "$LOG_DIR" "$STATE_DIR"

if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env"
  set +a
fi

HEALTH_HOST="${RUNTIME_HEALTH_HOST:-127.0.0.1}"
HEALTH_PORT="${RUNTIME_HEALTH_PORT:-43117}"

printf 'RUNTIME_HEALTH_HOST=%s\nRUNTIME_HEALTH_PORT=%s\n' "$HEALTH_HOST" "$HEALTH_PORT" > "$HEALTH_FILE"

kill_pid() {
  local pid="$1"
  local signal="$2"
  if kill "-$signal" "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

wait_for_exit() {
  local pid="$1"
  local attempts="${2:-20}"
  local index
  for ((index = 0; index < attempts; index += 1)); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

stop_stale_pid() {
  if [ ! -f "$PID_FILE" ]; then
    return
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -z "$pid" ]; then
    rm -f "$PID_FILE"
    return
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    rm -f "$PID_FILE"
    return
  fi

  echo "Stopping existing $PROJECT_NAME process: $pid"
  kill_pid "$pid" TERM || true
  if ! wait_for_exit "$pid" 24; then
    kill_pid "$pid" KILL || true
    wait_for_exit "$pid" 8 || true
  fi
  rm -f "$PID_FILE"
}

stop_stale_project_processes() {
  local candidates
  candidates="$(ps -Ao pid=,command= | awk -v root="$PROJECT_ROOT" '
    index($0, root) > 0 && ($0 ~ /src\/index\.ts/ || $0 ~ /dist\/index\.js/) { print $1 }
  ')"

  if [ -z "$candidates" ]; then
    return
  fi

  while read -r pid; do
    if [ -z "$pid" ] || [ "$pid" = "$$" ]; then
      continue
    fi
    echo "Cleaning stale project process: $pid"
    kill_pid "$pid" TERM || true
    wait_for_exit "$pid" 16 || kill_pid "$pid" KILL || true
  done <<< "$candidates"
}

wait_for_ready() {
  local attempts=40
  local index
  for ((index = 0; index < attempts; index += 1)); do
    if curl -fsS "http://$HEALTH_HOST:$HEALTH_PORT/healthz" >/dev/null 2>&1; then
      return 0
    fi

    if [ -f "$PID_FILE" ]; then
      local pid
      pid="$(cat "$PID_FILE" 2>/dev/null || true)"
      if [ -n "$pid" ] && ! kill -0 "$pid" >/dev/null 2>&1; then
        return 1
      fi
    fi

    sleep 0.5
  done
  return 1
}

resolve_ready_pid() {
  curl -fsS "http://$HEALTH_HOST:$HEALTH_PORT/healthz" \
    | sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p'
}

if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
  echo "Redis is unavailable; continuing with in-memory queue fallback" | tee -a "$START_LOG_FILE"
fi

stop_stale_pid
stop_stale_project_processes

if [ "$MODE" = "tsx" ]; then
  START_CMD=("$PROJECT_ROOT/node_modules/.bin/tsx" src/index.ts)
else
  START_CMD=(node dist/index.js)
fi

: > "$LOG_FILE"
{
  printf '[%s] starting mode=%s health=%s:%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$MODE" "$HEALTH_HOST" "$HEALTH_PORT"
  printf '[%s] command=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${START_CMD[*]}"
} >> "$START_LOG_FILE"

(
  cd "$PROJECT_ROOT"
  nohup env \
    RUNTIME_HEALTH_HOST="$HEALTH_HOST" \
    RUNTIME_HEALTH_PORT="$HEALTH_PORT" \
    "${START_CMD[@]}" >>"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
)

if ! wait_for_ready; then
  echo "Application failed to become ready. See $LOG_FILE" | tee -a "$START_LOG_FILE" >&2
  if [ -f "$PID_FILE" ]; then
    "$SCRIPT_DIR/stop.sh" >/dev/null 2>&1 || true
  fi
  exit 1
fi

READY_PID="$(resolve_ready_pid)"
if [ -n "$READY_PID" ]; then
  echo "$READY_PID" > "$PID_FILE"
fi

echo "Started $PROJECT_NAME ($MODE) with PID $(cat "$PID_FILE")"
echo "Health: http://$HEALTH_HOST:$HEALTH_PORT/healthz"
echo "Logs:   $LOG_FILE"
