# DirectorAI — Start All Services
# Starts MCP server + Context Engine in separate windows
# Usage: .\tools\start-all.ps1

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
$root = (Get-Location).Path

Write-Host ""
Write-Host "DirectorAI — Starting all services" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Start MCP server in new window
Write-Host "Starting MCP server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-File", "$root\tools\start-server.ps1"

Start-Sleep -Seconds 1

# Start context engine in new window
Write-Host "Starting context engine..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-File", "$root\tools\start-context.ps1"

Write-Host ""
Write-Host "Services starting in separate windows." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Load panel in UDT: apps\panel\dist\manifest.json" -ForegroundColor Gray
Write-Host "  2. Open Premiere Pro 2024" -ForegroundColor Gray
Write-Host "  3. Window -> Extensions -> DirectorAI" -ForegroundColor Gray
Write-Host "  4. Or: connect Claude Desktop (see CLAUDE_DESKTOP.md)" -ForegroundColor Gray
Write-Host ""
