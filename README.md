# OmniDx

Two apps, one idea: software that tells you the truth, runs on your own machine,
and doesn't rent itself to you.

| | What it is | Try it |
|---|---|---|
| **OmniDx Diagnostics** | Reads your car's engine fault codes, tests your phone's hardware, benchmarks your computer. | [Open the app](https://hundostacksgit-svg.github.io/apextune-updates/app/) |
| **OmniDx Studio** | A full video editor with an AI that turns a sentence into a finished edit. | [Open the editor](https://hundostacksgit-svg.github.io/apextune-updates/studio/app/) · [Site](https://hundostacksgit-svg.github.io/apextune-updates/studio/) |

---

## OmniDx Studio

**Tell it what you want. Watch it cut itself.**

A real multitrack video editor — timeline, colour, keyframes, audio mixing,
export — with an AI layer on top. Drop your clips in, type *"make me a 30
second TikTok trailer, fast cuts on the beat, teal and orange, captions on"*,
and it plans the edit, shows you every step, and puts it on the timeline as
ordinary clips you can drag, trim or undo.

- **Free is the product, not a trial.** The whole editor, no watermark, no
  export limit, no account needed. Paid tiers are $19.99 and $39.99, once.
- **Works offline.** Install it and edit with the wifi off.
- **Your footage never leaves your machine.** Editing and export happen on the
  device. Only an AI request ever goes out, and only if you use one.
- **Three skill levels.** Beginner shows nine tools; Expert hides nothing.
- **Autosave every five seconds** with real crash recovery.
- **Runs everywhere** — macOS, Windows, Linux, iOS, Android, or a browser tab.

**One-tap styles.** Eleven finished edits — anime AMV, velocity, phonk, aesthetic,
cinematic, gaming, product, meme, sports, listicle, talking-head cleanup — each
showing its plan before it runs. Free on every tier.

**Motion tracking.** Draw a box round a face or a number plate, and pin a blur, a
sticker or a title to it. Runs on the device with no model to download.

**Effects that make the edits people copy**: real motion blur sampled from actual
movement, chromatic split that pulses on the beat, inverted impact frames, drawn
speed lines, zoom blur, bloom, halftone, cel shading, VHS wobble, CRT.

**Three-way colour wheels** — lift, gamma, gain — as a GPU filter, so grading stays
real-time on a laptop.

**Professional export.** H.264 and H.265 encoded frame by frame, faster than real
time, with the tab free to go in the background. Apple ProRes 422 and Avid DNxHR
from the desktop app, with no extra licence to buy.

**Studio audio repair.** Spectral noise reduction, mains-hum removal, click repair
and automatic levelling — the four things people open a DAW for.

**Projects that move.** A bundle carries your footage with the edit, so it opens
intact on a phone, a friend's laptop or a desktop install. It's also just a ZIP.

**Proxies and awkward files.** Automatic 540p proxies for old machines — never used
for export. Variable-frame-rate phone video and screen recordings open as they are.

**Creative audio filters.** Underwater, telephone, old radio, megaphone, cathedral,
vinyl, robot, 8-bit, nightcore — seventeen of them, live on playback and rendered
into the export. Thirteen are free.

**One payment, never a subscription.** $19.99, $39.99, or $69.99 for three people.
Nothing renews and nothing expires.

Read next:
[what it does and why](docs/STUDIO-COMPLAINTS.md) ·
[how it's built](docs/STUDIO.md) ·
[**take money in ten minutes**](docs/SQUARE-SETUP.md) ·
[getting paid, in full](docs/STUDIO-PAYMENTS.md) ·
[shipping to the stores](docs/STUDIO-BUILD.md) ·
[pushing updates](docs/STUDIO-UPDATES.md) ·
[deploying the API](docs/STUDIO-DEPLOY.md)

---

## OmniDx Diagnostics

**All-around diagnostics.** One app that reads your car's engine fault codes, tests your
phone's hardware, and benchmarks your computer — offline, with nothing uploaded anywhere.

- **Site:** <https://hundostacksgit-svg.github.io/apextune-updates/>
- **App:** <https://hundostacksgit-svg.github.io/apextune-updates/app/>
- **Launch kit:** [`docs/LAUNCH-KIT.md`](docs/LAUNCH-KIT.md) — videos, scripts, what to buy, how to get paid
- **What to build next:** [`docs/NEXT-PRODUCTS.md`](docs/NEXT-PRODUCTS.md) — other products worth the effort, and the ones that aren't
- **The business:** [`docs/THE-BUSINESS.md`](docs/THE-BUSINESS.md) — what $30k a year actually costs by route, and the order to do things in

No app store, no account, no backend. It's a Progressive Web App: a static site that
installs like a native app on a phone or a desktop.

---

## What it does

### Vehicle scan
Talks to a standard OBD-II adapter and reads what a shop scanner reads:

- **Trouble codes** — stored, pending and permanent, each translated into plain English and
  ranked critical / major / minor.
- **Cause and fix guidance** — for every code in the table: the likely causes in order of how
  often they turn out to be the culprit, what to check first (cheapest first), a difficulty
  rating and a rough parts cost. P0420 tells you to rule out an oxygen sensor before buying a
  catalytic converter, which is the single most over-replaced part in car repair.
- **Freeze frame** — the engine conditions recorded at the exact moment a fault was stored
  (revs, speed, coolant, fuel trims). Usually the fastest route to the real cause.
- **Readiness monitors** — the self-tests an emissions inspection checks, and the usual
  reason a car fails one.
- **Live gauges** — 30+ parameters updating continuously, colour-coded when a reading
  leaves its healthy range.
- **Data logging** — record a session and export every sample as CSV.
- **VIN**, protocol, trip counters, distance since codes were cleared.
- **Clear codes** (mode 04), behind a warning that explains what clearing actually costs you.

Works with ELM327-compatible adapters over **Bluetooth LE** or **USB**. Handles CAN,
ISO 9141 and KWP2000 framing, multi-ECU replies and multi-frame ISO-TP messages.

**No adapter? Use demo mode.** A simulated ECU drives the whole flow — codes, gauges,
freeze frame, VIN — so you can see exactly what a scan looks like before buying anything.

### Device checks
Battery, memory, storage, CPU benchmark, GPU renderer, measured refresh rate, network
latency, motion sensors and media enumeration — plus hands-on tests you run yourself:
dead pixels, touchscreen tracking, speakers, microphone level, cameras, GPS accuracy,
accelerometer/gyroscope and the vibration motor.

### System benchmarks
Single-core and all-core CPU benchmarks with parallel-scaling analysis, memory allocation
ceiling, GPU fill rate, storage read/write speed, network throughput, and a browser
capability matrix.

### Controllers and screens
PS5, Xbox, Switch Pro and generic pads over Bluetooth or USB: **stick drift measured**
against a resting baseline, every button, both trigger ranges, and rumble. Plus a display
suite — dead pixels, backlight bleed, uniformity, colour banding, ghosting, black level and
text clarity — which works on a monitor, a laptop, a phone or the TV a console is plugged into.

A console itself cannot be reached from a browser and the app says so. Its controller and its
screen are the parts that actually fail, and both are genuinely testable.

### Everyday tools
- **Code lookup** — 205 trouble codes searchable by code, partial code or plain-English
  symptom. Works with no adapter and no signal.
- **Garage** — keep several vehicles; scans recognise the VIN and file themselves against
  the right car, building a score history per vehicle.
- **Reports** — save, share, copy or export any scan as a text file.

---

## Hardware you need

**Device and System checks need nothing.** Only the car scan needs an adapter.

| Adapter | Price | Verdict |
|---|---|---|
| **Vgate iCar Pro BLE 4.0** | $28–40 | **The one to buy.** Reliable, sleeps when the car is off. |
| Generic ELM327 BLE 4.0 | $15–22 | Cheapest that works. Buy where returns are easy. |
| ELM327 USB cable | $10–18 | Rock solid, but tethered. Add a USB-C OTG adapter (~$8) for a phone. |
| OBDLink LX / CX | $60–110 | Faster and more compatible. Only worth it if you scan often. |

**Do not buy:** Wi-Fi adapters (browsers can't reach them), Bluetooth 3.0 / "Classic"
adapters (the SPP profile is unreachable from any browser on any platform), or $6 clones.
It must say **BLE** or **Bluetooth 4.0**.

Any car sold in the US from 1996, or the EU from 2001 (petrol) / 2004 (diesel), has an
OBD-II port — usually under the dash near your left knee.

### Browser support

| Platform | Car scan |
|---|---|
| Chrome on Android | Bluetooth + USB |
| Chrome / Edge on desktop | Bluetooth + USB |
| Safari or any browser on iPhone / iPad | Demo mode only |

Apple does not permit Web Bluetooth or Web Serial in **any** iOS browser, so live car
scanning is impossible from a web app on iPhone. Everything else works fully on iOS.

---

## Install it on your phone

1. Open the app URL in your phone's browser.
2. **Android / Chrome:** tap **Install** in the app header, or menu **⋮ → Add to Home screen**.
3. **iPhone / Safari:** tap **Share** → **Add to Home Screen**.

It then launches full screen and works with no signal.

## Install it on your desktop

Easiest way: open the app in Chrome or Edge and click **Install** in the header — that
creates a real desktop shortcut and Start-menu entry with no scripts at all.

There is also a local launcher that serves the app from your own machine, so it works with
no internet at all:

**Windows** — double-click `desktop\Create-Shortcut.cmd`

**macOS / Linux**
```
python3 desktop/install.py
```

That puts *OmniDx* on your desktop: a `.lnk` on Windows, a real `.app` bundle on macOS, a
`.desktop` entry on Linux. Remove it with `python3 desktop/install.py --uninstall`.

Behind the shortcut, `desktop/omnidx.py` serves the app from `http://127.0.0.1:8787`.
A loopback address is a *secure origin*, so **USB and Bluetooth adapters work from the
desktop app** too. Nothing is exposed to your network. Details in
[`desktop/README.md`](desktop/README.md).

---

## Deeper PC diagnostics

A browser is sandboxed — it cannot read disk SMART health, CPU temperatures, installed RAM
modules or running processes. A companion script can:

```
python3 tools/sysreport.py
```

Zero dependencies, any Python 3, works on Windows, macOS and Linux. Read-only; nothing is
uploaded. Use `--json` for machine-readable output.

---

## Running it locally

Any static file server will do — but it must be `localhost` or HTTPS, since service workers
and hardware APIs require a secure context.

```
python3 -m http.server 8080
```
Then open <http://localhost:8080> for the site, or <http://localhost:8080/app/> for the app.

---

## Deploying

Pages is enabled and serves the `gh-pages` branch. The workflow in
`.github/workflows/pages.yml` mirrors every push onto that branch, so the live site tracks
the default branch automatically. There is no build step.

This uses a branch deploy rather than the `deploy-pages` action deliberately: a workflow
token is not permitted to create a Pages site, so an Actions-source deploy cannot bootstrap
itself on a repository where Pages has never been turned on. Pushing a `gh-pages` branch to
a public repository enables Pages on its own, and mirroring to it needs only
`contents: write`.

### Custom domain

The chosen domain is **omnidx.net** (`omnidx.com` is taken). It was unregistered at the last
check, so it should be available for about $11–15/yr.

Buy it, add four A records, then run:

```
python3 tools/set-domain.py omnidx.net
```

That script checks DNS before writing the `CNAME` file and refuses if the domain isn't
pointing at GitHub yet — because once a `CNAME` exists, Pages serves the site *only* on that
hostname, and adding it early takes the live site offline. Full steps in
[`docs/CUSTOM-DOMAIN.md`](docs/CUSTOM-DOMAIN.md).

---

## Selling it

Payment is wired to **Cash App** (`app/js/config.js` holds the cashtag, price and links —
change it in one place and the app and site follow).

The buyer pays, puts their email in the payment note, and you send back an unlock code
generated offline:

```
python3 tools/make-licence.py
```

Codes validate against a checksum in `app/js/pro.js` with no server involved. Check one with
`python3 tools/make-licence.py --check OMNIDX-XXXX-XXXX-XXXX`.

**Read [`docs/PAYMENTS.md`](docs/PAYMENTS.md) before selling.** It covers taking cards and
wallets properly through Square while still being paid into Cash App, why a raw cashtag link
is limited, and exactly how much the licence check does and doesn't protect. Short version:
it stops guessing and casual sharing; it cannot stop someone determined, because nothing
running only in the buyer's browser can.

The free/paid split is one line in `app/js/pro.js`:

```js
export const PRO_FEATURES = ['live-scan', 'logging', 'garage'];
```

Installing the app never unlocks Pro — the tier is decided by the licence code, so a buyer
can install on every device they own and unlock each with the same code, with no reinstall
after paying.

### What the site does not have, and why

- **No login or signup.** There is no server, so any login form would be theatre — and one
  that collects passwords it cannot check is actively harmful, since people reuse them. The
  licence code fills the same role without an account. Real accounts would mean adding a
  backend (Supabase and Firebase both have free tiers).
- **No app-store downloads.** Publishing to the App Store needs an Apple developer account
  at $99/yr plus a native build; Google Play needs $25 and the same. The install cards give
  a genuine home-screen app on all four platforms today, for nothing.
- **No public rating count.** Ratings are stored in the visitor's own browser, so each
  person sees their own. Showing an aggregate would need a backend to hold them — and
  inventing one would be fake social proof.

## How it is built

Vanilla ES modules — no framework, no bundler, no dependencies. Every file is served
exactly as written.

```
index.html              landing page
assets/site.css         landing page styles
assets/shots/           real product screenshots (generated, not stock)
app/index.html          the app shell
app/manifest.webmanifest
app/sw.js               service worker — offline cache
app/css/app.css         app design system
app/js/app.js           router, service worker registration, install prompt
app/js/ui.js            DOM helpers, gauges, score rings, toasts
app/js/store.js         local persistence — reports, vehicles, preferences
app/js/report.js        scoring, text rendering, share / copy / CSV export
app/js/card.js          the result drawn as a share-ready 1080x1920 image
app/js/modules/*.js     one file per screen
app/js/obd/transport.js Bluetooth LE, Web Serial and simulated ECU links
app/js/obd/elm327.js    ELM327 command queue and response framing
app/js/obd/pids.js      SAE J1979 parameter definitions and decoders
app/js/obd/dtc.js       trouble-code decoding, descriptions, search, monitors
app/js/obd/repairs.js   what causes each code and what to check first
icons/                  app icons, plus .ico and .icns for desktop shortcuts
desktop/omnidx.py       desktop launcher — local server plus its own app window
desktop/install.py      creates the desktop shortcut on Windows, macOS or Linux
tools/sysreport.py      companion deep hardware scan
tools/promo/            promo video generators
tools/promo/beatsync.py find the beat in a song, so the edit can be cut to it
tools/promo/og.html     source of the 1200x630 link-preview card
tools/set-domain.py     move the site, and repoint its absolute URLs with it
LICENSE                 published source, not an open licence
```

---

## Privacy

Everything runs on your device. There is no server, no analytics and no network calls
beyond loading the app itself. Saved reports and vehicles live in your browser's local
storage until you delete them, and are only shared when you tap Share.

## Disclaimer

Trouble code descriptions are the generic SAE definitions. Manufacturers assign their own
meanings to some codes, so treat a result as a starting point for diagnosis, not a repair
order. Confirm faults with a qualified technician before carrying out repairs. Do not
operate the app while driving.
