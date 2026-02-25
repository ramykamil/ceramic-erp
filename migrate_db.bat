@echo off
echo Running Database Migration...
cd backend
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
:: Run the script located in src/scripts/
node src/scripts/update_margin_types.js
echo.
echo Migration Finished.
pause
