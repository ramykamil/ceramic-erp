@echo off
title Ceramic ERP - Installation Client
color 0B

echo.
echo ============================================================
echo    CERAMIC ERP - CONFIGURATION POSTE CLIENT
echo ============================================================
echo.
echo    Ce script va creer un raccourci pour acceder
echo    au systeme Ceramic ERP depuis cet ordinateur.
echo.
echo ============================================================
echo.

set /p SERVER_IP="Entrez l'adresse IP du serveur (ex: 192.168.1.100): "

if "%SERVER_IP%"=="" (
    echo [ERREUR] Vous devez entrer une adresse IP!
    pause
    exit /b 1
)

echo.
echo [INFO] Test de connexion au serveur...
ping -n 1 %SERVER_IP% >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [AVERTISSEMENT] Le serveur ne repond pas au ping.
    echo                 Verifiez que le serveur est allume.
    echo.
    set /p CONTINUE="Voulez-vous continuer quand meme? (O/N): "
    if /I not "%CONTINUE%"=="O" exit /b 1
)

echo.
echo [INFO] Creation du raccourci sur le bureau...

:: Get desktop path
for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop 2^>nul') do set DESKTOP=%%B

:: Create shortcut using PowerShell
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Ceramic ERP.lnk'); $Shortcut.TargetPath = 'http://%SERVER_IP%:3000'; $Shortcut.IconLocation = 'shell32.dll,14'; $Shortcut.Description = 'Ceramic ERP - Systeme de Gestion'; $Shortcut.Save()"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ============================================================
    echo    INSTALLATION TERMINEE!
    echo ============================================================
    echo.
    echo    Un raccourci "Ceramic ERP" a ete cree sur votre bureau.
    echo.
    echo    Double-cliquez dessus pour acceder au systeme.
    echo.
    echo    Adresse du serveur: http://%SERVER_IP%:3000
    echo.
    echo ============================================================
    echo.
    
    set /p OPEN_NOW="Ouvrir Ceramic ERP maintenant? (O/N): "
    if /I "%OPEN_NOW%"=="O" start http://%SERVER_IP%:3000
) else (
    echo [ERREUR] La creation du raccourci a echoue.
)

echo.
pause
