#!/bin/bash
# Auto-generated bot runner
BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPT_FILE="$BOT_DIR/prompt.md"
LOG_FILE="$BOT_DIR/runs/$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$BOT_DIR/runs"

echo "[$(date)] Bot starting..." | tee "$LOG_FILE"

# Unset CLAUDECODE to allow nested Claude Code
unset CLAUDECODE

# Run Claude Code with the prompt
claude -p "$(cat "$PROMPT_FILE")" \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=$?
echo "[$(date)] Bot finished with exit code $EXIT_CODE" | tee -a "$LOG_FILE"
