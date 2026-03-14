# PowerShell wrapper for AI PR review
# Usage: .\scripts\review-pr.ps1 <PR_NUMBER>

param(
    [Parameter(Mandatory=$true, Position=0)]
    [int]$PRNumber
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Running AI review for PR #$PRNumber..." -ForegroundColor Cyan

Push-Location $ProjectRoot
try {
    node scripts/review-pr.js $PRNumber
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Review failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
