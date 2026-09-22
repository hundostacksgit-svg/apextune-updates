# OmniDx Tune — the one command.
#
#   irm omnidx.net/go.ps1 | iex
#
# Asks for your key, gets administrator rights, fetches the tune and runs it.
# Nothing is installed; the tune runs from memory and leaves its report, its
# undo script and its backups in C:\OmniDx. To undo:  set $env:OMNIDX_MODE='undo'
# first, or run C:\OmniDx\undo\undo.ps1.
$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
$base = 'https://omnidx.net'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$key = $env:OMNIDX_KEY
if (-not $key -and $env:OMNIDX_MODE -ne 'undo' -and $env:OMNIDX_MODE -ne 'report') {
  Write-Host ''
  Write-Host '  OmniDx Tune' -ForegroundColor Magenta
  $key = Read-Host '  Paste your key (TUNE-XXXX-XXXX-XXXX-XXXX)'
  $key = ($key -replace '\s', '').ToUpper()
}

if (-not $isAdmin) {
  Write-Host '  Asking for administrator rights...' -ForegroundColor DarkGray
  $cmd = "`$env:OMNIDX_KEY='$key'; `$env:OMNIDX_MODE='$($env:OMNIDX_MODE)'; `$env:OMNIDX_FLAGS='$($env:OMNIDX_FLAGS)'; `$env:OMNIDX_KEEP='$($env:OMNIDX_KEEP)'; irm $base/go.ps1 | iex"
  Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd)
  return
}

# The licence server, if one is configured, comes from the same place the site reads it.
$api = ''
try { $cfg = Invoke-RestMethod -Uri "$base/tune/config.json" -TimeoutSec 15; if ($cfg.api) { $api = [string]$cfg.api } } catch { }

$script = Invoke-RestMethod -Uri "$base/tune/omnidx.ps1" -TimeoutSec 60
if (-not $script -or $script.Length -lt 1000) { throw 'Could not fetch the tune from omnidx.net. Check your connection and try again.' }
$block = [scriptblock]::Create([string]$script)
# Options ride in on one more variable, so the one command never changes:
#   $env:OMNIDX_FLAGS='-Aggressive -CutXbox -Dns'   (any of the script's switches)
#   $env:OMNIDX_KEEP='Wallpaper Engine,RTSS'         (startup entries to leave on)
$opts = @{}
foreach ($f in ($env:OMNIDX_FLAGS -split '[\s,]+' | Where-Object { $_ })) {
  $name = $f.TrimStart('-')
  if ($name -match '^(Aggressive|CutXbox|Dns|NoRestorePoint|Yes)$') { $opts[$name] = $true }
}
if ($env:OMNIDX_KEEP) { $opts['Keep'] = @($env:OMNIDX_KEEP -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
switch ($env:OMNIDX_MODE) {
  'undo'   { & $block -Undo }
  'report' { & $block -Report }
  default  { & $block -Key $key -Api $api @opts }
}
