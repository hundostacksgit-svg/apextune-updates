#!/usr/bin/env python3
"""
Create a desktop shortcut for OmniDx on this machine.

    python3 desktop/install.py              # add the shortcut
    python3 desktop/install.py --uninstall  # remove it again

Windows gets a .lnk on the Desktop, macOS gets a real .app bundle, and Linux
gets a .desktop entry on the Desktop and in the applications menu. Each one
runs desktop/omnidx.py, which serves the app locally and opens it in its own
window. Nothing is installed system-wide and nothing needs administrator rights.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

APP_NAME = "OmniDx"
APP_ID = "omnidx-diagnostics"
COMMENT = "Run diagnostics on your car, phone and PC"

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
LAUNCHER = HERE / "omnidx.py"

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"


def fail(msg: str) -> int:
    print(f"error: {msg}", file=sys.stderr)
    return 1


def desktop_dir() -> Path:
    """The user's Desktop, honouring a localised or relocated one where we can."""
    if not IS_WIN and not IS_MAC and shutil.which("xdg-user-dir"):
        try:
            out = subprocess.run(["xdg-user-dir", "DESKTOP"], capture_output=True,
                                 text=True, timeout=5).stdout.strip()
            if out and Path(out).is_dir():
                return Path(out)
        except (OSError, subprocess.SubprocessError):
            pass
    if IS_WIN:
        for var in ("OneDrive", "USERPROFILE"):
            base = os.environ.get(var)
            if base and (Path(base) / "Desktop").is_dir():
                return Path(base) / "Desktop"
    return Path.home() / "Desktop"


def python_command() -> str:
    """An interpreter path the shortcut can rely on later, not just right now."""
    exe = Path(sys.executable)
    if IS_WIN:
        # Prefer the console build so a stuck server stays visible and killable.
        console = exe.with_name(exe.name.replace("pythonw", "python"))
        if console.exists():
            return str(console)
    return str(exe)


# --------------------------------------------------------------------------
# Windows
# --------------------------------------------------------------------------

def ps_quote(value: str) -> str:
    """Quote for a PowerShell single-quoted literal."""
    return "'" + str(value).replace("'", "''") + "'"


def windows_script(link: Path, remove: bool) -> str:
    if remove:
        return f"if (Test-Path {ps_quote(link)}) {{ Remove-Item -LiteralPath {ps_quote(link)} -Force }}\n"
    icon = ROOT / "icons" / "icon.ico"
    return (
        "$s = (New-Object -ComObject WScript.Shell).CreateShortcut(" + ps_quote(link) + ")\n"
        "$s.TargetPath = " + ps_quote(python_command()) + "\n"
        '$s.Arguments = ' + ps_quote(f'"{LAUNCHER}"') + "\n"
        "$s.WorkingDirectory = " + ps_quote(ROOT) + "\n"
        "$s.IconLocation = " + ps_quote(icon) + "\n"
        "$s.Description = " + ps_quote(COMMENT) + "\n"
        "$s.WindowStyle = 7\n"   # minimised: visible in the taskbar, out of the way
        "$s.Save()\n"
    )


def do_windows(remove: bool) -> int:
    link = desktop_dir() / f"{APP_NAME}.lnk"
    # A script file avoids the quoting minefield of passing this via -Command.
    with tempfile.NamedTemporaryFile("w", suffix=".ps1", delete=False, encoding="utf-8") as fh:
        fh.write(windows_script(link, remove))
        script = fh.name
    try:
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if not powershell:
            return fail("PowerShell not found, so the shortcut cannot be created.")
        res = subprocess.run([powershell, "-NoProfile", "-ExecutionPolicy", "Bypass",
                              "-File", script], capture_output=True, text=True, timeout=60)
        if res.returncode != 0:
            return fail(f"PowerShell failed: {res.stderr.strip() or res.stdout.strip()}")
    finally:
        os.unlink(script)

    print(f"{'Removed' if remove else 'Created'}: {link}")
    return 0


# --------------------------------------------------------------------------
# macOS
# --------------------------------------------------------------------------

PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>{name}</string>
  <key>CFBundleDisplayName</key><string>{name}</string>
  <key>CFBundleIdentifier</key><string>com.omnidx.diagnostics</string>
  <key>CFBundleExecutable</key><string>{exe}</string>
  <key>CFBundleIconFile</key><string>icon.icns</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
</dict>
</plist>
"""

# Finder launches apps with a bare PATH, so look in the usual places rather
# than trusting `env python3` to find anything.
MAC_LAUNCHER = """#!/bin/sh
for py in {preferred} /usr/bin/python3 /usr/local/bin/python3 /opt/homebrew/bin/python3; do
  if [ -x "$py" ]; then
    exec "$py" {script}
  fi
done
/usr/bin/osascript -e 'display alert "Python 3 not found" message "OmniDx needs Python 3. Install it from python.org, or run: xcode-select --install"'
exit 1
"""


def do_macos(remove: bool) -> int:
    bundle = desktop_dir() / f"{APP_NAME}.app"
    if remove:
        if bundle.exists():
            shutil.rmtree(bundle)
            print(f"Removed: {bundle}")
        else:
            print(f"Nothing to remove at {bundle}")
        return 0

    exe_name = "OmniDx"
    macos_dir = bundle / "Contents" / "MacOS"
    res_dir = bundle / "Contents" / "Resources"
    if bundle.exists():
        shutil.rmtree(bundle)
    macos_dir.mkdir(parents=True)
    res_dir.mkdir(parents=True)

    (bundle / "Contents" / "Info.plist").write_text(
        PLIST.format(name=APP_NAME, exe=exe_name), encoding="utf-8")
    (bundle / "Contents" / "PkgInfo").write_text("APPL????", encoding="utf-8")

    launcher = macos_dir / exe_name
    launcher.write_text(
        MAC_LAUNCHER.format(
            preferred=shell_quote(python_command()),
            script=shell_quote(str(LAUNCHER)),
        ),
        encoding="utf-8",
    )
    launcher.chmod(0o755)

    icon = ROOT / "icons" / "icon.icns"
    if icon.exists():
        shutil.copy2(icon, res_dir / "icon.icns")

    # Nudge Finder to pick up the new bundle's icon straight away.
    if shutil.which("touch"):
        subprocess.run(["touch", str(bundle)], check=False)

    print(f"Created: {bundle}")
    return 0


def shell_quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


# --------------------------------------------------------------------------
# Linux
# --------------------------------------------------------------------------

def desktop_exec_quote(value: str) -> str:
    """
    Quote one Exec= argument per the Desktop Entry specification, which is not
    shell quoting: arguments are wrapped in double quotes with a backslash
    before any of " ` $ \\ -- and then every backslash is doubled again,
    because the file format itself treats backslash as its own escape.
    """
    escaped = "".join("\\" + c if c in '"`$\\' else c for c in str(value))
    return ('"' + escaped + '"').replace("\\", "\\\\")


def desktop_entry() -> str:
    icon = ROOT / "icons" / "icon-256.png"
    exec_line = f"{desktop_exec_quote(python_command())} {desktop_exec_quote(str(LAUNCHER))}"
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        "Version=1.0\n"
        f"Name={APP_NAME}\n"
        f"Comment={COMMENT}\n"
        f"Exec={exec_line}\n"
        f"Icon={icon}\n"
        f"Path={ROOT}\n"
        "Terminal=false\n"
        "Categories=Utility;System;Development;\n"
        "Keywords=diagnostics;obd;obd2;car;scanner;benchmark;\n"
        "StartupNotify=true\n"
    )


def do_linux(remove: bool) -> int:
    filename = f"{APP_ID}.desktop"
    targets = [desktop_dir() / filename,
               Path.home() / ".local" / "share" / "applications" / filename]

    if remove:
        for t in targets:
            if t.exists():
                t.unlink()
                print(f"Removed: {t}")
            else:
                print(f"Nothing to remove at {t}")
    else:
        body = desktop_entry()
        for t in targets:
            t.parent.mkdir(parents=True, exist_ok=True)
            t.write_text(body, encoding="utf-8")
            t.chmod(0o755)
            # GNOME hides launchers it does not trust until they are marked.
            if shutil.which("gio"):
                subprocess.run(["gio", "set", str(t), "metadata::trusted", "true"],
                               check=False, capture_output=True)
            print(f"Created: {t}")

    if shutil.which("update-desktop-database"):
        subprocess.run(["update-desktop-database",
                        str(Path.home() / ".local" / "share" / "applications")],
                       check=False, capture_output=True)
    return 0


# --------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=f"Create a desktop shortcut for {APP_NAME}")
    ap.add_argument("--uninstall", action="store_true", help="remove the shortcut instead")
    args = ap.parse_args()

    if not LAUNCHER.exists():
        return fail(f"launcher missing: {LAUNCHER}")
    if not (ROOT / "app" / "index.html").exists():
        return fail(f"app files not found next to {ROOT}")

    target = desktop_dir()
    if not args.uninstall and not target.is_dir():
        try:
            target.mkdir(parents=True, exist_ok=True)
        except OSError:
            return fail(f"no Desktop folder found at {target}")

    if IS_WIN:
        rc = do_windows(args.uninstall)
    elif IS_MAC:
        rc = do_macos(args.uninstall)
    else:
        rc = do_linux(args.uninstall)

    if rc == 0 and not args.uninstall:
        try:
            print()
            print(f'  Double-click "{APP_NAME}" on your desktop to start.')
            print("  It opens in its own window and stops when you close it.")
            print("  USB and Bluetooth OBD-II adapters work from the desktop app,")
            print("  because it is served over a local secure origin.")
        except BrokenPipeError:
            pass  # output was piped into something that stopped reading
    return rc


if __name__ == "__main__":
    sys.exit(main())
