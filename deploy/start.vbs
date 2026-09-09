' Dev launcher — mot terminal, npm run dev (khong health/kill)
Option Explicit

Dim sh, fso, root, startBat

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
startBat = root & "\deploy\start.bat"

If Not fso.FileExists(startBat) Then
  MsgBox "Khong tim thay deploy\start.bat", vbCritical, "Software DEV"
  WScript.Quit 1
End If

sh.Run "cmd /k """ & startBat & """", 1, False
