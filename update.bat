@echo off
title Installer Mise a jour 1.2
color 1F
echo ========================================================
echo      INSTALLATION MISE A JOUR 1.2 - CERAMIC ERP
echo ========================================================
echo.
echo 1. Arret des processus existants...
taskkill /F /IM node.exe /T 2>nul

echo.
echo 2. Copie des fichiers...
xcopy /Y /S /E "backend" "..\backend\"
xcopy /Y /S /E "frontend" "..\frontend\"
copy /Y "start_app_safe.bat" "..\"
copy /Y "run_silent.vbs" "..\"
copy /Y "start_servers.bat" "..\"
copy /Y "UPDATE_SCHEMA_1_2.sql" "..\"

echo.
echo 3. Mise a jour terminee.
echo.
echo IMPORTANT:
echo Veuillez ouvrir pgAdmin 4 et executer le script 
echo "UPDATE_SCHEMA_1_2.sql" pour mettre a jour la base de donnees.
echo.
echo Une fois la base de donnees a jour, vous pouvez relancer
echo l'application avec "start_app_safe.bat".
echo.
pause
