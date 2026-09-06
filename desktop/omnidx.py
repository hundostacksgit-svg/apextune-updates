#!/usr/bin/env python3
"""
OmniDx — desktop launcher.

Serves the app from this machine and opens it in its own window, with no
browser tabs or address bar. Running over http://127.0.0.1 keeps it a secure
context, so service workers, Web Serial and Web Bluetooth all work exactly as
they do on a hosted copy — which means USB and Bluetooth OBD-II adapters can
be used from the desktop app.

    python3 desktop/omnidx.py

The server stops on its own once you close the window. Nothing is exposed to
your network: it listens on the loopback interface only.
"""

from __future__ import annotations

import argparse
import http.server
import json
import mimetypes
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

APP_NAME = "OmniDx"
ROOT = Path(__file__).resolve().parent.parent

# A stable port matters: the browser keys saved reports, the service worker
# cache and any installed shortcut to the exact origin, so a port that moved
# between runs would look like the app had lost its history.
DEFAULT_PORT = 8787
PORT_SPAN = 10

STARTUP_GRACE = 120.0   # seconds to wait for the window to check in at all
IDLE_LIMIT = 150.0      # seconds without a check-in before assuming it is gone
QUIT_GRACE = 6.0        # seconds after a close, so a page reload can cancel it

IS_WIN = sys.platform.startswith("win")
IS_MAC = sys.platform == "darwin"

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")


class Liveness:
    """Tracks whether an app window is still open, so the server can exit."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.started = time.monotonic()
        self.last_seen: float | None = None
        self.quit_at: float | None = None
        self.stop = threading.Event()
        self.reason = ""

    def alive(self) -> None:
        with self.lock:
            self.last_seen = time.monotonic()
            self.quit_at = None      # a reload cancels a pending shutdown

    def closing(self) -> None:
        with self.lock:
            self.quit_at = time.monotonic() + QUIT_GRACE

    def shutdown(self, reason: str) -> None:
        self.reason = reason
        self.stop.set()

    def watch(self) -> None:
        while not self.stop.wait(1.0):
            now = time.monotonic()
            with self.lock:
                quit_at, last_seen, started = self.quit_at, self.last_seen, self.started
            if quit_at is not None and now >= quit_at:
                self.shutdown("window closed")
            elif last_seen is None and now - started > STARTUP_GRACE:
                self.shutdown("no window connected")
            elif last_seen is not None and now - last_seen > IDLE_LIMIT:
                self.shutdown("window stopped responding")


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static file server for the app, plus three tiny control endpoints."""

    live: Liveness
    port: int

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        pass  # the banner below is the only output worth showing

    def end_headers(self):
        # The service worker owns offline caching; keep HTTP itself revalidating
        # so an edited file shows up on the next reload.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _empty(self, code=204):
        self.send_response(code)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path == "/__alive":
            self.live.alive()
            self._empty()
        elif path == "/__quit":
            self.live.closing()
            self._empty()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/__ping":
            body = json.dumps({"app": "omnidx", "port": self.port}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def already_running(port: int) -> bool:
    """True if a previous OmniDx launcher already owns this port."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/__ping", timeout=0.6) as r:
            return json.loads(r.read()).get("app") == "omnidx"
    except Exception:
        return False


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_browser() -> str | None:
    """Locate a Chromium-family browser, which is what supports --app windows."""
    if IS_WIN:
        rel = [
            r"Google\Chrome\Application\chrome.exe",
            r"Microsoft\Edge\Application\msedge.exe",
            r"BraveSoftware\Brave-Browser\Application\brave.exe",
            r"Chromium\Application\chrome.exe",
        ]
        bases = [os.environ.get(v, "") for v in
                 ("ProgramFiles", "ProgramFiles(x86)", "LocalAppData")]
        for base in filter(None, bases):
            for r in rel:
                p = Path(base) / r
                if p.exists():
                    return str(p)
        return None

    if IS_MAC:
        for p in (
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ):
            if Path(p).exists():
                return p
        return None

    for name in ("google-chrome", "google-chrome-stable", "chromium",
                 "chromium-browser", "brave-browser", "microsoft-edge",
                 "microsoft-edge-stable"):
        found = shutil.which(name)
        if found:
            return found
    return None


def open_window(url: str) -> str:
    """Open the app in its own chrome-less window; fall back to a normal tab."""
    browser = find_browser()
    if browser:
        try:
            subprocess.Popen(
                [browser, f"--app={url}", "--window-size=560,940"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=not IS_WIN,
            )
            return Path(browser).stem
        except OSError:
            pass
    webbrowser.open(url)
    return "default browser"


def main() -> int:
    ap = argparse.ArgumentParser(description=f"{APP_NAME} desktop launcher")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port to serve on (default {DEFAULT_PORT})")
    ap.add_argument("--no-browser", action="store_true", help="serve only, do not open a window")
    ap.add_argument("--no-autoquit", action="store_true", help="keep serving after the window closes")
    args = ap.parse_args()

    if not (ROOT / "app" / "index.html").exists():
        print(f"error: cannot find app/index.html next to {ROOT}", file=sys.stderr)
        print("Keep this script inside the repository's desktop/ folder.", file=sys.stderr)
        return 1

    # Hand off to an instance that is already up -- anywhere in the range, not
    # just on the preferred port, since a previous run may have been pushed up
    # it. Starting a second server would strand the reports saved under the
    # first, because the browser scopes storage to the exact origin. Closed
    # ports refuse instantly, so this scan costs nothing in the normal case.
    for candidate in range(args.port, args.port + PORT_SPAN):
        if port_in_use(candidate) and already_running(candidate):
            print(f"{APP_NAME} is already running on port {candidate} — opening another window.")
            open_window(f"http://127.0.0.1:{candidate}/app/index.html?app=desktop")
            return 0

    port = args.port
    for candidate in range(args.port, args.port + PORT_SPAN):
        if not port_in_use(candidate):
            port = candidate
            break
    else:
        print(f"error: ports {args.port}-{args.port + PORT_SPAN - 1} are all busy.", file=sys.stderr)
        return 1

    if port != args.port:
        print(f"note: port {args.port} was taken, using {port} instead.")
        print("      Reports saved under a different port will not appear here.")

    live = Liveness()
    Handler.live = live
    Handler.port = port

    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()

    url = f"http://127.0.0.1:{port}/app/index.html?app=desktop"
    print(f"\n  {APP_NAME}")
    print(f"  serving {ROOT}")
    print(f"  at      {url}\n")

    if args.no_browser:
        print("  --no-browser set; open that address yourself.")
    else:
        print(f"  opened in {open_window(url)}")

    if args.no_autoquit:
        print("  running until you press Ctrl+C.\n")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            print("\n  stopped.")
            server.shutdown()
            return 0

    print("  closing the window stops this server. Ctrl+C also works.\n")
    threading.Thread(target=live.watch, daemon=True).start()
    try:
        live.stop.wait()
        print(f"  {live.reason} — stopping.")
    except KeyboardInterrupt:
        print("\n  stopped.")
    server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
