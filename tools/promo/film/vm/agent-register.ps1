# Run once by first-logon.cmd, as the account signing in: the filming helper's sign-in task, registered the way the
# tasks that did start after the Edition's restarts were (the tune's keep task, the Edition's own): for this account,
# interactive, highest privileges, a short delay after sign-in, allowed on battery, no time limit, normal priority.
# Takes 6 and 7 lost the helper after the restart: the Administrators-group task and the one schtasks made
# (no start on battery, a 72-hour limit, low priority) never started at a later sign-in.
$me = "$env:USERDOMAIN\$env:USERNAME"
$act = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument '--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\film\agent.ps1'
$trig = New-ScheduledTaskTrigger -AtLogOn -User $me
$trig.Delay = 'PT20S'
$prin = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Highest
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$set.Priority = 4
try {
  Register-ScheduledTask -TaskName 'FilmAgentPS' -Action $act -Trigger $trig -Principal $prin -Settings $set -Force -ErrorAction Stop | Out-Null
  "$(Get-Date -Format s) FilmAgentPS registered for $me"
} catch { "$(Get-Date -Format s) FilmAgentPS: $($_.Exception.Message)" }
