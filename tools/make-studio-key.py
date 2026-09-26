#!/usr/bin/env python3
"""Make an OmniDx Studio licence key.

Use this when a payment arrives that the Worker did not handle — a Cash App
transfer, a bank payment, a friend, a refund replacement, a giveaway. Keys made
here validate in the app and in the Worker, because all three implement the same
four lines of arithmetic.

    python3 tools/make-studio-key.py                 # one Studio key
    python3 tools/make-studio-key.py --edition creator --count 5
    python3 tools/make-studio-key.py --check OMNIDX-STU-ABCD-EFGH-JKLM

Keep a note of who you gave each key to. Without the Worker there is no record
of it anywhere, which is the trade you make for not running a server.
"""

import argparse
import secrets
import sys

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no I, O, 0 or 1
TAGS = {"creator": "CRE", "studio": "STU"}
EDITIONS = {v: k for k, v in TAGS.items()}
SALT = "omnidx-studio-2026"


def fnv1a(text: str) -> int:
    """32-bit FNV-1a. Chosen because JavaScript's Math.imul reproduces it
    exactly, so a key made here always validates in the browser."""
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def checksum(tag: str, payload: str) -> str:
    h = fnv1a(f"{SALT}:{tag}:{payload}")
    out = ""
    for _ in range(4):
        out += ALPHABET[h % len(ALPHABET)]
        h = h // len(ALPHABET) + (h % 7)
    return out


def make(edition: str) -> str:
    tag = TAGS[edition]
    payload = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"OMNIDX{tag}{payload}{checksum(tag, payload)}"


def pretty(key: str) -> str:
    return f"OMNIDX-{key[6:9]}-{key[9:13]}-{key[13:17]}-{key[17:21]}"


def check(raw: str):
    key = "".join(c for c in raw.upper() if c.isalnum())
    if len(key) != 21 or not key.startswith("OMNIDX"):
        return None
    tag, payload, chk = key[6:9], key[9:17], key[17:21]
    if tag not in EDITIONS:
        return None
    if any(c not in ALPHABET for c in payload):
        return None
    if checksum(tag, payload) != chk:
        return None
    return EDITIONS[tag]


def main() -> int:
    ap = argparse.ArgumentParser(description="Make or check an OmniDx Studio licence key.")
    ap.add_argument("--edition", choices=sorted(TAGS), default="studio",
                    help="which edition the key unlocks (default: studio)")
    ap.add_argument("--count", type=int, default=1, help="how many keys to make")
    ap.add_argument("--check", metavar="KEY", help="validate a key instead of making one")
    args = ap.parse_args()

    if args.check:
        edition = check(args.check)
        if edition:
            print(f"valid — unlocks {edition}")
            return 0
        print("not a valid OmniDx Studio key", file=sys.stderr)
        return 1

    if args.count < 1 or args.count > 500:
        print("--count must be between 1 and 500", file=sys.stderr)
        return 1

    for _ in range(args.count):
        print(pretty(make(args.edition)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
