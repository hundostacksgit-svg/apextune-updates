#!/usr/bin/env python3
"""Cut a release of OmniDx Studio.

Everyone running the app checks version.json every half hour. Bumping it is
what makes an update reach them: the running copy notices, shows a bar with
these notes, and reloads onto the new files when they press the button.

    python3 tools/release.py 1.2.0 --headline "Background removal" \
        --note "Remove a background without a green screen" \
        --note "Faster export on long timelines"

    python3 tools/release.py --show          # what is live right now

It rewrites three things and then it is a normal commit and push:
  version.json          what the running apps read
  studio/app/js/updates.js   the BUILD constant the app compares against
  studio/app/sw.js      the cache name, so the old shell is thrown away

Nothing here talks to a server. GitHub Pages publishes the commit; the apps
pick it up on their own.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_FILE = ROOT / "version.json"
UPDATES_JS = ROOT / "studio" / "app" / "js" / "updates.js"
SW_JS = ROOT / "studio" / "app" / "sw.js"


def load() -> dict:
    return json.loads(VERSION_FILE.read_text()) if VERSION_FILE.exists() else {}


def valid(version: str) -> bool:
    return bool(re.fullmatch(r"\d+\.\d+\.\d+", version))


def newer(a: str, b: str) -> bool:
    return tuple(int(x) for x in a.split(".")) > tuple(int(x) for x in b.split("."))


def bump(kind: str, current: str) -> str:
    major, minor, patch = (int(x) for x in current.split("."))
    if kind == "major":
        return f"{major + 1}.0.0"
    if kind == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Cut a release of OmniDx Studio.")
    ap.add_argument("version", nargs="?",
                    help="the new version, or one of: major, minor, patch")
    ap.add_argument("--headline", help="one line, shown on the update bar")
    ap.add_argument("--note", action="append", default=[],
                    help="a bullet in the release notes; repeat for more")
    ap.add_argument("--show", action="store_true", help="print the current version and exit")
    args = ap.parse_args()

    current = load()
    if args.show or not args.version:
        if not current:
            print("No version.json yet.")
            return 1
        print(f"{current['version']}  ({current.get('date', 'no date')})")
        print(f"  {current.get('headline', '')}")
        for note in current.get("notes", []):
            print(f"  - {note}")
        return 0

    version = args.version
    if version in {"major", "minor", "patch"}:
        version = bump(version, current.get("version", "1.0.0"))

    if not valid(version):
        print(f"'{version}' is not a version. Use 1.2.3, or major/minor/patch.", file=sys.stderr)
        return 1

    if current.get("version") and not newer(version, current["version"]):
        print(f"{version} is not newer than the current {current['version']}. "
              "Apps only update forwards, so this would reach nobody.", file=sys.stderr)
        return 1

    if not args.headline:
        print("A release needs --headline. It is the line people read on the update bar,\n"
              "and 'various improvements' is why nobody presses the button.", file=sys.stderr)
        return 1

    payload = {
        "version": version,
        "date": dt.date.today().isoformat(),
        "headline": args.headline,
        "notes": args.note or [args.headline],
        "minimum": current.get("minimum", "1.0.0"),
        "app": "studio",
    }
    VERSION_FILE.write_text(json.dumps(payload, indent=2) + "\n")

    # The constant the running app compares against.
    js = UPDATES_JS.read_text()
    js, n = re.subn(r"export const BUILD = '[\d.]+';",
                    f"export const BUILD = '{version}';", js, count=1)
    if not n:
        print("Could not find the BUILD constant in updates.js — fix that by hand.", file=sys.stderr)
        return 1
    UPDATES_JS.write_text(js)

    # A new cache name is what actually evicts the old shell.
    sw = SW_JS.read_text()
    sw, n = re.subn(r"const VERSION = 'omnidx-studio-v[^']+';",
                    f"const VERSION = 'omnidx-studio-v{version}';", sw, count=1)
    if not n:
        print("Could not find the cache name in sw.js — fix that by hand.", file=sys.stderr)
        return 1
    SW_JS.write_text(sw)

    print(f"Released {version}.")
    print(f"  {payload['headline']}")
    for note in payload["notes"]:
        print(f"  - {note}")
    print("\nNow commit and push. Every running copy picks it up within half an hour,")
    print("or the moment someone reopens the app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
