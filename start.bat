@echo off
REM Dev test: backend :2108 + frontend Vite :2413
REM Khong dung cong prod :2411 — co the chay song song voi production.
cd /d "%~dp0"

echo.
echo === Khoi dong DEV (song song voi prod) ===
echo Backend  http://localhost:2108
echo Frontend http://localhost:2413
echo.

start "Music Player DEV" cmd /k "npm run dev"

REM Cho Vite/backend san sang
timeout /t 4 /nobreak >nul

start "" "http://localhost:2413"
