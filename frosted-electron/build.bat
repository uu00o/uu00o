@echo off
rem ============================================================================
rem  DSH Frosted Glass - one-click builder
rem  Double-click this file to build the exe package (dist\DSHFrostedGlass-win32-x64).
rem  Requirements: Windows + Node.js 18+ (https://nodejs.org) installed first.
rem ============================================================================
cd /d "%~dp0"

echo ===== DSH Frosted Glass - One-Click Builder =====
echo This will install dependencies (Electron, dsh CLI) and package the exe.
echo First build downloads the Electron runtime (~100MB) and may take a few minutes.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ from https://nodejs.org first.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if errorlevel 1 (
  echo.
  echo [BUILD FAILED] See messages above.
  pause
  exit /b 1
)

echo.
echo Build finished. The exe package is in the "dist\DSHFrostedGlass-win32-x64" folder.
echo Share the WHOLE folder (or zip it) - double-click DSHFrostedGlass.exe to launch.
pause
