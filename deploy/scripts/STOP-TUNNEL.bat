@echo off
chcp 65001 >nul
title Arrêt Tunnel - Allaoua Ceram ERP

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║              🛑 Arrêt du Tunnel Cloudflare                  ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Chercher et arrêter le processus cloudflared
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | findstr /i "cloudflared.exe" >nul
if errorlevel 1 (
    echo ℹ️  Aucun tunnel actif trouvé.
    echo.
    pause
    exit /b 0
)

echo Arrêt du tunnel en cours...
taskkill /IM cloudflared.exe /F >nul 2>&1

if errorlevel 1 (
    echo ❌ Erreur lors de l'arrêt du tunnel.
) else (
    echo ✅ Tunnel arrêté avec succès.
    echo    L'accès à distance est désactivé.
)

echo.
pause
exit /b 0
