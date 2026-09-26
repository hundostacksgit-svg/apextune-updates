#!/usr/bin/env python3
"""
Stamp the shared chrome — the top menu box, the mobile drawer and the footer —
into every OmniDx page.

Four static pages each need the same navigation, and the only thing that
differs between them is how many `../` sit in front of a link. Hand-editing
four copies is how a site ends up with a menu that has a dead link on one page
and not the others, so the menu lives here once and gets written out.

The pages stay plain static HTML with the nav baked in: no framework, no build
step for the visitor, and the menu is there before a single byte of JavaScript
runs. Re-run this after changing the menu:

    python3 tools/build-site.py

It rewrites in place and is safe to run as many times as you like.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'studio'

# page -> prefix back to studio/
#
# omnidx.net sells OmniDx Tune. The site still lives under studio/ because
# that is where every link, redirect and Square return URL already points;
# moving the folder would break all of them for nothing. The video editor
# (OmniDx Studio) stays reachable at studio/app/ and is linked from the
# footer only.
PAGES = {
    'index.html': '',
    'pricing/index.html': '../',
    'download/index.html': '../',
    'account/index.html': '../',
    'trust/index.html': '../',
    'guide/index.html': '../',
    'fresh/index.html': '../',
    'undervolt/index.html': '../',
    'builds/index.html': '../',
    'edition/index.html': '../',
    'showcase/index.html': '../',
    'what-it-touches/index.html': '../',
    'changelog/index.html': '../',
    'terms/index.html': '../',
    # The front page in Spanish and Portuguese, written by tools/build-lang.py (run it first).
    'es/index.html': '../',
    'pt/index.html': '../',
}

LOGO_SVG = (
    '<svg viewBox="0 0 64 64" aria-hidden="true" style="width:18px;height:18px">'
    '<rect x="12" y="17" width="30" height="6" rx="3" fill="#fff" opacity=".92"/>'
    '<rect x="12" y="29" width="20" height="6" rx="3" fill="#fff" opacity=".68"/>'
    '<rect x="12" y="41" width="11" height="6" rx="3" fill="#fff" opacity=".45"/>'
    '<path d="M47 14 L37 34 L45 34 L41 50 L53 28 L45 28 Z" fill="#fff"/></svg>'
)

# Kept for anything that genuinely needs to point at the source. Nothing the
# public menu or footer links to should use it: a visitor came here for a video
# editor, not for a repository. Links into the repository must name a branch
# that exists. This project has
# no "main": the default branch is the diagnostics one, and the Studio files
# live only here. A /blob/main/ link therefore 404s, and so does /blob/HEAD/,
# because HEAD resolves to a default branch without these files. If this branch
# is ever renamed or merged, change this one line and re-run this script.
BRANCH = 'claude/omnidx-editing-platform-9phdcc'

# The OmniDx Discord: a permanent invite (never expires, no use limit), in the bar on every page, the phone
# menu and the footer.
DISCORD = 'https://discord.gg/VvbYJcDQbB'
DISCORD_SVG = (
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037'
    'c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37'
    'a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028'
    'c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291'
    'a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127'
    'c-.598.35-1.22.645-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03'
    '.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419'
    ' 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419'
    ' 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>'
)
DOCS = f'https://github.com/hundostacksgit-svg/apextune-updates/blob/{BRANCH}/docs/'

# ---------------------------------------------------------------------------
# The menu. Each entry is either a plain link or a group with a panel under it.
# Items are (icon, title, one-line description, href).
# ---------------------------------------------------------------------------
MENU = [
    {
        'label': 'What it does',
        'items': [
            ('🧹', 'What gets cut', 'Startup apps, services, tasks, bloat, telemetry', '{s}#cut'),
            ('🗑️', 'Debloat, for good', 'Preinstalled apps, OEM trials, OneDrive if unused, legacy Windows', '{s}#debloat'),
            ('🔍', 'Reads your PC first', 'Laptop or desktop, printers, Bluetooth, Wi-Fi, Xbox — the safe bar is yours', '{s}#tailored'),
            ('⚡', 'The OmniDx power plan', 'Built for frames: no core parking, no bus sleep', '{s}#power'),
            ('🎮', 'Game profiles', 'Fortnite, VALORANT, CS2, Marvel Rivals and twenty-seven more', '{s}#games'),
            ('🎯', "Settings inside your games", "V-Sync, shadows and blur written into each game's own file", '{s}#gamefiles'),
            ('🌡️', 'GPU, heat and network', 'Throttling, temperatures, jitter and loss, as numbers', '{s}#health'),
            ('🎙️', 'Streamers', 'OBS and Streamlabs keep what they need', '{s}#streamers'),
            ('📶', 'Network', 'Nagle off, adapter power saving off, latency first', '{s}#network'),
            ('🎧', 'Discord, Spotify, browser', 'Hardware acceleration on, background running off', '{s}#apps'),
            ('🧬', 'BIOS checklist', 'Written for your exact board and CPU', '{s}#bios'),
            ('🛟', 'Fail-safes', 'Restore point, undo in one file, security untouched', '{s}#safe'),
            ('📋', 'Everything it touches', 'Every service, task, app and value, with the reason', '{s}what-it-touches/'),
        ],
    },
    {
        'label': 'Run it',
        'items': [
            ('⌨️', 'The command', 'One line in PowerShell. Nothing installed.', '{s}download/'),
            ('📋', 'Free report mode', 'See what it would find, no key, changes nothing', '{s}download/#report'),
            ('↩️', 'Undo', 'Put everything back, one line', '{s}download/#undo'),
            ('🎛️', 'Options', 'Aggressive, cut Xbox, keep a startup app, DNS', '{s}download/#options'),
            ('🦅', 'OmniDx Edition', 'Windows set up for games, with every key', '{s}edition/'),
            ('💿', 'A fresh install', 'An answer file for a clean Windows, free', '{s}fresh/'),
            ('🔑', 'Your key', 'Get it again after paying', '{s}activate/'),
            ('📜', 'Read the script', 'Every line, public, before you run it', 'https://omnidx.net/tune/omnidx.ps1'),
        ],
    },
    {'label': 'Showcase', 'href': '{s}showcase/'},
    {'label': 'Pricing', 'href': '{s}pricing/'},
    {
        'label': 'Help',
        'items': [
            ('💬', 'FAQ', 'Anti-cheat, laptops, money, new PC', '{s}pricing/#faq'),
            ('🛡️', 'Is this safe? Is it a scam?', 'The straight answer, and how to check', '{s}trust/'),
            ('📘', 'Do it by hand', 'The honest list, nothing to buy', '{s}guide/'),
            ('🧊', 'Undervolt, not overclock', 'Cooler, quieter, same frames', '{s}undervolt/'),
            ('🧱', 'Custom Windows builds', 'What they cut, and where the tune stops', '{s}builds/'),
            ('🚫', "What it won't touch", 'Defender, firewall, Secure Boot, your drivers', '{s}trust/#cant'),
            ('🔓', 'Paid but no key?', 'Your receipt number gets it', '{s}activate/'),
            ('🗒️', 'Changelog', 'What changed in each version', '{s}changelog/'),
            ('📄', 'Terms, privacy, money', 'Plain words, one page', '{s}terms/'),
            ('🎬', 'OmniDx Studio', 'The video editor, still here', '{s}app/'),
        ],
    },
]


def href(raw: str, s: str) -> str:
    return raw.replace('{s}', s)


def panel_items(group, s) -> str:
    return ''.join(
        f'<a class="mb-link" href="{href(h, s)}" role="menuitem">'
        f'<span class="mb-ico" aria-hidden="true">{icon}</span>'
        f'<span class="mb-txt"><b>{title}</b><span>{desc}</span></span></a>'
        for icon, title, desc, h in group['items']
    )


def build_nav(s: str) -> str:
    """The sticky top bar: logo, the menu box, then the account controls."""
    top = []
    for i, group in enumerate(MENU):
        if 'href' in group:
            top.append(
                f'      <a class="mb-btn" href="{href(group["href"], s)}">{group["label"]}</a>'
            )
            continue
        gid = f'mbp{i}'
        top.append(
            f'      <div class="mb" data-mb>\n'
            f'        <button class="mb-btn" type="button" aria-expanded="false" aria-haspopup="true"'
            f' aria-controls="{gid}">{group["label"]}'
            f'<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
            f'</button>\n'
            f'        <div class="mb-pop" id="{gid}" role="menu">{panel_items(group, s)}</div>\n'
            f'      </div>'
        )
    return f'''<nav class="nav">
  <div class="wrap">
    <a class="logo" href="{s or './'}" aria-label="OmniDx"><img class="logo-img" src="{s}assets/logo/omnidx-logo-800.webp" srcset="{s}assets/logo/omnidx-logo-800.webp 800w, {s}assets/logo/omnidx-logo-1600.webp 1600w" sizes="132px" width="800" height="402" alt="OmniDx" decoding="async"></a>

    <!-- The menu box. One row on a desktop, and the same links live in the
         drawer below for phones — never two different menus to keep in step. -->
    <div class="menubox" data-menubox>
{chr(10).join(top)}
    </div>

    <div class="nav-right">
      <button class="tbtn" data-theme-toggle aria-label="Switch between dark and light">
        <svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
        <svg class="moon" viewBox="0 0 24 24"><path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5z"/></svg>
      </button>
      <a class="nav-discord" href="{DISCORD}" target="_blank" rel="noopener" aria-label="Join the OmniDx Discord">{DISCORD_SVG}<span>Discord</span></a>
      <a class="nav-key" href="{s}activate/">Your key</a>
      <a class="btn btn-primary nav-cta" href="{s}pricing/">Get it — <span data-price="tune">$19.99</span></a>
      <button class="burger" type="button" data-drawer aria-expanded="false"
              aria-controls="drawer" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
  <span class="nav-progress" data-progress aria-hidden="true"></span>
</nav>

<!-- Phone menu. Hidden until the button is pressed, and it holds exactly the
     same links as the box above so nothing is only reachable on a desktop. -->
<div class="drawer" id="drawer" hidden>
  <div class="drawer-inner">
{build_drawer(s)}
  </div>
</div>'''


def build_drawer(s: str) -> str:
    out = [
        '    <div class="drawer-top">',
        f'      <a class="btn btn-primary btn-lg" href="{s}pricing/">Get it — <span data-price="tune">$19.99</span></a>',
        f'      <a class="btn btn-lg" href="{s}download/">Run it</a>',
        f'      <a class="btn btn-lg drawer-discord" href="{DISCORD}" target="_blank" rel="noopener">{DISCORD_SVG}Join the Discord</a>',
        '    </div>',
    ]
    for group in MENU:
        if 'href' in group:
            out.append(
                f'    <a class="drawer-solo" href="{href(group["href"], s)}">{group["label"]}</a>'
            )
            continue
        links = ''.join(
            f'\n        <a href="{href(h, s)}"><span aria-hidden="true">{icon}</span>{title}'
            f'<em>{desc}</em></a>'
            for icon, title, desc, h in group['items']
        )
        out.append(
            f'    <div class="drawer-group">\n'
            f'      <div class="drawer-h">{group["label"]}</div>\n'
            f'      <div class="drawer-links">{links}\n      </div>\n'
            f'    </div>'
        )
    return '\n'.join(out)


def build_footer(s: str) -> str:
    return f'''<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <a class="logo logo-foot" href="{s or './'}" aria-label="OmniDx"><img class="logo-img" src="{s}assets/logo/omnidx-logo-800.webp" width="800" height="402" alt="OmniDx" loading="lazy" decoding="async"></a>
        <p class="small" style="margin-top:14px;max-width:34ch">One command. Windows cut down to what your
          games need, a power plan built for frames, and a BIOS checklist for your exact board.</p>
        <p class="tiny muted" style="margin-top:10px">One payment. No subscription, ever. Nothing installed.</p>
        <div id="rate-us" class="rate-host" aria-label="Rate OmniDx Tune"></div>
      </div>
      <div>
        <h4>What it does</h4>
        <a href="{s}#cut">What gets cut</a>
        <a href="{s}#debloat">Debloat, for good</a>
        <a href="{s}#tailored">Reads your PC first</a>
        <a href="{s}#power">The power plan</a>
        <a href="{s}#games">Game profiles</a>
        <a href="{s}#bios">BIOS checklist</a>
        <a href="{s}#safe">Fail-safes</a>
        <a href="{s}what-it-touches/">Everything it touches</a>
        <a href="{s}showcase/">Showcase: real runs on camera</a>
      </div>
      <div>
        <h4>Get it</h4>
        <a href="{s}pricing/">Pricing</a>
        <a href="{s}download/">Run it</a>
        <a href="{s}edition/">OmniDx Edition</a>
        <a href="{s}activate/">Your key</a>
        <a href="{s}download/#undo">Undo</a>
        <a href="https://omnidx.net/tune/omnidx.ps1">Read the script</a>
      </div>
      <div>
        <h4>More</h4>
        <a href="{s}trust/">Is this safe? Is it a scam?</a>
        <a href="{s}pricing/#faq">FAQ</a>
        <a href="{s}trust/#cant">What it won't touch</a>
        <a href="{s}changelog/">Changelog</a>
        <a href="{s}terms/">Terms, privacy, money</a>
        <a href="{DISCORD}" target="_blank" rel="noopener">The OmniDx Discord</a>
        <a href="{s}es/" hreflang="es" lang="es">En español</a>
        <a href="{s}pt/" hreflang="pt-BR" lang="pt-BR">Em português</a>
        <a href="{s}app/">OmniDx Studio — the video editor</a>
        <span class="foot-support" data-support="OmniDx Tune — help" hidden></span>
      </div>
    </div>
    <div class="foot-note">
      <span>© 2026 OmniDx. One payment. Yours. Script <span data-script-version>v1.2.0</span>.</span>
      <span>Nothing leaves your PC except the key check.</span>
    </div>
  </div>
</footer>'''


# Generated blocks are fenced by these comments, so a second run replaces what
# the first one wrote instead of stacking a second menu on top of it. The
# fallback patterns are only used the first time, before the fences exist.
NAV_OPEN, NAV_CLOSE = '<!-- chrome:nav -->', '<!-- /chrome:nav -->'
FOOT_OPEN, FOOT_CLOSE = '<!-- chrome:footer -->', '<!-- /chrome:footer -->'

FENCED_NAV = re.compile(re.escape(NAV_OPEN) + r'.*?' + re.escape(NAV_CLOSE), re.S)
FENCED_FOOT = re.compile(re.escape(FOOT_OPEN) + r'.*?' + re.escape(FOOT_CLOSE), re.S)
FIRST_NAV = re.compile(r'<nav class="nav">.*?</nav>', re.S)
FIRST_FOOT = re.compile(r'<footer>.*?</footer>', re.S)


def swap(html, fenced, first, block, opener, closer, what, rel):
    """Replace a fenced block, or the original markup on the first run."""
    fresh = f'{opener}\n{block}\n{closer}'
    if fenced.search(html):
        return fenced.sub(lambda _m: fresh, html, count=1)
    if first.search(html):
        return first.sub(lambda _m: fresh, html, count=1)
    print(f'  !! no {what} found in {rel}', file=sys.stderr)
    return None


def main() -> int:
    # --check: write nothing, fail if any page's menu or footer is not what this would write (a page regenerated by
    # another tool, tune-touches.py for one, comes back with empty markers until this is run).
    check = '--check' in sys.argv
    changed = 0
    for rel, s in PAGES.items():
        path = SITE / rel
        html = path.read_text()
        before = html

        html = swap(html, FENCED_NAV, FIRST_NAV, build_nav(s),
                    NAV_OPEN, NAV_CLOSE, '<nav class="nav">', rel)
        if html is None:
            return 1
        html = swap(html, FENCED_FOOT, FIRST_FOOT, build_footer(s),
                    FOOT_OPEN, FOOT_CLOSE, '<footer>', rel)
        if html is None:
            return 1

        if html != before:
            changed += 1
            if check:
                print(f'  stale chrome in {rel}: run python3 tools/build-site.py', file=sys.stderr)
                continue
            path.write_text(html)
            print(f'  updated {rel}')
        elif not check:
            print(f'  unchanged {rel}')
    if check:
        print(f'chrome current on {len(PAGES) - changed} of {len(PAGES)} pages')
        return 1 if changed else 0
    print(f'{changed} page(s) rewritten')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
