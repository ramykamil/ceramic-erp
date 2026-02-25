@echo off
setlocal
echo ==========================================================
echo Ceramic ERP - Direct Cloud Database Uploader
echo ==========================================================
echo.
echo This script will upload your local database directly to your
echo Supabase or Neon.tech database, bypassing the browser limit.
echo.

:: 1. Ask user for the connection string
set /p "CLOUD_DB_URL=Paste your Cloud Database Connection String (postgres://...): "

if not defined CLOUD_DB_URL (
    echo Error: You must provide a connection string.
    pause
    exit /b 1
)

:: 2. Find the most recent backup file
set "LATEST_BACKUP="
for /f "delims=" %%I in ('dir /b /o-d cloud_migration_dump_*.sql 2^>nul') do (
    set "LATEST_BACKUP=%%I"
    goto :found_backup
)

:found_backup
if "%LATEST_BACKUP%"=="" (
    echo [ERROR] Could not find any cloud_migration_dump_*.sql files.
    echo Please run 'generate_cloud_dump.bat' first.
    pause
    exit /b 1
)

:: 3. Find psql.exe
set "PSQL_EXE="
for %%v in (17 16 15 14 13 12 11 10) do (
    if exist "C:\Program Files\PostgreSQL\%%v\bin\psql.exe" (
        set "PSQL_EXE=C:\Program Files\PostgreSQL\%%v\bin\psql.exe"
        goto :found_psql
    )
)

:found_psql
if "%PSQL_EXE%"=="" (
    echo [ERROR] Could not automatically find psql.exe.
    pause
    exit /b 1
)

echo.
echo Found backup file: %LATEST_BACKUP%
echo Starting upload to cloud database...
echo Please wait, this might take a minute...
echo.

:: 4. Run the upload command
"%PSQL_EXE%" -d "%CLOUD_DB_URL%" -f "%LATEST_BACKUP%"

if not errorlevel 1 (
    echo.
    echo ✅ Upload completed successfully!
    echo Check your Cloud Dashboard to verify the tables exist.
) else (
    echo.
    echo ❌ Upload encountered errors. Check the messages above.
)

pause
