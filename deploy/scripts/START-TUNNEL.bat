@echo off
chcp 65001 >nul
title Tunnel Cloudflare - Allaoua Ceram ERP

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║              🌐 Démarrage du Tunnel Cloudflare              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0
set TOOLS_DIR=%SCRIPT_DIR%..\tools
set CONFIG_DIR=%SCRIPT_DIR%..\config
set CLOUDFLARED=%TOOLS_DIR%\cloudflared.exe

:: Vérifier que cloudflared est installé
if not exist "%CLOUDFLARED%" (
    echo ❌ cloudflared.exe non trouvé!
    echo    Exécutez d'abord SETUP-TUNNEL.bat pour l'installer.
    echo.
    pause
    exit /b 1
)

:: Vérifier le mode configuré
set TUNNEL_MODE=quick
if exist "%CONFIG_DIR%\tunnel_mode.txt" (
    set /p TUNNEL_MODE=<"%CONFIG_DIR%\tunnel_mode.txt"
)

if "%TUNNEL_MODE%"=="named" goto :START_NAMED

:: ============================================
:: MODE RAPIDE (Quick Tunnel)
:: ============================================
:START_QUICK

echo Mode: Tunnel Rapide (URL aléatoire gratuite)
echo.
echo ════════════════════════════════════════════════════════════════
echo  Le tunnel démarre... Attendez l'URL ci-dessous.
echo  ⚠️  NE FERMEZ PAS cette fenêtre!
echo ════════════════════════════════════════════════════════════════
echo.
echo L'URL publique apparaîtra ci-dessous (cherchez "trycloudflare.com"):
echo.

"%CLOUDFLARED%" tunnel --url http://localhost:3000

:: Si on arrive ici, le tunnel s'est arrêté
echo.
echo ⚠️  Le tunnel s'est arrêté.
pause
exit /b 0

:: ============================================
:: MODE PERMANENT (Named Tunnel)
:: ============================================
:START_NAMED

:: Lire le hostname
set HOSTNAME=
if exist "%CONFIG_DIR%\tunnel_hostname.txt" (
    set /p HOSTNAME=<"%CONFIG_DIR%\tunnel_hostname.txt"
)

echo Mode: Tunnel Permanent
if defined HOSTNAME echo URL:  https://%HOSTNAME%
echo.
echo ════════════════════════════════════════════════════════════════
echo  Le tunnel démarre...
echo  ⚠️  NE FERMEZ PAS cette fenêtre!
echo ════════════════════════════════════════════════════════════════
echo.

"%CLOUDFLARED%" tunnel --config "%CONFIG_DIR%\cloudflared.yml" run ceramic-erp

:: Si on arrive ici, le tunnel s'est arrêté
echo.
echo ⚠️  Le tunnel s'est arrêté.
pause
exit /b 0
