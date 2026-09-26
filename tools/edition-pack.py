#!/usr/bin/env python3
"""
Pack OmniDx Edition for omnidx.net: edition/ without its checks (ci/) as one zip, and a small record next to it
with the zip's SHA-256, which edition.ps1 checks before it opens anything.

    python3 tools/edition-pack.py OUT_DIR

writes OUT_DIR/omnidx-edition.zip and OUT_DIR/edition.json. The publish (.github/workflows/pages.yml) puts both at
omnidx.net/edition/; the Edition's Windows check (.github/workflows/edition.yml) serves them from the build machine
and runs edition.ps1 against them. The zip is the same bytes for the same files (sorted, fixed times), so a
publish that changed nothing in edition/ publishes the same hash.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'edition'
LEAVE_OUT = {'ci'}


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.rglob('*') if p.is_file() and p.relative_to(SRC).parts[0] not in LEAVE_OUT and not p.name.startswith('.'))
    need = ['setup.ps1', 'build.ps1', 'make-usb.ps1', 'first-logon.cmd', 'usb/autounattend.xml', 'apps/Common.cs']
    have = {p.relative_to(SRC).as_posix() for p in files}
    missing = [n for n in need if n not in have]
    if missing:
        print(f'edition/ is missing {", ".join(missing)}', file=sys.stderr)
        return 1
    zpath = out / 'omnidx-edition.zip'
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in files:
            info = zipfile.ZipInfo(p.relative_to(SRC).as_posix(), date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, p.read_bytes())
    data = zpath.read_bytes()
    version = re.search(r"^\$Version = '([^']+)'", (SRC / 'setup.ps1').read_text(), re.M)
    try:
        commit = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', '--short=7', 'HEAD'], text=True).strip()
    except Exception:
        commit = ''
    rec = {
        'version': version.group(1) if version else '',
        'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data),
        'files': len(files),
        'commit': commit,
    }
    (out / 'edition.json').write_text(json.dumps(rec, indent=2) + '\n')
    print(f'packed {len(files)} files, {len(data):,} bytes, sha256 {rec["sha256"][:12]}..., version {rec["version"]} -> {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
