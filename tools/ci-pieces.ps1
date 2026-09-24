<# Discovery for the Windows check: where the Windows pieces the tune removes are recorded
   outside DISM, and what each source costs. The free look spends most of its time opening
   a DISM session to ask about a handful of names (fifteen of nineteen seconds cold on the
   build machine, 1.62.0); this prints what the component store's registry, the optional
   feature class and the files on disk say about the same names, next to DISM's answer, so a
   cheaper read can be judged against the truth before the script relies on it. Prints only. #>
param()
$ErrorActionPreference = 'Continue'
$caps = 'App.StepsRecorder~~~~0.0.1.0', 'Media.WindowsMediaPlayer~~~~0.0.12.0', 'Microsoft.Windows.WordPad~~~~0.0.1.0', 'MathRecognizer~~~~0.0.1.0', 'Browser.InternetExplorer~~~~0.0.11.0', 'Print.Fax.Scan~~~~0.0.1.0', 'Hello.Face.20134~~~~0.0.1.0', 'Hello.Face.18967~~~~0.0.1.0', 'Hello.Face.17658~~~~0.0.1.0'
$feats = 'MicrosoftWindowsPowerShellV2Root', 'MicrosoftWindowsPowerShellV2', 'Printing-XPSServices-Features', 'WorkFolders-Client', 'WindowsMediaPlayer', 'Internet-Explorer-Optional-amd64'
$sw = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host "== DISM by name"
foreach ($c in $caps) {
  $t = [System.Diagnostics.Stopwatch]::StartNew(); $s = ''
  try { $s = "$((Get-WindowsCapability -Online -Name $c -ErrorAction Stop).State)" } catch { $s = 'error: ' + $_.Exception.Message }
  Write-Host ("  {0}: {1} ({2:0.0} s)" -f $c, $s, $t.Elapsed.TotalSeconds)
}
foreach ($f in $feats) {
  $t = [System.Diagnostics.Stopwatch]::StartNew(); $s = ''
  try { $s = "$((Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction Stop).State)" } catch { $s = 'error: ' + $_.Exception.Message }
  Write-Host ("  {0}: {1} ({2:0.0} s)" -f $f, $s, $t.Elapsed.TotalSeconds)
}
Write-Host ("  DISM total {0:0.0} s" -f $sw.Elapsed.TotalSeconds); $sw.Restart()

Write-Host "== Component store packages in the registry"
$pk = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\Packages'
$names = @()
try { $names = @(Get-ChildItem -Path $pk -Name -ErrorAction Stop) } catch { Write-Host ("  cannot list: {0}" -f $_.Exception.Message) }
Write-Host ("  {0} packages listed in {1:0.0} s" -f $names.Count, $sw.Elapsed.TotalSeconds); $sw.Restart()
$want = 'StepsRecorder|MediaPlayer|WordPad|MathRecognizer|InternetExplorer|Internet-Explorer|Fax|Hello|Face|PowerShell-V2|PowerShellV2|XPS|WorkFolders'
foreach ($n in @($names | Where-Object { $_ -match $want })) {
  $st = $null; $vis = $null
  try { $k = Get-Item -Path (Join-Path $pk $n) -ErrorAction Stop; $st = $k.GetValue('CurrentState'); $vis = $k.GetValue('Visibility') } catch { }
  Write-Host ("  {0}  CurrentState={1} Visibility={2}" -f $n, $st, $vis)
}
Write-Host ("  matched in {0:0.0} s" -f $sw.Elapsed.TotalSeconds); $sw.Restart()

Write-Host "== Win32_OptionalFeature (capped at 90 s)"
try {
  $of = @(Get-CimInstance Win32_OptionalFeature -OperationTimeoutSec 90 -ErrorAction Stop)
  Write-Host ("  {0} features in {1:0.0} s" -f $of.Count, $sw.Elapsed.TotalSeconds)
  foreach ($f in $feats) { $h = $of | Where-Object { $_.Name -eq $f } | Select-Object -First 1; Write-Host ("  {0}: {1}" -f $f, $(if ($h) { $h.InstallState } else { 'not listed' })) }
} catch { Write-Host ("  error after {0:0.0} s: {1}" -f $sw.Elapsed.TotalSeconds, $_.Exception.Message) }
$sw.Restart()

Write-Host "== Files"
foreach ($f in "$env:SystemRoot\System32\psr.exe", "$env:ProgramFiles\Windows Media Player\wmplayer.exe", "$env:ProgramFiles\Windows NT\Accessories\wordpad.exe", "$env:CommonProgramFiles\microsoft shared\ink\mip.exe", "$env:ProgramFiles\Internet Explorer\iexplore.exe", "$env:SystemRoot\System32\WFS.exe", "$env:SystemRoot\System32\WorkFolders.exe", "$env:SystemRoot\System32\xpsrchvw.exe", "$env:SystemRoot\Microsoft.NET\Framework64\v2.0.50727\mscorlib.dll") {
  Write-Host ("  {0}: {1}" -f $f, (Test-Path $f))
}
Write-Host ("  files in {0:0.0} s" -f $sw.Elapsed.TotalSeconds)
