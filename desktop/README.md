# OmniDx on the desktop

Turns the web app into a proper desktop app: its own window, its own icon, no
address bar, and a shortcut you double-click like anything else.

It works by serving the app from `http://127.0.0.1:8787/app/` on your own machine.
That matters — a loopback address counts as a *secure origin*, so service
workers, **Web Serial and Web Bluetooth all keep working**. Your USB or
Bluetooth OBD-II adapter can be used from the desktop app exactly as it would
from a hosted copy.

Nothing is exposed to your network. The server listens on the loopback
interface only, and stops on its own when you close the window.

## Install the shortcut

**Windows** — double-click `Create-Shortcut.cmd`

**macOS / Linux**
```
python3 desktop/install.py
```

You get:

| Platform | What is created |
|---|---|
| Windows | `OmniDx.lnk` on your Desktop |
| macOS | `OmniDx.app` on your Desktop |
| Linux | A `.desktop` entry on your Desktop **and** in the applications menu |

Then double-click it. Nothing is installed system-wide and no administrator
rights are needed.

To remove it again:
```
python3 desktop/install.py --uninstall
```

## Run it without a shortcut

**Windows** — double-click `OmniDx.cmd`

**macOS / Linux**
```
python3 desktop/omnidx.py
```

Options:

| Flag | Effect |
|---|---|
| `--port N` | Serve on a different port (default `8787`) |
| `--no-browser` | Start the server only, and open the address yourself |
| `--no-autoquit` | Keep serving after the window closes; stop with Ctrl+C |

## Requirements

Python 3.8 or newer, and a Chromium-family browser (Chrome, Edge, Brave or
Chromium) for the borderless window. Without one it opens in your default
browser as an ordinary tab, which still works.

macOS and most Linux distributions already ship Python 3. On Windows, get it
from [python.org](https://www.python.org/downloads/) — tick **Add python.exe to
PATH** during setup — or from the Microsoft Store.

## How it shuts down

The page checks in with the launcher every 30 seconds and says goodbye when the
window closes, so the server exits a few seconds later and never lingers in the
background. Reloading the page cancels that shutdown, so Ctrl+R is safe. If the
browser is force-quit and never says anything, the launcher gives up on its own
after about two and a half minutes.

## Why the port stays the same

Browsers key saved reports, the offline cache and any installed shortcut to the
exact origin, so a port that changed between runs would look like the app had
lost all its history. The launcher keeps `8787` whenever it can, and hands off
to an instance that is already running instead of starting a second one. If
`8787` is genuinely taken by something else, it moves up the range and warns you
that reports saved under the old port will not appear.

## No Python? Install the web app instead

Chrome and Edge on the desktop can install the live site directly: open
<https://hundostacksgit-svg.github.io/omnidx-updates/>, then **⋮ → Cast, save
and share → Install page as app**. That creates a real desktop shortcut and Start-menu entry
with no scripts and no Python at all. The only thing you give up is that it
needs the deployed URL rather than running purely from this folder.
