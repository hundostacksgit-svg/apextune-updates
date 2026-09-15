# Promo video generator

> **OmniDx Studio's promo pack lives in [`studio/`](studio/README.md):** twenty
> TikTok videos, the YouTube tour, feed posts and the thumbnail, rendered from
> the real editor. What to post with each is in `docs/PROMO-KIT.md`. The rest
> of this file is the ApexTune promo.

Renders the 28-second vertical TikTok/Reels promo from the app's own screenshots.
No stock footage, no external services.

## Rebuild it

```
python3 -m http.server 8099 --bind 127.0.0.1 &     # serve the repo root
SP=/tmp/promo node tools/promo/render.mjs          # 840 frames -> $SP/vid/frames
SP=/tmp/promo python3 tools/promo/voice.py         # timed voiceover -> $SP/vid/voiceover.wav
ffmpeg -y -framerate 30 -i /tmp/promo/vid/frames/f%05d.jpg -i /tmp/promo/vid/voiceover.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -r 30 \
  -c:a aac -b:a 192k -shortest -movflags +faststart omnidx-tiktok.mp4
```

Needs `ffmpeg` and `espeak-ng` (`apt install ffmpeg espeak-ng`), plus the
Playwright Chromium the repo already uses for testing.

## Editing it

`promo.html` is the whole video. It renders at 1080x1920 and exposes
`window.seek(t)`, which positions every element for time `t` — so the render is
frame-accurate and repeatable rather than a real-time screen capture.

- Copy changes: edit the scene markup directly.
- Timing: the `SCENES` array sets each scene's start and end.
- Motion: the per-scene block at the bottom of `seek()`.
- Layout: keep content between y=200 and y=1470. TikTok's caption, username and
  action buttons cover roughly the bottom 450px and the right 180px.

Voiceover lines and their slots live in `voice.py`. Each line is rate-fitted to
its slot automatically, capped at 215 wpm so it stays intelligible.

The bundled voice is espeak-ng, which sounds synthetic. TikTok's own
text-to-speech is free and better — render the silent version and add text
blocks in the app instead.
