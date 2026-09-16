# Run this ONCE to create a "Ritmo de Lima" shortcut on your Desktop.
# From inside the repo folder, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1
# (Or right-click this file -> "Run with PowerShell".)
#
# The shortcut points at scripts\run-app.bat, which does "git pull",
# starts "npm run dev" in its own window, and opens Chrome at
# http://localhost:5173/. After running this once, just double-click
# the "Ritmo de Lima" icon on your Desktop from now on.

$repoRoot = Split-Path -Parent $PSScriptRoot
$batPath = Join-Path $repoRoot "scripts\run-app.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Ritmo de Lima.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Inicia El Ritmo de Lima (git pull + npm run dev) e abre no Chrome"
$shortcut.Save()

Write-Host "Atalho criado em: $shortcutPath"
Write-Host "Pode fechar esta janela e usar o atalho na Area de Trabalho a partir de agora."
