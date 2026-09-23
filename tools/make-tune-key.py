#!/usr/bin/env python3
"""Make, check or reproduce an OmniDx Tune key.

Keys made here validate in the script, in the browser and in the Worker,
because all four implement the same four lines of checksum arithmetic.

    python3 tools/make-tune-key.py                       # one random Tune key
    python3 tools/make-tune-key.py --product squad       # the older three-PC SQUAD tag
    python3 tools/make-tune-key.py --count 5
    python3 tools/make-tune-key.py --order 8Yh3kLm2Qp    # the key the activation page
                                                         #   derives for that Square order
                                                         #   when no Worker is deployed
    python3 tools/make-tune-key.py --check TUNE-ABCD-EFGH-JKLM-NPQR
    python3 tools/make-tune-key.py --sql                 # also print the INSERT for D1

When the Worker is deployed, a key only works if it is in the tune_keys table:
paste the --sql line into `npx wrangler d1 execute omnidx-studio --remote
--command "..."`. Without the Worker, the script checks the checksum and
binds the key to the first PC that runs it; keep a note of who got what.
"""

import argparse
import hashlib
import secrets
import time

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no I, O, 0 or 1
SALT = "omnidx-tune-2026"
TAGS = {"tune": "TUNE", "squad": "SQUAD"}
SEATS = {"tune": 1, "squad": 3}
BY_TAG = {v: k for k, v in TAGS.items()}


def fnv1a(text: str) -> int:
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


def make(product: str) -> str:
    tag = TAGS[product]
    payload = "".join(secrets.choice(ALPHABET) for _ in range(12))
    return f"{tag}{payload}{checksum(tag, payload)}"


def for_order(product: str, order: str) -> str:
    """The same derivation studio/assets/tunekey.js uses when no Worker is deployed."""
    tag = TAGS[product]
    digest = hashlib.sha256(f"omnidx-tune-order:{tag}:{order.strip().upper()}".encode()).digest()
    payload = "".join(ALPHABET[b % len(ALPHABET)] for b in digest[:12])
    return f"{tag}{payload}{checksum(tag, payload)}"


def pretty(key: str) -> str:
    tag = "SQUAD" if key.startswith("SQUAD") else "TUNE"
    rest = key[len(tag):]
    return f"{tag}-{rest[0:4]}-{rest[4:8]}-{rest[8:12]}-{rest[12:16]}"


def check(raw: str):
    key = "".join(c for c in raw.upper() if c.isalnum())
    for tag, product in BY_TAG.items():
        if key.startswith(tag) and len(key) == len(tag) + 16:
            payload, chk = key[len(tag):len(tag) + 12], key[len(tag) + 12:]
            if any(c not in ALPHABET for c in payload):
                return None
            if checksum(tag, payload) != chk:
                return None
            return product, key
    return None


def sql(key: str, product: str, order: str | None) -> str:
    order_sql = f"'{order}'" if order else "NULL"
    return (
        "INSERT INTO tune_keys (key, product, seats, order_ref, provider, verified, created_at) "
        f"VALUES ('{key}', '{product}', {SEATS[product]}, {order_sql}, 'manual', 1, {int(time.time() * 1000)});"
    )


def main() -> int:
    ap = argparse.ArgumentParser(description="Make, check or reproduce an OmniDx Tune key.")
    ap.add_argument("--product", choices=sorted(TAGS), default="tune")
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--order", metavar="REF", help="derive the key the activation page gives this Square order")
    ap.add_argument("--check", metavar="KEY", help="validate a key instead of making one")
    ap.add_argument("--sql", action="store_true", help="print the D1 INSERT for each key")
    args = ap.parse_args()

    if args.check:
        found = check(args.check)
        if found:
            product, key = found
            print(f"valid: {pretty(key)} — {product} ({SEATS[product]} PC{'s' if SEATS[product] > 1 else ''})")
            return 0
        print("not a valid OmniDx Tune key")
        return 1

    if args.order:
        key = for_order(args.product, args.order)
        print(pretty(key))
        if args.sql:
            print(sql(key, args.product, args.order))
        return 0

    for _ in range(args.count):
        key = make(args.product)
        print(pretty(key))
        if args.sql:
            print(sql(key, args.product, None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
