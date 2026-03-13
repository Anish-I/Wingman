@echo off
REM Wingman AI Stack — Auto-start on boot
REM Starts: openclaw gateway + Claude Code (bypass permissions, all MCPs)

title Wingman AI Stack

REM Wait for network and services to be ready
timeout /t 10 /nobreak >nul

REM Start openclaw gateway in background (if not already running)
echo [Wingman] Starting openclaw gateway...
start /min "" cmd /c "openclaw gateway 2>nul"
timeout /t 5 /nobreak >nul

REM Launch Claude Code in Windows Terminal with bypass permissions
echo [Wingman] Starting Claude Code...
cd /d C:\Users\ivatu\Wingman
start "" wt.exe -w 0 nt --title "Claude Code" -- cmd /k "claude --dangerously-skip-permissions"

echo [Wingman] Stack started.
