#!/usr/bin/env python3
"""
Stamp the shared chrome — the top menu box, the mobile drawer and the footer —
into every OmniDx Studio page.

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
# omnidx.net is OmniDx Studio's domain and nothing else's. The other app in
# this repository is not part of this site, is not linked from it, and is not
# published under this domain — so there is no second prefix to track.
PAGES = {
    'index.html': '',
    'pricing/index.html': '../',
    'download/index.html': '../',
    'account/index.html': '../',
}

LOGO_SVG = (
    '<svg viewBox="0 0 64 64" aria-hidden="true" style="width:18px;height:18px">'
    '<rect x="13" y="18" width="26" height="6" rx="3" fill="#fff" opacity=".92"/>'
    '<rect x="13" y="29" width="18" height="6" rx="3" fill="#fff" opacity=".68"/>'
    '<rect x="13" y="40" width="30" height="6" rx="3" fill="#fff" opacity=".45"/>'
    '<path d="M43 24.5 L54 32 L43 39.5 Z" fill="#fff"/></svg>'
)

# Links into the repository must name a branch that exists. This project has
# no "main": the default branch is the diagnostics one, and the Studio files
# live only here. A /blob/main/ link therefore 404s, and so does /blob/HEAD/,
# because HEAD resolves to a default branch without these files. If this branch
# is ever renamed or merged, change this one line and re-run this script.
BRANCH = 'claude/omnidx-editing-platform-9phdcc'
DOCS = f'https://github.com/hundostacksgit-svg/apextune-updates/blob/{BRANCH}/docs/'

# ---------------------------------------------------------------------------
# The menu. Each entry is either a plain link or a group with a panel under it.
# Items are (icon, title, one-line description, href).
# ---------------------------------------------------------------------------
MENU = [
    {
        'label': 'Products',
        'items': [
            ('🎬', 'The editor', 'Multitrack timeline, colour, effects, export', '{s}#features'),
            ('✨', 'AI editing', 'Say what you want. It builds the cut.', '{s}#ai'),
            ('⚡', 'Edit styles', '11 one-tap styles — anime, phonk, velocity', '{s}#styles'),
            ('🎚️', 'Pro tools', 'ProRes, audio repair, proxies, colour wheels', '{s}#pro'),
            ('🎓', 'Skill levels', 'Beginner, Intermediate, Professional', '{s}#levels'),
            ('🔊', 'Audio filters', 'Underwater, telephone, cathedral, robot', '{s}#pro'),
        ],
    },
    {
        'label': 'Download',
        'items': [
            ('🍎', 'macOS', 'Apple silicon and Intel', '{s}download/#desktop'),
            ('🪟', 'Windows', 'Windows 10 and 11', '{s}download/#desktop'),
            ('📱', 'iPhone &amp; iPad', 'Installs from Safari, no App Store', '{s}download/#mobile'),
            ('🤖', 'Android', 'Android 10 and up', '{s}download/#mobile'),
            ('🌐', 'Open in the browser', 'No install. The whole editor.', '{s}app/'),
            ('📦', 'All downloads', 'Every platform on one page', '{s}download/'),
        ],
    },
    {'label': 'Pricing', 'href': '{s}pricing/'},
    {
        'label': 'Help',
        'items': [
            ('🚀', 'Getting started', 'The walkthrough, five minutes', '{s}app/'),
            ('✅', "What's built", 'The honest built / not-built list', DOCS + 'STUDIO-COMPLAINTS.md'),
            ('💬', 'FAQ', 'Payments, devices, refunds', '{s}pricing/#faq'),
            ('🔑', 'Redeem a key', 'Unlock with a licence key', '{s}account/#redeem'),
            ('🛠️', 'Set up payments', 'Take money in about ten minutes', DOCS + 'SQUARE-SETUP.md'),
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
    <a class="logo" href="{s or './'}"><span class="mark">{LOGO_SVG}</span>OmniDx <small>Studio</small></a>

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
      <a class="nav-login" href="{s}account/">Log in</a>
      <a class="btn btn-primary nav-cta" href="{s}app/">Open editor</a>
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
        f'      <a class="btn btn-primary btn-lg" href="{s}app/">Open the editor</a>',
        f'      <a class="btn btn-lg" href="{s}account/">Log in</a>',
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
        <a class="logo" href="{s or './'}"><span class="mark">{LOGO_SVG}</span>OmniDx <small>Studio</small></a>
        <p class="small" style="margin-top:14px;max-width:34ch">The editor that stops fighting you.
          Free to use, yours to own, and it never holds your work hostage.</p>
        <p class="tiny muted" style="margin-top:10px">One payment. No subscription, ever.</p>
      </div>
      <div>
        <h4>Product</h4>
        <a href="{s}#features">Features</a>
        <a href="{s}#ai">AI editing</a>
        <a href="{s}#pro">Pro tools</a>
        <a href="{s}#styles">Edit styles</a>
        <a href="{s}#fixes">What we fixed</a>
      </div>
      <div>
        <h4>Get it</h4>
        <a href="{s}app/">Open in browser</a>
        <a href="{s}download/#desktop">Mac &amp; Windows</a>
        <a href="{s}download/#mobile">iOS &amp; Android</a>
        <a href="{s}pricing/">Pricing</a>
        <a href="{s}account/">Your account</a>
      </div>
      <div>
        <h4>More</h4>
        <a href="{s}pricing/#faq">FAQ</a>
        <a href="{s}account/#redeem">Redeem a key</a>
        <a href="{DOCS}STUDIO-COMPLAINTS.md">What's built</a>
        <span class="foot-support" data-support="OmniDx Studio — help" hidden></span>
      </div>
    </div>
    <div class="foot-note">
      <span>© 2026 OmniDx. Built to be owned, not rented.</span>
      <span>Your footage stays on your machine unless you ask it not to.</span>
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
            path.write_text(html)
            changed += 1
            print(f'  updated {rel}')
        else:
            print(f'  unchanged {rel}')
    print(f'{changed} page(s) rewritten')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
