# OmniDx Bench - a game's frame rate on this PC, stock and with OmniDx, measured the way reviewers measure it.
#
#   irm omnidx.net/bench.ps1 | iex
#
# Free, and it changes nothing on the PC. It uses PresentMon, Intel's open-source frame-time capture tool (the one
# reviewers use), fetched once from its GitHub release and checked against the SHA-256 pinned below before every use.
# You play the same scene for a minute; it writes down every frame and says:
#   average FPS; the 1% low and the 0.1% low (the slowest frames, the ones you feel); stutters a minute.
# Run it once stock and once with OmniDx (after the tune and a restart), same game, same scene, same settings: it puts
# the two side by side and draws a 1080 x 1920 result card in C:\OmniDx\bench, ready to post.
#
#   $env:OMNIDX_BENCH_GAME='cs2.exe'     record this game only (otherwise: the game that drew the most frames)
#   $env:OMNIDX_BENCH_LABEL='stock'      or 'omnidx': skips the question
#   $env:OMNIDX_BENCH_SECONDS='90'       how long to record (default 60, 20 to 300)
#   $env:OMNIDX_BENCH_MODE='compare'     record nothing: the side by side and the card from the runs already saved
#   $env:OMNIDX_BENCH_MODE='fetch'       only fetch and check PresentMon
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
# Everything but PresentMon comes from omnidx.net; the Windows check serves a copy on the build machine (127.0.0.1
# only), answers the questions with OMNIDX_YES and reads a PresentMon file it made (OMNIDX_BENCH_CSV) instead of a game.
$base = 'https://omnidx.net'
if ("$env:OMNIDX_BASE" -match '^http://(127\.0\.0\.1|localhost)(:\d+)?$') { $base = "$env:OMNIDX_BASE" }
$BenchVersion = '1.0.0'
$quiet = "$env:OMNIDX_YES" -eq '1'
$mode = "$env:OMNIDX_BENCH_MODE".ToLower(); if (-not $mode) { $mode = 'run' }
$dir = if ($env:OMNIDX_BENCH_DIR) { $env:OMNIDX_BENCH_DIR } else { 'C:\OmniDx\bench' }
$csvIn = "$env:OMNIDX_BENCH_CSV"
$want = ("$env:OMNIDX_BENCH_GAME" -replace '[^A-Za-z0-9 ._()-]', '').Trim()
$label = "$env:OMNIDX_BENCH_LABEL".ToLower(); if ($label -notin @('stock', 'omnidx')) { $label = '' }
$secs = 60; if ("$env:OMNIDX_BENCH_SECONDS" -match '^\d+$') { $secs = [Math]::Min(300, [Math]::Max(20, [int]$env:OMNIDX_BENCH_SECONDS)) }
$delay = 10

# PresentMon, pinned: this release, this file, this SHA-256. A download that does not match is deleted, never run.
$pmVersion = '2.4.1'
$pmUrl = "https://github.com/GameTechDev/PresentMon/releases/download/v$pmVersion/PresentMon-$pmVersion-x64.exe"
$pmSha = 'D74183E7AE630F72CD3690BE0373ECBFDC6CBB86578148AAB8FA2A7166068F34'

# Games by their exe, for the name on the card and to pick the game out of everything that drew frames.
$Games = @{
  'FortniteClient-Win64-Shipping.exe' = 'Fortnite'; 'VALORANT-Win64-Shipping.exe' = 'VALORANT'; 'cs2.exe' = 'Counter-Strike 2'
  'r5apex.exe' = 'Apex Legends'; 'r5apex_dx12.exe' = 'Apex Legends'; 'RocketLeague.exe' = 'Rocket League'
  'RainbowSix.exe' = 'Rainbow Six Siege'; 'RainbowSix_Vulkan.exe' = 'Rainbow Six Siege'; 'Marvel-Win64-Shipping.exe' = 'Marvel Rivals'
  'javaw.exe' = 'Minecraft'; 'Minecraft.Windows.exe' = 'Minecraft'; 'Overwatch.exe' = 'Overwatch 2'; 'cod.exe' = 'Call of Duty'
  'League of Legends.exe' = 'League of Legends'; 'GTA5.exe' = 'GTA V'; 'GTA5_Enhanced.exe' = 'GTA V'; 'RobloxPlayerBeta.exe' = 'Roblox'
  'TslGame.exe' = 'PUBG'; 'dota2.exe' = 'Dota 2'; 'destiny2.exe' = 'Destiny 2'; 'Cyberpunk2077.exe' = 'Cyberpunk 2077'
  'eldenring.exe' = 'Elden Ring'; 'project8.exe' = 'Deadlock'; 'Discovery.exe' = 'THE FINALS'
}
# Things that draw frames and are not the game: never recorded, never picked.
$NotGames = @('dwm.exe', 'explorer.exe', 'WindowsTerminal.exe', 'OpenConsole.exe', 'conhost.exe', 'powershell.exe', 'pwsh.exe',
  'msedge.exe', 'msedgewebview2.exe', 'chrome.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'Discord.exe', 'Spotify.exe',
  'steam.exe', 'steamwebhelper.exe', 'EpicGamesLauncher.exe', 'EpicWebHelper.exe', 'Battle.net.exe', 'RiotClientServices.exe',
  'RiotClientUx.exe', 'RiotClientUxRender.exe', 'obs64.exe', 'NVIDIA Overlay.exe', 'nvsphelper64.exe', 'GameBar.exe',
  'TextInputHost.exe', 'SearchHost.exe', 'StartMenuExperienceHost.exe', 'ShellExperienceHost.exe', 'ApplicationFrameHost.exe',
  'SystemSettings.exe', 'Taskmgr.exe', 'Code.exe', 'Medal.exe', 'Overwolf.exe', "PresentMon-$pmVersion-x64.exe")

function Say([string]$t, [string]$c = 'Gray') { Write-Host "  $t" -ForegroundColor $c }
function Ask([string]$q, [string]$default = '') {
  if ($quiet) { return $default }
  $a = Read-Host "  $q"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim()
}
function Beep([int]$f, [int]$ms) { try { [Console]::Beep($f, $ms) } catch { } }
function Pct([double[]]$sorted, [double]$p) { $n = $sorted.Length; return $sorted[[Math]::Min($n - 1, [Math]::Max(0, [int][Math]::Ceiling($p * $n) - 1))] }
function Median([double[]]$v) {
  $s = [double[]]$v.Clone(); [Array]::Sort($s); $n = $s.Length
  if ($n % 2) { return $s[($n - 1) / 2] } else { return ($s[$n / 2 - 1] + $s[$n / 2]) / 2 }
}
function Side([string]$l) { if ($l -eq 'omnidx') { 'With OmniDx' } else { 'Stock' } }

Write-Host ''
Say 'OmniDx Bench' 'Magenta'
Say 'Your game, your PC: average FPS, 1% and 0.1% lows and stutters, stock and with OmniDx. Free; changes nothing.' 'DarkGray'
Write-Host ''
if ($mode -notin @('run', 'compare', 'fetch')) { Say "Unknown mode '$mode': use compare or fetch, or leave it empty." 'Yellow'; return }

# Recording frames needs administrator rights (PresentMon listens to Windows' own frame events). Reading a file or
# the saved runs does not. The new window gets the same choices, cleaned so nothing but them crosses.
$records = $mode -ne 'compare' -and -not $csvIn
if ($records -and $mode -eq 'run') {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    Say 'Asking for administrator rights (PresentMon needs them to see the frames)...' 'DarkGray'
    $cmd = "`$env:OMNIDX_BENCH_GAME='$want'; `$env:OMNIDX_BENCH_LABEL='$label'; `$env:OMNIDX_BENCH_SECONDS='$secs'; irm $base/bench.ps1 | iex"
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $cmd)
    return
  }
}
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# ---------------------------------------------------------------- PresentMon
function Get-PresentMon {
  $exe = Join-Path $dir "PresentMon-$pmVersion-x64.exe"
  for ($try = 0; $try -lt 2; $try++) {
    if (-not (Test-Path $exe)) {
      Say "Fetching PresentMon $pmVersion from Intel's GitHub release (about 1 MB, once)..." 'DarkGray'
      Invoke-WebRequest -Uri $pmUrl -OutFile $exe -UseBasicParsing -TimeoutSec 120
    }
    $h = (Get-FileHash -Path $exe -Algorithm SHA256).Hash
    if ($h -eq $pmSha) { return $exe }
    Say "PresentMon's fingerprint is $h, not the one pinned here; deleting it." 'Yellow'
    Remove-Item $exe -Force
  }
  throw 'PresentMon did not match its pinned SHA-256 twice, so it was not run. Nothing was changed.'
}

# ---------------------------------------------------------------- reading PresentMon's file
# One list of frame times per swap chain (a game has one; the menu and the match can be two). PresentMon 2 calls the
# column MsBetweenPresents, 1.x msBetweenPresents: the time from one frame to the next, the frame rate as the game ran it.
function Read-PresentMon([string]$path) {
  $chains = @{}
  $rd = New-Object System.IO.StreamReader $path
  try {
    $head = $rd.ReadLine(); if (-not $head) { return $chains }
    $cols = $head.Split(','); $ix = @{}
    for ($i = 0; $i -lt $cols.Count; $i++) { $ix[$cols[$i].Trim()] = $i }
    $cFt = $null; foreach ($n in 'MsBetweenPresents', 'FrameTime') { if ($ix.ContainsKey($n)) { $cFt = $ix[$n]; break } }
    if (-not $ix.ContainsKey('Application') -or $null -eq $cFt) { throw "$path is not a PresentMon file (no Application or MsBetweenPresents column)." }
    $cApp = $ix['Application']; $cPid = $ix['ProcessID']; $cSwap = $ix['SwapChainAddress']; $cMode = $ix['PresentMode']; $cSync = $ix['SyncInterval']
    $inv = [Globalization.CultureInfo]::InvariantCulture; $ft = 0.0
    while ($null -ne ($line = $rd.ReadLine())) {
      $f = $line.Split(',')
      if ($f.Count -le $cFt) { continue }
      if (-not [double]::TryParse($f[$cFt], [Globalization.NumberStyles]::Float, $inv, [ref]$ft) -or $ft -le 0 -or $ft -gt 5000) { continue }
      $k = '{0}|{1}|{2}' -f $f[$cApp], $(if ($null -ne $cPid) { $f[$cPid] }), $(if ($null -ne $cSwap) { $f[$cSwap] })
      $c = $chains[$k]
      if (-not $c) { $c = @{ app = $f[$cApp]; ft = New-Object 'System.Collections.Generic.List[double]'; modes = @{}; sync = @{} }; $chains[$k] = $c }
      $c.ft.Add($ft)
      if ($null -ne $cMode) { $c.modes[$f[$cMode]] = 1 + [int]$c.modes[$f[$cMode]] }
      if ($null -ne $cSync) { $c.sync[$f[$cSync]] = 1 + [int]$c.sync[$f[$cSync]] }
    }
  } finally { $rd.Close() }
  return $chains
}

function Select-Chain($chains) {
  $list = @($chains.Values | Where-Object { $_.ft.Count -ge 100 })
  if ($want) { $list = @($list | Where-Object { $_.app -ieq $want }) } else { $list = @($list | Where-Object { $NotGames -notcontains $_.app }) }
  if (-not $list.Count) { return $null }
  $known = @($list | Where-Object { $Games.ContainsKey($_.app) })
  $pool = if ($known.Count) { $known } else { $list }
  return ($pool | Sort-Object { $_.ft.Count } -Descending | Select-Object -First 1)
}

# Average FPS is frames over time. The 1% low is the frame rate at the 99th percentile frame time (one frame in a
# hundred is slower than this), the 0.1% low at the 99.9th. A stutter is a frame that took over twice the median.
function Get-Stats($chain) {
  $ft = $chain.ft.ToArray(); $n = $ft.Length; $total = 0.0
  foreach ($x in $ft) { $total += $x }
  $sorted = [double[]]$ft.Clone(); [Array]::Sort($sorted)
  $median = Pct $sorted 0.5
  $stutters = 0; foreach ($x in $ft) { if ($x -gt 2 * $median) { $stutters++ } }
  $top = { param($h) if ($h.Count) { ($h.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1).Key } else { '' } }
  return [ordered]@{
    frames = $n; seconds = [Math]::Round($total / 1000, 1)
    avg = [Math]::Round($n * 1000 / $total, 1)
    low1 = [Math]::Round(1000 / (Pct $sorted 0.99), 1)
    low01 = [Math]::Round(1000 / (Pct $sorted 0.999), 1)
    medianMs = [Math]::Round($median, 2)
    stuttersPerMin = [Math]::Round($stutters / [Math]::Max($total / 60000, 0.01), 1)
    presentMode = [string](& $top $chain.modes); syncInterval = [string](& $top $chain.sync)
  }
}

function Get-PcInfo {
  $pc = [ordered]@{ cpu = ''; gpu = ''; ramGb = 0; refreshHz = 0 }
  try { $pc.cpu = ((Get-CimInstance Win32_Processor | Select-Object -First 1).Name -replace '\s+', ' ').Trim() } catch { }
  try {
    $v = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic Display|Remote|Virtual|Parsec|Meta' })
    if ($v.Count) { $pc.gpu = [string]$v[0].Name; $pc.refreshHz = [int]$v[0].CurrentRefreshRate }
  } catch { }
  try { $pc.ramGb = [int][Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB) } catch { }
  return $pc
}

# Whether the tune has run here, and whether the PC restarted since: the numbers after a tune count after a restart.
function Get-TuneState {
  $s = [ordered]@{ ran = $false; version = ''; stamp = ''; restartedSince = $false }
  $sum = Get-ChildItem 'C:\OmniDx' -Filter 'summary-*.json' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  if ($sum) {
    try { $j = Get-Content $sum.FullName -Raw | ConvertFrom-Json; if ([int]$j.changes -gt 0) { $s.ran = $true; $s.version = [string]$j.version; $s.stamp = [string]$j.stamp } } catch { }
    try { $s.restartedSince = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime -gt $sum.LastWriteTime } catch { }
  }
  return $s
}

# ---------------------------------------------------------------- side by side
function Get-Side($runs, [string]$l) {
  $r = @($runs | Where-Object { $_.label -eq $l })
  if (-not $r.Count) { return $null }
  return [ordered]@{
    runs = $r.Count
    avg = Median ([double[]]@($r | ForEach-Object { [double]$_.avg })); low1 = Median ([double[]]@($r | ForEach-Object { [double]$_.low1 }))
    low01 = Median ([double[]]@($r | ForEach-Object { [double]$_.low01 })); stutters = Median ([double[]]@($r | ForEach-Object { [double]$_.stuttersPerMin }))
    modes = @($r | ForEach-Object { [string]$_.presentMode } | Select-Object -Unique); sync = @($r | ForEach-Object { [string]$_.syncInterval } | Select-Object -Unique)
    seconds = [int](Median ([double[]]@($r | ForEach-Object { [double]$_.seconds })))
  }
}
function Change([double]$a, [double]$b) { if ($a -le 0) { return 0.0 } return [Math]::Round(($b - $a) / $a * 100, 1) }
function ChangeText([double]$pct) {
  if ([Math]::Abs($pct) -lt 3) { return 'about the same' }
  return ('{0}{1:0.0}%' -f $(if ($pct -gt 0) { '+' } else { '' }), $pct)
}

function Show-Compare([string]$gdir) {
  $runs = @(Get-ChildItem $gdir -Filter '*.json' -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { try { Get-Content $_.FullName -Raw | ConvertFrom-Json } catch { } } | Where-Object { $_ -and $_.avg })
  if (-not $runs.Count) { Say "No runs saved in $gdir yet." 'Yellow'; return $null }
  $game = [string]$runs[-1].game
  $st = Get-Side $runs 'stock'; $om = Get-Side $runs 'omnidx'
  Write-Host ''
  if ($st -and $om) {
    Say "$game, on this PC" 'White'
    Say ('{0,-22}{1,10}{2,12}   {3}' -f '', 'Stock', 'With OmniDx', 'Change') 'DarkGray'
    $rows = @(@('Average FPS', $st.avg, $om.avg, $false), @('1% low', $st.low1, $om.low1, $false), @('0.1% low', $st.low01, $om.low01, $false), @('Stutters a minute', $st.stutters, $om.stutters, $true))
    foreach ($r in $rows) {
      $pc = Change $r[1] $r[2]
      $good = if ($r[3]) { $pc -le -3 } else { $pc -ge 3 }; $bad = if ($r[3]) { $pc -ge 3 } else { $pc -le -3 }
      Say ('{0,-22}{1,10:0.0}{2,12:0.0}   {3}' -f $r[0], $r[1], $r[2], (ChangeText $pc)) $(if ($good) { 'Green' } elseif ($bad) { 'Red' } else { 'Gray' })
    }
    Write-Host ''
    Say ('Medians of {0} stock run{1} and {2} with OmniDx. Two runs of one scene differ by 2 to 3% on their own, so a' -f $st.runs, $(if ($st.runs -ne 1) { 's' }), $om.runs) 'DarkGray'
    Say 'change smaller than 3% is called "about the same". Two or three runs each make the answer surer.' 'DarkGray'
    if (($st.modes + $om.modes | Select-Object -Unique).Count -gt 1) { Say ("The runs were not all in the same display mode ({0}): fullscreen against windowed is not a fair test." -f (($st.modes + $om.modes | Select-Object -Unique) -join ', ')) 'Yellow' }
  }
  else {
    $one = if ($st) { $st } else { $om }
    Say ('{0}, {1}: average {2:0.0} FPS, 1% low {3:0.0}, 0.1% low {4:0.0}, {5:0.0} stutters a minute ({6} run{7}).' -f $game, (Side $(if ($st) { 'stock' } else { 'omnidx' })), $one.avg, $one.low1, $one.low01, $one.stutters, $one.runs, $(if ($one.runs -ne 1) { 's' })) 'White'
    if ($st) { Say 'Now run the tune, restart, and run this again in the same scene: the two go side by side.' 'DarkGray' }
    else { Say 'For the side by side: undo (put everything back), restart, run this for the stock number, then the tune again.' 'DarkGray' }
  }
  foreach ($side in @($st, $om)) {
    if (-not $side) { continue }
    if ($side.sync | Where-Object { $_ -match '^[1-4]$' }) { Say 'V-Sync was on in a run: the frame rate stops at your refresh rate, which hides any gain. Turn it off for the test.' 'Yellow'; break }
  }
  foreach ($side in @($st, $om)) {
    if (-not $side) { continue }
    foreach ($cap in 30, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 300, 360) {
      if ([Math]::Abs($side.avg - $cap) / $cap -lt 0.015 -and $side.low1 -gt 0.85 * $side.avg) { Say "A run looks capped at $cap FPS (a frame cap or V-Sync): the average cannot go above it, so compare the lows, or lift the cap for the test." 'Yellow'; break }
    }
  }
  return @{ game = $game; stock = $st; omnidx = $om; last = $runs[-1] }
}

# ---------------------------------------------------------------- the card
function New-Card([string]$path, $cmp) {
  Add-Type -AssemblyName System.Drawing
  $W = 1080; $H = 1920
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
  $col = { param($hex, $a = 255) $v = [Convert]::ToInt32($hex.TrimStart('#'), 16); [System.Drawing.Color]::FromArgb($a, ($v -shr 16) -band 255, ($v -shr 8) -band 255, $v -band 255) }
  $font = { param($size, $style = 'Bold', $family = 'Segoe UI') New-Object System.Drawing.Font($family, [single]$size, [System.Drawing.FontStyle]$style, [System.Drawing.GraphicsUnit]::Pixel) }
  $brush = { param($c) New-Object System.Drawing.SolidBrush $c }
  $center = New-Object System.Drawing.StringFormat; $center.Alignment = 'Center'; $center.LineAlignment = 'Near'
  $left = New-Object System.Drawing.StringFormat; $left.Alignment = 'Near'
  $right = New-Object System.Drawing.StringFormat; $right.Alignment = 'Far'
  $grad = { param($x, $y, $w, $h) New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF $x, $y, $w, $h), (& $col '#8B5CF6'), (& $col '#D946EF'), [single]0) }
  $round = { param($x, $y, $w, $h, $r)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($x, $y, $r * 2, $r * 2, 180, 90); $p.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
    $p.AddArc($x + $w - $r * 2, $y + $h - $r * 2, $r * 2, $r * 2, 0, 90); $p.AddArc($x, $y + $h - $r * 2, $r * 2, $r * 2, 90, 90); $p.CloseFigure(); $p }
  $fit = { param($text, $size, $maxW, $style = 'Bold') $s = $size; while ($s -gt 20 -and $g.MeasureString($text, (& $font $s $style)).Width -gt $maxW) { $s -= 4 }; & $font $s $style }
  $num = { param($v) if ($v -ge 100) { '{0:0}' -f $v } else { '{0:0.#}' -f $v } }

  $g.Clear((& $col '#050308'))
  foreach ($glow in @(@(-260, -420, 1600, 1300, '#6D28D9', 120), @(300, 1250, 1100, 900, '#D946EF', 46))) {
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath; $gp.AddEllipse($glow[0], $glow[1], $glow[2], $glow[3])
    $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush $gp
    $pg.CenterColor = & $col $glow[4] $glow[5]; $pg.SurroundColors = @((& $col '#050308' 0)); $g.FillPath($pg, $gp)
  }

  # The logo (from omnidx.net, kept next to the runs), or the name when it cannot be fetched.
  $logo = Join-Path $dir 'omnidx-logo.png'
  if (-not (Test-Path $logo)) { try { Invoke-WebRequest -Uri "$base/studio/assets/logo/omnidx-logo.png" -OutFile $logo -UseBasicParsing -TimeoutSec 20 } catch { } }
  $y = 96
  if (Test-Path $logo) {
    try { $im = [System.Drawing.Image]::FromFile($logo); $lw = 440; $lh = [int]($im.Height * $lw / $im.Width); $g.DrawImage($im, [int](($W - $lw) / 2), $y, $lw, $lh); $im.Dispose(); $y += $lh + 26 } catch { $y += 10 }
  }
  else { $g.DrawString('OMNIDX', (& $font 64 'Bold'), (& $grad 0 $y $W 80), [single]($W / 2), [single]$y, $center); $y += 110 }
  $g.DrawString('B E N C H   R E S U L T', (& $font 28 'Bold'), (& $brush (& $col '#A78BFA')), [single]($W / 2), [single]$y, $center); $y += 52
  $g.DrawString($cmp.game, (& $fit $cmp.game 88 960), (& $brush (& $col '#F1ECFF')), [single]($W / 2), [single]$y, $center); $y += 118
  $g.DrawString('Measured on this PC with PresentMon', (& $font 32 'Regular'), (& $brush (& $col '#9A8FB8')), [single]($W / 2), [single]$y, $center); $y += 80

  $st = $cmp.stock; $om = $cmp.omnidx; $both = $st -and $om
  $panelY = $y
  $g.FillPath((& $brush (& $col '#0E0A17' 235)), (& $round 60 $panelY 960 540 36)); $g.DrawPath((New-Object System.Drawing.Pen (& $col '#2A1F45'), 2), (& $round 60 $panelY 960 540 36))
  $g.DrawString('AVERAGE FPS', (& $font 30 'Bold'), (& $brush (& $col '#7D7199')), [single]($W / 2), [single]($panelY + 40), $center)
  if ($both) {
    $g.DrawString('STOCK', (& $font 28 'Bold'), (& $brush (& $col '#9A8FB8')), [single]290, [single]($panelY + 110), $center)
    $g.DrawString('WITH OMNIDX', (& $font 28 'Bold'), (& $brush (& $col '#C4B5FD')), [single]790, [single]($panelY + 110), $center)
    $g.DrawString((& $num $st.avg), (& $font 150 'Bold'), (& $brush (& $col '#CFC6E6')), [single]290, [single]($panelY + 150), $center)
    $g.DrawString((& $num $om.avg), (& $font 150 'Bold'), (& $grad 560 ($panelY + 150) 460 200), [single]790, [single]($panelY + 150), $center)
    $g.DrawString('>', (& $font 90 'Bold'), (& $brush (& $col '#6D5A99')), [single]540, [single]($panelY + 185), $center)
    $pc = Change $st.avg $om.avg; $t = ChangeText $pc
    $cc = if ($pc -ge 3) { '#34D399' } elseif ($pc -le -3) { '#F87171' } else { '#C4B5FD' }
    $g.DrawString($t, (& $font 64 'Bold'), (& $brush (& $col $cc)), [single]($W / 2), [single]($panelY + 400), $center)
  }
  else {
    $one = if ($st) { $st } else { $om }
    $g.DrawString((Side $(if ($st) { 'stock' } else { 'omnidx' })).ToUpper(), (& $font 28 'Bold'), (& $brush (& $col '#C4B5FD')), [single]($W / 2), [single]($panelY + 110), $center)
    $g.DrawString((& $num $one.avg), (& $font 190 'Bold'), (& $grad 200 ($panelY + 150) 680 240), [single]($W / 2), [single]($panelY + 150), $center)
  }

  $y = $panelY + 580
  $rows = @(@('1% low', 'low1', $false), @('0.1% low', 'low01', $false), @('Stutters a minute', 'stutters', $true))
  $g.FillPath((& $brush (& $col '#0E0A17' 235)), (& $round 60 $y 960 420 36)); $g.DrawPath((New-Object System.Drawing.Pen (& $col '#2A1F45'), 2), (& $round 60 $y 960 420 36))
  $ry = $y + 40
  foreach ($r in $rows) {
    $g.DrawString($r[0], (& $font 40 'Bold'), (& $brush (& $col '#F1ECFF')), [single]104, [single]($ry + 26), $left)
    if ($both) {
      $a = $st[$r[1]]; $b = $om[$r[1]]; $pc = Change $a $b
      $good = if ($r[2]) { $pc -le -3 } else { $pc -ge 3 }; $bad = if ($r[2]) { $pc -ge 3 } else { $pc -le -3 }
      $g.DrawString(('{0}  >  {1}' -f (& $num $a), (& $num $b)), (& $font 54 'Bold'), (& $brush (& $col '#F1ECFF')), [single]976, [single]($ry + 6), $right)
      $g.DrawString((ChangeText $pc), (& $font 28 'Bold'), (& $brush (& $col $(if ($good) { '#34D399' } elseif ($bad) { '#F87171' } else { '#9A8FB8' }))), [single]976, [single]($ry + 72), $right)
    }
    else {
      $one = if ($st) { $st } else { $om }
      $g.DrawString((& $num $one[$r[1]]), (& $font 54 'Bold'), (& $brush (& $col '#F1ECFF')), [single]976, [single]($ry + 14), $right)
    }
    $ry += 118
    if ($r -ne $rows[-1]) { $g.FillRectangle((& $brush (& $col '#2A1F45')), 104, $ry - 4, 872, 2) }
  }

  $y += 470
  $last = $cmp.last
  $secsTxt = if ($both) { '{0} s of the same scene each' -f $st.seconds } else { '{0} s' -f $(if ($st) { $st.seconds } else { $om.seconds }) }
  $foot = @(('{0}  |  PresentMon {1}  |  {2}' -f $secsTxt, $pmVersion, (Get-Date).ToString('d MMM yyyy', [Globalization.CultureInfo]::InvariantCulture)), [string]$last.pc.cpu, $(if ($last.pc.gpu) { '{0}{1}' -f $last.pc.gpu, $(if ([int]$last.pc.refreshHz -gt 0) { "  |  $($last.pc.refreshHz) Hz" }) } else { '' }))
  foreach ($l in $foot) { if ($l) { $g.DrawString($l, (& $fit $l 30 960 'Regular'), (& $brush (& $col '#9A8FB8')), [single]($W / 2), [single]$y, $center); $y += 46 } }
  $y += 14
  $note = if ($both) { 'One PC, one scene. Yours will differ: run the free bench on yours.' } else { 'Run it again with the other setup for the side by side.' }
  $g.DrawString($note, (& $fit $note 30 960 'Regular'), (& $brush (& $col '#7D7199')), [single]($W / 2), [single]$y, $center)
  $g.DrawString('omnidx.net', (& $font 64 'Bold'), (& $grad 300 1780 480 80), [single]($W / 2), [single]1790, $center)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

# ---------------------------------------------------------------- run
if ($records) { $pm = Get-PresentMon; Say "PresentMon $pmVersion checked (SHA-256 matches)." 'Green' }
if ($mode -eq 'fetch') { return }

if ($mode -eq 'compare') {
  $gdir = if ($want) { Join-Path $dir (($(if ($Games.ContainsKey($want)) { $Games[$want] } else { $want -replace '\.exe$', '' }) -replace '[^A-Za-z0-9]+', '-').Trim('-').ToLower()) }
  else { (Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
  if (-not $gdir -or -not (Test-Path $gdir)) { Say "No runs saved in $dir yet: run it without a mode first." 'Yellow'; return }
  $cmp = Show-Compare $gdir
  if ($cmp) { $card = Join-Path $gdir 'card.png'; New-Card $card $cmp; Say "Result card: $card" 'Green'; if (-not $quiet) { Start-Process $card } }
  return
}

$tune = Get-TuneState
if (-not $label) {
  $def = if ($tune.ran) { '2' } else { '1' }
  Say '1  Stock: OmniDx has not run on this PC (or undo ran and the PC restarted since)' 'White'
  Say '2  With OmniDx: after the tune and a restart' 'White'
  $label = if ((Ask "Type 1 or 2 and press Enter (Enter alone: $def)" $def) -eq '2') { 'omnidx' } else { 'stock' }
}
if ($label -eq 'omnidx' -and $tune.ran -and -not $tune.restartedSince) { Say 'The PC has not restarted since the tune: what it switched off is still running until it does. Restart first for the real number.' 'Yellow' }
if ($label -eq 'stock' -and $tune.ran) { Say 'Heads up: the tune has run here. For a stock number, undo first ($env:OMNIDX_MODE=''undo''; irm omnidx.net/go.ps1 | iex), then restart.' 'Yellow' }

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$csv = Join-Path $dir "capture-$stamp.csv"
if ($csvIn) { Copy-Item $csvIn $csv -Force }
else {
  Write-Host ''
  Say 'For a fair test: same game, same map or replay or benchmark scene, same settings, V-Sync and frame caps off,' 'DarkGray'
  Say 'nothing else open you would not normally have open. Do it twice each way if you can.' 'DarkGray'
  Write-Host ''
  Say 'Start the game and get to the scene. Then come back here and press Enter.' 'White'
  if (-not $quiet) { [void](Read-Host '  Press Enter when you are ready') }
  Say "Click back into the game now. Recording starts in $delay seconds and lasts $secs; one beep at the start, two at the end." 'White'
  for ($i = $delay; $i -gt 0; $i--) { Write-Host ("`r  {0,2} " -f $i) -NoNewline; Start-Sleep -Seconds 1 }
  Write-Host "`r  Recording...  "
  Beep 880 200
  $a = @('--output_file', $csv, '--timed', "$secs", '--terminate_after_timed', '--stop_existing_session', '--session_name', 'OmniDxBench', '--no_console_stats')
  if ($want) { $a += @('--process_name', $want) } else { foreach ($n in $NotGames) { $a += @('--exclude', $n) } }
  # Windows PowerShell turns a native program's stderr into errors, and 'Stop' would end the run on the first line.
  $ErrorActionPreference = 'Continue'
  $out = & $pm @a 2>&1
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Beep 660 150; Start-Sleep -Milliseconds 120; Beep 660 150
  if (-not (Test-Path $csv)) { Say "PresentMon wrote nothing (exit $code): $(($out | Select-Object -Last 3) -join ' ')" 'Red'; return }
}

$chains = Read-PresentMon $csv
$chain = Select-Chain $chains
if (-not $chain) {
  $seen = @($chains.Values | Sort-Object { $_.ft.Count } -Descending | Select-Object -First 5 | ForEach-Object { '{0} ({1} frames)' -f $_.app, $_.ft.Count })
  Say 'No game frames were recorded. Was the game in front and drawing for the whole minute?' 'Red'
  if ($seen.Count) { Say ('Seen: {0}' -f ($seen -join ', ')) 'DarkGray' }
  Say "To name the game: `$env:OMNIDX_BENCH_GAME='game.exe'; irm omnidx.net/bench.ps1 | iex" 'DarkGray'
  Remove-Item $csv -Force -ErrorAction SilentlyContinue
  return
}
$app = [string]$chain.app
$game = if ($Games.ContainsKey($app)) { $Games[$app] } else { $app -replace '\.exe$', '' }
$gdir = Join-Path $dir (($game -replace '[^A-Za-z0-9]+', '-').Trim('-').ToLower())
New-Item -ItemType Directory -Force -Path $gdir | Out-Null
$stats = Get-Stats $chain
$rec = [ordered]@{ tool = 'OmniDx Bench'; bench = $BenchVersion; presentmon = $pmVersion; game = $game; exe = $app; label = $label; when = (Get-Date).ToString('s') }
foreach ($k in $stats.Keys) { $rec[$k] = $stats[$k] }
$rec.pc = Get-PcInfo
$rec.tune = $tune
$json = Join-Path $gdir "$stamp-$label.json"
$rec | ConvertTo-Json -Depth 4 | Set-Content -Path $json -Encoding UTF8
Move-Item $csv (Join-Path $gdir "$stamp-$label.csv") -Force
Say ('{0} ({1}), {2}: {3} frames in {4} s.' -f $game, $app, (Side $label), $stats.frames, $stats.seconds) 'Green'

$cmp = Show-Compare $gdir
if ($cmp) {
  $card = Join-Path $gdir 'card.png'
  New-Card $card $cmp
  Write-Host ''
  Say "Result card: $card" 'Green'
  Say "Everything is in $gdir (each run's numbers and PresentMon's own file)." 'DarkGray'
  if (-not $quiet) { Start-Process $card }
}
