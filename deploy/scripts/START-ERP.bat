@echo off
chcp 65001 >nul
title Démarrage ERP - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║                   Démarrage du Système                      ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Obtenir le chemin du dossier parent (ceramic-erp-platform)
set SCRIPT_DIR=%~dp0
set PROJECT_DIR=%SCRIPT_DIR%..\..

echo [INFO] Dossier du projet: %PROJECT_DIR%
echo.

:: Vérifier que Node.js est installé
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ ERREUR: Node.js n'est pas installé!
    echo    Veuillez installer Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js trouvé: 
node --version

:: Vérifier les dossiers
if not exist "%PROJECT_DIR%\backend" (
    echo ❌ ERREUR: Dossier backend non trouvé!
    pause
    exit /b 1
)
if not exist "%PROJECT_DIR%\frontend" (
    echo ❌ ERREUR: Dossier frontend non trouvé!
    pause
    exit /b 1
)

echo.
echo ════════════════════════════════════════════════════════════════
echo  DÉMARRAGE DU BACKEND (API)
echo ════════════════════════════════════════════════════════════════
echo.

:: Démarrer le backend dans une nouvelle fenêtre
start "ERP Backend - API Server" cmd /k "cd /d %PROJECT_DIR%\backend && echo Démarrage du serveur Backend... && npm start"

:: Attendre 3 secondes pour que le backend démarre
echo Attente du démarrage du backend (3 secondes)...
timeout /t 3 /nobreak >nul

echo.
echo ════════════════════════════════════════════════════════════════
echo  DÉMARRAGE DU FRONTEND (Interface Web)
echo ════════════════════════════════════════════════════════════════
echo.

:: Démarrer le frontend dans une nouvelle fenêtre
start "ERP Frontend - Web Interface" cmd /k "cd /d %PROJECT_DIR%\frontend && echo Démarrage du serveur Frontend... && npm start"

:: Attendre 5 secondes pour que le frontend démarre
echo Attente du démarrage du frontend (5 secondes)...
timeout /t 5 /nobreak >nul

echo.
echo ════════════════════════════════════════════════════════════════
echo  OUVERTURE DU NAVIGATEUR
echo ════════════════════════════════════════════════════════════════
echo.

:: Obtenir l'adresse IP locale
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set LOCAL_IP=%%b
        goto :found_ip
    )
)
:found_ip

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ✅ SYSTÈME DÉMARRÉ                        ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Backend API:  http://localhost:5000                        ║
echo ║  Frontend:     http://localhost:3000                        ║
echo ║                                                              ║
echo ║  Accès réseau: http://%LOCAL_IP%:3000                    ║
echo ║                                                              ║
echo ║  ⚠️  NE FERMEZ PAS les fenêtres CMD du serveur!             ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Ouvrir le navigateur
start "" "http://localhost:3000"

echo L'application s'ouvre dans votre navigateur...
echo.

:: ============================================
:: ACCÈS À DISTANCE (Cloudflare Tunnel)
:: ============================================
echo.
echo ════════════════════════════════════════════════════════════════
echo  ACCÈS À DISTANCE
echo ════════════════════════════════════════════════════════════════
echo.

set TUNNEL_SCRIPT=%SCRIPT_DIR%START-TUNNEL.bat
set CLOUDFLARED=%SCRIPT_DIR%..\tools\cloudflared.exe

if not exist "%CLOUDFLARED%" (
    echo ℹ️  Accès à distance non configuré.
    echo    Pour l'activer: exécutez SETUP-TUNNEL.bat
    echo.
    goto :END
)

echo Voulez-vous activer l'accès à distance? (O/N)
set /p TUNNEL_CHOICE="> "
if /i "%TUNNEL_CHOICE%"=="O" (
    echo.
    echo 🌐 Démarrage du tunnel d'accès à distance...
    start "ERP Tunnel - Accès à Distance" cmd /k "call "%TUNNEL_SCRIPT%""
    echo ✅ Tunnel démarré dans une nouvelle fenêtre.
    echo    ⚠️  Ne fermez pas la fenêtre du tunnel!
)

:END
echo.
echo Appuyez sur une touche pour fermer cette fenêtre (les serveurs resteront actifs)...
pause >nul
