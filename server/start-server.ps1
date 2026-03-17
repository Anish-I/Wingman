#!/usr/bin/env pwsh
# Start Wingman server with automatic restart on crash

$maxAttempts = 10
$attempt = 0

while ($attempt -lt $maxAttempts) {
  $attempt++
  Write-Host "[attempt $attempt/$maxAttempts] Starting Wingman server..."
  
  & npm start
  
  $exitCode = $LASTEXITCODE
  Write-Host "[server] Process exited with code: $exitCode"
  
  if ($exitCode -eq 0) {
    Write-Host "[server] Clean shutdown"
    break
  }
  
  Write-Host "[server] Waiting 3 seconds before restart..."
  Start-Sleep -Seconds 3
}

Write-Host "[server] All attempts exhausted or clean shutdown"
exit $exitCode
