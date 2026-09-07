# Social assets

Profile pictures, 1080×1080. TikTok crops to a circle, so nothing important
sits outside the inscribed circle.

| File | Look | Reads at 48px? |
|---|---|---|
| `pfp-a-gradient-white.png` | White pulse mark on the brand gradient | **Yes — best overall** |
| `pfp-e-inverted.png` | Dark mark on solid orange | **Yes — highest contrast** |
| `pfp-c-monogram.png` | "Dx" on the gradient | Yes, but generic |
| `pfp-b-app-icon.png` | The exact app icon | No — dark on dark, vanishes in feed |
| `pfp-d-ring.png` | Mark inside a ring, dark | No — same problem |

`pfp-size-comparison.png` shows all five circular at 150 / 100 / 48 / 28px,
which is how the choice was made. The app icon is the most on-brand option and
also the worst performing one: a dark avatar on TikTok's dark feed reads as an
empty grey dot at 48px.

Regenerate or edit them in `tools/promo/pfp.html` — open it at 1080×1080 and
screenshot each `.pfp` block.
