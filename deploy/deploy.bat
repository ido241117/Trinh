@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM Deploy Software_lan: build FE+BE, restart :2411.
REM Arg: nopause = Host Manager (khong pause).
cd /d "%~dp0.."
set "ROOT=%CD%"
set "LOG=%~dp0deploy.log"
set "NODE_DIR=C:\Program Files\nodejs"
set "PATH=%NODE_DIR%;%PATH%"

echo ===== %DATE% %TIME% software-lan deploy ROOT=%ROOT% > "%LOG%"
echo.
echo === Build frontend ===
echo %TIME% FE build start>> "%LOG%"
cd /d "%ROOT%\frontend"
if errorlevel 1 (
  echo ERROR cd frontend>> "%LOG%"
  echo Khong vao duoc frontend
  if /I not "%~1"=="nopause" pause
  exit /b 1
)
call "%NODE_DIR%\npm.cmd" run build >> "%LOG%" 2>&1
set "EC=!ERRORLEVEL!"
echo %TIME% FE build exit=!EC!>> "%LOG%"
if not "!EC!"=="0" (
  echo Frontend build that bai — xem %LOG%
  if /I not "%~1"=="nopause" pause
  exit /b 1
)

echo.
echo === Build backend ===
echo %TIME% BE build start>> "%LOG%"
cd /d "%ROOT%\backend"
call "%NODE_DIR%\npm.cmd" run build >> "%LOG%" 2>&1
set "EC=!ERRORLEVEL!"
echo %TIME% BE build exit=!EC!>> "%LOG%"
if not "!EC!"=="0" (
  echo Backend build that bai — xem %LOG%
  if /I not "%~1"=="nopause" pause
  exit /b 1
)

cd /d "%ROOT%"
echo.
echo === Dung backend cu ===
echo %TIME% stop>> "%LOG%"
call "%~dp0stop.bat" >> "%LOG%" 2>&1

echo.
echo === Khoi dong backend moi ===
echo %TIME% start /force>> "%LOG%"
wscript.exe //B "%~dp0start-prod.vbs" /silent /force

echo.
echo Deploy xong. Backend :2411
echo   Log  %LOG%
echo Neu PWA dang mo, Ctrl+Shift+R.
echo.
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOG%' -Tail 20"
echo %TIME% done>> "%LOG%"
if /I not "%~1"=="nopause" pause
exit /b 0
