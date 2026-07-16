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
:: accepted tradeoff for this single-user dev launcher. It also won't catch a
:: leftover process if this folder was opened via a different path form (a
:: mapped drive, UNC path, or symlink) than the one that started it.
::
:: git.exe's CommandLine for a bare `git fetch`/`git pull` never contains the
:: project path (the working directory is a separate process attribute that
:: Win32_Process doesn't expose) — the exact hung-pull scenario this step
:: exists for would otherwise never match. So git.exe is matched by verb
:: (fetch/pull) instead of by path; node.exe still requires the project path,
:: since its CommandLine does include the local vite/npm script path. This
:: means a hung `git fetch`/`git pull` in a *different* repo on the same
:: machine could also be closed — an accepted broadening of the existing
:: single-user-launcher tradeoff above.
::
:: The match/echo/kill all happen inside PowerShell (rather than parsing
:: fields back out in batch) so the process's raw CommandLine — which can
:: contain characters like & | < > that cmd.exe would otherwise misparse —
:: never has to pass through an unquoted batch command. After killing, it
:: waits briefly for the process to actually exit, since Stop-Process only
:: requests termination and doesn't guarantee file handles are released by
:: the time it returns.
echo Checking for a previous running instance...
set "LAUNCH_APP_DIR=%~dp0"
powershell -NoProfile -Command "$dir = $env:LAUNCH_APP_DIR; if ($dir) { $procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -and $_.CommandLine.IndexOf($dir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or ($_.Name -eq 'git.exe' -and $_.CommandLine -and ($_.CommandLine.IndexOf('fetch', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.CommandLine.IndexOf('pull', [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) }; foreach ($p in $procs) { Write-Host \"Closing leftover process $($p.ProcessId) ($($p.Name)) from a previous run...\"; Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }; if ($procs) { Wait-Process -Id ($procs | Select-Object -ExpandProperty ProcessId) -Timeout 5 -ErrorAction SilentlyContinue } }"

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
