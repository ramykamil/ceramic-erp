Set WshShell = CreateObject("WScript.Shell")
WshShell.Run chr(34) & "start_app_safe.bat" & chr(34), 0
Set WshShell = Nothing
