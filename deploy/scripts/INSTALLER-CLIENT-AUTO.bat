@echo off
chcp 65001 >nul
title Configuration Client ERP - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║              Configuration Automatique Client               ║
echo ║          ⚡ Détection Automatique du Serveur ⚡             ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SERVER_PORT=3000

:: Essayer le premier serveur
set SERVER_IP=192.168.0.164
echo [1/4] Test du serveur principal (%SERVER_IP%)...
ping -n 1 -w 1000 %SERVER_IP% >nul 2>&1
if not errorlevel 1 (
    echo      ✅ Serveur %SERVER_IP% trouvé!
    goto :FOUND
)
echo      ❌ Serveur %SERVER_IP% non disponible

:: Essayer le second serveur
set SERVER_IP=192.168.0.179
echo [2/4] Test du serveur secondaire (%SERVER_IP%)...
ping -n 1 -w 1000 %SERVER_IP% >nul 2>&1
if not errorlevel 1 (
    echo      ✅ Serveur %SERVER_IP% trouvé!
    goto :FOUND
)
echo      ❌ Serveur %SERVER_IP% non disponible

:: Aucun serveur trouvé
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║               ⚠️  AUCUN SERVEUR TROUVÉ                       ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Les serveurs suivants ne sont pas accessibles:             ║
echo ║    - 192.168.0.164                                          ║
echo ║    - 192.168.0.179                                          ║
echo ║                                                              ║
echo ║  Vérifiez que:                                              ║
echo ║    1. Le serveur ERP est allumé                             ║
echo ║    2. Vous êtes connecté au même réseau                     ║
echo ║    3. Le câble réseau est branché                           ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.
echo Voulez-vous créer le raccourci quand même? (O/N)
set /p CONTINUE="> "
if /i not "%CONTINUE%"=="O" (
    echo Installation annulée.
    pause
    exit /b 1
)
set SERVER_IP=192.168.0.164
goto :CREATE_SHORTCUT

:FOUND
echo.

:CREATE_SHORTCUT
set ERP_URL=http://%SERVER_IP%:%SERVER_PORT%

echo [3/4] Création du raccourci sur le Bureau...

set SHORTCUT_NAME=Allaoua Ceram ERP
set DESKTOP=%USERPROFILE%\Desktop

:: Créer un fichier .url (raccourci internet)
echo [InternetShortcut] > "%DESKTOP%\%SHORTCUT_NAME%.url"
echo URL=%ERP_URL% >> "%DESKTOP%\%SHORTCUT_NAME%.url"
echo IconIndex=0 >> "%DESKTOP%\%SHORTCUT_NAME%.url"

echo [4/4] Configuration terminée!

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ✅ INSTALLATION RÉUSSIE                   ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Un raccourci "Allaoua Ceram ERP" a été créé sur le Bureau  ║
echo ║                                                              ║
echo ║  Serveur utilisé: %SERVER_IP%                             ║
echo ║  Adresse: %ERP_URL%                         ║
echo ║                                                              ║
echo ║  Double-cliquez sur le raccourci pour accéder à l'ERP      ║
echo ║                                                              ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Proposer d'ouvrir l'ERP maintenant
echo Voulez-vous ouvrir l'ERP maintenant? (O/N)
set /p OPEN_NOW="> "
if /i "%OPEN_NOW%"=="O" (
    start "" "%ERP_URL%"
    echo.
    echo 🌐 Ouverture de l'ERP dans votre navigateur...
)

echo.
echo Appuyez sur une touche pour fermer...
pause >nul
