#!/bin/bash
# Codex Bot Builder - Codex describes what it wants, this builds a Claude Code agent for it
# Usage: ./codex-bot-builder.sh "description of what the bot should do"
# Or:    codex exec "use codex-bot-builder to create a bot that monitors PRs"

WINGMAN_DIR="C:/Users/ivatu/Wingman"
BOTS_DIR="$WINGMAN_DIR/bots"
CLAUDE_CMD="claude"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

mkdir -p "$BOTS_DIR"

if [ -z "$1" ]; then
  echo -e "${RED}Usage: codex-bot-builder.sh \"<bot description>\"${NC}"
  echo ""
  echo "Examples:"
  echo "  ./codex-bot-builder.sh \"a bot that monitors SECURITY-AUDIT.md and fixes one issue every 4 hours\""
  echo "  ./codex-bot-builder.sh \"a bot that reviews all new commits and posts feedback to telegram\""
  echo "  ./codex-bot-builder.sh \"a bot that runs e2e tests on the expo app and reports failures\""
  exit 1
fi

DESCRIPTION="$1"
BOT_SLUG=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | cut -c1-40 | sed 's/-$//')
BOT_DIR="$BOTS_DIR/$BOT_SLUG"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo -e "${GREEN}Creating bot: ${BOT_SLUG}${NC}"
echo -e "${YELLOW}Description: ${DESCRIPTION}${NC}"
echo ""

mkdir -p "$BOT_DIR"

# Generate the bot prompt file
cat > "$BOT_DIR/prompt.md" << PROMPT_EOF
# Bot: $BOT_SLUG
Created: $TIMESTAMP
Description: $DESCRIPTION

## Instructions for Claude Code

You are an autonomous bot. Your job:

$DESCRIPTION

## Working Directory
$WINGMAN_DIR

## Rules
1. Read relevant files before making changes
2. Run type-checks or tests after changes
3. Git add specific files (not -A), commit with descriptive message, push to origin main
4. Report what you did and what's left
5. If something fails, report the error — don't retry blindly
6. One focused task per run

## Project Context
- Server: Express on port 3001 at $WINGMAN_DIR/server
- Mobile: Expo app at $WINGMAN_DIR/mobile-v2
- Security audit: $WINGMAN_DIR/SECURITY-AUDIT.md
- Git remote: https://github.com/Anish-I/Wingman.git (branch: main)
PROMPT_EOF

# Generate the runner script
cat > "$BOT_DIR/run.sh" << 'RUN_EOF'
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
RUN_EOF

chmod +x "$BOT_DIR/run.sh"

# Generate a one-liner for Codex to kick it off
cat > "$BOT_DIR/codex-trigger.sh" << TRIGGER_EOF
#!/bin/bash
# Codex can run this to trigger the bot
# Usage: codex exec "run $BOT_DIR/codex-trigger.sh"
cd "$WINGMAN_DIR"
unset CLAUDECODE
bash "$BOT_DIR/run.sh"
TRIGGER_EOF

chmod +x "$BOT_DIR/codex-trigger.sh"

# Generate OpenClaw cron job config
cat > "$BOT_DIR/openclaw-cron.json" << CRON_EOF
{
  "name": "bot-$BOT_SLUG",
  "description": "$DESCRIPTION",
  "schedule": "every 4 hours",
  "command": "Use the coding-agent skill to spawn Claude Code. Have it follow the instructions in $BOT_DIR/prompt.md",
  "delivery": {
    "channel": "telegram",
    "to": "5006911570"
  }
}
CRON_EOF

echo ""
echo -e "${GREEN}Bot created at: $BOT_DIR${NC}"
echo ""
echo "Files:"
echo "  prompt.md          - Bot instructions (edit to customize)"
echo "  run.sh             - Run the bot manually"
echo "  codex-trigger.sh   - Let Codex trigger it"
echo "  openclaw-cron.json - OpenClaw cron config (manual add)"
echo "  runs/              - Execution logs"
echo ""
echo -e "${YELLOW}Quick start:${NC}"
echo "  Manual:  bash $BOT_DIR/run.sh"
echo "  Codex:   codex exec \"bash $BOT_DIR/codex-trigger.sh\""
echo "  Cron:    Add to OpenClaw cron via Telegram"
echo ""
echo -e "${GREEN}Done.${NC}"
