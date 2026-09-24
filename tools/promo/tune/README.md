# The "Watch it work" tutorial

The 74-second video behind the "Watch it work" button on the front page and
the download page (`studio/assets/video/omnidx-tune-how-it-works.*`). It is
made here, from code, so it can be re-cut when the app changes.

| File | What it is |
|---|---|
| `timeline.js` | Every cut, keystroke, click and log line, once. The picture and the sound both read it, so a cut and its hit are the same number. 100 BPM; sections start on bar lines. |
| `tutorial.html`, `tutorial.js` | The picture. `window.seek(t)` sets every element for time `t`; nothing animates on its own. The OmniDx Tune window is drawn from the window's own layout (`$script:Xaml` in `tune/omnidx.ps1`): same columns, labels, buttons and colours. |
| `score.html`, `score.js` | The sound: an original score in D minor and every key, click, whoosh and hit, rendered offline in the browser. Nothing sampled. |
| `render.mjs` | Renders both, encodes WebM (VP9 + Opus), MP4 (H.264 + AAC) and the poster into `studio/assets/video/`. |

## Rebuild it

```
node tools/promo/tune/render.mjs
```

It needs the Playwright Chromium the repo already tests with and an ffmpeg with
libx264, libvpx-vp9, libopus and aac (`FFMPEG=/path/to/ffmpeg`). The two fonts
(Inter, JetBrains Mono, both SIL Open Font License) are fetched into `$WORK/fonts`
on first use and never committed. About five minutes for the picture, one for
the sound, a few for the encodes.

Review stills without rendering the whole thing:

```
node tools/promo/tune/render.mjs --stills 12.5,30,47.6
```

`--audio` renders the score alone; `--reuse-audio` and `--reuse-picture` skip a
part that has not changed.

## What it must stay true to

- The log lines are the script's own shapes and headings (compare
  `studio/assets/ci-log.txt`). When the script's wording changes, change
  `timeline.js`.
- The PC and its numbers are the site's example PC, and the picture says
  "Example run" whenever a number is on screen. The run is shown eight times
  faster and says "Sped up 8x"; the log's seconds are the real ones.
- No voice, so every step is on screen in words, and the same steps are
  written out under the player on the site.
- The house rules in `docs/TUNE-PROMOTION.md` apply: no frame-rate figure, no
  competitor, no "AI".

## The TikTok cuts

Seven 9:16 edits of the same footage, for TikTok, Reels and Shorts. What to
post with each is in `docs/TUNE-TIKTOK.md`.

| File | What it is |
|---|---|
| `shorts.js` | The seven cuts: which tutorial moment each shot plays and how fast, the camera, the hook, captions, rings, keycaps and cards. 120 BPM; cuts land on beats. |
| `short.html`, `short.js` | The vertical picture. The desktop is the tutorial's own (`tutorial.html?mode=short` in an iframe, framed by the cut's camera); the editor's layer is drawn on top. |
| `short-score.html`, `short-score.js` | The sound: the tutorial's instruments (`synth.js`) at 120 BPM, and the tutorial's keys and clicks moved to wherever each cut plays them. |
| `render-shorts.mjs` | Renders them to `$OUT` (default `$WORK/tiktok`): `NN-name.mp4` and `NN-name-cover.jpg`. Never into git. |

```
node tools/promo/tune/render-shorts.mjs                        all seven
node tools/promo/tune/render-shorts.mjs --only ram-speed       one
node tools/promo/tune/render-shorts.mjs --stills ram-speed:1,5 stills to check a change
```

The Task Manager window the first two cuts open is part of the tutorial's
desktop (hidden in the tutorial itself), drawn with the example PC's numbers.
