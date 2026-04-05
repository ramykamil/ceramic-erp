@echo off
title Installation du Service CeramicERP
color 0B

echo.
echo ============================================================
echo    CERAMIC ERP - INSTALLATION DU SERVICE WINDOWS
echo ============================================================
echo.
echo    Ce script va installer CeramicERP comme un service Windows
echo    qui demarrera automatiquement au demarrage de l'ordinateur.
echo.
echo ============================================================
echo.

:: Check for admin rights
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Ce script necessite les droits administrateur!
    echo.
    echo Cliquez-droit sur ce fichier et selectionnez:
    echo "Executer en tant qu'administrateur"
    echo.
    pause
    exit /b 1
)

:: Get script directory
set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: Check for node-windows
echo [1/4] Verification de node-windows...
call npm list node-windows >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo      Installation de node-windows...
    call npm install node-windows
)

:: Install backend service
echo [2/4] Installation du service Backend...
node install-service.js install

:: Wait for service to start
timeout /t 5 /nobreak >nul

:: Build frontend if needed
echo [3/4] Preparation du Frontend...
cd ..\frontend

if not exist "node_modules" (
    echo      Installation des dependances...
    call npm install
)

if not exist ".next" (
    echo      Construction de l'application...
    call npm run build
)

cd ..\deploy\scripts

:: Create frontend service (using nssm or PM2 alternative)
echo [4/4] Configuration du demarrage automatique...

:: Create a scheduled task for frontend startup
schtasks /create /tn "CeramicERP-Frontend" /tr "cmd /c cd /d %SCRIPT_DIR%..\frontend && npm run start" /sc onstart /ru SYSTEM /f >nul 2>&1

echo.
echo ============================================================
echo    INSTALLATION TERMINEE!
echo ============================================================
echo.
echo    Le systeme Ceramic ERP est maintenant installe.
echo.
echo    Services installes:
echo    - CeramicERP-Backend (Service Windows)
echo    - CeramicERP-Frontend (Tache planifiee)
echo.
echo    Ouvrez votre navigateur: http://localhost:3000
echo.
echo ============================================================
echo.

:: Start frontend now
start /min cmd /c "title CeramicERP-Frontend && cd /d %SCRIPT_DIR%..\frontend && npm run start"

:: Open browser
start http://localhost:3000

pause
