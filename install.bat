@echo off
echo ===========================================
echo   Ceramic ERP - Installation Script
echo ===========================================
echo.

echo [1/3] Installing Backend Dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo Error installing backend dependencies!
    pause
    exit /b %errorlevel%
)
cd ..
echo Backend dependencies installed.
echo.

echo [2/3] Installing Frontend Dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo Error installing frontend dependencies!
    pause
    exit /b %errorlevel%
)

echo [3/3] Building Frontend Application...
echo This process may take a few minutes. Please wait...
call npm run build
if %errorlevel% neq 0 (
    echo Error building frontend!
    pause
    exit /b %errorlevel%
)
cd ..

echo.
echo ===========================================
echo   Installation Complete Successfully!
echo ===========================================
echo You can now use 'start_app.bat' to launch the application.
pause
