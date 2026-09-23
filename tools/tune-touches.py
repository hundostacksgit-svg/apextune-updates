#!/usr/bin/env python3
"""
Write studio/what-it-touches/index.html from tune/omnidx.ps1.

The page lists every service, scheduled task, preinstalled app and registry
area the tune touches, with the reason next to each, and what it keeps and
why. It is generated from the script's own lists so the page can never say
one thing while the script does another.

    python3 tools/tune-touches.py          # rewrite the page
    python3 tools/tune-touches.py --check  # exit 1 if the page is stale

Run tools/build-site.py afterwards to stamp the nav and footer in.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'tune' / 'omnidx.ps1'
OUT = ROOT / 'studio' / 'what-it-touches' / 'index.html'

# Section headings, by the function the change is made in.
SECTIONS = {
    'Cut-Startup': 'Startup apps', 'Cut-Services': 'Services', 'Cut-Tasks': 'Scheduled tasks', 'Cut-Apps': 'Preinstalled apps',
    'Cut-Telemetry': 'Telemetry, background activity, the shell', 'Tune-System': 'System tuning', 'New-PowerPlan': 'The OmniDx power plan',
    'Tune-Network': 'Network', 'Tune-Apps': 'Discord, Spotify, browsers', 'Set-GameProfiles': 'Game profiles', 'Tune-Gpu': 'NVIDIA extras',
    'Set-Vbs': 'Memory integrity (opt-in)', 'New-Safety': 'Safety first', 'Register-AfterCount': 'After-restart count',
}

# What Get-KeepList keeps, in words. Kept in step with the function by hand;
# the check below fails if a service named here is not in the script.
KEEPS = [
    ('A printer is installed', 'Spooler (print spooler)'),
    ('Bluetooth is in use', 'bthserv, BTAGService, BthAvctpSvc'),
    ('A Wi-Fi adapter is present', 'WlanSvc, RmSvc'),
    ('Touch screen, or a laptop', 'TabletInputService (touch keyboard)'),
    ('A Windows Hello reader is present', 'WbioSrvc (biometrics)'),
    ('Laptop', 'SensorService, SensrSvc, SensorDataService, WwanSvc; battery-side power settings; hibernation'),
    ('A VPN adapter is present', 'iphlpsvc, SSDPSRV, upnphost'),
    ('A hard disk is present', 'SysMain (prefetch)'),
    ('Game Pass, the Xbox app or Minecraft is installed', 'XblAuthManager, XblGameSave, XboxNetApiSvc, XboxGipSvc (unless -CutXbox)'),
    ('An Xbox controller is connected', 'XboxGipSvc (unless -CutXbox)'),
    ('Always', 'Themes; Microsoft Defender, the firewall, SmartScreen, UAC, Windows Update, audio, networking, every anti-cheat, every driver'),
]


def block(text: str, name: str) -> str:
    start = text.index(f'$script:{name} = @(')
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '(':
            depth += 1
        elif text[i] == ')':
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    raise ValueError(name)


def pairs(body: str) -> list[tuple[str, str]]:
    return re.findall(r"@\('([^']+)',\s*'([^']+)'\)", body)


def strings(body: str) -> list[str]:
    return re.findall(r"'([^']+)'", body)


def registry(text: str) -> dict[str, list[tuple[str, str]]]:
    """Registry values by section: (key path, value name)."""
    out: dict[str, list[tuple[str, str]]] = {}
    fn = None
    for line in text.splitlines():
        m = re.match(r'function ([\w-]+)', line)
        if m:
            fn = m.group(1)
            continue
        if fn not in SECTIONS:
            continue
        for m in re.finditer(r"""Set-Reg\s+('(?P<p1>[^']+)'|"(?P<p2>[^"]+)"|(?P<p3>\$[\w:]+))\s+('(?P<n1>[^']+)'|"(?P<n2>[^"]+)"|(?P<n3>\$[\w.]+))""", line):
            path = m.group('p1') or m.group('p2') or m.group('p3')
            name = m.group('n1') or m.group('n2') or m.group('n3')
            out.setdefault(SECTIONS[fn], []).append((path, name))
    return out


def page(text: str) -> str:
    version = re.search(r"\$script:Version = '([^']+)'", text).group(1)
    services = pairs(block(text, 'ServiceOff'))
    manual = set(strings(block(text, 'ManualOnly')))
    tasks = pairs(block(text, 'TaskList'))
    apps = strings(block(text, 'JunkApps'))
    caps = pairs(block(text, 'Capabilities'))
    feats = pairs(block(text, 'Features'))
    reg = registry(text)
    for _, names in KEEPS:
        for svc in re.findall(r'\b([A-Za-z]+Svc|[A-Za-z]+Service|Spooler|SysMain|Themes|bthserv|WlanSvc|RmSvc|WbioSrvc|iphlpsvc|SSDPSRV|upnphost|XblAuthManager|XblGameSave)\b', names):
            if svc in ('Windows', 'Defender'):
                continue
            if svc not in text:
                raise SystemExit(f'KEEPS names {svc}, which the script does not mention')

    e = html.escape
    svc_rows = ''.join(
        f'<tr><td class="mono">{e(n)}</td><td>{e(why)}</td><td class="{"p" if n in manual else "y"}">{"manual" if n in manual else "disabled"}</td></tr>'
        for n, why in services)
    task_rows = ''.join(f'<tr><td class="mono">{e(p)}{e(n)}</td></tr>' for p, n in tasks)
    app_items = ''.join(f'<li class="mono">{e(a)}</li>' for a in apps)
    keep_rows = ''.join(f'<tr><td>{e(when)}</td><td>{e(what)}</td></tr>' for when, what in KEEPS)
    reg_blocks = ''.join(
        f'<details><summary>{e(section)} <span class="muted tiny">({len(vals)} values)</span></summary><div style="overflow-x:auto"><table class="cmp" style="min-width:0"><tbody>'
        + ''.join(f'<tr><td class="mono" style="width:auto">{e(p)}</td><td class="mono">{e(n)}</td></tr>' for p, n in vals)
        + '</tbody></table></div></details>'
        for section, vals in reg.items())
    reg_total = sum(len(v) for v in reg.values())
    yours = strings(re.search(r"\$yours = @\(([^\n]*)\)", text).group(1))
    yours_items = ''.join(f'<li class="mono">{e(y)}</li>' for y in yours)
    games_block = text[text.index('$script:Games = @('):text.index('function Get-GameRoots')]
    games = [(m.group(1), strings(m.group(2))) for m in re.finditer(r"@\{ name = '([^']+)'; exes = @\(([^)]*)\)", games_block)]
    game_rows = ''.join(f'<tr><td>{e(n)}</td><td class="mono">{e(", ".join(x))}</td></tr>' for n, x in games)
    legacy_rows = ''.join(f'<tr><td class="mono">{e(n)}</td><td>{e(what)}</td><td>capability</td></tr>' for n, what in caps) + \
        ''.join(f'<tr><td class="mono">{e(n)}</td><td>{e(what)}</td><td>optional feature</td></tr>' for n, what in feats)

    return f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Everything it touches — OmniDx Tune</title>
<meta name="description" content="Every service, scheduled task, preinstalled app and registry value OmniDx Tune changes, with the reason next to each, and what it keeps on your PC and why. Generated from the script itself.">
<meta name="theme-color" content="#050308">
<link rel="icon" href="../assets/mark.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../assets/icons/apple-touch-icon.png">
<link rel="canonical" href="https://omnidx.net/studio/what-it-touches/">
<meta property="og:url" content="https://omnidx.net/studio/what-it-touches/">
<meta property="og:image" content="https://omnidx.net/studio/assets/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="OmniDx Tune: a PowerShell window running the tune, the process count falling from 214 to 86.">
<meta name="twitter:image" content="https://omnidx.net/studio/assets/og-card.png">
<meta name="twitter:title" content="Everything it touches — OmniDx Tune">
<meta name="twitter:description" content="Every service, task, app and registry value the tune changes, with the reason, and what it keeps and why.">
<meta property="og:site_name" content="OmniDx Tune">
<meta property="og:title" content="Everything it touches — OmniDx Tune">
<meta property="og:description" content="Every service, task, app and registry value the tune changes, with the reason, and what it keeps and why.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="../assets/studio.css">
<script>
(function(){{try{{var t=localStorage.getItem('omnidx.theme')||'dark';document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();
</script>
<style>
  .touch details{{border:1px solid var(--line);border-radius:13px;background:var(--surface);padding:0 18px;margin-bottom:10px}}
  .touch summary{{cursor:pointer;padding:14px 0;font-weight:640;font-size:15px;list-style:none}}
  .touch summary::-webkit-details-marker{{display:none}}
  .touch details[open]{{border-color:var(--blue)}}
  .touch table{{margin-bottom:14px}}
  .touch ul.apps{{columns:2;column-gap:28px;padding-left:18px;font-size:13px;color:var(--text-2)}}
  @media(max-width:600px){{.touch ul.apps{{columns:1}}}}
</style>
</head>
<body>
<div class="aurora" aria-hidden="true"><div class="grid"></div></div>
<!-- chrome:nav -->
<!-- /chrome:nav -->
<header class="hero" style="padding:64px 0 30px">
  <div class="wrap center">
    <div class="eyebrow"><span class="pulse"></span>Generated from the script · v{e(version)}</div>
    <h1 style="font-size:clamp(34px,5.6vw,58px)">Everything it touches.</h1>
    <p class="lede">
      This page is written by a tool that reads <a href="https://omnidx.net/tune/omnidx.ps1">the script</a> and
      lists what it does, so the page cannot say one thing while the script does another. Every row is
      recorded when it is changed and put back by undo.
    </p>
  </div>
</header>

<section id="keeps" style="padding-top:26px">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>What it keeps, and why</h2>
      <p>Decided on your PC from what it finds, before anything changes. The free report lists these for your machine.</p>
    </div>
    <div class="cmp-wrap"><table class="cmp" style="min-width:0"><thead><tr><th>When</th><th>Kept</th></tr></thead><tbody>{keep_rows}</tbody></table></div>
  </div>
</section>

<section id="services">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Services ({len(services)})</h2>
      <p>Stopped and set to manual or disabled, never deleted. Anything in the table above stays when your PC needs it.
        Services can start any one of them again.</p>
    </div>
    <div class="cmp-wrap"><table class="cmp" style="min-width:0"><thead><tr><th>Service</th><th>What it is</th><th>Set to</th></tr></thead><tbody>{svc_rows}</tbody></table></div>
  </div>
</section>

<section id="tasks">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Scheduled tasks ({len(tasks)})</h2>
      <p>Disabled, not deleted. Plus NVIDIA's crash-report and updater tasks when an NVIDIA card is found. Task Scheduler can enable any of them again.</p>
    </div>
    <div class="cmp-wrap"><table class="cmp" style="min-width:0"><tbody>{task_rows}</tbody></table></div>
  </div>
</section>

<section id="apps">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Preinstalled apps ({len(apps)} patterns)</h2>
      <p>Removed for your account when present. Each comes back from the Microsoft Store. Patterns with a star match the
        third-party apps some PCs ship with. The Xbox apps go only with <span class="mono">-CutXbox</span>.</p>
    </div>
    <ul class="apps">{app_items}</ul>
  </div>
</section>

<section id="legacy">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Legacy pieces of Windows ({len(caps) + len(feats)})</h2>
      <p>Removed when present. Fax and Scan stays when a printer is installed; Hello face stays when a Hello camera or reader is present.
        Undo puts every one back (a capability needs Windows Update reachable to come back). OneDrive is uninstalled only when nobody is
        signed in to it; your files stay, and undo reinstalls it.</p>
    </div>
    <div class="cmp-wrap"><table class="cmp" style="min-width:0"><thead><tr><th>Name</th><th>What it is</th><th>Kind</th></tr></thead><tbody>{legacy_rows}</tbody></table></div>
  </div>
</section>

<section id="registry">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Registry values ({reg_total})</h2>
      <p>Every value written, by section. The value it had before is recorded and undo writes it back;
        a value that did not exist is removed again.</p>
    </div>
    {reg_blocks}
  </div>
</section>

<section id="games">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>Games it writes a profile for ({len(games)})</h2>
      <p>By the game's own executable name, so it applies wherever the game is installed: CPU priority high, I/O and memory priority raised, the high-performance GPU, fullscreen optimisations off. The report adds each game's competitive in-game settings. Vanguard, Easy Anti-Cheat, BattlEye, Ricochet and every game file are never touched.</p>
    </div>
    <div class="cmp-wrap"><table class="cmp" style="min-width:0"><thead><tr><th>Game</th><th>Executables</th></tr></thead><tbody>{game_rows}</tbody></table></div>
  </div>
</section>

<section id="keep">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>What the keep task checks</h2>
      <p>Only if you said yes to it. Three minutes after each sign-in it compares every service, scheduled task and registry value above with the machine and sets again what a Windows update turned back on. It never adds anything, and anything under these paths is left alone on purpose: if it changed after the tune, it was you, in Settings or Task Manager, and that wins.</p>
    </div>
    <ul class="tick" style="max-width:70ch">{yours_items}</ul>
    <p class="small muted" style="margin-top:14px">Its log is <span class="mono">C:\\OmniDx\\keep-log.txt</span>; <span class="mono">-NoKeep</span> never makes it; undo removes it. Read the comparison itself: <span class="mono">Get-Drift</span> in the script.</p>
  </div>
</section>

<section id="also">
  <div class="wrap touch">
    <div class="section-head reveal">
      <h2>And, outside the registry</h2>
    </div>
    <ul class="tick" style="max-width:70ch">
      <li>A System Restore point, and a registry export of the areas above plus the service list, before anything else</li>
      <li>A power plan named OmniDx, made from Ultimate Performance; undo makes your previous plan active again and deletes it</li>
      <li>Hibernation off on desktops (hiberfil.sys freed); left alone on laptops</li>
      <li>TCP settings by netsh and adapter properties by their driver names; every one recorded with its previous value</li>
      <li>Discord's settings.json and Spotify's prefs, backed up first, only while the apps are closed</li>
      <li>Store app pre-launch off (Disable-MMAgent); NTFS last-access stamps off; NTFS allowed more cache memory with 16 GB or more; TRIM switched on for SSDs if it was off. Each recorded with its previous value</li>
      <li>One scheduled task that runs once at your next sign-in, writes the after-restart process count and removes itself; skip it with <span class="mono">-NoAfterCount</span></li>
      <li>One scheduled task, "OmniDx keep", if you say yes to it: three minutes after each sign-in it compares the services, tasks and values above with the machine and puts back what a Windows update turned on. It never touches startup apps or personal preferences, logs to <span class="mono">C:\OmniDx\keep-log.txt</span>, and undo removes it; <span class="mono">-NoKeep</span> never makes it</li>
      <li>OneDrive uninstalled when nobody is signed in to it (files untouched; undo reinstalls); kept when you are</li>
      <li>Edge policies: shopping assistant, recommendations, Spotlight, feedback prompts and reporting off; your tabs and settings untouched</li>
      <li>Cleanup: temp files older than a day, the Windows Update download cache and the peer-to-peer update cache; not undoable, because none of it is anything</li>
      <li>Memory integrity off only with <span class="mono">-Aggressive</span>, and only after asking again</li>
    </ul>
    <p class="small muted" style="margin-top:20px">Not touched, ever: Defender, the firewall, SmartScreen, UAC, Secure Boot, TPM, BitLocker,
      Windows Update, any anti-cheat, any driver, your files and browser data. <a href="../trust/#cant">The full list.</a></p>
  </div>
</section>

<!-- chrome:footer -->
<!-- /chrome:footer -->
<script type="module" src="../assets/studio.js"></script>
</body>
</html>
'''


def main() -> int:
    text = SCRIPT.read_text(encoding='utf-8')
    fresh = page(text)
    if '--check' in sys.argv:
        current = OUT.read_text() if OUT.exists() else ''
        # The nav and footer are stamped in afterwards; compare the parts between them.
        strip = lambda h: re.sub(r'<!-- chrome:nav -->.*?<!-- /chrome:nav -->', '', re.sub(r'<!-- chrome:footer -->.*?<!-- /chrome:footer -->', '', h, flags=re.S), flags=re.S)
        if strip(current) != strip(fresh):
            print('studio/what-it-touches/index.html is out of date: run python3 tools/tune-touches.py && python3 tools/build-site.py')
            return 1
        print('what-it-touches is current')
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(fresh)
    print(f'wrote {OUT.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
