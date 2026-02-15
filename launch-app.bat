@echo off
setlocal
title ID Card App - Dev Server

echo ============================================
echo ID Card App - Launching web app
echo ============================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ and run install-and-build.bat first.
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    echo Please install Node.js and run install-and-build.bat first.
    pause
    exit /b 1
)

:: Check that node_modules exists (dependencies installed)
if not exist "node_modules" (
    echo ERROR: Dependencies not found. Please run install-and-build.bat first.
    pause
    exit /b 1
)

echo Starting development server...
echo The app will open at http://localhost:5173 (or the port shown below).
echo Press Ctrl+C to stop the server.
echo.

call npm run dev

pause
exit /b 0
