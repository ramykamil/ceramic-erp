@echo off
title Ceramic ERP Launcher
echo ===========================================
echo   Starting Ceramic ERP System
echo ===========================================

echo.
echo.
echo Starting Backend Server...
start "Ceramic ERP Backend" cmd /k "cd backend && npm run dev || pause"

echo Waiting for backend to initialize...
timeout /t 5 /nobreak >nul

echo.
echo Installing Frontend Dependencies (if missing)...
cd frontend
if not exist "node_modules" (
    call npm install
)
cd ..

echo Starting Frontend Server...
start "Ceramic ERP Frontend" cmd /k "cd frontend && npm run dev || pause"

echo Waiting for frontend to be ready...
timeout /t 10 /nobreak >nul

echo.
echo Launching Browser...
start "" "http://localhost:3000"

echo.
echo ===========================================
echo   Application is running!
echo ===========================================
echo DO NOT CLOSE the two minimized command windows.
echo You can minimize this window too.
echo.
pause
