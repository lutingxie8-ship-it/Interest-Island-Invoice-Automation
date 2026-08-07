<#
.SYNOPSIS
    Create or update the Windows Task Scheduler entry for invoice-mail-monitor.

.DESCRIPTION
    Registers a scheduled task (default name: InvoiceMailMonitor_15min) that runs the
    pure-Python monitor every 15 minutes between 09:30 and 19:00 daily. The monitor
    checks the mailbox, writes sidecars to the handoff/pending dir, and marks
    invoice emails as read. AI pipeline is triggered separately by the WorkBuddy
    automation (hourly) when a sidecar appears.

    This script is idempotent: if the task already exists it is removed and recreated.

.PARAMETER SkillDir
    Root directory of the invoice-mail-monitor skill (must contain venv/ and skill/src/).
    Default: $env:USERPROFILE\.workbuddy\skills\invoice-mail-monitor

.PARAMETER TaskName
    Name of the scheduled task. Default: InvoiceMailMonitor_15min

.EXAMPLE
    # from the repo root, default location:
    powershell -ExecutionPolicy Bypass -File scripts\setup_windows_monitor.ps1

    # custom skill location:
    powershell -ExecutionPolicy Bypass -File scripts\setup_windows_monitor.ps1 -SkillDir "D:\skills\invoice-mail-monitor"
#>
param(
    [string]$SkillDir = "$env:USERPROFILE\.workbuddy\skills\invoice-mail-monitor",
    [string]$TaskName = "InvoiceMailMonitor_15min"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SkillDir)) {
    Write-Error "Skill directory not found: $SkillDir`nInstall invoice-mail-monitor to the user-level skills dir first, or pass -SkillDir."
    exit 1
}

# Prefer pythonw (no console window); fall back to python.exe if missing.
$py = Join-Path $SkillDir "venv\Scripts\pythonw.exe"
if (-not (Test-Path $py)) { $py = Join-Path $SkillDir "venv\Scripts\python.exe" }
if (-not (Test-Path $py)) {
    Write-Error "venv interpreter not found: $py`nCreate the venv and install PyYAML first (see INIT.md)."
    exit 1
}

$action = New-ScheduledTaskAction -Execute $py -Argument "-m skill.src.monitor" -WorkingDirectory $SkillDir

$trigger = New-ScheduledTaskTrigger -Daily -At "09:30"
$trigger.RepetitionInterval = [TimeSpan]::FromMinutes(15)
$trigger.RepetitionDuration = [TimeSpan]::FromHours(9.5)   # 09:30 + 9.5h = 19:00

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -Hidden

# Idempotent: remove existing task before recreating.
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task: $TaskName"
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Interest Island invoice automation: monitor invoice emails every 15min (09:30-19:00). Pure Python, 0 token. AI pipeline triggered by WorkBuddy automation when a sidecar appears." `
    -Force | Out-Null

Write-Host "OK: scheduled task '$TaskName' created."
Write-Host "    Action : $py -m skill.src.monitor"
Write-Host "    Trigger: Daily 09:30, repeat every 15 min, duration 9.5h (until 19:00)"
Write-Host "    Manage : Win+R -> taskschd.msc -> Task Scheduler Library -> $TaskName"
