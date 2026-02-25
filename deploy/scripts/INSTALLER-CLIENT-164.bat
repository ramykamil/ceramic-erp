@echo off
chcp 65001 >nul
title Configuration Client ERP - Allaoua Ceram

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ALLAOUA CERAM ERP                        ║
echo ║              Configuration Automatique Client               ║
echo ║                  Serveur: 192.168.0.164                     ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

set SERVER_IP=192.168.0.164
set SERVER_PORT=3000
set ERP_URL=http://%SERVER_IP%:%SERVER_PORT%

echo [1/3] Test de connexion au serveur...
ping -n 1 %SERVER_IP% >nul 2>&1
if errorlevel 1 (
    echo.
    echo ⚠️  ATTENTION: Le serveur %SERVER_IP% n'est pas accessible.
    echo     Vérifiez que:
    echo     - Le serveur ERP est allumé
    echo     - Vous êtes sur le même réseau
    echo     - Le pare-feu autorise la connexion
    echo.
    echo     Le raccourci sera créé quand même.
    echo.
    pause
)

echo [2/3] Création du raccourci sur le Bureau...

:: Créer le raccourci avec VBScript
set SHORTCUT_NAME=Allaoua Ceram ERP
set DESKTOP=%USERPROFILE%\Desktop

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\CreateShortcut.vbs"
echo sLinkFile = "%DESKTOP%\%SHORTCUT_NAME%.url" >> "%TEMP%\CreateShortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\CreateShortcut.vbs"
echo oLink.TargetPath = "%ERP_URL%" >> "%TEMP%\CreateShortcut.vbs"
echo oLink.Save >> "%TEMP%\CreateShortcut.vbs"

cscript //nologo "%TEMP%\CreateShortcut.vbs"
del "%TEMP%\CreateShortcut.vbs"

:: Aussi créer un fichier .url simple (plus fiable)
echo [InternetShortcut] > "%DESKTOP%\%SHORTCUT_NAME%.url"
echo URL=%ERP_URL% >> "%DESKTOP%\%SHORTCUT_NAME%.url"
echo IconIndex=0 >> "%DESKTOP%\%SHORTCUT_NAME%.url"

echo [3/3] Configuration terminée!

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                    ✅ INSTALLATION RÉUSSIE                   ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║                                                              ║
echo ║  Un raccourci "Allaoua Ceram ERP" a été créé sur le Bureau  ║
echo ║                                                              ║
echo ║  Adresse du serveur: %ERP_URL%              ║
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
