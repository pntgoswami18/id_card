@echo off
setlocal enabledelayedexpansion
title ID Card App - Dev Server

echo ============================================
echo  ID Card App - Launching web app
echo ============================================
echo.

cd /d "%~dp0"

:: ======================================================
:: WINGET — detect once, used by steps 1 and 2
:: ======================================================
set "HAS_WINGET=0"
where winget >nul 2>nul
if !ERRORLEVEL! equ 0 set "HAS_WINGET=1"

:: ======================================================
:: 1. GIT — check / install
:: ======================================================
echo [1/5] Checking for Git...
where git >nul 2>nul
if !ERRORLEVEL! neq 0 (
    if !HAS_WINGET! equ 1 (
        echo     Git not found. Installing via winget...
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
        if !ERRORLEVEL! neq 0 (
            echo.
            echo ERROR: winget failed to install Git.
            echo Please install Git manually from https://git-scm.com/ then re-run this script.
            pause
            exit /b 1
        )
        set "PATH=%PATH%;C:\Program Files\Git\cmd"
        echo     Git installed successfully.
    ) else (
        echo.
        echo ERROR: Git is not installed and winget is not available to install it automatically.
        echo Please install Git from https://git-scm.com/ then re-run this script.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=*" %%v in ('git --version') do echo     %%v
)
echo.

:: ======================================================
:: 2. NODE 20+ — check / install
:: ======================================================
echo [2/5] Checking for Node.js 20+...
set "NODE_VER="
for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"

set "NODE_MAJOR_NUM=0"
if defined NODE_VER (
    for /f "tokens=1 delims=." %%m in ("!NODE_VER!") do (
        set "_PFX=%%m"
        set "NODE_MAJOR_NUM=!_PFX:~1!"
    )
)

if !NODE_MAJOR_NUM! lss 20 (
    if !HAS_WINGET! equ 1 (
        if "!NODE_VER!" == "" (
            echo     Node.js not found. Installing LTS via winget...
        ) else (
            echo     Node.js !NODE_VER! found but 20+ required. Upgrading via winget...
        )
        winget install OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements
        if !ERRORLEVEL! neq 0 (
            echo.
            echo ERROR: winget failed to install Node.js.
            echo Please install Node.js 20+ from https://nodejs.org/ then re-run this script.
            pause
            exit /b 1
        )
        set "PATH=%PATH%;C:\Program Files\nodejs"
        echo     Node.js installed successfully.
    ) else (
        echo.
        if "!NODE_VER!" == "" (
            echo ERROR: Node.js is not installed and winget is not available to install it automatically.
        ) else (
            echo ERROR: Node.js !NODE_VER! is below the required version 20, and winget is not available to upgrade it automatically.
        )
        echo Please install Node.js 20+ from https://nodejs.org/ then re-run this script.
        pause
        exit /b 1
    )
) else (
    echo     Node.js !NODE_VER! (OK^)
)
echo.

:: ======================================================
:: 3. SYNC WITH MAIN BRANCH
:: ======================================================
echo [3/5] Checking for updates from main...
:: Skip entirely if this folder is not a git repo
if not exist ".git\" (
    echo     Not a git repository. Skipping update check.
    goto :after_update
)
:: Skip if no origin remote is configured
git remote get-url origin >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo     No remote origin configured. Skipping update check.
    goto :after_update
)
:: Disable any credential / passphrase prompts so fetch fails fast instead of hanging
set "GIT_TERMINAL_PROMPT=0"
set "GIT_ASKPASS=echo"
git fetch origin main >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo     WARNING: Could not reach remote. Continuing with current version.
) else (
    set "BEHIND=0"
    for /f %%n in ('git rev-list HEAD..origin/main --count 2^>nul') do set "BEHIND=%%n"
    if !BEHIND! gtr 0 (
        echo     !BEHIND! new commit(s) available. Updating...
        git diff-index --quiet HEAD -- >nul 2>&1
        if !ERRORLEVEL! neq 0 (
            echo     Stashing local changes first...
            git stash push -m "Auto-stash before update [launch-app.bat]" >nul 2>&1
        )
        git pull origin main
        if !ERRORLEVEL! neq 0 (
            echo     WARNING: Pull encountered issues. Continuing with current version.
        ) else (
            echo     Updated to latest version.
        )
    ) else (
        echo     Already up to date.
    )
)
:after_update
echo.

:: ======================================================
:: 4. KILL EXISTING INSTANCES ON PORT 5173
:: ======================================================
echo [4/5] Checking for existing app instances...
set "KILLED=0"
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":5173" ^| findstr "LISTENING"') do (
    if not "%%p" == "" (
        taskkill /PID %%p /F >nul 2>&1
        if !ERRORLEVEL! equ 0 (
            echo     Stopped existing instance (PID %%p^).
            set "KILLED=1"
        )
    )
)
if !KILLED! equ 0 echo     No running instances found.
echo.

:: ======================================================
:: 5. INSTALL DEPS + START APP + OPEN BROWSER
:: ======================================================
echo [5/5] Installing / updating dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Starting development server...
echo  App will open in your browser automatically.
echo  Press Ctrl+C to stop the server.
echo ============================================
echo.

call npm run dev -- --open

pause
exit /b 0
