# Hand tattoo designs

Three black-and-grey hand tattoo layouts, each rendered as a reference image
(2400 x 3200 PNG) of the design on a hand resting on a knee in dark streetwear,
plus the prompts for generating a photoreal version with an image model.
[`PROMPTS.md`](PROMPTS.md) has the real-hand cinematic prompts, tuned per
generator; the original design prompts are at the bottom of this page.

The references are built the same way as the promo material in `tools/promo`:
an HTML page draws the design as SVG and Playwright screenshots it. Every
element is placed by hand landmarks (knuckles, joints, bone lines, wrist), so
lettering sits exactly where the prompt says it should. The hand carries
directional light, knuckle creases, tendons, veins and hair, with a ribbed hoodie
cuff at the bottom of the frame, but it is still drawn, not photographed: use the
images as placement references for an artist or as the layout input to an image
model, not as finished photoreal art.

| # | File | Wrist | Fingers | Knuckles |
|---|------|-------|---------|----------|
| 1 | [`1-bleeding-heart.png`](1-bleeding-heart.png) | "Almost Healed", Chicano script curved over the cuff | "Opportunist" down the index finger | "RN4L", one letter per knuckle |
| 2 | [`2-soundwave.png`](2-soundwave.png) | "Almost Healed" banner wrapping the top of the wrist | "RN4L" across the lower finger joints | "7220" etched into the bone, one digit per knuckle |
| 3 | [`3-pocket-watch.png`](3-pocket-watch.png) | "Deep Thoughts", gothic around the wrist bone | "RN4L" down the middle finger; "Opportunist" micro-script along the pinky side | — |

All three share the same hand: top-down, back of a right hand, thumb on the
left, wrist at the bottom, resting on a knee in dark streetwear with a ribbed
hoodie cuff at the bottom of the frame, with the full skeleton in bright white
over heavy black.

## Rebuild the images

```
NODE_PATH=/opt/node22/lib/node_modules node designs/hand-tattoos/render.mjs
```

Pass `1`, `2` or `3` to render one design. The script serves the folder itself
so the bundled fonts load, and needs the Playwright Chromium the repo already
uses (set `CHROME=/path/to/chrome` to point at a different binary).

To change a design, edit its HTML page. Artwork is plain SVG built in the
`<script>` block; `hand.js` draws the hand and returns the landmarks
(`H.f.index.mcp`, `H.f.middle.pip`, `H.wrist`, and so on) that everything is
positioned against. Open the page in a browser to preview without rendering.

## Original design prompts

These are the prompts each design was built from, unchanged. For the real-hand
photograph versions use [`PROMPTS.md`](PROMPTS.md) instead, and use the PNG
beside each as the placement reference when the model gets the lettering wrong.

### 1. Bleeding heart, chain-link, OTF plaque

> Hyper-realistic tattoo design reference of a man's full hand and wrist, top-down view, flat on neutral grey, black and grey only, no color. High-contrast dark realism with smooth needle shading. Anatomically correct skeleton hand bones rendered bright white beneath the artwork, with heavy solid-black negative space behind the bones. On the back of the hand: a gritty, highly detailed bleeding heart intertwined with chain-link fence, blended seamlessly beside a cracked, stone-textured blank emblem plaque. Lettering sharp and legible: "Almost Healed" in clean Chicano script curved over the wrist cuff; "Opportunist" in fine-line block letters running vertically down the index finger bone; "RN4L" bold across the four main knuckles, one character per knuckle. Premium tattoo studio portfolio piece, clean and masculine, no filler.

### 2. Soundwave into smoke profile

> Ultra-realistic black and grey tattoo design of a man's hand extending onto the wrist cuff, top-down view, flat on neutral grey, no color. Full anatomical skeleton bone overlay across the whole hand. Woven between the metacarpal bones on the back of the hand: a hyper-realistic, subtly glowing audio soundwave that flows downward and dissolves into a dark, smoky side-profile silhouette of a man near the wrist. Lettering clean and legible: "7220" etched into the bone, one digit per knuckle across the four main knuckles; "RN4L" in a bold block font across the lower finger joints; "Almost Healed" as a sharp horizontal banner wrapping the top of the wrist. Highly structured, perfectly balanced layout, zero filler symbols, professional stencil quality.

### 3. Shattering pocket watch into storm

> Professional tattoo flash design of a man's hand and fingers, top-down view, flat on neutral grey, black and grey only. Fine-line dark surrealism mixed with heavy solid blackwork shading. A detailed skeleton bone overlay forms the base structure of the entire hand. Center of the back of the hand: a realistic shattering pocket-watch face with Roman numerals, fragments blowing away into a dark storm cloud spreading toward the wrist. Lettering crisp and fully readable in white against black shading: "Deep Thoughts" in premium gothic cursive wrapping cleanly around the wrist bone; "Opportunist" in precise micro-script running down the side of the hand along the pinky bone; "RN4L" running down the middle finger along the phalanges, tracking the bone line. Strong contrast between solid black, white bones, and white lettering. No generic filler.

## Fonts

Bundled in `fonts/`, all under the SIL Open Font License, from Google Fonts:

- Pinyon Script — the Chicano-style script ("Almost Healed")
- UnifrakturMaguntia — gothic ("Deep Thoughts")
- Anton — bold block ("RN4L")
- Oswald 500 — fine-line block ("Opportunist", design 1)
- Tangerine 700 — micro-script ("Opportunist", design 3)
- Bebas Neue — etched digits ("7220")
- Cinzel 700 — Roman numerals on the watch dial
