#!/usr/bin/env bash
# ============================================================================
# scrub-secrets.sh — Remove leaked secrets from git history
# ============================================================================
#
# STATUS: COMPLETED (2026-03-22) — secrets purged via git filter-repo.
#         This script is kept for reference only.
#
# WHEN TO RUN: After confirming that all exposed credentials have been rotated.
# This rewrites git history, so coordinate with collaborators before running.
#
# USAGE:
#   bash scripts/scrub-secrets.sh
#   git push --force origin main
#
# WHAT IT DOES:
#   1. Replaces real secret values with [REDACTED] in all historical commits
#   2. Cleans up git refs and garbage-collects unreachable objects
#
# AFFECTED COMMITS:
#   - 14aea81 (SECURITY-AUDIT.md added with plaintext secrets)
#   - 82063f9 (redaction commit that still had secrets in the diff)
#
# ============================================================================

set -euo pipefail

# Secrets that were exposed in SECURITY-AUDIT.md (commit 14aea81)
# These MUST be rotated before or after running this script.
SECRETS=(
  # =====================================================================
  # DO NOT put real secrets here — they would be committed to the repo.
  # Instead, populate this array from a local .env or pass values via
  # environment variables before running the script.
  #
  # Example:
  #   export SCRUB_TWILIO_TOKEN="real-value-here"
  #   bash scripts/scrub-secrets.sh
  # =====================================================================
  "${SCRUB_TWILIO_TOKEN:?Set SCRUB_TWILIO_TOKEN}"                # Twilio auth token
  "${SCRUB_GEMINI_KEY:?Set SCRUB_GEMINI_KEY}"                    # Gemini API key
  "${SCRUB_COMPOSIO_KEY:?Set SCRUB_COMPOSIO_KEY}"                # Composio API key
  "${SCRUB_GOOGLE_SECRET:?Set SCRUB_GOOGLE_SECRET}"              # Google OAuth client secret
  "${SCRUB_TOGETHER_KEY:?Set SCRUB_TOGETHER_KEY}"                # Together AI key
  "${SCRUB_SUPABASE_PASS:?Set SCRUB_SUPABASE_PASS}"              # Supabase DB password
  "${SCRUB_TWILIO_SID:?Set SCRUB_TWILIO_SID}"                    # Twilio Account SID
)

echo "=== Scrubbing ${#SECRETS[@]} secrets from git history ==="
echo ""
echo "WARNING: This rewrites git history. All collaborators must re-clone or"
echo "         run 'git fetch --all && git reset --hard origin/main' after the"
echo "         force-push."
echo ""
read -r -p "Continue? [y/N] " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# Build the sed expression
SED_ARGS=""
for secret in "${SECRETS[@]}"; do
  SED_ARGS="$SED_ARGS -e 's/${secret}/[REDACTED]/g'"
done

git filter-branch --tree-filter "
  for f in \$(git diff-tree --no-commit-id --name-only -r HEAD); do
    if [ -f \"\$f\" ]; then
      eval sed -i $SED_ARGS \"\$f\" 2>/dev/null || true
    fi
  done
" --force -- --all

echo ""
echo "=== Cleaning up refs and garbage collecting ==="
git for-each-ref --format='delete %(refname)' refs/original/ | git update-ref --stdin
git reflog expire --expire=now --all
git gc --prune=now --aggressive

echo ""
echo "=== Done! ==="
echo "Verify with: git log --all -p -S 'REDACTED' | head -20"
echo "Then force-push: git push --force origin main"
