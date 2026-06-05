@echo off
title Stop Review Game
cls

echo ==========================================================
echo                STOPPING REVIEW GAME PROCESSES
echo ==========================================================
echo.

:: 1. Stop Vite Server by Port (5173)
echo [INFO] Checking for local Vite server on port 5173...
set "found_port=0"
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do (
    set "found_port=1"
    echo [INFO] Stopping Vite server process (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)
if "%found_port%"=="1" (
    echo [SUCCESS] Vite server stopped.
) else (
    echo [INFO] No active Vite server detected on port 5173.
)
echo.

:: 2. Stop Vite Server Window
taskkill /F /T /FI "WINDOWTITLE eq ReviewGameServer*" >nul 2>&1

:: 3. Stop Electron App Window and processes
echo [INFO] Checking for running Electron processes...
taskkill /F /T /FI "WINDOWTITLE eq ReviewGameElectron*" >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Electron application stopped.
) else (
    echo [INFO] No active Electron processes detected.
)

echo.
echo [SUCCESS] Cleanup complete. All Review Game processes closed.
echo.
timeout /t 3
