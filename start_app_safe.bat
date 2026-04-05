@echo off
title Ceramic ERP Launcher
echo ===========================================
echo   Starting Ceramic ERP System (Safe Mode)
echo ===========================================

echo.
echo 1. Stopping existing Application processes...
:: Kill specific ports 3000 and 5000 using PowerShell to avoid killing other Node apps
powershell -Command "Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"
powershell -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"

echo Ensuring ports are clear...
:: Wait loop (max 10s)
for /L %%i in (1,1,10) do (
    netstat -ano | find "5000" >nul
    if errorlevel 1 (
         netstat -ano | find "3000" >nul
         if errorlevel 1 goto :PortsClear
    )
    timeout /t 1 /nobreak >nul
)
:PortsClear

echo.
echo 2. Starting Servers in Background...
wscript.exe "run_silent.vbs" "start_servers.bat"

echo.
echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo Launching Browser...
start "" "http://localhost:3000"

echo.
echo ===========================================
echo   Application is running in background!
echo ===========================================
echo You can close this window.
pause
