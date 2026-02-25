@echo off
TITLE Mise a jour Ceramic ERP - Catalogue Performance
COLOR 0A

echo ===================================================
echo   MISE A JOUR CERAMIC ERP - PACK PERFORMANCE
echo ===================================================
echo.
echo Ce script va mettre a jour l'application avec les ameliorations de vitesse.
echo Assurez-vous d'etre dans le dossier contenant l'application ou modifiez
echo le chemin ci-dessous.
echo.

set "APP_DIR=%CD%"
echo Dossier actuel : %APP_DIR%
echo.
pause

echo 1. Arret de l'application...
call type NUL > .maintenance
taskkill /F /IM node.exe >nul 2>&1
echo Application arretee.
echo.

echo 2. Copie des fichiers...
xcopy /E /Y /I "backend" "%APP_DIR%\backend"
xcopy /E /Y /I "frontend" "%APP_DIR%\frontend"
echo Fichiers copies.
echo.

echo 3. Installation des dependances (si besoin)...
cd backend
call npm install
cd ..
echo Dependances verifiees.
echo.

echo 4. Execution du script SQL...
echo Veuillez executer "UPDATE_CATALOGUE_INDEXES.sql" manuellement dans pgAdmin 4
echo pour une vitesse maximale.
echo.

echo 5. Redemarrage...
del .maintenance
start /B npm run start:prod
echo.

echo ===================================================
echo   MISE A JOUR TERMINEE !
echo ===================================================
echo.
pause
