<# For the Windows check: DISM's own answer about every Windows piece the tune knows, with the cost of
   asking, next to what the component store's registry and the optional-feature class say about the same
   names. With -Compare, the count DISM gives is held against the free look's count in the newest preview
   report, and a mismatch prints PIECES MISMATCH (the step fails on it): the look reads the cheap sources
   and must agree with DISM. Assumes the build machine has no printer and no Hello sensor (the two keep
   rules). Prints only. #>
param([switch]$Compare, [switch]$Quick)
$ErrorActionPreference = 'Continue'
$caps = 'App.StepsRecorder~~~~0.0.1.0', 'Media.WindowsMediaPlayer~~~~0.0.12.0', 'Microsoft.Windows.WordPad~~~~0.0.1.0', 'MathRecognizer~~~~0.0.1.0', 'Browser.InternetExplorer~~~~0.0.11.0', 'Print.Fax.Scan~~~~0.0.1.0', 'Hello.Face.20134~~~~0.0.1.0', 'Hello.Face.18967~~~~0.0.1.0', 'Hello.Face.17658~~~~0.0.1.0'
$feats = 'MicrosoftWindowsPowerShellV2Root', 'MicrosoftWindowsPowerShellV2', 'Printing-XPSServices-Features', 'WorkFolders-Client', 'WindowsMediaPlayer', 'Internet-Explorer-Optional-amd64'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$installed = @(); $enabled = @()

if ($Quick) {
  # Discovery only: where the feature states might live in the component store's registry, printed
  # before and after the run so a cheap read can be judged against DISM's answer above.
  $pk = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\Packages'
  $names = @(); try { $names = @(Get-ChildItem -Path $pk -Name -ErrorAction Stop) } catch { }
  # Only the packages that own features (a walk of all 7,844 ran past thirty minutes), and a time budget.
  $own = @($names | Where-Object { $_ -match 'Foundation|Features|ServerCore|Client-Desktop|Client-Language|Editions' })
  Write-Host ("== Feature names under the Updates keys of {0} feature-owning packages (of {1})" -f $own.Count, $names.Count)
  $hits = 0; $walked = 0
  foreach ($n in $own) {
    if ($sw.Elapsed.TotalSeconds -gt 90) { Write-Host '  (stopped at the ninety-second budget)'; break }
    $walked++
    $u = Join-Path (Join-Path $pk $n) 'Updates'
    if (-not (Test-Path -Path $u)) { continue }
    $subs = @(Get-ChildItem -Path $u -Name -ErrorAction SilentlyContinue)
    Write-Host ("  {0}: {1} updates" -f $n, $subs.Count)
    foreach ($f in $feats) {
      if ($subs -contains $f) {
        $st = $null; try { $st = (Get-Item -Path (Join-Path $u $f) -ErrorAction Stop).GetValue('CurrentState') } catch { }
        Write-Host ("    {0}  CurrentState={1}" -f $f, $st); $hits++
      }
    }
  }
  Write-Host ("  {0} hits in {1} packages, {2:0.0} s" -f $hits, $walked, $sw.Elapsed.TotalSeconds); $sw.Restart()
  Write-Host "== Win32_OptionalFeature"
  try { $of = @(Get-CimInstance Win32_OptionalFeature -OperationTimeoutSec 90 -ErrorAction Stop); Write-Host ("  {0} features in {1:0.0} s" -f $of.Count, $sw.Elapsed.TotalSeconds); foreach ($f in $feats) { $h = $of | Where-Object { $_.Name -eq $f } | Select-Object -First 1; Write-Host ("  {0}: {1}" -f $f, $(if ($h) { $h.InstallState } else { 'not listed' })) } } catch { Write-Host ("  error: {0}" -f $_.Exception.Message) }
  return
}

Write-Host "== DISM by name"
foreach ($c in $caps) {
  $t = [System.Diagnostics.Stopwatch]::StartNew(); $s = ''
  try { $s = "$((Get-WindowsCapability -Online -Name $c -ErrorAction Stop).State)" } catch { $s = 'error: ' + $_.Exception.Message }
  if ($s -eq 'Installed') { $installed += $c }
  Write-Host ("  {0}: {1} ({2:0.0} s)" -f $c, $s, $t.Elapsed.TotalSeconds)
}
foreach ($f in $feats) {
  $t = [System.Diagnostics.Stopwatch]::StartNew(); $s = ''
  try { $s = "$((Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction Stop).State)" } catch { $s = 'error: ' + $_.Exception.Message }
  if ($s -eq 'Enabled') { $enabled += $f }
  Write-Host ("  {0}: {1} ({2:0.0} s)" -f $f, $s, $t.Elapsed.TotalSeconds)
}
Write-Host ("  DISM total {0:0.0} s" -f $sw.Elapsed.TotalSeconds); $sw.Restart()

Write-Host "== Component store packages in the registry (the names the script looks for)"
$pk = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\Packages'
$names = @()
try { $names = @(Get-ChildItem -Path $pk -Name -ErrorAction Stop) } catch { Write-Host ("  cannot list: {0}" -f $_.Exception.Message) }
Write-Host ("  {0} packages listed in {1:0.0} s" -f $names.Count, $sw.Elapsed.TotalSeconds); $sw.Restart()
foreach ($n in @($names | Where-Object { $_ -match 'StepsRecorder|MediaPlayer|InternetExplorer-Optional-Package|WordPad|TabletPCMath|WFS|Fax|Hello' })) {
  $st = $null; $vis = $null
  try { $k = Get-Item -Path (Join-Path $pk $n) -ErrorAction Stop; $st = $k.GetValue('CurrentState'); $vis = $k.GetValue('Visibility') } catch { }
  Write-Host ("  {0}  CurrentState={1} Visibility={2}" -f $n, $st, $vis)
}
Write-Host ("  matched in {0:0.0} s" -f $sw.Elapsed.TotalSeconds); $sw.Restart()

Write-Host "== Win32_OptionalFeature"
try {
  $of = @(Get-CimInstance Win32_OptionalFeature -OperationTimeoutSec 90 -ErrorAction Stop)
  Write-Host ("  {0} features in {1:0.0} s" -f $of.Count, $sw.Elapsed.TotalSeconds)
  foreach ($f in $feats) { $h = $of | Where-Object { $_.Name -eq $f } | Select-Object -First 1; Write-Host ("  {0}: {1}" -f $f, $(if ($h) { $h.InstallState } else { 'not listed' })) }
} catch { Write-Host ("  error after {0:0.0} s: {1}" -f $sw.Elapsed.TotalSeconds, $_.Exception.Message) }

# What the tune's list comes to by DISM's answer: the Media Player feature folds into its capability.
$expect = $installed.Count + $enabled.Count
if (($enabled -contains 'WindowsMediaPlayer') -and ($installed -contains 'Media.WindowsMediaPlayer~~~~0.0.12.0')) { $expect-- }
Write-Host ("== By DISM, the tune would remove {0} pieces ({1} capabilities, {2} features)" -f $expect, $installed.Count, $enabled.Count)
if ($Compare) {
  $preview = Get-ChildItem C:\OmniDx -Filter 'report-preview-*.txt' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $preview) { Write-Host 'PIECES MISMATCH: no preview report to compare with'; return }
  $text = Get-Content $preview.FullName -Raw
  if ($text -notmatch '(?m)^\s*legacy Windows pieces removed: (\d+)') { Write-Host 'PIECES MISMATCH: the preview report has no pieces line'; return }
  $said = [int]$Matches[1]
  if ($text -match 'OneDrive \(nobody is signed in to it\)') { $said-- }
  if ($said -ne $expect) { Write-Host ("PIECES MISMATCH: the free look would remove {0} pieces, DISM says {1}" -f $said, $expect) }
  else { Write-Host ("PIECES MATCH: the free look and DISM both say {0}" -f $expect) }
}
