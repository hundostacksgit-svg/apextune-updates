# OmniDx Studio promo videos

Twenty-two short TikTok videos, four narrated one-minute tours, an 80-second
YouTube tour, six Instagram feed posts and a YouTube thumbnail, rendered from
the real editor with no stock footage, no licensed music and no screen
recording. What to post with each one — captions,
hashtags, voice-over scripts, the schedule — is in `docs/PROMO-KIT.md`.

## Rebuild everything

```
export PROMO_ASSETS=$HOME/omnidx-promo          # where the inputs and outputs live (not in git)
export FFMPEG=/path/to/ffmpeg                   # any ffmpeg with libx264, libvpx and aac
node tools/promo/studio/fonts.mjs               # Inter + Sora, once
node tools/promo/studio/music.mjs               # beats from the app's own beatmaker
node tools/promo/studio/footage.mjs             # five drawn clips for the editor to hold
node tools/promo/studio/shots.mjs               # screenshots of the editor with those clips, every panel, 2x
node tools/promo/studio/pairs.mjs               # the before/after pairs, made by running the app's own engines
PIPER=/usr/local/bin/piper VOICE=/path/en-us-ryan-high.onnx \
  node tools/promo/studio/voice.mjs             # the narration for the tours, and the timing they take from it
node tools/promo/studio/logos.mjs \
  --davinci a.jpg --ae b.png --capcut c.png     # optional: cut supplied competitor marks onto alpha (see below)
node tools/promo/studio/verify.mjs               # check the specs before spending two minutes a video on them
node tools/promo/studio/render.mjs --fmt tiktok --video all --jobs 2 --out $PROMO_ASSETS/out
node tools/promo/studio/render.mjs --fmt yt --video yt-showcase --out $PROMO_ASSETS/out
node tools/promo/studio/render.mjs --stills --out $PROMO_ASSETS/out
```

## Resolution and frame rate

`--scale 2` renders 4K (2160×3840 for TikTok), `--scale 4` renders 8K, at the
same layout: the browser is told the device has more pixels per logical pixel,
so text and vectors are sharp at full resolution and a canvas scene allocates
at device pixels. `--fps 120` does what it says. The output file carries the
resolution and rate in its name (`-4k-120fps`). `show-01-genesis` is the piece
built for this — see the promo kit.

## Checking the specs

`verify.mjs` reads `videos.js` and resolves everything it claims, without
rendering anything. It catches the failures that are invisible until you watch
forty finished videos: a mistyped shot name (which renders a broken image rather
than throwing), a music bed that was never generated, a cut list with a gap in
it, **a cut between two pictures too alike to read as a cut** — measured, by
scaling each crop to a single grey pixel — and the copy rules from
`docs/PROMOTION.md` §3: no "AI-powered", no claim about a named competitor, no
price that is not on the pricing page, nothing about transcription until it
ships, and no more than five hashtags on a TikTok.

It needs `PROMO_ASSETS` pointed at generated assets and `FFMPEG` set, and exits
non-zero on any failure.

## Ambient loops

The `sleep` scene and the `amb-01…05` specs are not promos: they are
one-minute seamless loops with no mark and no text, meant to become hour-long
sleep videos on a channel of their own. Three tools and a workflow make that a
finished upload — `docs/AMBIENT.md` is the whole process, including titles.

```
node tools/promo/studio/render.mjs --fmt yt --silent --scale 2 --crf 22 --video amb-02-rain   # the picture: 3840x2160, last frame = first frame
node tools/promo/studio/ambient.mjs --only rain                                                 # the sound: synthesised in ffmpeg, nobody's recording
node tools/promo/studio/longform.mjs --loop <loop.mp4> --bed <bed.mp3> --hours 8 --out rain-8h.mp4   # the length: stream copy, minutes not hours
```

`--crf 22` matters here: the loop is repeated by stream copy, so its bitrate is
the long file's bitrate. `ambient.mjs` normalises every bed to -16 LUFS and
fades both ends so the repeats join silently. The `Ambient video` workflow
(`.github/workflows/ambient.yml`) runs all three on GitHub's machines from the
Actions tab and attaches the result to a release, for a phone with nothing
installed.

## Copying somebody else's edit

`dissect.mjs` takes any MP4 apart and reports what you need to rebuild it: where
every cut lands, how long each shot runs, whether it is cut to a track and at
what tempo, plus a contact sheet of every shot.

```
FFMPEG=/path/to/ffmpeg node tools/promo/studio/dissect.mjs reference.mp4 --out /tmp/ref
```

`mog-01-subscription` and `mog-02-rivals` in `videos.js` are both of these —
see the mog sections of `docs/PROMO-KIT.md` for how the times get from
`cuts.json` into a `drop` scene, and for what went wrong the first time.

## Competitor marks

`mog-02-rivals` shows the DaVinci, After Effects and CapCut logos. **Those files
are not in this repo** — they are other companies' trademarks, and while showing
a competitor is ordinary comparison, redistributing their artwork is not ours to
do. `logos.mjs` takes copies you supply and cuts them onto alpha into
`$PROMO_ASSETS/logos/`, which git ignores along with the rest of the generated
input. `verify.mjs` fails if a `rivals` scene names a mark that is not there.

Outputs land in `$PROMO_ASSETS/out/tiktok/*.mp4` (1080x1920, also Reels and
Shorts), `out/yt/yt-showcase.mp4` (1920x1080), `out/stills/feed-*.png`
(1080x1350) and `out/stills/yt-thumb.png` (1280x720).

Needs Node 20+, the Playwright Chromium the repo's tests already use
(`CHROME` overrides the path; `PLAYWRIGHT_MODULE` points at the module if it
is not on the require path), and ffmpeg. A 20-second video renders in about a
minute; the whole set in under half an hour.

## How it is put together

- `comp.html` + `comp.css` + `comp.js` — the composition. `window.seek(t)`
  positions every element for time `t`; nothing animates on its own, so a
  frame is the same every time it is asked for.
- `videos.js` — every video as data: scenes, copy, where to zoom, where the
  cursor goes. This is the file to edit to change what a video says.
- `render.mjs` — opens the composition in headless Chromium, asks for each
  frame by time, pipes the JPEGs straight into ffmpeg with the beat muxed
  under it. `--frame 4.2 --video <id>` writes one PNG to check a moment.
- `voice.mjs` — the narration for the videos marked `voice: true`. Speaks each
  scene's `say` line with Piper, measures it, and writes
  `$PROMO_ASSETS/voice/<id>.wav` plus a `<id>.json` of per-scene start times.
  Lines are placed at their own start rather than joined end to end, so
  re-recording one line cannot drift the rest.
- `shots.mjs`, `footage.mjs`, `pairs.mjs`, `music.mjs`, `fonts.mjs` — make the
  inputs.

Scene durations are in beats of the chosen track, so cuts land on the music.
The app-scene coordinates are fractions of the screenshot, measured from a
1600x1000 capture; re-shooting at that size keeps them valid.

## Pointing at a control

An app scene can drive a cursor across the screenshot and put a spotlight on
something. Both take `on: '<mark>'` rather than coordinates:

```js
{ type: 'app', shot: 'export', view: hold(V.dialog, 0, 4),
  cursor: [{ at: 1.0, x: 0.42, y: 0.36 }, { at: 2.0, on: 'preset' },
           { at: 2.5, on: 'preset', click: true }, { at: 4.7, on: 'all', click: true }],
  spots:  [{ at: 4.95, until: 6.2, on: 'all', label: 'every platform, one render' }] }
```

The marks come from `shots.json`, which `shots.mjs` writes next to the PNGs:
for every shot a video points into, it records the box of each control it
named, measured off the live page at the instant of the screenshot. Reading
those coordinates off by eye is what the file exists to stop — an eyeballed
cursor keeps pointing at the same spot after the layout moves, lands on empty
chrome, and nobody notices until the video is posted. A mark that is off the
top or bottom of the panel is dropped rather than recorded, because the
screenshot does not contain it; comp.js warns in the console for an `on` it
cannot resolve and falls back to whatever was written by hand.

To point at something new, add it to that shot's mark list in `shots.mjs`
(a CSS selector, `{ sel, nth }`, or `{ sel, text }`) and re-shoot.

`view` keyframes take `on` too, so a scene can frame a control by name:
`{ at: 2, on: 'plan', w: 0.3 }`.

## The narrated tours

A video with `voice: true` has no music and no beat grid. Its scene durations
come out of `voice/<id>.json` instead: the line is spoken first, measured, and
the scene it belongs to lasts exactly that long plus a short pause. So the
picture follows the voice — editing a `say` line and re-running `voice.mjs`
re-times the video by itself, and nothing has to be counted by hand. A scene
with its own `dur` uses that as a floor, which is how the end card stays up
long enough for the address to be read rather than just said.

`wm: 'corner'` puts the watermark in a small pill in the top-left instead of
under the middle of the frame, so it survives a screen-recorded repost without
sitting in the middle of the picture.

The voice is a neural TTS model running locally — no key, no request, and the
same script always produces the same take. `VOICE` points at the `.onnx`;
`PIPER` at the binary.

## Changing a video

Edit its entry in `videos.js`, then check a frame or two:

```
node tools/promo/studio/render.mjs --video 04-340-effects --frame 9.5 --out $PROMO_ASSETS/out
```

The PNG lands in `out/check/`. When it looks right, render just that one:

```
node tools/promo/studio/render.mjs --video 04-340-effects --out $PROMO_ASSETS/out
```

## Copying an edit

`dissect.mjs` takes an MP4 apart so it can be rebuilt: a reference somebody
sent, a screen recording of a TikTok worth stealing the shape of, or one of
ours.

```
FFMPEG=/path/to/ffmpeg node tools/promo/studio/dissect.mjs reference.mp4 --out /tmp/ref
```

It writes `cuts.json` (every cut time, every shot length, the pace, and the
tempo those lengths imply if the edit is cut to a track), `shot-NN.jpg` from the
middle of each shot, and `contact.jpg` — the whole edit as one image, which is
the thing to look at first.

Two details it gets right that a naive read does not:

- **A flash on the cut is not a shot.** A white frame between two shots trips
  the scene detector twice, so a five-shot edit reports as nine, four of them a
  single frame long. Anything under two frames is folded back into the shot it
  interrupted and counted as a transition instead.
- **A shot length only implies a tempo if music is made at it.** 60 over a
  4.5-second shot is 13 BPM, which is arithmetic rather than a tempo. It tries
  one, two, four and eight beats a cut and keeps the readings that land between
  60 and 200.

`--threshold` tunes the cut detector: higher for a busy edit full of camera
movement, lower for a slow one. The value used is recorded in `cuts.json`.

Then build the copy as a normal entry in `videos.js`, with scene durations taken
from `cuts.json`. What transfers exactly is the structure — cut timing, shot
count and order, text placement and timing, the moves. What cannot transfer is
the audio: a commercial track cannot be reproduced and should not be, so those
rebuilds get rendered `--silent` and the sound goes on in the app.

## Before and after pairs

Two scenes show a result rather than a panel, and both are the app's real
output rather than an illustration:

- `wipe` with `pair: 'erase'` wipes between `footage/erase-before.png` and
  `erase-after.png`. The "after" is produced by `erase.js` filling the can out
  of the "before", from a background plate taken later in the same shot.
- `sound` draws `audio-repair.json`: the envelope, noise floor and click
  positions of a deliberately awful recording, and of the same recording after
  `audio-repair.js` has been over it. The decibel figure on screen is the
  measured change in the noise floor.

Both are produced by `pairs.mjs`, which refuses to write a pair that would
mislead: it fails if any of the can survives the erase, if the repair does not
find the hum that was put in, or if the noise floor barely moves. If either
engine changes, run it again and re-render video 22, or the video will be
showing an older version of the app than the app is.

Every claim in the copy matches the comparison table on the pricing page.
Keep it that way — a video that promises something the app does not do is
worse than no video.
