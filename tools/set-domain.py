#!/usr/bin/env python3
"""
Point OmniDx at a custom domain, safely.

Writing a CNAME file makes GitHub Pages serve the site *only* on that hostname.
Do it before DNS is pointing at GitHub and the site goes dark until it is. This
script checks first and refuses if the domain isn't ready, so that can't happen.

    python3 tools/set-domain.py omnidx.net      # check, then write CNAME
    python3 tools/set-domain.py --check-only omnidx.net
    python3 tools/set-domain.py --remove        # go back to the github.io URL

The link-preview tags in index.html carry absolute URLs, because the scrapers
behind iMessage, Discord and the rest will not resolve a relative one. Moving the
site means rewriting them, so this does that too -- including after a repository
rename, which changes the address without involving DNS at all:

    python3 tools/set-domain.py --site-url https://user.github.io/omnidx/
"""

from __future__ import annotations

import argparse
import random
import socket
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CNAME = ROOT / "CNAME"
INDEX = ROOT / "index.html"

# Every absolute link in the page head. Each is rewritten as a whole URL rather
# than by substituting a hostname, so a half-updated tag is not possible.
SITE_TAGS = (
    ('<link rel="canonical" href="', '">'),
    ('<meta property="og:url" content="', '">'),
    ('<meta property="og:image" content="', '">'),
    ('<meta name="twitter:image" content="', '">'),
)

# GitHub Pages' apex addresses. Your A records must be exactly these four.
GH_IPS = {"185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"}


def dns_query(name: str, qtype: int, server: str = "8.8.8.8"):
    """Return (rcode, answer_count). qtype 1=A, 2=NS."""
    tid = random.randint(0, 0xFFFF)
    header = struct.pack(">HHHHHH", tid, 0x0100, 1, 0, 0, 0)
    q = b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\x00"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(6)
    try:
        sock.sendto(header + q + struct.pack(">HH", qtype, 1), (server, 53))
        data, _ = sock.recvfrom(4096)
    finally:
        sock.close()
    flags = struct.unpack(">H", data[2:4])[0]
    ancount = struct.unpack(">H", data[6:8])[0]
    return flags & 0xF, ancount


def a_records(name: str) -> set[str]:
    try:
        return set(socket.gethostbyname_ex(name)[2])
    except OSError:
        return set()


def check(domain: str) -> tuple[bool, list[str]]:
    """(ready, notes). Ready means the CNAME file is safe to write."""
    notes = []

    try:
        rcode, _ = dns_query(domain, 2)
    except OSError as exc:
        notes.append(f"Could not reach a DNS resolver ({type(exc).__name__}). Check by hand: dig +short {domain}")
        return False, notes

    if rcode == 3:
        notes.append(f"{domain} is not registered — it returns NXDOMAIN.")
        notes.append("Buy it first (Cloudflare Registrar sells .net at cost), then run this again.")
        return False, notes

    found = a_records(domain)
    if not found:
        notes.append(f"{domain} is registered but has no A records yet.")
        notes.append("Add the four GitHub Pages A records at your registrar, then re-run.")
        return False, notes

    missing = GH_IPS - found
    extra = found - GH_IPS
    if missing:
        notes.append(f"{domain} resolves to {', '.join(sorted(found))}")
        notes.append(f"Missing GitHub Pages addresses: {', '.join(sorted(missing))}")
        if extra:
            notes.append(f"Unexpected addresses present: {', '.join(sorted(extra))}")
        notes.append("DNS may still be propagating — it can take up to an hour.")
        return False, notes

    notes.append(f"{domain} points at all four GitHub Pages addresses.")
    www = a_records(f"www.{domain}")
    if www:
        notes.append(f"www.{domain} resolves too.")
    else:
        notes.append(f"www.{domain} has no record yet — add a CNAME to hundostacksgit-svg.github.io if you want it.")
    return True, notes


def rewrite_site_url(base: str) -> list[str]:
    """Point the link-preview tags at `base`. Returns what changed."""
    base = base.rstrip("/") + "/"
    html = INDEX.read_text(encoding="utf-8")

    # The canonical tag is the authority on where the site currently lives.
    # Everything else is rewritten relative to it, because a project page's URL
    # carries a repository path -- "/user.github.io/omnidx/" -- that belongs to
    # the site root, not to the file underneath it. Splitting on slashes instead
    # would fold that path into the filename and produce /omnidx/old-name/....
    cstart = html.find(SITE_TAGS[0][0])
    if cstart < 0:
        return ["! no canonical tag in index.html — cannot tell where the site lives"]
    cstart += len(SITE_TAGS[0][0])
    old_base = html[cstart:html.find(SITE_TAGS[0][1], cstart)].rstrip("/") + "/"

    changed = []
    for prefix, suffix in SITE_TAGS:
        start = html.find(prefix)
        if start < 0:
            changed.append(f"! {prefix.strip()} not found in index.html — left alone")
            continue
        vstart = start + len(prefix)
        vend = html.find(suffix, vstart)
        old = html[vstart:vend]
        if not old.startswith(old_base.rstrip("/")):
            changed.append(f"! {old} is not under {old_base} — left alone")
            continue
        tail = old[len(old_base):] if old.startswith(old_base) else ""
        new_url = base + tail
        if new_url != old:
            html = html[:vstart] + new_url + html[vend:]
            changed.append(f"  {old}\n    -> {new_url}")
    INDEX.write_text(html, encoding="utf-8")
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description="Point OmniDx at a custom domain, safely")
    ap.add_argument("domain", nargs="?", help="e.g. omnidx.net")
    ap.add_argument("--check-only", action="store_true", help="report readiness, change nothing")
    ap.add_argument("--remove", action="store_true", help="delete CNAME and return to the github.io URL")
    ap.add_argument("--force", action="store_true", help="write CNAME even if the check fails (will break the site)")
    ap.add_argument("--site-url", metavar="URL",
                    help="just repoint the link-preview tags at URL (use after a repo rename)")
    args = ap.parse_args()

    if args.site_url:
        changes = rewrite_site_url(args.site_url)
        for c in changes:
            print(c)
        print("\nNothing to change." if not changes else "\nUpdated index.html. Commit and push.")
        return 0

    if args.remove:
        if CNAME.exists():
            CNAME.unlink()
            print("Removed CNAME. Commit and push, and the site returns to the github.io address.")
        else:
            print("No CNAME file — the site is already on the github.io address.")
        return 0

    if not args.domain:
        ap.error("give a domain, or use --remove")

    domain = args.domain.strip().lower().removeprefix("https://").removeprefix("http://").rstrip("/")
    print(f"Checking {domain}…\n")
    ready, notes = check(domain)
    for n in notes:
        print(f"  {n}")
    print()

    if args.check_only:
        print("Ready." if ready else "Not ready yet.")
        return 0 if ready else 1

    if not ready and not args.force:
        print("Refusing to write CNAME — it would take the live site offline until DNS matches.")
        print("Re-run once the records are in place, or pass --force if you know better.")
        return 1

    CNAME.write_text(domain + "\n", encoding="utf-8")
    print(f"Wrote {CNAME} containing: {domain}")
    for c in rewrite_site_url(f"https://{domain}/"):
        print(c)
    print("Repointed the link-preview tags at the new address.")
    print()
    print("Now commit and push:")
    print('  git add -A && git commit -m "Point the site at ' + domain + '" && git push')
    print()
    print("Then in Settings -> Pages, tick Enforce HTTPS once the certificate is issued.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
