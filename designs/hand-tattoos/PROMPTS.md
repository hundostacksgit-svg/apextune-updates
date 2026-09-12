# Real-hand prompts

Prompts for generating each design as a cinematic photograph of a real man's hand,
in the framing you gave: hand resting on his knee, dark streetwear hoodie, moody
light, skin texture, hair and veins, healed black and grey tattoo. Design 1 is your
prompt word for word. Designs 2 and 3 use the same opening and closing sentences
with their own artwork and lettering dropped in.

Every variant names all three pieces of lettering with exact placement, and none of
the negative lists contain the words "text", "letters" or "words", which would
suppress the lettering itself.

## Where to run them

1. **GPT Image (ChatGPT)** first. Attach the matching PNG from this folder as the
   image input, paste the GPT Image prompt, and generate portrait 1024x1536. It
   renders text reliably and can copy placement from the layout.
2. **Ideogram 3** (style Realistic, Magic Prompt off, aspect 4:5, paste the negative
   into the negative box) or **Flux 1.1 Pro** (no negative box; the positive prompt
   carries everything). Both handle short quoted lettering well.
3. **Midjourney v7** last, for mood and skin, expecting to fix lettering by hand or
   with inpainting. Optionally upload the PNG and put its URL in front of the prompt
   as an image prompt with `--iw 1.5` (not `--sref`, which copies style, not layout).

What usually goes wrong: misspelled or duplicated letters ("RN4L" becoming "RNAL",
"7220" sliding off the knuckles), colour creeping into the heart, glow or watch face,
the hoodie cuff covering the wrist lettering, the OTF plaque being dropped, and extra
or fused fingers. Check spelling, knuckle count, wrist visibility and finger count
before accepting a render.

## 1. Bleeding heart, chain-link, OTF plaque

Layout reference: [`1-bleeding-heart.png`](1-bleeding-heart.png)

### Main prompt

```
A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy. Woven into the bone structure on the back of his hand is a detailed bleeding heart with a chain-link fence texture and a clean OTF logo. The word 'Almost Healed' is tattooed in sharp Chicano script wrapping his wrist. The letters 'RN4L' are boldly tattooed across his knuckles, and the word 'Opportunist' runs down the side of his index finger. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Negative prompt

```
color, colour, colored ink, red, pink, rainbow, saturated tones, misspelling, gibberish, garbled glyphs, duplicated glyphs, extra symbols, filler decoration, stars, roses, clouds, dots, extra fingers, missing fingers, six fingers, deformed hand, fused fingers, second hand, two hands, gloves, forearm tattoo, blur, out of focus, low resolution, noise, watermark, signature, cartoon, anime, illustration, drawing, sketch, 3D render, CGI, painting, flat vector, fresh ink, redness, swelling, plastic skin, smooth skin, mannequin, woman's hand, child's hand, bright studio lighting, white background
```

### GPT Image (attach the PNG)

```
A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the wrist is fully exposed. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo, monochrome black and grey ink only. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy, pale bones on heavy black shading. On the back of the hand, woven into the bones, is a gritty, highly detailed bleeding heart intertwined with chain-link fence, and beside it a cracked stone plaque carrying a clean OTF emblem. The attached image is a placement reference only: match where each element and each word sits on the hand, but render everything as a real healed tattoo in real skin, not in the reference's flat illustrated style, and keep the hand in the natural resting pose described here. Lettering, spelled exactly as written: "Almost Healed" in sharp Chicano script wrapping the wrist; "RN4L" in bold block letters across the four main knuckles, one letter per knuckle; "Opportunist" in fine-line block letters running down the side of the index finger. The only artwork is the bones, the heart, the fence, the plaque and the lettering. One hand only, five fingers, no gloves. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Ideogram 3 / Flux

```
A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the wrist is fully exposed. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo, monochrome black and grey ink only. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy, pale bones on heavy black shading. On the back of the hand, woven into the bones, is a gritty, highly detailed bleeding heart intertwined with chain-link fence. Beside the heart is a cracked stone plaque carrying a clean OTF emblem. The only artwork is the bones, the heart, the fence, the plaque and the lettering. The words "Almost Healed" are tattooed in sharp Chicano script wrapping around his wrist. The letters "RN4L" are tattooed in bold block letters across the four main knuckles, one letter per knuckle. The word "Opportunist" is tattooed in fine-line block letters running down the side of his index finger. Every word is spelled exactly as written. One hand only, five fingers. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Midjourney v7

```
cinematic close-up photograph, a man's real hand resting on his knee, dark streetwear hoodie with the sleeve pushed back so the wrist is fully exposed, moody dramatic low-key lighting, natural skin texture, hair and veins, back of hand and fingers fully covered in a healed high-contrast black and grey realism tattoo, sharp skeleton bone overlay on heavy black shading aligned to the real hand anatomy, on the back of the hand a gritty highly detailed bleeding heart intertwined with chain-link fence beside a cracked stone plaque bearing a clean OTF emblem, monochrome black and grey ink only, wrist wrapped in sharp Chicano script reading "Almost Healed", four main knuckles reading "RN4L" in bold block letters one letter per knuckle, side of index finger reading "Opportunist" in fine-line block letters, healed tattoo embedded in real skin, one hand, five fingers, 85mm, shallow depth of field --ar 4:5 --style raw --s 50 --no color, cartoon, illustration, extra fingers, second hand, gloves, watermark
```

## 2. Soundwave into smoke profile

Layout reference: [`2-soundwave.png`](2-soundwave.png)

### Main prompt

```
A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the whole wrist is exposed. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy, bright white bones over heavy solid black shading. Woven between the metacarpal bones on the back of the hand is a subtly glowing audio soundwave that flows downward and dissolves into a dark, smoky side-profile silhouette of a man near the wrist. Lettering is crisp and fully legible: "7220" etched into the bone across the four main knuckles, one digit per knuckle; "RN4L" in a bold block font across the lower finger joints, one letter per finger; "Almost Healed" in a sharp horizontal banner wrapping the top of the wrist. Strictly monochrome black and grey ink, the soundwave glow a pale grey-white. One bare hand with five fingers and nothing else in the design. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Negative prompt

```
colour, color, coloured ink, red, blue, cyan, green, coloured neon, misspelling, garbled glyphs, duplicated glyphs, substituted glyphs, tattoo on the palm, extra fingers, missing fingers, six fingers, fused fingers, deformed hand, second hand, two hands, gloves, rings, bracelets, jewellery, sleeve covering the wrist, hidden wrist, blur, out of focus, motion blur, low resolution, noise, watermark, signature, logo, cartoon, illustration, drawing, sketch, vector, anime, 3D render, CGI, plastic skin, smooth airbrushed skin, fresh ink, redness, swelling, stencil paper, flat grey background, top-down flat lay, filler decoration, stars, roses, clocks, chains, wings, bright flat lighting, coloured hoodie, female hand
```

### GPT Image (attach the PNG)

```
. A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the whole wrist is exposed. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy, bright white bones over heavy black shading. The attached image is a placement reference only. Match where each element and each word sits on the hand, but render everything as a real healed tattoo in real skin, not in the reference's flat illustrated style. Artwork: a subtly glowing audio soundwave woven between the metacarpal bones on the back of the hand, flowing downward and dissolving into a dark, smoky side-profile silhouette of a man near the wrist. Lettering, placed as in the reference and spelled exactly as written: "7220" etched into the bone across the four main knuckles, one digit per knuckle; "RN4L" in a bold block font across the lower finger joints, one letter per finger; "Almost Healed" in a sharp horizontal banner wrapping the top of the wrist. Spell every word exactly as written, with no duplicated, missing or substituted characters. Strictly monochrome black and grey ink, including the soundwave glow, which is pale grey-white. The design contains only the bone overlay, the soundwave, the smoke silhouette and the three pieces of lettering. Exactly one bare hand with five fingers is in frame. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Ideogram 3 / Flux

```
A close-up, high-detail cinematic photograph of a man's real hand resting on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the whole wrist is exposed. The lighting is moody and dramatic, showing natural skin texture, hair and veins on the hand. The back of the hand and fingers are fully covered in a healed, high-contrast black and grey realism tattoo. A sharp skeleton bone overlay of bright white bones on heavy black shading is perfectly aligned with his real hand anatomy. Woven between the metacarpal bones on the back of the hand is a subtly glowing audio soundwave with a pale grey-white glow. The soundwave flows downward and dissolves into a dark, smoky side-profile silhouette of a man near the wrist. The text "7220" is etched into the bone across the four main knuckles, one digit per knuckle. The text "RN4L" is in a bold block font across the lower finger joints, one letter per finger. The text "Almost Healed" is in a sharp horizontal banner wrapping the top of the wrist. All lettering is crisp, correctly spelled and fully legible. Strictly monochrome black and grey ink throughout. The design contains only the bone overlay, the soundwave, the smoke silhouette and the three pieces of lettering. One bare hand with five fingers. The tattoo looks completely healed and embedded into real human skin. Style: Realistic / Photo. Aspect ratio 4:5.
```

### Midjourney v7

```
cinematic close-up photograph of a man's real hand resting on his knee, dark streetwear hoodie with the sleeve pushed back and the wrist fully exposed, moody dramatic lighting, natural skin texture, hair and veins, back of the hand and fingers fully covered in a healed high-contrast black and grey realism tattoo, sharp white skeleton bone overlay aligned to the real hand anatomy over heavy black shading, a subtly glowing pale grey-white audio soundwave woven between the metacarpal bones flowing downward and dissolving into a dark smoky side-profile silhouette of a man near the wrist, strictly monochrome black and grey ink, one bare hand with five fingers, tattoo embedded in real skin. Lettering: "7220" etched into the bone across the four main knuckles one digit per knuckle, "RN4L" bold block font across the lower finger joints one letter per finger, "Almost Healed" sharp horizontal banner wrapping the top of the wrist --ar 4:5 --style raw --no color, cartoon, illustration, extra fingers, second hand, gloves, sleeve over wrist, watermark
```

## 3. Shattering pocket watch into storm

Layout reference: [`3-pocket-watch.png`](3-pocket-watch.png)

### Main prompt

```
A close-up, high-detail cinematic photograph of a man's real hand resting palm-down on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the wrist is fully visible. The lighting is moody and dramatic, showing natural skin texture, hair, and veins on the hand. The back of the hand and fingers are fully covered in a high-contrast black and grey realism tattoo. The tattoo features a sharp skeleton bone hand overlay perfectly aligned with his natural hand anatomy. In the centre of the back of the hand sits a realistic pocket-watch face with Roman numerals, its glass and dial shattering, the fragments blowing away into a dark storm cloud that spreads toward the wrist, rendered in fine-line dark surrealism over heavy solid blackwork, with crisp white bones on deep black. The lettering "Deep Thoughts" in premium gothic cursive wraps around the wrist bone. The lettering "Opportunist" in precise micro-script runs down the side of the hand along the pinky bone. The lettering "RN4L" in bold block letters runs down the middle finger along the phalanges, tracking the bone line. Strictly monochrome black and grey ink. The only artwork is the shattering pocket watch, the storm cloud, the skeleton overlay and these three pieces of lettering, each spelled exactly as written. The tattoo looks completely healed, realistic, and embedded into real human skin.
```

### Negative prompt

```
color, colour, colored ink, red, blue, green, yellow, sepia tint, misspelling, gibberish, garbled glyphs, duplicated glyphs, extra symbols, extra decoration, filler ornaments, roses, clocks elsewhere, second person's hand, two hands, extra fingers, missing fingers, fused fingers, deformed hand, palm up, sleeve covering wrist, gloves, rings, jewelry, blur, out of focus, low resolution, noise, watermark, signature, logo, caption, cartoon, anime, illustration, drawing, painting, 3D render, CGI, plastic skin, smooth skin, fresh ink, redness, stencil lines, sticker look, flat lighting, bright daylight, white background, studio backdrop
```

### GPT Image (attach the PNG)

```
The attached image is a placement reference only: match where each element and each word sits on the hand, but render everything as a real healed tattoo in real skin, not in the reference's flat illustrated style. A close-up, high-detail cinematic photograph of a man's real hand resting palm-down on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the wrist is fully visible, with moody dramatic lighting that shows natural skin texture, hair, and veins. The back of the hand and fingers are fully covered in a healed, high-contrast black and grey realism tattoo with a sharp white skeleton bone hand overlay on heavy solid black, perfectly aligned with his real hand anatomy. In the centre of the back of the hand is a realistic shattering pocket-watch face with Roman numerals, its fragments blowing away into a dark storm cloud that spreads toward the wrist, in fine-line dark surrealism over heavy blackwork. Lettering, matching the reference: "Deep Thoughts" in premium gothic cursive wrapping around the wrist bone; "Opportunist" in precise micro-script running down the side of the hand along the pinky bone; "RN4L" in bold block letters running down the middle finger along the phalanges, tracking the bone line. Spell each word exactly as written. Strictly monochrome black and grey ink. The only artwork is the pocket watch, storm cloud, skeleton overlay, and these three pieces of lettering. One hand only, no gloves or jewelry. The tattoo looks completely healed and embedded into real human skin.
```

### Ideogram 3 / Flux

```
A close-up, high-detail cinematic photograph of a man's real hand resting palm-down on his knee, wearing a dark streetwear hoodie with the sleeve pushed back so the wrist is fully visible. Moody dramatic lighting shows natural skin texture, hair, and veins. The back of the hand and fingers are fully covered in a healed, high-contrast black and grey realism tattoo. A sharp white skeleton bone hand overlay sits on heavy solid black, perfectly aligned with his real hand anatomy. In the centre of the back of the hand is a realistic shattering pocket-watch face with Roman numerals. Its fragments blow away into a dark storm cloud that spreads toward the wrist, in fine-line dark surrealism over heavy blackwork. The text "Deep Thoughts" is written in premium gothic cursive and wraps around the wrist bone. The text "Opportunist" is written in precise micro-script and runs down the side of the hand along the pinky bone. The text "RN4L" is written in bold block letters and runs down the middle finger along the phalanges, tracking the bone line. Strictly monochrome black and grey ink. The only artwork is the pocket watch, storm cloud, skeleton overlay, and these three exact pieces of lettering. One hand, one tattoo, healed and embedded in real skin.
```

### Midjourney v7

```
cinematic close-up photograph of a man's real hand resting palm-down on his knee, dark streetwear hoodie with the sleeve pushed back so the wrist is fully visible, moody dramatic low-key lighting, natural skin texture, hair and veins, healed high-contrast black and grey realism tattoo covering the back of the hand and fingers, sharp white skeleton bone overlay aligned to the real hand anatomy on heavy solid black, realistic shattering pocket-watch face with Roman numerals centred on the back of the hand, fragments blowing into a dark storm cloud spreading toward the wrist, fine-line dark surrealism, black and grey ink only, lettering "Deep Thoughts" in gothic cursive wrapping around the wrist bone, "Opportunist" in micro-script down the side of the hand along the pinky bone, "RN4L" in bold block letters down the middle finger along the phalanges --ar 4:5 --style raw --no color, cartoon, illustration, two hands, gloves, jewelry, watermark
```
