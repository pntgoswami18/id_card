@echo off
setlocal
title ID Card App - Dev Server

echo ============================================
echo ID Card App - Launching web app
echo ============================================
echo.

:: Change to the project directory so all commands run from the right location
cd /d "%~dp0"

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Check for git
where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Git is not installed or not in PATH.
    echo Please install Git from https://git-scm.com/
    pause
    exit /b 1
)

:: If an earlier instance of this app is still running (e.g. a previous window
:: left open), its git/node processes can hold file handles inside .git\objects,
:: which makes the pull below hang on Windows' "Should I try again? (y/n)" retry
:: prompt. Terminate any leftover git.exe/node.exe processes scoped to this
:: project folder before touching the repo. Note: this matches on command line
:: alone, so it will also close an unrelated git.exe/node.exe process that
:: happens to reference this folder (e.g. an IDE's git integration) — an
:: accepted tradeoff for this single-user dev launcher.
echo Checking for a previous running instance...
set "LAUNCH_APP_DIR=%~dp0"
for /f "usebackq tokens=1,2,* delims=|" %%A in (`powershell -NoProfile -Command "$dir = $env:LAUNCH_APP_DIR; Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'git.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -like ('*' + $dir + '*') } | ForEach-Object { '{0}|{1}|{2}' -f $_.ProcessId, $_.Name, $_.CommandLine }"`) do (
    echo Closing leftover process %%A ^(%%B: %%C^) from a previous run...
    taskkill /PID %%A /F >nul 2>nul
)

:: Pull latest changes from main (non-fatal — continues with current version if offline or conflicted)
echo Updating from remote main branch...
git fetch origin main
if %ERRORLEVEL% neq 0 (
    echo WARNING: Could not reach remote. Continuing with current version...
    echo.
) else (
    git pull origin main
    if %ERRORLEVEL% neq 0 (
        echo WARNING: Pull failed ^(local changes may conflict^). Continuing with current version...
        echo.
    )
)

:: Install or update dependencies (handles first-time setup and new packages added after a pull)
echo Checking dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo Starting development server...
echo The app will open at http://localhost:5173 (or the port shown below).
echo Press Ctrl+C to stop the server.
echo.

call npm run dev -- --open

pause
exit /b 0
