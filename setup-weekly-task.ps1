# Downloads Organizer - Windows Task Scheduler Setup Script
# This script automatically creates a scheduled task to run the organizer every week

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   Downloads Organizer - Task Scheduler Setup" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$projectPath = $PSScriptRoot
if (-not $projectPath) {
    $projectPath = Get-Location
}

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    Write-Host "✗ Node.js not found! Please install Node.js first." -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

$taskName = "DownloadsOrganizer_Weekly"
$scriptPath = Join-Path $projectPath "main.js"
$logPath = Join-Path $projectPath "organizer.log"

Write-Host "Project Path: $projectPath" -ForegroundColor Gray
Write-Host "Task Name: $taskName" -ForegroundColor Gray
Write-Host ""

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Task already exists. Updating..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute "node" -Argument "`"$scriptPath`" --schedule" -WorkingDirectory $projectPath

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "9:00AM"

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Automatically organizes Downloads folder every Monday at 9:00 AM" | Out-Null

Write-Host "✓ Task created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Task Details:" -ForegroundColor Cyan
Write-Host "  - Name: $taskName" -ForegroundColor Gray
Write-Host "  - Schedule: Every Monday at 9:00 AM" -ForegroundColor Gray
Write-Host "  - Script: $scriptPath" -ForegroundColor Gray
Write-Host ""

$confirmTask = Get-ScheduledTask -TaskName $taskName
Write-Host "Task Status: $($confirmTask.State)" -ForegroundColor $(if ($confirmTask.State -eq 'Ready') { 'Green' } else { 'Yellow' })

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "   Setup Complete! The organizer will run weekly." -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

Write-Host "To manually run the task now, use:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "To view task in Task Scheduler:" -ForegroundColor Yellow
Write-Host "  taskschd.msc" -ForegroundColor Gray
Write-Host ""
Write-Host "To remove the scheduled task:" -ForegroundColor Yellow
Write-Host "  Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false" -ForegroundColor Gray
Write-Host ""