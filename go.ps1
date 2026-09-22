# OmniDx Tune - the one command.
#
#   irm omnidx.net/go.ps1 | iex
#
# Gets administrator rights, fetches the tune and opens the app: a window
# that reads your PC, lets you tick what to keep, takes your key and runs the
# tune with a live log. Nothing is installed; it runs from memory and leaves
# its report, its undo script and its backups in C:\OmniDx.
#
#   $env:OMNIDX_MODE='report'; irm omnidx.net/go.ps1 | iex     free look, changes nothing
#   $env:OMNIDX_MODE='undo';   irm omnidx.net/go.ps1 | iex     put everything back
#   $env:OMNIDX_MODE='check';  irm omnidx.net/go.ps1 | iex     check a key's format, nothing else
#   $env:OMNIDX_MODE='console'; irm omnidx.net/go.ps1 | iex    the console flow instead of the window
#   $env:OMNIDX_FLAGS='-Aggressive -CutXbox -Dns'               options (see omnidx.net/studio/download/#options)
#   $env:OMNIDX_KEEP='Wallpaper Engine,RTSS'                    startup entries to leave on
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$base = 'https://omnidx.net'
$mode = "$env:OMNIDX_MODE".ToLower()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$isCore = $PSVersionTable.PSEdition -eq 'Core'
$key = $env:OMNIDX_KEY
if (-not $mode) { $mode = 'app' }
if (-not $key -and $mode -ne 'undo' -and $mode -ne 'report' -and $mode -ne 'app') {
  Write-Host ''
  Write-Host '  OmniDx Tune' -ForegroundColor Magenta
  Write-Host '  Your key is on the page after you paid: omnidx.net/studio/activate/' -ForegroundColor DarkGray
  $key = Read-Host '  Paste your key (TUNE-XXXX-XXXX-XXXX-XXXX)'
  $key = ($key -replace '\s', '').ToUpper()
}

# The tune needs Windows PowerShell 5.1 (Checkpoint-Computer and the Store app
# commands live only there) and administrator rights. A window that is either
# not elevated or PowerShell 7 hands over to a fresh elevated 5.1 window.
if (-not $isAdmin -or $isCore) {
  Write-Host $(if ($isCore) { '  Switching to Windows PowerShell 5.1 with administrator rights...' } else { '  Asking for administrator rights...' }) -ForegroundColor DarkGray
  $cmd = "`$env:OMNIDX_KEY='$key'; `$env:OMNIDX_MODE='$mode'; `$env:OMNIDX_FLAGS='$($env:OMNIDX_FLAGS)'; `$env:OMNIDX_KEEP='$($env:OMNIDX_KEEP)'; irm $base/go.ps1 | iex"
  $verb = if ($isAdmin) { 'Open' } else { 'RunAs' }
  Start-Process powershell.exe -Verb $verb -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd)
  return
}

# The licence server, if one is configured, comes from the same place the site reads it.
$web = New-Object System.Net.WebClient
$web.Encoding = [System.Text.Encoding]::UTF8
$web.Headers['User-Agent'] = 'OmniDxTune/go'
$bust = [DateTime]::UtcNow.Ticks
$api = ''
try { $cfg = $web.DownloadString("$base/tune/config.json?v=$bust") | ConvertFrom-Json; if ($cfg.api) { $api = [string]$cfg.api } } catch { }

# Fetched fresh every run, past any cache, so a fix reaches you on your next run.
$script = ''
try { $script = $web.DownloadString("$base/tune/omnidx.ps1?v=$bust") } catch { }
if (-not $script -or $script.Length -lt 1000 -or $script -notmatch 'function Main') { throw 'Could not fetch the tune from omnidx.net. Check your connection and try again.' }
$block = [scriptblock]::Create([string]$script)

# Options ride in on one more variable, so the one command never changes.
$opts = @{}
foreach ($f in ("$env:OMNIDX_FLAGS" -split '[\s,]+' | Where-Object { $_ })) {
  $name = $f.TrimStart('-')
  if ($name -match '^(Aggressive|CutXbox|Dns|NoRestorePoint|NoAfterCount|Yes)$') { $opts[$name] = $true }
}
if ($env:OMNIDX_KEEP) { $opts['Keep'] = @($env:OMNIDX_KEEP -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
switch ($mode) {
  'undo'   { & $block -Undo }
  'report' { & $block -Report }
  'check'  { & $block -Key $key -CheckKey }
  'app'    { & $block -Key $key -Api $api -Gui @opts }
  default  { & $block -Key $key -Api $api @opts }
}
