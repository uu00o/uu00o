@echo off
chcp 65001 >nul
setlocal EnableExtensions
title DSH 开机自启开关
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LNK=%STARTUP%\DSH磨砂玻璃.lnk"
set "TARGET=D:\project1\test\TestMyBrian\frosted-electron\start.bat"
set "WORKDIR=D:\project1\test\TestMyBrian\frosted-electron"
set "ICON=D:\project1\test\TestMyBrian\frosted-electron\node_modules\electron\dist\electron.exe"

REM ---- 支持命令行参数：无参数=交互菜单；1=启用；2=禁用 ----
if "%~1"=="1" goto enable
if "%~1"=="2" goto disable

:menu
cls
echo ============================================
echo    DSH 磨砂玻璃 - 开机自启开关
echo ============================================
if exist "%LNK%" (
  echo   [状态] 开机自启：已启用
) else (
  echo   [状态] 开机自启：已禁用
)
echo.
echo    1. 启用开机自启
echo    2. 禁用开机自启
echo    0. 退出
echo.
set /p choice=请选择 (1/2/0): 

if "%choice%"=="1" goto enable
if "%choice%"=="2" goto disable
if "%choice%"=="0" goto end
echo 无效输入，请重新选择
pause
goto menu

:enable
REM 中文文件名用 Unicode 码点构造，避免 cmd->powershell 编码丢失；exit code 报告结果
powershell -NoProfile -Command "$s=[Environment]::GetFolderPath('Startup');$n=-join([char[]](0x78E8,0x7802,0x73BB,0x7483));$p=Join-Path $s ('DSH'+$n+'.lnk');$ws=New-Object -ComObject WScript.Shell;$l=$ws.CreateShortcut($p);$l.TargetPath='%TARGET%';$l.WorkingDirectory='%WORKDIR%';$l.IconLocation='%ICON%';$l.Description='boot: DSH frosted glass';$l.WindowStyle=7;$l.Save();if(Test-Path $p){exit 0}else{exit 1}"
if "%errorlevel%"=="0" (
  echo.
  echo   已启用开机自启！
) else (
  echo.
  echo   启用失败，请检查权限后重试。
)
if "%~1"=="" pause
goto end

:disable
if exist "%LNK%" del "%LNK%"
if not exist "%LNK%" (
  echo.
  echo   已禁用开机自启！
) else (
  echo.
  echo   禁用失败，请检查权限后重试。
)
if "%~1"=="" pause
goto end

:end
endlocal