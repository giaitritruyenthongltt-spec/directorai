# DirectorAI Context Engine — Quick Start
# Usage: .\tools\start-context.ps1 [port]

param([int]$Port = 8000)

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host ""
Write-Host "DirectorAI Context Engine" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host "Port: $Port"
Write-Host ""

Set-Location "apps\context-engine"

if (-not (Test-Path ".venv")) {
    Write-Host "Creating .venv with Python 3.11..." -ForegroundColor Yellow
    uv venv --python 3.11
}

Write-Host "Installing deps..." -ForegroundColor Yellow
uv pip install --quiet fastapi "uvicorn[standard]" pydantic pydantic-settings structlog httpx tenacity python-multipart pillow anthropic

Write-Host ""
Write-Host "Starting context engine on http://127.0.0.1:$Port (Ctrl+C to stop)..." -ForegroundColor Green
Write-Host ""

uv run uvicorn "directorai_context.main:app" --host "127.0.0.1" --port $Port --reload

Set-Location "..\..\"
