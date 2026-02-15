@echo off
setlocal EnableDelayedExpansion
title ID Card App - Install and Build

echo ============================================
echo ID Card App - Installing dependencies and building
echo ============================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    echo npm is usually included with Node.js. Please reinstall Node.js.
    pause
    exit /b 1
)

echo Node version: 
node -v
echo npm version:
npm -v
echo.

echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Building the app...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Build failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo Install and build completed successfully.
echo ============================================
pause
exit /b 0
