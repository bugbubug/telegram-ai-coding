#!/bin/bash
# 会话结束时自动记录变更摘要到 .claude/memory/

MEMORY_DIR=".claude/memory"
mkdir -p "$MEMORY_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SUMMARY_FILE="$MEMORY_DIR/session_${TIMESTAMP}.md"

echo "# Session Summary — $(date)" > "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "## Changed Files" >> "$SUMMARY_FILE"
git diff --name-only HEAD 2>/dev/null >> "$SUMMARY_FILE" || echo "No git changes" >> "$SUMMARY_FILE"
echo "" >> "$SUMMARY_FILE"
echo "## Staged Files" >> "$SUMMARY_FILE"
git diff --cached --name-only 2>/dev/null >> "$SUMMARY_FILE" || echo "None" >> "$SUMMARY_FILE"
