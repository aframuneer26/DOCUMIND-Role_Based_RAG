# DocuMind RAG - Start All Services
# Run this from the project root: .\start_all.ps1

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== DocuMind RAG - Starting All Services ===" -ForegroundColor Cyan
Write-Host "Project root: $root`n" -ForegroundColor Gray

# 1. Start Python RAG Service (port 8000)
Write-Host "[1/3] Starting Python RAG Service on port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; .\myenv\Scripts\Activate.ps1; cd python_service; python main.py" -WindowStyle Normal

Start-Sleep -Seconds 2

# 2. Start Node.js Backend (port 5001)
Write-Host "[2/3] Starting Node.js Backend on port 5001..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 2

# 3. Start Vite Frontend (port 3030)
Write-Host "[3/3] Starting Vite Frontend on port 3030..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

Write-Host "`n=== All services started! ===" -ForegroundColor Green
Write-Host ">>> Open your browser at: http://localhost:3030 <<<" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services:" -ForegroundColor White
Write-Host "  Frontend  -> http://localhost:3030" -ForegroundColor Gray
Write-Host "  Backend   -> http://localhost:5001" -ForegroundColor Gray  
Write-Host "  Python    -> http://localhost:8000" -ForegroundColor Gray
Write-Host "  DB Health -> http://localhost:5001/health" -ForegroundColor Gray
Write-Host ""
