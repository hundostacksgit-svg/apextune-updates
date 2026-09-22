#!/usr/bin/env python3
"""Stamp tune/config.json with the script's version and SHA-256.

    python3 tools/tune-stamp.py          # write version + sha256
    python3 tools/tune-stamp.py --check  # exit 1 when either is stale

go.ps1 reads config.json before it fetches the script and refuses to run a
script whose hash does not match: a truncated download, a stale cache in
front of omnidx.net, or a file someone tampered with between the two fetches
all fail the same way. The hash is over the script's bytes exactly as
served, which the publish check keeps true by running --check.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'tune' / 'omnidx.ps1'
CONFIG = ROOT / 'tune' / 'config.json'


def current():
    data = SCRIPT.read_bytes()
    version = re.search(rb"\$script:Version = '([^']+)'", data).group(1).decode()
    return version, hashlib.sha256(data).hexdigest()


def main() -> int:
    version, digest = current()
    cfg = json.loads(CONFIG.read_text())
    if '--check' in sys.argv:
        if cfg.get('version') == version and cfg.get('sha256') == digest:
            print(f'config.json is current: v{version} {digest[:12]}')
            return 0
        print(f'config.json is stale: run python3 tools/tune-stamp.py (script is v{version} {digest[:12]}, config says v{cfg.get("version")} {str(cfg.get("sha256"))[:12]})')
        return 1
    cfg['version'] = version
    cfg['sha256'] = digest
    CONFIG.write_text(json.dumps(cfg, indent=2) + '\n')
    print(f'stamped v{version} {digest[:12]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
