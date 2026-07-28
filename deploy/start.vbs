' ============================================================
'  Music Player - Prod launcher (hidden, no terminal)
'  - Start backend on :2411 if needed
'  - Close any stale PWA window, then open fresh after /health
'  Args: /silent  = no MsgBox (use for Windows Run-at-login)
'        /force   = skip already-up (dung sau deploy)
' ============================================================
Option Explicit

Dim sh, fso, root, nodeExe, http, up, tries, quiet, force, logPath, line
Dim chromeExe, killPs1, i, arg

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = root
logPath = root & "\deploy\start.log"
killPs1 = root & "\deploy\kill-stale-pwa.ps1"
quiet = False
force = False
chromeExe = "C:\Program Files\Google\Chrome\Application\chrome.exe"
nodeExe = "C:\Program Files\nodejs\node.exe"

For i = 0 To WScript.Arguments.Count - 1
  arg = LCase(WScript.Arguments(i))
  If arg = "/silent" Then quiet = True
  If arg = "/force" Then force = True
Next

Sub Log(msg)
  On Error Resume Next
  Dim ts
  Set ts = fso.OpenTextFile(logPath, 8, True)
  ts.WriteLine Now & "  " & msg
  ts.Close
  On Error GoTo 0
End Sub

Function HealthOk()
  Dim statusCode, body
  HealthOk = False
  statusCode = 0
  body = ""
  On Error Resume Next
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  http.SetTimeouts 800, 800, 1500, 1500
  http.Option(6) = False
  http.Open "GET", "http://127.0.0.1:2411/health", False
  http.Send
  If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    Exit Function
  End If
  statusCode = http.Status
  body = http.ResponseText
  On Error GoTo 0
  If statusCode = 200 Then
    If InStr(1, body, """status""", vbTextCompare) > 0 Then HealthOk = True
  End If
End Function

Sub KillStalePwa()
  Log "closing stale PWA processes (if any)"
  If fso.FileExists(killPs1) Then
    sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & killPs1 & """", 0, True
  End If
  WScript.Sleep 800
End Sub

' Sub OpenApp()
'   KillStalePwa
'   ' --app=URL forces a fresh navigation after backend is up (avoids stale ERR_CONNECTION_REFUSED)
'   If fso.FileExists(chromeExe) Then
'     line = """" & chromeExe & """ --profile-directory=Default --app=http://127.0.0.1:2411/"
'     Log "open: " & line
'     sh.Run line, 1, False
'   Else
'     Log "ERROR Chrome not found"
'     If Not quiet Then MsgBox "Khong tim thay Google Chrome.", vbCritical, "Software"
'   End If
' End Sub

Log "start quiet=" & quiet & " force=" & force

If Not fso.FileExists(nodeExe) Then
  Log "ERROR node.exe missing: " & nodeExe
  If Not quiet Then MsgBox "Khong tim thay Node.js:" & vbCrLf & nodeExe, vbCritical, "Software"
  WScript.Quit 1
End If

If Not fso.FileExists(root & "\backend\dist\index.js") Then
  Log "ERROR missing backend\dist\index.js"
  If Not quiet Then MsgBox "Thieu backend\dist\index.js - chay deploy\deploy.bat truoc.", vbCritical, "Software"
  WScript.Quit 1
End If

If force And HealthOk() Then
  Log "force kill before restart"
  sh.Run "cmd /c """ & root & "\deploy\stop.bat""", 0, True
  WScript.Sleep 1500
End If

If force Or Not HealthOk() Then
  Log "backend starting (force=" & force & ")"
  sh.Environment("PROCESS")("PORT") = "2411"
  sh.Environment("PROCESS")("DOTENV_CONFIG_PATH") = root & "\backend\.env"
  line = """" & nodeExe & """ """ & root & "\backend\dist\index.js"""
  Log "run: " & line
  sh.Run line, 0, False
Else
  Log "backend already up"
End If

up = False
tries = 0
Do While tries < 90 And Not up
  If HealthOk() Then
    up = True
  Else
    WScript.Sleep 1000
    tries = tries + 1
  End If
Loop

If Not up Then
  Log "ERROR health timeout after " & tries & "s"
  If Not quiet Then MsgBox "Backend khong len duoc tren http://127.0.0.1:2411" & vbCrLf & "Xem log: " & logPath, vbExclamation, "Software"
  WScript.Quit 1
End If

Log "health ok after " & tries & "s - skipping OpenApp"
' WScript.Sleep 1000
' OpenApp
Log "done"
