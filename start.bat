@echo off
title Review Game Manager

:: Clear screen
cls

echo ==========================================================
echo               BIBLE QUIZ - REVIEW GAME MANAGER
echo ==========================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 goto no_node

:: Navigate to frontend directory
cd /d "%~dp0quiz-frontend"

:: Check for node_modules
if not exist node_modules goto install_deps

:menu
set "choice="
echo ----------------------------------------------------------
echo Please select an option to run the game:
echo ----------------------------------------------------------
echo  [1] Launch Web App (Local server + opens default browser)
echo  [2] Launch Desktop App (Runs inside native Electron window)
echo  [3] Build & Package Desktop App (Creates standalone installer)
echo  [4] Exit Manager
echo.
set /p choice="Enter option (1-4): "

if "%choice%"=="1" goto launch_web
if "%choice%"=="2" goto launch_desktop
if "%choice%"=="3" goto build_desktop
if "%choice%"=="4" goto exit_mgr

echo [ERROR] Invalid option, please choose between 1 and 4.
echo.
goto menu

:no_node
echo [ERROR] Node.js is not installed!
echo Please download and install Node.js (LTS version recommended) from:
echo https://nodejs.org/
echo.
pause
exit /b 1

:install_deps
echo [INFO] node_modules not found. Installing dependencies...
echo This may take a minute depending on your internet connection...
call npm install
if %errorlevel% neq 0 goto install_failed
echo [SUCCESS] Dependencies installed successfully.
echo.
goto menu

:install_failed
echo [ERROR] npm install failed. Please check your internet connection and try again.
pause
exit /b 1

:launch_web
echo.
echo [INFO] Launching Web App...
echo Starting local Vite server on port 5173...
:: Start Vite server in background window
start "ReviewGameServer" /min cmd /c "npm run dev"
:: Wait for server to boot up
timeout /t 3 /nobreak >nul
:: Open the browser
start http://localhost:5173
echo.
echo [SUCCESS] Web App launched successfully in your browser!
echo Note: To stop the server at any time, run 'stop.bat'.
echo.
pause
goto exit_mgr

:launch_desktop
echo.
echo [INFO] Launching Desktop App...
echo Initializing Electron application...
:: Start Electron dev server in background window
start "ReviewGameElectron" /min cmd /c "npm run electron:dev"
echo.
echo [SUCCESS] Electron app launched!
echo Note: To force close the app and clean up, run 'stop.bat'.
echo.
pause
goto exit_mgr

:build_desktop
echo.
echo [INFO] Building & Packaging Desktop App...
echo This compiles all assets and creates a standalone Windows executable.
echo Please wait...
call npm run electron:build:win
if %errorlevel% neq 0 (
    echo [ERROR] Build failed. Check the logs above.
) else (
    echo.
    echo [SUCCESS] Standalone Windows executable build complete!
    echo You can find the installer/executable in: quiz-frontend\dist\
)
echo.
pause
goto menu

:exit_mgr
exit /b 0
