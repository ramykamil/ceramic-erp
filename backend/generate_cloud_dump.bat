@echo off
setlocal
echo ==========================================================
echo Ceramic ERP - Cloud Database Migration Script
echo ==========================================================
echo.
echo This script will create a complete backup of your local database
echo ready to be imported into Supabase or Neon.tech.
echo.

set PGPASSWORD=postgres
set DB_USER=postgres
set DB_NAME=ceramic_erp
set BACKUP_FILE=cloud_migration_dump_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql

:: Dynamically find pg_dump.exe since it's not in the PATH
set "PGDUMP_EXE="
for %%v in (17 16 15 14 13 12 11 10) do (
    if exist "C:\Program Files\PostgreSQL\%%v\bin\pg_dump.exe" (
        set "PGDUMP_EXE=C:\Program Files\PostgreSQL\%%v\bin\pg_dump.exe"
        goto :found
    )
)

:found
if "%PGDUMP_EXE%"=="" (
    echo [ERROR] Could not automatically find PostgreSQL installation.
    echo Please add 'C:\Program Files\PostgreSQL\YOUR_VERSION\bin' to your system PATH.
    pause
    exit /b 1
)

echo Found pg_dump at: %PGDUMP_EXE%
echo Exporting database '%DB_NAME%' to '%BACKUP_FILE%'...
"%PGDUMP_EXE%" -U %DB_USER% -h localhost -d %DB_NAME% -F p -f "%BACKUP_FILE%"

if not errorlevel 1 (
    echo.
    echo ✅ Backup successful!
    echo.
    echo Next Steps for Supabase/Neon:
    echo 1. Open your Cloud Database Dashboard (Supabase/Neon)
    echo 2. Find the "SQL Editor" or "Query Tool"
    echo 3. Open the generated file: %BACKUP_FILE%
    echo 4. Copy and paste the contents into the SQL Editor and Run it.
    echo.
) else (
    echo.
    echo ❌ Backup failed. Is PostgreSQL running locally?
)

pause
