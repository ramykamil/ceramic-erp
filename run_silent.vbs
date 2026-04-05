If WScript.Arguments.Count >= 1 Then
    ReDim args(WScript.Arguments.Count - 2)
    For i = 1 To WScript.Arguments.Count - 1
        args(i - 1) = WScript.Arguments(i)
    Next
    
    CreateObject("WScript.Shell").Run WScript.Arguments(0), 0, False
End If
