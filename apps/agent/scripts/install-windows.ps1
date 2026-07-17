#Requires -RunAsAdministrator
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exec = Join-Path $root "dist\main.js"
$taskName = "NexusDeskAgent"
$action = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$exec`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null
# Start once via the task only (single instance). Duplicate launches break screen streaming.
Start-ScheduledTask -TaskName $taskName
Write-Host "NexusDesk agent installed as scheduled task $taskName"
