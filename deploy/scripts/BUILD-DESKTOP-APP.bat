@echo off
chcp 65001 >nul
title Création de l'application Desktop - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║            Création de l'Application Desktop                ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0
set DESKTOP_APP_DIR=%SCRIPT_DIR%..\desktop-app

echo [1/4] Vérification de Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo ❌ ERREUR: Node.js n'est pas installé!
    pause
    exit /b 1
)
echo ✅ Node.js trouvé

echo.
echo [2/4] Installation des dépendances Electron...
cd /d "%DESKTOP_APP_DIR%"
call npm install
if errorlevel 1 (
    echo ❌ ERREUR: Installation des dépendances échouée
    pause
    exit /b 1
)
echo ✅ Dépendances installées

echo.
echo [3/4] Construction de l'application...
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
echo ║  L'installateur se trouve dans:                             ║
echo ║  desktop-app\dist\Allaoua Ceram ERP Setup.exe               ║
echo ║                                                              ║
echo ║  Double-cliquez dessus pour installer l'application         ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Ouvrir le dossier dist
explorer "%DESKTOP_APP_DIR%\dist"

pause
