# Close stale Software PWA / app windows so launcher can open a fresh load.
$appId = 'digdoligjapflpifenehkiababebgnjd'
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$appId*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'Software*' } |
  Stop-Process -Force -ErrorAction SilentlyContinue
