#!/usr/bin/env python3
"""
Generate OmniDx Pro licence codes.

Run this after a customer pays, then send them the code.

    python3 tools/make-licence.py                 # one code
    python3 tools/make-licence.py -n 10           # ten codes
    python3 tools/make-licence.py -n 5 --csv      # ready to paste into a sheet

The checksum matches app/js/pro.js exactly, so codes made here always validate
in the app with no server involved. Keep the generated codes somewhere you can
search — Cash App payments carry no order metadata, so your record of
"code X went to buyer Y" is the only link between the two.
"""

from __future__ import annotations

import argparse
import secrets
from datetime import date

# Must stay identical to app/js/pro.js
SALT = "omnidx-2026-licence"
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no I, O, 0 or 1
MASK = 0xFFFFFFFF


def fnv1a(text: str) -> int:
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & MASK
    return h


def checksum(a: str, b: str) -> str:
    h = fnv1a(f"{SALT}:{a}-{b}")
    out = ""
    for _ in range(4):
        out += ALPHABET[h % len(ALPHABET)]
        h = h // len(ALPHABET) + (h % 7)
    return out


def make_code() -> str:
    a = "".join(secrets.choice(ALPHABET) for _ in range(4))
    b = "".join(secrets.choice(ALPHABET) for _ in range(4))
    return f"OMNIDX-{a}-{b}-{checksum(a, b)}"


def is_valid(code: str) -> bool:
    c = "".join(ch for ch in code.upper() if ch.isalnum())
    if len(c) != 18 or not c.startswith("OMNIDX"):
        return False
    a, b, chk = c[6:10], c[10:14], c[14:18]
    if any(ch not in ALPHABET for ch in a + b):
        return False
    return checksum(a, b) == chk


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate OmniDx Pro licence codes")
    ap.add_argument("-n", "--count", type=int, default=1, help="how many to generate")
    ap.add_argument("--csv", action="store_true", help="emit code,issued,buyer columns")
    ap.add_argument("--check", metavar="CODE", help="verify a code instead of generating")
    args = ap.parse_args()

    if args.check:
        ok = is_valid(args.check)
        print(f"{args.check}: {'VALID' if ok else 'NOT VALID'}")
        return 0 if ok else 1

    if args.csv:
        print("code,issued,buyer")
    for _ in range(max(1, args.count)):
        code = make_code()
        print(f"{code},{date.today().isoformat()}," if args.csv else code)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
