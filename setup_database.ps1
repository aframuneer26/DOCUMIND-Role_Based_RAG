# DocuMind RAG - PostgreSQL Setup Script
# Run this script in PowerShell to create the database and all tables
# Usage: .\setup_database.ps1

$PSQL = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$PG_USER = "postgres"

Write-Host "`n=== DocuMind RAG - Database Setup ===" -ForegroundColor White
Write-Host "PostgreSQL 18 detected at: $PSQL`n" -ForegroundColor Gray

# Prompt for password securely
$securePassword = Read-Host "Enter your PostgreSQL password for user 'postgres'" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$PG_PASSWORD = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$env:PGPASSWORD = $PG_PASSWORD

Write-Host "`n[1/3] Creating database 'RagAdv'..." -ForegroundColor Cyan
& $PSQL -U $PG_USER -c "CREATE DATABASE \"RagAdv\";" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Database may already exist, continuing..." -ForegroundColor Yellow
}

Write-Host "`n[2/3] Running schema setup..." -ForegroundColor Cyan
& $PSQL -U $PG_USER -d RagAdv -f "database\setup.sql" 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[3/3] Verifying tables..." -ForegroundColor Cyan
    & $PSQL -U $PG_USER -d RagAdv -c "\dt" 2>&1

    Write-Host "`n=== SUCCESS! Database setup complete ===" -ForegroundColor Green
    Write-Host "Tables created: users, documents, document_access, document_chunks, query_logs" -ForegroundColor Gray
    Write-Host "`nNow update your .env files with this password and start the services." -ForegroundColor White
} else {
    Write-Host "`n=== ERROR: Schema setup failed. Check the output above. ===" -ForegroundColor Red
}

# Clean up
$env:PGPASSWORD = ""
