$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\AviationHub.lnk")
$Shortcut.TargetPath = "C:\Users\David\next-dashboard\launch-aviationhub.bat"
$Shortcut.IconLocation = "C:\Users\David\next-dashboard\src-tauri\icons\icon.ico"
$Shortcut.WorkingDirectory = "C:\Users\David\next-dashboard"
$Shortcut.Description = "AviationHub Desktop Application"
$Shortcut.WindowStyle = 1
$Shortcut.Save()
Write-Host "Desktop shortcut created: $env:USERPROFILE\Desktop\AviationHub.lnk" -ForegroundColor Green