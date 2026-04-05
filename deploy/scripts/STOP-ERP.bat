@echo off
title Ceramic ERP - Arret...
color 0C

echo.
echo ========================================
echo    CERAMIC ERP - ARRET DU SYSTEME
echo ========================================
echo.

echo [INFO] Arret des serveurs...

:: Kill Node.js processes running our servers
taskkill /FI "WINDOWTITLE eq CeramicERP-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq CeramicERP-Frontend*" /F >nul 2>&1

:: Also try to kill by port (backup method)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo [OK] Ceramic ERP a ete arrete.
echo.
echo ========================================
echo.

timeout /t 3
