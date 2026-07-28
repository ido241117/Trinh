@echo off
REM Khoi dong app o che do prod, chay an (khong terminal backend).
REM Chi la wrapper goi start.vbs - ban co the double-click start.vbs truc tiep.
cd /d "%~dp0"
start "" wscript.exe "%~dp0start.vbs"
