@echo off
setlocal EnableExtensions
title DSH Frosted Glass
cd /d "%~dp0"

REM ===== Configuration =====
set "NODE_DIR=C:\Program Files\nodejs"
set "DSH_CLI=D:\project1\test\TestMyBrian\.tools\global\node_modules\@deepseek-ai\dsh\lib\bin.js"
set "URL=http://127.0.0.1:3080"
set "ELECTRON_EXE=%~dp0node_modules\electron\dist\electron.exe"

set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo   DSH Frosted Glass Launcher
echo ============================================

REM ---- Step 1: is the DSH web service already up? ----
echo [1/3] Checking DSH web service at %URL% ...
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 3) | Out-Null; exit 0 } catch { exit 1 }"
if "%errorlevel%"=="0" (
  echo       Service already running - skip start.
  goto :service_ok
)

REM ---- Step 2: start the DSH web service in background ----
echo [2/3] Starting DSH web service ...
powershell -NoProfile -Command "Start-Process -FilePath '%NODE_DIR%\node.exe' -ArgumentList '%DSH_CLI%','--profile','web' -WindowStyle Minimized"

REM ---- wait up to 90s for the service ----
set /a tries=0
:wait_loop
set /a tries+=1
if %tries% gtr 90 (
  echo       ERROR: service did not start in time. Check the DSH Web Service window.
  pause
  exit /b 1
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not "%errorlevel%"=="0" (
  ping -n 2 127.0.0.1 >nul
  goto :wait_loop
)
echo       Service is up.

:service_ok
REM ---- Step 3: launch the frosted glass window ----
echo [3/3] Launching frosted glass window ...
if not exist "%ELECTRON_EXE%" (
  echo       ERROR: Electron is not installed.
  echo       Run: "%NODE_DIR%\npm.cmd" install
  pause
  exit /b 1
)
powershell -NoProfile -Command "Start-Process -FilePath '%ELECTRON_EXE%' -ArgumentList '%~dp0'"
echo.
echo Done. You can close this window.
ping -n 6 127.0.0.1 >nul
endlocal
