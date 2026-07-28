@echo off
REM Tat backend prod Software_lan dang chay an (chi kill dung node cua app nay).
powershell -NoProfile -Command ^
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'PhanLeThien\\Software_lan\\backend\\dist\\index\.js' } | ForEach-Object { Write-Host ('kill node PID ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"
echo Da tat backend (neu dang chay).
ping -n 3 127.0.0.1 >nul
