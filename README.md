# ApexTune Diagnostics

A universal diagnostics app that runs in your browser and installs to your home
screen. It scans **your car**, **your phone or tablet**, and **your computer** —
offline, with nothing uploaded anywhere.

No app store, no account, no backend. It is a Progressive Web App: a single
static site that installs like a native app.

---

## What it does

### Vehicle scan
Talks to a standard OBD-II adapter and reads what a shop scanner reads:

- **Trouble codes** — stored, pending and permanent, each translated into plain
  English and ranked critical / major / minor.
- **Check-engine light** status and the number of codes behind it.
- **Readiness monitors** — the self-tests an emissions inspection checks. The app
  tells you which have not finished, which is the usual reason a car fails a test.
- **Live sensor gauges** — RPM, speed, coolant, throttle, engine load, battery
  voltage, intake temp, MAF, fuel level, manifold pressure, oil temp and more,
  with continuous polling.
- **VIN**, connection protocol, trip counters and distance since codes were cleared.
- **Clear codes** (mode 04), behind a warning that explains what clearing actually costs you.

Works with ELM327-compatible adapters over **Bluetooth LE** (Web Bluetooth) or
**USB** (Web Serial). Handles CAN, ISO 9141 and KWP2000 response framing, multi-ECU
replies and multi-frame ISO-TP messages.

**No adapter? Use demo mode.** A simulated ECU drives the entire flow — codes,
gauges, monitors, VIN — so you can see exactly what a scan looks like first.

### Device checks
Battery level and health, memory, storage, CPU benchmark, GPU renderer, measured
display refresh rate, network latency and jitter, motion sensors, camera and
microphone enumeration, and platform details — plus hands-on tests you run yourself:

- Dead-pixel sweep (six full-screen colours)
- Touchscreen tracking with multi-touch detection
- Speaker tone sweep
- Live microphone level meter
- Camera preview across every lens
- GPS accuracy fix
- Accelerometer / gyroscope live readout
- Vibration motor

### System benchmarks
Single-core and all-core CPU benchmarks with parallel-scaling analysis, memory
allocation ceiling, GPU fill rate and limits, storage read/write speed, network
throughput, and a browser capability matrix.

### Reports
Every scan can be saved, then shared to any app, copied, or exported as a text
file. History lives in local storage on your device only.

---

## Hardware you need

**Device and System checks need nothing.** Only the car scan needs an adapter.

| Adapter | Price | Verdict |
|---|---|---|
| **Vgate iCar Pro BLE 4.0** | $28 – $40 | **The one to buy.** Reliable, sleeps when the car is off so it won't drain your battery. |
| Generic ELM327 BLE 4.0 | $15 – $22 | Cheapest that works. Quality varies — buy somewhere with returns. |
| ELM327 USB cable | $10 – $18 | Rock solid, but tethered. On a phone add a USB-C OTG adapter (~$8). |
| OBDLink LX / CX | $60 – $110 | Faster and more compatible. Only worth it if you scan often. |

### Do not buy

- **Wi-Fi OBD-II adapters** — they make your phone join their own network. Browsers can't reach them and you lose mobile data.
- **Bluetooth 3.0 / "Classic" adapters** — they use the SPP profile, which no browser on any platform can open. Must say **BLE** or **Bluetooth 4.0**.
- **$6 mystery clones** — frequently fake chips that hang mid-scan.

Any car sold in the US from 1996, or the EU from 2001 (petrol) / 2004 (diesel),
has an OBD-II port — usually under the dash near your left knee.

### Browser support

| Platform | Car scan |
|---|---|
| Chrome on Android | Bluetooth + USB |
| Chrome / Edge on desktop | Bluetooth + USB |
| Safari or any browser on iPhone / iPad | Demo mode only |

Apple does not permit Web Bluetooth or Web Serial in **any** iOS browser, so live
car scanning is impossible from a web app on iPhone. Everything else in the app
works fully on iOS. For live car data on an iPhone you need a native app and a
Wi-Fi adapter.

---

## Install it on your phone

1. Open <https://hundostacksgit-svg.github.io/apextune-updates/> in your phone's browser.
2. **Android / Chrome:** tap **Install** in the app header, or menu **⋮ → Add to Home screen**.
3. **iPhone / Safari:** tap **Share** → **Add to Home Screen**.

It then launches full screen from your home screen and works with no signal.

---

## Install it on your desktop

The app also runs as a proper desktop app — own window, own icon, no address
bar — with a shortcut you double-click.

**Windows** — double-click `desktop\Create-Shortcut.cmd`

**macOS / Linux**
```
python3 desktop/install.py
```

That puts *ApexTune Diagnostics* on your desktop: a `.lnk` on Windows, a real
`.app` bundle on macOS, and a `.desktop` entry (desktop **and** applications
menu) on Linux. Remove it again with `python3 desktop/install.py --uninstall`.

Behind the shortcut, `desktop/apextune.py` serves the app from
`http://127.0.0.1:8787`. A loopback address is a *secure origin*, so **USB and
Bluetooth OBD-II adapters work from the desktop app** just as they do from a
hosted copy. Nothing is exposed to your network, and the server stops by itself
when you close the window.

Needs Python 3.8+ and, for the borderless window, a Chromium-family browser
(Chrome, Edge, Brave, Chromium). Without one it opens as a normal tab, which
still works. Full detail in [`desktop/README.md`](desktop/README.md).

## Deeper PC diagnostics

A browser is sandboxed — it cannot read disk SMART health, CPU temperatures,
installed RAM modules or running processes. A companion script can:

```
python3 tools/sysreport.py
```

Zero dependencies, any Python 3, works on Windows, macOS and Linux. It prints a
report and saves `apextune-system-report.txt` alongside itself. Read-only;
nothing is uploaded or changed. Use `--json` for machine-readable output.

---


## Running it from a plain server

Any static file server will do — but it must be `localhost` or HTTPS, since
service workers and hardware APIs require a secure context.

```
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploying

**The site is live at <https://hundostacksgit-svg.github.io/apextune-updates/>.**

Pages is enabled and serves the `gh-pages` branch. The workflow in
`.github/workflows/pages.yml` mirrors every push onto that branch, so the live
site tracks the default branch automatically. There is no build step — the
files are served exactly as committed.

This deliberately uses a branch deploy rather than the `deploy-pages` action.
A workflow token is not permitted to create a Pages site, so an Actions-source
deploy cannot bootstrap itself on a repository where Pages has never been
turned on; pushing a `gh-pages` branch to a public repository enables Pages on
its own. Mirroring to that branch needs only `contents: write` and no
repository setting.

---

## How it is built

Vanilla ES modules, no framework, no bundler, no dependencies. Every file is
served exactly as written.

```
index.html              app shell, tab bar
manifest.webmanifest    PWA metadata, icons, shortcuts
sw.js                   service worker — offline cache
css/app.css             design system
js/app.js               router, service worker registration, install prompt
js/ui.js                DOM helpers, gauges, score rings, toasts
js/store.js             local report persistence
js/report.js            scoring, text rendering, share / copy / download
js/modules/*.js         one file per screen
js/obd/transport.js     Bluetooth LE, Web Serial and simulated ECU links
js/obd/elm327.js        ELM327 command queue and response framing
js/obd/pids.js          SAE J1979 parameter definitions and decoders
js/obd/dtc.js           trouble-code decoding, descriptions, readiness monitors
desktop/apextune.py     desktop launcher — local server plus its own app window
desktop/install.py      creates the desktop shortcut on Windows, macOS or Linux
desktop/*.cmd           Windows double-click helpers that locate Python
tools/sysreport.py      companion deep hardware scan
```

---

## Privacy

Everything runs on your device. There is no server, no analytics and no network
calls beyond loading the app itself. Saved reports stay in your browser's local
storage until you delete them, and are only shared when you tap Share.

## Disclaimer

Trouble code descriptions are the generic SAE definitions. Manufacturers assign
their own meanings to some codes, so treat a result as a starting point for
diagnosis, not a repair order. Confirm faults with a qualified technician before
carrying out repairs. Do not operate the app while driving.
