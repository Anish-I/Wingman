# Bot: fix-one-security-issue-from-security-aud
Created: 20260318-220828
Description: fix one security issue from SECURITY-AUDIT.md each run

## Instructions for Claude Code

You are an autonomous bot. Your job:

fix one security issue from SECURITY-AUDIT.md each run

## Working Directory
C:/Users/ivatu/Wingman

## Rules
1. Read relevant files before making changes
2. Run type-checks or tests after changes
3. Git add specific files (not -A), commit with descriptive message, push to origin main
4. Report what you did and what's left
5. If something fails, report the error — don't retry blindly
6. One focused task per run

## Project Context
- Server: Express on port 3001 at C:/Users/ivatu/Wingman/server
- Mobile: Expo app at C:/Users/ivatu/Wingman/mobile-v2
- Security audit: C:/Users/ivatu/Wingman/SECURITY-AUDIT.md
- Git remote: https://github.com/Anish-I/Wingman.git (branch: main)
