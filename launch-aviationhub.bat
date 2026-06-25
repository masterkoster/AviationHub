@echo off
title AviationHub Desktop Launcher
setlocal

set PATH=C:\Users\David\.cargo\bin;C:\msys64\mingw64\bin;%PATH%
set RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-msvc
cd /d C:\Users\David\next-dashboard

echo ========================================
echo   AviationHub Desktop Launcher
echo ========================================
echo.

:: Check if Next.js dev server is running on port 3000
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Next.js dev server already running on port 3000
    goto :launch_tauri
)

echo [INFO] Starting Next.js dev server on port 3000...
start "AviationHub Web Server" /min cmd /c "cd /d C:\Users\David\next-dashboard && npm run dev"

:: Wait for the dev server to be ready
echo [INFO] Waiting for dev server to start...
set /a tries=0
:wait_server
timeout /t 2 /nobreak >nul
set /a tries+=1
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Dev server is ready
    goto :launch_tauri
)
if %tries% geq 15 (
    echo [ERROR] Dev server did not start in time. Try running "npm run dev" manually first.
    pause
    exit /b 1
)
echo [INFO] Still waiting... (%tries%/15)
goto :wait_server

:launch_tauri
echo.
echo [INFO] Launching Tauri desktop app...
echo [INFO] (This window will stay open while the app runs. Close it to quit.)
echo.
cd /d C:\Users\David\next-dashboard\src-tauri
cargo tauri dev

:: If we get here, the app closed
echo.
echo [INFO] AviationHub desktop app has closed.
timeout /t 3 /nobreak >nul