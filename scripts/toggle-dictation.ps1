$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class StudyPopKeyboard {
  [DllImport("user32.dll")]
  public static extern void keybd_event(
    byte virtualKey,
    byte scanCode,
    uint flags,
    UIntPtr extraInfo
  );
}
"@

$keyUp = 0x0002
$leftWindows = 0x5B
$hKey = 0x48

[StudyPopKeyboard]::keybd_event($leftWindows, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 45
[StudyPopKeyboard]::keybd_event($hKey, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 45
[StudyPopKeyboard]::keybd_event($hKey, 0, $keyUp, [UIntPtr]::Zero)
[StudyPopKeyboard]::keybd_event($leftWindows, 0, $keyUp, [UIntPtr]::Zero)
