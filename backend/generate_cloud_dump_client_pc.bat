@echo off
setlocal
echo ==========================================================
echo Ceramic ERP - Client PC Remote Network Backup Script
echo ==========================================================
echo.
echo This script will remotely connect to the Main Server PC over 
echo your local Wi-Fi/LAN and extract a complete database backup.
echo.

:: 1. Ask the User for the Main Server PC's IP Address
set /p DB_HOST="Enter the Main Server PC's IP Address (e.g., 192.168.1.53): "

if "%DB_HOST%"=="" (
    echo Error: You must enter the IP address of the Main PC.
    pause
    exit /b 1
)

:: Database Connection Details
set PGPASSWORD=postgres
set DB_USER=postgres
set DB_NAME=ceramic_erp
set BACKUP_FILE=cloud_migration_dump_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql

:: 2. Find pg_dump.exe on this specific Client PC
set "PGDUMP_EXE="

:: Check 64-bit Program Files
for %%v in (18 17 16 15 14 13 12 11 10) do (
    if exist "C:\Program Files\PostgreSQL\%%v\bin\pg_dump.exe" (
        set "PGDUMP_EXE=C:\Program Files\PostgreSQL\%%v\bin\pg_dump.exe"
        goto :found
    )
)

:: Check 32-bit Program Files (x86)
for %%v in (18 17 16 15 14 13 12 11 10) do (
    if exist "C:\Program Files (x86)\PostgreSQL\%%v\bin\pg_dump.exe" (
        set "PGDUMP_EXE=C:\Program Files (x86)\PostgreSQL\%%v\bin\pg_dump.exe"
        goto :found
    )
)

:found
if "%PGDUMP_EXE%"=="" (
    echo.
    echo [ERROR] PostgreSQL is NOT installed on this Client PC.
    echo Please install PostgreSQL first so we can use its network backup tools,
    echo or simply run 'generate_cloud_dump.bat' directly on the Main Server PC!
    echo.
    pause
    exit /b 1
)

echo.
echo Found PostgreSQL tools at: %PGDUMP_EXE%
echo Attempting to connect over network to Main Server at: %DB_HOST%
echo Exporting remote database '%DB_NAME%' to '%BACKUP_FILE%'...
echo.

:: 3. Run the export command connecting to the custom IP instead of localhost
"%PGDUMP_EXE%" -U %DB_USER% -h %DB_HOST% -d %DB_NAME% -F p -f "%BACKUP_FILE%"

if not errorlevel 1 (
    echo.
    echo ✅ Remote Backup successful!
    echo.
    echo The file %BACKUP_FILE% is now ready on this computer.
    echo Please run 'upload_to_cloud.bat' next.
    echo.
) else (
    echo.
    echo ❌ Backup failed. 
    echo Please make sure the IP address is correct and the Main PC is turned on.
)

pause
