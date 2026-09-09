@echo off
REM Dev nhanh: backend :2108 + Vite :2413 — mot terminal, npm run dev
cd /d "%~dp0.."

echo.
echo === DEV (APP DANG TEST) ===
echo Backend  http://localhost:2108
echo Frontend http://localhost:2413
echo Ctrl+C de dung
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:2413"
call npm run dev
