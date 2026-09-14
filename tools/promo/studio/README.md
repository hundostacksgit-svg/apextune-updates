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
node tools/promo/studio/render.mjs --fmt tiktok --video all --jobs 2 --out $PROMO_ASSETS/out
node tools/promo/studio/render.mjs --fmt yt --video yt-showcase --out $PROMO_ASSETS/out
node tools/promo/studio/render.mjs --stills --out $PROMO_ASSETS/out
```

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
