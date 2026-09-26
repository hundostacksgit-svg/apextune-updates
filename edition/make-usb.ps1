<#
  Makes an OmniDx Edition USB stick out of a Windows USB stick made by Microsoft's Media Creation Tool.

  1. Make the stick with Microsoft's Media Creation Tool (search "download Windows 11" on microsoft.com).
  2. Run this, with the stick's drive letter:
       .\make-usb.ps1 -Drive E:
       .\make-usb.ps1 -Drive E: -Account Player -Key TUNE-XXXX-XXXX-XXXX-XXXX
  3. Boot the PC from the stick. Windows installs as it always does (setup asks which disk: pick it yourself), signs
     in once, and OmniDx Edition sets itself up and restarts.

  The stick keeps Windows exactly as Microsoft made it. This adds two things to it: autounattend.xml at the top (the
  answers Windows setup reads) and the omnidx folder (the Edition, and your key if you give one).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Drive,
  [string]$Account = 'Player',
  [string]$Password = '',
  [string]$Key,
  [string]$Language = 'en-US',
  [string]$Keyboard = '0409:00000409',
  [string]$Region = 'en-US',
  [switch]$KeepWifiScreen
)
$ErrorActionPreference = 'Stop'
$root = ($Drive.TrimEnd('\', ':') + ':\')
if (-not (Test-Path (Join-Path $root 'setup.exe')) -or -not (Test-Path (Join-Path $root 'sources'))) {
  throw "$root does not look like a Windows USB stick (no setup.exe and sources folder). Make it with Microsoft's Media Creation Tool first."
}
if ($Account -match '["/\\\[\]:;|=,+*?<>@]' -or $Account.Length -gt 20 -or $Account -match '^(administrator|guest|user|admin)$') { throw 'The account name: up to 20 characters, none of " / \ [ ] : ; | = , + * ? < > @, and not a name Windows keeps for itself.' }
if ($Key -and $Key -notmatch '^(TUNE|SQUAD)(-[A-Z0-9]{4}){4}$') { throw 'The key looks like TUNE-XXXX-XXXX-XXXX-XXXX.' }
$x = { param($t) [Security.SecurityElement]::Escape($t) }

$template = Get-Content (Join-Path $PSScriptRoot 'usb\autounattend.xml') -Raw
$xml = $template.Replace('{{ACCOUNT}}', (& $x $Account)).Replace('{{PASSWORD}}', (& $x $Password)).Replace('{{LANG}}', $Language).Replace('{{INPUT}}', $Keyboard).Replace('{{REGION}}', $Region).Replace('{{WIFI}}', $(if ($KeepWifiScreen) { 'false' } else { 'true' }))
[xml]$xml | Out-Null   # it must still be valid XML
Set-Content -Path (Join-Path $root 'autounattend.xml') -Value $xml -Encoding UTF8
Write-Host "  autounattend.xml written (account $Account)" -ForegroundColor Green

$dest = Join-Path $root 'omnidx\edition'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($i in 'apps', 'assets', 'webview2', 'setup.ps1', 'build.ps1', 'first-logon.cmd', 'README.md') {
  $p = Join-Path $PSScriptRoot $i
  if (Test-Path $p) { Copy-Item $p $dest -Recurse -Force }
}
Write-Host "  the Edition copied to $dest" -ForegroundColor Green
if ($Key) { Set-Content -Path (Join-Path $root 'omnidx\key.txt') -Value $Key -Encoding ASCII; Write-Host '  your key saved on the stick (omnidx\key.txt): setup runs the tune in Extreme with it' -ForegroundColor Green }
Write-Host ''
Write-Host '  Done. Back up anything you want to keep, then boot the PC from the stick.' -ForegroundColor Magenta
