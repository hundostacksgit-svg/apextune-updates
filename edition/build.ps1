<#
  Builds the OmniDx Edition apps on this PC, from the source next to this file, with the C# compiler that is part of
  Windows (.NET Framework 4.8's csc.exe). Nothing arrives ready-made: what runs is what is in apps\, compiled here.

    .\build.ps1                      builds into .\bin
    .\build.ps1 -Out 'C:\Program Files\OmniDx\Edition'

  OmniDx Browser needs Microsoft's WebView2 SDK (the three files that connect a program to the Edge engine already in
  Windows). It comes from nuget.org, Microsoft's own package source, and is used only if Windows confirms each file
  is signed by Microsoft.
#>
[CmdletBinding()]
param(
  [string]$Out = (Join-Path $PSScriptRoot 'bin'),
  [string]$WebView2Version = '1.0.2903.40',
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
function Say([string]$t, [string]$c = 'Gray') { Write-Host "  $t" -ForegroundColor $c }

$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'The C# compiler that comes with .NET Framework 4.8 is not on this PC.' }
$src = Join-Path $PSScriptRoot 'apps'
$assets = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force -Path $Out, (Join-Path $Out 'assets') | Out-Null
if ((Resolve-Path $Out).Path.TrimEnd('\') -ne (Resolve-Path $PSScriptRoot).Path.TrimEnd('\')) {
  Copy-Item (Join-Path $assets '*.ico'), (Join-Path $assets '*-256.png'), (Join-Path $assets 'logo.png') (Join-Path $Out 'assets') -Force
}

# Every app: its own icon, DPI aware, Windows 10 and 11 behaviour, never asks for administrator rights on its own.
$manifest = Join-Path $env:TEMP 'omnidx-edition.manifest'
@'
<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="1.0.0.0" name="OmniDx.Edition"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2"><security><requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
    <requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application>
    <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings>
    <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware></windowsSettings></application>
  <dependency><dependentAssembly><assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0"
    processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/></dependentAssembly></dependency>
</assembly>
'@ | Set-Content -Path $manifest -Encoding UTF8

$refs = @('/r:System.dll', '/r:System.Core.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll')
function Build([string]$name, [string]$main, [string[]]$files, [string]$icon, [string[]]$extra = @()) {
  $exe = Join-Path $Out "$name.exe"
  $a = @('/nologo', '/target:winexe', '/optimize+', '/platform:anycpu', '/langversion:5', '/codepage:65001', '/warn:0', "/out:$exe", "/main:$main",
    "/win32icon:$(Join-Path $assets $icon)", "/win32manifest:$manifest") + $refs + $extra + @($files | ForEach-Object { Join-Path $src $_ })
  $o = & $csc @a 2>&1
  if ($LASTEXITCODE -ne 0) { $o | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }; throw "$name did not build" }
  Say ("built {0} ({1:N0} KB)" -f "$name.exe", ((Get-Item $exe).Length / 1KB)) 'Green'
}

Build 'OmniSearch' 'OmniDx.SearchProgram' @('Common.cs', 'Search.cs') 'search.ico'
Build 'OmniHub' 'OmniDx.HubProgram' @('Common.cs', 'Search.cs', 'Hub.cs') 'hub.ico'

if (-not $NoBrowser) {
  # The WebView2 SDK: kept next to this file once fetched, so a rebuild needs no network.
  $sdk = Join-Path $PSScriptRoot "webview2\$WebView2Version"
  if (-not (Test-Path (Join-Path $sdk 'ok.txt'))) {
    New-Item -ItemType Directory -Force -Path $sdk | Out-Null
    $zip = Join-Path $sdk 'sdk.zip'
    Say "fetching the WebView2 SDK $WebView2Version from nuget.org"
    (New-Object System.Net.WebClient).DownloadFile("https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$WebView2Version", $zip)
    Expand-Archive -Path $zip -DestinationPath (Join-Path $sdk 'pkg') -Force
    Remove-Item $zip -Force
    Set-Content (Join-Path $sdk 'ok.txt') (Get-Date -Format s)
  }
  $pkg = Join-Path $sdk 'pkg'
  $lib = Get-ChildItem (Join-Path $pkg 'lib') -Directory | Where-Object { $_.Name -match '^net4' } | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $lib) { throw 'The WebView2 SDK has no .NET Framework library folder.' }
  $core = Join-Path $lib.FullName 'Microsoft.Web.WebView2.Core.dll'
  $forms = Join-Path $lib.FullName 'Microsoft.Web.WebView2.WinForms.dll'
  $loaders = Get-ChildItem (Join-Path $pkg 'runtimes') -Recurse -Filter 'WebView2Loader.dll'
  foreach ($f in @($core, $forms) + @($loaders | ForEach-Object { $_.FullName })) {
    $sig = Get-AuthenticodeSignature -FilePath $f
    if ($sig.Status -ne 'Valid' -or "$($sig.SignerCertificate.Subject)" -notmatch 'O=Microsoft Corporation') { throw "Not signed by Microsoft, not used: $f ($($sig.Status))" }
  }
  Say 'WebView2 SDK: every file signed by Microsoft' 'Green'
  Copy-Item $core, $forms $Out -Force
  foreach ($l in $loaders) {
    $rid = $l.Directory.Parent.Name   # win-x64, win-x86, win-arm64
    $dest = Join-Path $Out "runtimes\$rid\native"
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item $l.FullName $dest -Force
  }
  # The loader for this PC's own architecture also sits next to the program, where Windows looks first.
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'win-arm64' } elseif ([Environment]::Is64BitOperatingSystem) { 'win-x64' } else { 'win-x86' }
  $mine = $loaders | Where-Object { $_.Directory.Parent.Name -eq $arch } | Select-Object -First 1
  if ($mine) { Copy-Item $mine.FullName $Out -Force }
  Build 'OmniBrowser' 'OmniDx.BrowserProgram' @('Common.cs', 'Search.cs', 'Browser.cs') 'browser.ico' @("/r:$core", "/r:$forms")
}
Say "done: $Out" 'Green'
