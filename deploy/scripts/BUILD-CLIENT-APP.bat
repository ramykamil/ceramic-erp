@echo off
chcp 65001 >nul
title Création de l'Application Client - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║          Création de l'Application CLIENT                   ║
echo ║    (Pour les PC qui se connectent au serveur central)       ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0
set CLIENT_APP_DIR=%SCRIPT_DIR%..\desktop-app-client

echo ═══════════════════════════════════════════════════════════════
echo  CONFIGURATION DE L'ADRESSE IP DU SERVEUR
echo ═══════════════════════════════════════════════════════════════
echo.
echo  Avant de continuer, assurez-vous que l'adresse IP du serveur
echo  est correctement configurée dans:
echo.
echo  desktop-app-client\main.js (ligne 8)
echo.
echo  Actuellement configuré pour: 192.168.0.164
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

set /p CONTINUE="Continuer avec cette IP? (O/N): "
if /i not "%CONTINUE%"=="O" (
    echo.
    echo Modifiez l'IP dans desktop-app-client\main.js puis relancez ce script.
    pause
    exit /b 0
)

echo.
echo [1/3] Vérification de Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ ERREUR: Node.js n'est pas installé!
    pause
    exit /b 1
)
echo ✅ Node.js trouvé

echo.
echo [2/3] Installation des dépendances...
cd /d "%CLIENT_APP_DIR%"
call npm install
if errorlevel 1 (
    echo ❌ ERREUR: Installation des dépendances échouée
    pause
    exit /b 1
)
echo ✅ Dépendances installées

echo.
echo [3/3] Construction de l'application client...
echo     (Cela peut prendre plusieurs minutes)
echo.
call npm run build
if errorlevel 1 (
    echo ❌ ERREUR: Construction échouée
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ✅ CONSTRUCTION TERMINÉE                  ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  L'installateur CLIENT se trouve dans:                      ║
echo ║  desktop-app-client\dist\Allaoua Ceram ERP Setup.exe        ║
echo ║                                                              ║
echo ║  Copiez ce fichier sur les PC clients et installez-le!     ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Ouvrir le dossier dist
explorer "%CLIENT_APP_DIR%\dist"

pause
