@echo off
echo ========================================
echo    RESET ALL DATA - CERAMIC ERP
echo ========================================
echo.
echo This will DELETE all:
echo   - Sales / Orders
echo   - Purchases
echo   - Inventory
echo   - Customer balances
echo   - Supplier balances
echo.
echo Press any key to continue or close this window to cancel...
pause > nul
echo.
echo Running reset...
cd /d "%~dp0"
node reset_all_data.js
echo.
echo ========================================
echo Press any key to close...
pause > nul
