# DirectorAI MCP Server — Quick Start
# Usage: .\tools\start-server.ps1 [mock|uxp]
# Default: mock (no Premiere required)

param(
    [string]$AdapterMode = "mock",
    [int]$WsPort = 7778,
    [string]$LogLevel = "info"
)

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host ""
Write-Host "DirectorAI MCP Server" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host "Adapter : $AdapterMode" -ForegroundColor Yellow
Write-Host "WS port : $WsPort"
Write-Host "Log     : $LogLevel"
Write-Host ""

$env:CONTEXT_SERVER_WSPORT = $WsPort
$env:LOG_LEVEL = $LogLevel
$env:ADAPTER_MODE = $AdapterMode

# Load .env if it exists
if (Test-Path ".env") {
    Write-Host "Loading .env..." -ForegroundColor Green
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^([^#][^=]*)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim())
        }
    }
}

Write-Host "Starting server (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host ""

# If dist/index.js exists, run compiled version; else use tsx for dev
if (Test-Path "apps\server\dist\index.js") {
    node "apps\server\dist\index.js"
} else {
    pnpm exec tsx "apps\server\src\index.ts"
}
