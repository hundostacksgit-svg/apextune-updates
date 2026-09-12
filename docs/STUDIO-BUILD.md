# Shipping OmniDx Studio to Mac, Windows, iOS and Android

The web version is already all four platforms — installed from the browser it
gets an icon, its own window and works offline. That is the fastest path and
the one the download page leads with. Store builds are for reach and for the
things a web page genuinely cannot do.

Nothing below needs a paid account except the Apple parts, which do.

---

## The web build (no build)

There isn't one. `studio/app/` is served as files. Push the repo, GitHub Pages
serves it, done. On a phone: Safari → Share → Add to Home Screen; Chrome →
menu → Install app.

**What you get:** an icon, no browser chrome, full offline, autosave, the whole
editor. **What you don't:** hardware video decoding, file associations, and a
listing anyone can find by searching a store.

---

## macOS, Windows and Linux — Electron

```bash
cd studio/desktop
npm install
npm run start          # run it now, unpackaged
npm run dist           # installers into studio/desktop/out/
```

`npm run dist` builds for the machine you're on. Cross-building macOS from
anything but a Mac does not work; Windows from Linux does, via wine, and is
more trouble than a free GitHub Actions runner.

### What the desktop shell adds

- Real Open/Save dialogs, so an export goes where you point it.
- Double-clicking a `.omnidx` project, a `.omnidxpkg` bundle, or a video,
  audio or image file opens it — a second launch hands the file to the
  window that is already open.
- A menu bar wired to the same actions the buttons use.
- A window that survives someone tidying their tabs.
- Updates itself: once a week it reads `latest.yml` from
  `https://omnidx.net/studio/download/files/`, downloads the new build in the
  background and installs it the next time it quits. No dialog, no restart
  prompt, and it waits while a render is running. Nothing to host but the
  files the download page already serves.

### Signing

Unsigned builds work but warn. To ship without the warning:

**macOS** — an Apple Developer account ($99/yr). Set these and
electron-builder does the rest, including notarisation:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

`entitlements.mac.plist` is already set up with the two entitlements Chromium
needs under the hardened runtime. Without them the app launches and dies with
no message, which is a miserable hour to spend.

**Windows** — a code-signing certificate (~$200-400/yr, or free-ish via Azure
Trusted Signing). Set `CSC_LINK` and `CSC_KEY_PASSWORD` the same way.
Unsigned, SmartScreen shows "unrecognised app" until enough people install it.

**Linux** — nothing to sign. AppImage, deb and rpm all come out of `npm run dist`.

### Automating it — this is the part that is done for you

`.github/workflows/desktop.yml` builds all three on the machines they need
(a `.dmg` needs a Mac, an `.exe` needs Windows). Run it from the Actions tab
with **Run workflow**, or push a tag like `v1.0.1`. Twenty minutes later there
are three artifacts to download: the installers, plus `latest.yml`,
`latest-mac.yml` and `latest-linux.yml`, which are what the installed apps
read to find out a new version exists.

Then, to publish:

1. Put every file from the three artifacts into `studio/download/files/`.
2. Fill in `DOWNLOADS` in `studio/assets/config.js` — the file name, version
   and size for `mac`, `windows` and `linux`. The download page turns each
   button into a direct download the moment the name is there.
3. Push. Pages serves the files; the download page serves the buttons; every
   installed copy finds the update within a week.

Bump `version` in `studio/desktop/package.json` before each build — the
updater compares that number, and a build with the same version is not an
update.

Signing certificates go in repository secrets (`MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`; `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`). Without them the
builds are unsigned: they work, and warn on first launch.

GitHub Pages refuses a single file over 100 MB. An Electron installer sits
near that line. If one goes over, host that file on Cloudflare R2 (the
Worker's account already has it) and put the full `https://` URL in `file`;
the updater's `publish.url` in `package.json` then points at the same place.

---

## iOS and Android — Capacitor

```bash
cd studio/mobile
npm install
npm run sync           # copies the editor into www/ and syncs native projects
npm run add:ios        # once
npm run add:android    # once
npm run open:ios       # opens Xcode
npm run open:android   # opens Android Studio
```

`copy-web.mjs` mirrors `studio/app`, `studio/assets` and `icons` into `www/`
keeping the relative paths, and deletes the service worker — inside a native
shell the files are already local and a stale cache is a horrible bug to chase.

`www/` is generated. It is in `.gitignore` and should stay there.

### Android

Google Play needs a signed App Bundle:

```bash
cd studio/mobile/android
./gradlew bundleRelease        # app/build/outputs/bundle/release/
```

Make an upload key once (`keytool -genkey -v -keystore omnidx.keystore ...`),
put it in `android/key.properties`, and **do not commit it**. Play's one-time
setup is $25.

For a direct download outside the store, `./gradlew assembleRelease` produces
an `.apk` you can host — worth doing, because "install without an account" is
a real selling point and the download page can link straight to it.

### iOS

Needs a Mac, Xcode and a $99/yr Apple Developer account. Open the project,
set the team, archive, upload. Two things App Review reliably asks about:

- **Why it needs the photo library** — the editor imports video. Write that in
  `NSPhotoLibraryUsageDescription`, in plain words.
- **What the paid tiers unlock.** Apple takes 15-30% of in-app purchases and
  requires you to use theirs for digital goods used inside the app. Selling the
  licence on your own website and having the app accept a key is the normal way
  round this, and it is what the app already does — but do not add a "Buy" button
  inside the iOS build that links to your own checkout, because that is the
  specific thing that gets rejected. Ship the iOS build with the upgrade prompts
  pointing at "redeem a key" only.

That last point is a real constraint on the iOS version and worth deciding
before you build it rather than after a rejection.

---

## Which to build first

1. **Web.** It's done. It costs nothing and covers every device.
2. **Windows .exe.** Biggest desktop audience, cheapest to sign, no review.
3. **Android .apk direct download**, then Play if it takes off.
4. **macOS .dmg** once you're paying Apple anyway.
5. **iOS** last. The most work, the most rules, the smallest marginal gain
   given the web version already installs to the home screen.
