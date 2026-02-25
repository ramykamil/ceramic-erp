@echo off
chcp 65001 >nul
title Configuration Tunnel Cloudflare - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║           Configuration du Tunnel Cloudflare                ║
echo ║            🌐 Accès à Distance Sécurisé 🌐                 ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SCRIPT_DIR=%~dp0
set TOOLS_DIR=%SCRIPT_DIR%..\tools
set CONFIG_DIR=%SCRIPT_DIR%..\config
set CLOUDFLARED=%TOOLS_DIR%\cloudflared.exe

:: ============================================
:: ÉTAPE 1: Télécharger cloudflared
:: ============================================

if exist "%CLOUDFLARED%" (
    echo ✅ cloudflared.exe déjà installé.
    echo.
    goto :CHECK_MODE
)

echo [1/3] Téléchargement de cloudflared...
echo.

:: Créer le dossier tools s'il n'existe pas
if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"

:: Télécharger cloudflared pour Windows 64-bit
set DOWNLOAD_URL=https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
echo    URL: %DOWNLOAD_URL%
echo    Destination: %CLOUDFLARED%
echo.

:: Utiliser PowerShell pour télécharger
powershell -Command "& { try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%DOWNLOAD_URL%' -OutFile '%CLOUDFLARED%' -UseBasicParsing; Write-Host '   ✅ Téléchargement réussi!' } catch { Write-Host '   ❌ Erreur de téléchargement:' $_.Exception.Message; exit 1 } }"

if not exist "%CLOUDFLARED%" (
    echo.
    echo ❌ Le téléchargement a échoué.
    echo    Vérifiez votre connexion internet et réessayez.
    echo    Ou téléchargez manuellement depuis:
    echo    %DOWNLOAD_URL%
    echo    et placez le fichier dans: %TOOLS_DIR%\cloudflared.exe
    pause
    exit /b 1
)

echo.
echo ✅ cloudflared.exe installé avec succès!
echo.

:: ============================================
:: ÉTAPE 2: Choisir le mode
:: ============================================

:CHECK_MODE
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                  CHOISIR LE MODE DE TUNNEL                  ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  [1] Mode Rapide (GRATUIT, sans compte Cloudflare)          ║
echo ║      → URL aléatoire: xxx.trycloudflare.com                ║
echo ║      → Parfait pour tester / utilisation occasionnelle      ║
echo ║      → L'URL change à chaque redémarrage                   ║
echo ║                                                              ║
echo ║  [2] Mode Permanent (nécessite un domaine + compte CF)     ║
echo ║      → URL fixe: erp.votre-domaine.com                     ║
echo ║      → Idéal pour utilisation quotidienne                   ║
echo ║      → Nécessite un compte Cloudflare gratuit               ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set /p MODE_CHOICE="Votre choix (1 ou 2): "

if "%MODE_CHOICE%"=="1" goto :SETUP_QUICK
if "%MODE_CHOICE%"=="2" goto :SETUP_NAMED
echo ❌ Choix invalide. Veuillez entrer 1 ou 2.
goto :CHECK_MODE

:: ============================================
:: MODE RAPIDE (Quick Tunnel)
:: ============================================
:SETUP_QUICK

:: Créer le dossier config s'il n'existe pas
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

:: Sauvegarder le mode choisi
echo quick > "%CONFIG_DIR%\tunnel_mode.txt"

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                 ✅ MODE RAPIDE CONFIGURÉ                    ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Aucune configuration supplémentaire nécessaire!            ║
echo ║                                                              ║
echo ║  Pour démarrer le tunnel:                                   ║
echo ║    → Exécutez START-TUNNEL.bat                              ║
echo ║    → Ou choisissez "Accès à distance" au démarrage de ERP  ║
echo ║                                                              ║
echo ║  Une URL publique sera générée automatiquement.             ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
pause
exit /b 0

:: ============================================
:: MODE PERMANENT (Named Tunnel)
:: ============================================
:SETUP_NAMED

echo.
echo [2/3] Connexion à votre compte Cloudflare...
echo    Une fenêtre de navigateur va s'ouvrir.
echo    Connectez-vous et autorisez l'accès.
echo.

"%CLOUDFLARED%" tunnel login

if errorlevel 1 (
    echo.
    echo ❌ La connexion à Cloudflare a échoué.
    echo    Veuillez réessayer.
    pause
    exit /b 1
)

echo.
echo ✅ Connexion réussie!
echo.

:: Créer le tunnel
echo [3/3] Création du tunnel "ceramic-erp"...
echo.

"%CLOUDFLARED%" tunnel create ceramic-erp

if errorlevel 1 (
    echo.
    echo ⚠️  Le tunnel existe peut-être déjà. Vérification...
    "%CLOUDFLARED%" tunnel list
    echo.
)

:: Obtenir l'ID du tunnel
for /f "tokens=1" %%i in ('"%CLOUDFLARED%" tunnel list ^| findstr "ceramic-erp"') do set TUNNEL_ID=%%i

echo.
echo ID du tunnel: %TUNNEL_ID%

:: Demander le sous-domaine
echo.
echo Entrez le sous-domaine que vous souhaitez utiliser.
echo Exemple: si votre domaine est "allaoua-ceram.com" et vous
echo entrez "erp", l'URL sera: erp.allaoua-ceram.com
echo.
set /p SUBDOMAIN="Sous-domaine (ex: erp): "
set /p DOMAIN="Domaine (ex: allaoua-ceram.com): "

set FULL_HOSTNAME=%SUBDOMAIN%.%DOMAIN%

:: Créer le dossier config
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

:: Créer le fichier de configuration
echo tunnel: %TUNNEL_ID% > "%CONFIG_DIR%\cloudflared.yml"
echo credentials-file: %USERPROFILE%\.cloudflared\%TUNNEL_ID%.json >> "%CONFIG_DIR%\cloudflared.yml"
echo. >> "%CONFIG_DIR%\cloudflared.yml"
echo ingress: >> "%CONFIG_DIR%\cloudflared.yml"
echo   - hostname: %FULL_HOSTNAME% >> "%CONFIG_DIR%\cloudflared.yml"
echo     service: http://localhost:3000 >> "%CONFIG_DIR%\cloudflared.yml"
echo   - service: http_status:404 >> "%CONFIG_DIR%\cloudflared.yml"

:: Sauvegarder le mode choisi
echo named > "%CONFIG_DIR%\tunnel_mode.txt"
echo %FULL_HOSTNAME% > "%CONFIG_DIR%\tunnel_hostname.txt"

:: Créer le routage DNS
echo.
echo Configuration DNS pour %FULL_HOSTNAME%...
"%CLOUDFLARED%" tunnel route dns ceramic-erp %FULL_HOSTNAME%

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║              ✅ TUNNEL PERMANENT CONFIGURÉ                  ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Tunnel ID: %TUNNEL_ID%
echo ║  URL:       https://%FULL_HOSTNAME%
echo ║                                                              ║
echo ║  Pour démarrer le tunnel:                                   ║
echo ║    → Exécutez START-TUNNEL.bat                              ║
echo ║    → Ou choisissez "Accès à distance" au démarrage de ERP  ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
pause
exit /b 0
