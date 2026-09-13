# OmniDx Studio promo videos

Twenty TikTok videos, an 80-second YouTube tour, six Instagram feed posts and
a YouTube thumbnail, rendered from the real editor with no stock footage, no
licensed music and no screen recording. What to post with each one — captions,
hashtags, voice-over scripts, the schedule — is in `docs/PROMO-KIT.md`.

## Rebuild everything

```
export PROMO_ASSETS=$HOME/omnidx-promo          # where the inputs and outputs live (not in git)
export FFMPEG=/path/to/ffmpeg                   # any ffmpeg with libx264, libvpx and aac
node tools/promo/studio/fonts.mjs               # Inter + Sora, once
node tools/promo/studio/music.mjs               # beats from the app's own beatmaker
node tools/promo/studio/footage.mjs             # four drawn clips for the editor to hold
node tools/promo/studio/shots.mjs               # screenshots of the editor with those clips, every panel, 2x
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
- `shots.mjs`, `footage.mjs`, `music.mjs`, `fonts.mjs` — make the inputs.

Scene durations are in beats of the chosen track, so cuts land on the music.
The app-scene coordinates are fractions of the screenshot, measured from a
1600x1000 capture; re-shooting at that size keeps them valid.

## Changing a video

Edit its entry in `videos.js`, then check a frame or two:

```
node tools/promo/studio/render.mjs --video 04-340-effects --frame 9.5 --out $PROMO_ASSETS/out
```

The PNG lands in `out/check/`. When it looks right, render just that one:

```
node tools/promo/studio/render.mjs --video 04-340-effects --out $PROMO_ASSETS/out
```

Every claim in the copy matches the comparison table on the pricing page.
Keep it that way — a video that promises something the app does not do is
worse than no video.
