# Pushing an update

Everyone running OmniDx Studio checks `version.json` on boot and every half
hour after. Bumping it is what makes an update reach them: the running app
notices, shows a bar with your notes, and reloads onto the new files when the
person presses the button.

It never reloads on its own. Someone mid-export losing an hour of rendering to
a background update would be unforgivable.

---

## Shipping one

```bash
python3 tools/release.py minor \
  --headline "Background removal, no green screen needed" \
  --note "Remove a background from any clip" \
  --note "Faster export on long timelines" \
  --note "Fixed captions drifting on ramped clips"

git add -A && git commit -m "Release 1.2.0: background removal" && git push
```

That's it. GitHub Actions publishes the commit to Pages, and every open copy
picks it up within half an hour — or the moment someone reopens the app.

`release.py` rewrites three things and refuses to do anything silly:

| File | Why |
|---|---|
| `version.json` | What the running apps read. |
| `studio/app/js/updates.js` | The `BUILD` constant they compare against. |
| `studio/app/sw.js` | The cache name — a new one is what actually evicts the old shell. |

It will not let you release a version that isn't newer than the current one
(apps only update forwards, so it would reach nobody), and it insists on a
`--headline`, because "various improvements" is why nobody presses the button.

Check what's live at any time:

```bash
python3 tools/release.py --show
```

## Why the reload actually gets new code

Service workers are the usual reason an update doesn't land. Ours is
**network-first for HTML and JavaScript** and cache-first for everything else,
so a running app is never served a stale module while still working offline.
When the update bar's button is pressed the app saves the open project, posts
`SKIP_WAITING` to the waiting worker, and reloads — so the new shell takes over
on *that* reload rather than the one after it.

## The website

The marketing pages are plain static files with no version check — a visitor
always gets the current ones. Push and they're live.

The one thing to remember: if you rename the site or move to a custom domain,
run `python3 tools/set-domain.py --site-url <url>` so the link-preview tags on
all five pages follow it.

## Desktop and mobile

These do **not** update through `version.json`, because they ship their own
copy of the app files:

- **Desktop (Electron)** — cut a GitHub release with new installers. Adding
  `electron-updater` would make it automatic; it isn't wired up yet.
- **iOS / Android (Capacitor)** — a store submission. Days, not minutes, and
  Apple reviews every one.

This is the main practical argument for pushing people to the web install: it
updates the moment you push, and the store builds do not.

## What an update cannot break

Projects and media live in the browser's IndexedDB, not in the app files. An
update replaces the code and leaves every project, every imported file and
every licence exactly where it was. `deserialize()` fills in anything a newer
schema added, so a project made in 1.0 opens in 1.5 without being touched.

The one thing worth testing before you push a release that changes the project
schema: open an old project. It takes thirty seconds and it is the only way
that promise stays true.

## If you tell me to push an update

Say what you want changed. I'll make the change, run the tests, bump the
version with real release notes, and push — and the update bar does the rest.
