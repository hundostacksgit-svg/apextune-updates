# Promo kit — OmniDx Studio

Everything to post, in the order to post it. The videos come from
`tools/promo/studio/` (see its README to re-render); this file is what goes
with them: the caption for each one, the hashtags, the voice-over to add in
the app, the schedule, and the copy for every other place worth being.

**Read `docs/PROMOTION.md` first.** It covers what to claim and never claim,
how to answer "this is a scam" in a comment section, and the two claims in this
kit that were fixed after it was written. This file is the material; that one
is the plan.

The one message, said twenty ways: **a full video editor you pay for once.
Free to start, $19.99 once for Creator, every update after it free, every
device, and features the subscription editors do not have.**

---

## What is in the pack

| Where | Files | Size |
|---|---|---|
| TikTok / Reels / Shorts | `out/tiktok/01-…22-*.mp4` | 1080x1920, 17–27 s, 30 fps, beat underneath |
| Narrated tours | `out/tiktok/tour-01…04-*.mp4` | 1080x1920, 53–69 s, 30 fps, spoken, no music |
| YouTube | `out/yt/yt-showcase.mp4` | 1920x1080, 83 s |
| YouTube thumbnail | `out/stills/yt-thumb.png` | 1280x720 |
| Instagram feed | `out/stills/feed-01…06-*.png` | 1080x1350 |
| Logo | the app tile, the wordmark on dark and on white | for profile pictures and headers |

Every video carries the logo and **omnidx.net** on every frame, an on-screen
caption for sound-off viewing, and an end card with the price, the address
and the hashtags. The music is the app's own beatmaker, so there is nothing
to licence and nothing TikTok can mute.

## Before the first post (once)

- **Bio link** on every account: `https://omnidx.net`. Bio text, all platforms:
  `Video editor you buy once. Free to start · $19.99 once · no subscription, ever. 340 effects, AI, every device.`
- **Profile picture**: the app tile. **Header / banner**: the wordmark on dark.
- **Pinned comment** on every video (post it yourself, right after uploading):
  `free version at omnidx.net — no watermark, no trial. Creator is $19.99 once and that's the last time you pay. ask me anything 👇`
- Turn **replies on** everywhere and answer every comment in the first hour.
  The algorithm counts replies; so do people deciding whether to trust an
  unknown app.

## Voice-over

Two kinds of video are in this pack, and they treat the voice differently.

The **four narrated tours** (`tour-01` … `tour-04`) already carry a spoken
track: a male voice, no music under it, timed so every scene lasts exactly as
long as the line that goes with it. Upload those as they are — do not add
TikTok's reader on top, and do not put a track under them. They are the long
ones, and the section below explains when to post them.

Everything else has no spoken track — on purpose. TikTok's built-in text-to-speech
is free, sounds native to the platform, and gets the video into the
"has a voice" ranking bucket. Each video below has a script sized to its
length. To add it:

1. Upload the MP4 in TikTok, tap **Text**, paste the script, tap the text →
   **Text-to-speech**, pick a voice (Jessie is the safe default; "Narrator" for
   the calmer ones like 05 and 14).
2. Drag the text box **off-screen** (or shrink it to the bottom edge) — the
   words are already burnt into the video. The voice stays.
3. Keep the original sound at about 40% under the voice.

For Reels and Shorts, CapCut's TTS does the same job; export and upload.

## Schedule

One video a day for three weeks, posted to TikTok first, then the same MP4
to Reels and Shorts within the hour (same caption, hashtags trimmed to the
platform). Feed images go up on the days marked. Best times for a new account
are 11:00–13:00 and 19:00–21:00 in your audience's time zone — pick one slot
and keep it.

| Day | Video | Also post |
|---|---|---|
| 1 | 18 Free forever *(proof first — see PROMOTION.md §4)* | feed-01 |
| 2 | 01 Stop paying monthly | |
| 3 | 02 One sentence, whole edit | |
| 4 | 04 340 effects | feed-03 |
| 5 | 03 Every cut on the beat | |
| 6 | 10 One edit, every platform | |
| 7 | 06 Expressions | feed-02 |
| 8 | 05 Private & offline | |
| 9 | 07 Text animators | |
| 10 | 20 What $19.99 gets you | feed-05 |
| 11 | 11 Every device | |
| 12 | 14 Colour | |
| 13 | 08 Particles | feed-04 |
| 14 | 19 Every update free | |
| 15 | 13 Motion tracking | |
| 16 | 09 Shape layers | feed-06 |
| 17 | 15 Audio repair | |
| 18 | 16 Speed ramps | |
| 19 | 17 Montage styles | |
| 20 | 21 Everything it can't do *(the shareable one)* | the trust page as a link post |
| 21 | 22 Tap it, it's gone *(the loudest one — see below)* | |
| 22 | YouTube tour (long) + re-post day 1 as a Short | |

**Video 21 is the limitations video and video 12 is held.** 21 is written to be
the most shareable thing in the set; it takes the slot 12 vacated.

**Video 22 is the one to break the schedule for.** It is the only video whose
first six seconds are a visual result rather than a claim, so it is the best
candidate to re-post, to boost, and to lead with if the first week is quiet.
It sits at day 21 because proof of the offer should land before the magic
does — post a trick first and the comments are "fake" — but if any earlier
video takes off, follow it with 22 the next day rather than waiting.

**12 Auto captions is deliberately not in this list.** It promises more than the
app does today; post it when the transcription server is live. That leaves
twenty-one videos over twenty-one days, which is about the right number — a
further slot is better spent on whichever of them worked than on a new one.

After day 22, re-post the three best performers with a new first line, and
keep making them: the generator is in the repo, and a new video is a new
entry in `videos.js`.

---

## The cold-open re-cuts — post these instead of the originals

`out/tiktok/*-cold.mp4`. Same videos, re-ordered so the **app doing something**
is the first frame and the hook line lands second.

This exists because of what the first twelve posts looked like: every cover was
a line of text on the same gradient, and every video opened on that card. The
counts (81, 92, 12, 36, 59, 108, 98, 96, 101) say the account is being
distributed fine — it is the half second at the start that people are deciding
on. `PROMOTION.md` §7c has the full read.

**These replace the originals.** Do not post both — to a scroller they are the
same video, and to the algorithm the second one is a repeat of something that
already did not hold.

| Re-cut | Now opens on |
|---|---|
| `01-no-subscription-cold` | the whole editor, timeline running |
| `02-ai-sentence-cold` | a sentence being typed into the AI panel |
| `03-cut-on-the-beat-cold` | clips snapping onto the beat grid |
| `04-340-effects-cold` | the preset wall, previewing on the clip |
| `15-audio-repair-cold` | the dirty waveform |
| `16-speed-ramps-cold` | the ramp curve being dragged |
| `17-montage-styles-cold` | the styles panel with the beat detected |
| `18-free-forever-cold` | the editor, free version |
| `20-vs-subscriptions-cold` | the effects panel |
| `22-instant-wow-cold` | the tap, and the thing vanishing |

**The best version of all is `-cold-silent`** — result first *and* no audio, so
you add a trending sound. Five of them are rendered:
`22-instant-wow`, `03-cut-on-the-beat`, `17-montage-styles`, `04-340-effects`,
`15-audio-repair`.

Render any video either way, or both:

```
node tools/promo/studio/render.mjs --fmt tiktok --cold --silent --video <id> --out $PROMO_ASSETS/out
```

The narrated tours are deliberately excluded — their scene order is the order
the voice was recorded in, and moving a scene puts the wrong sentence over it.

---

## The silent cuts — use a trending sound instead

`out/tiktok/*-silent.mp4` are the same videos with **no audio track at all**.
Six of them: `n1-tap-it-gone`, `n2-bad-audio`, `n3-its-a-phone`,
`h2-remove-a-thing`, `e1-phonk`, `22-instant-wow`.

**Why they exist.** A video that arrives with its own soundtrack is a video
TikTok files as an advert. A video posted silent lets you pick a sound from the
**Trending** list inside the app, and using a trending sound is one of the few
real distribution levers that costs nothing — the app actively pushes content
that uses sounds it is promoting that week.

It is also the only honest way to get music people recognise under these. Real
commercial tracks get claimed or muted on upload, and the claim lands on *your
account*. TikTok's own sound library is licensed for exactly this and costs you
nothing.

**How to post one**
1. Upload the `-silent.mp4`.
2. Tap **Add sound** → **Trending**, and pick something in the first screen —
   the newer the better.
3. Drag the sound so the drop lands on the video's biggest moment (the wipe,
   the waveform flip, the first cut).
4. Post. Do not add TikTok's text-to-speech on top; the captions are burnt in.

Render more of them any time:

```
node tools/promo/studio/render.mjs --fmt tiktok --silent --video <id> --out $PROMO_ASSETS/out
```

Anything in `videos.js` can be rendered silent — the flag drops the audio track
and names the file `<id>-silent.mp4`, so the version with sound is not
overwritten.

---

## The mog — a rebuild of somebody else's edit

`out/tiktok/mog-01-subscription-silent.mp4` · 19s · silent · corner sticker
throughout.

This one is not written from scratch. The owner sent over a BMW edit and asked
for it back one-for-one with OmniDx in place of the car, so it was **measured**
rather than eyeballed:

```
FFMPEG=... node tools/promo/studio/dissect.mjs <reference.mp4> --out /tmp/ref
```

`dissect.mjs` takes any MP4 apart and reports where every cut lands, how long
each shot runs, whether the thing is cut to a track and at what tempo, and it
writes a contact sheet of the middle frame of every shot so the content is
readable at a glance. The reference came back as **one six-second shot, then
thirty-one cuts in nine seconds, eight of them two frames long**. Those exact
times are the `cuts` array in `videos.js` — so the section lands where that
track lands, and dropping a sound on it in the app puts the hits back where
they were.

**The shape**

| | |
|---|---|
| **0 – 6.1s** | One frame. `CapCut`, `DaVinci`, `Adobe` stack up one at a time under **WHAT YOU ARE RENTING**, and a counter runs `MONTH 1` → `MONTH 60` — five years — over *and it still is not yours*. The frame pushes in the whole time and gets blown out in the last third of a second. |
| **6.1 – 15.9s** | Thirty-one cuts, **thirty-one different pictures** — nothing repeats. The first is the logo arriving, taking the same punch and chromatic split as every cut around it. Then the app, one feature a cut, lit and dark alternating. |
| **15.9 – 19.1s** | `omnidx.net` · `$19.99 once. no subscription. ever.` — as the last hit of the edit, not as an end card. |

**Three things it took another pass to get right**, all found by dissecting the
render rather than by watching it:

1. **Six of the thirty-one cuts were missing.** Every screenshot in this app is
   dark chrome — measured, the crops run 9 to 60 mean luma out of 255 — so two
   consecutive panels differ by less than a scene detector's threshold however
   hard the picture moves. The reference gets its cuts for free by being four
   differently-coloured cars. The fix is `TONES` in `comp.js`: every other cut
   is crushed and cool, the ones between are lifted and warm. That guarantees a
   delta on every cut whatever is in frame, and it is what a phonk edit does
   anyway.
2. **The intro stack sat on the caption.** It is centred, but it grows downward
   as each name lands and then gets scaled 1.16 by the push. Padding the plate's
   bottom moves the centre up, which holds at every stage of the build.

3. **Twelve of the thirty-one cuts showed a picture already used.** Nineteen
   frames cycling over thirty-one cuts repeats twelve of them, and the repeat is
   obvious because the *labels* come back round — you notice reading "tap it.
   gone." twice long before you notice the screenshot. There are now thirty-one
   frames for thirty-one cuts and nothing repeats.

The first pass at (1) alternated the grade on the **cut index** and still lost
five cuts, for the same reason as (3): with the list shorter than the cut list
the same picture came up warm on one pass and cool on the next, and two cuts met
in the middle. The tone belongs to the picture, not to the cut. `videos.js` pins
`tone: 'warm'` on the lit crops and `tone: 'cool'` on the dark ones, which puts
every lit frame above 40 and every dark one below 19.

Fixing (1) also turned up a bug in `dissect.mjs` itself. Folding away every span
shorter than two frames drops the *whole* burst when three detections cluster —
a flash going in, the cut, and the punch on the new shot tripping the filter
again — so the tool reported no cut at 12.0s while the frames either side of it
were a logo card and an export dialog. It now keeps the first of each burst,
which is where the cut actually is.

**On the three names.** They are set in OmniDx's own typeface, greyed back, as
text. No logo artwork, no colours, and — after a second pass — **no numbers
attached to any of them**. The intro originally showed `$22.99/month` running up
to `$1,379.40`, which reads well and is a price this project has no source for:
the pricing page carries OmniDx's prices, not anybody else's, and the house rule
is that a number on screen is a number the page carries. Counting *months* makes
the same point, lands harder, and asserts nothing about anyone. The only price in
the video is `$19.99 once`, on the last frame.

Naming what people already pay for is ordinary comparison. Reproducing
somebody's trademark is a different thing and is not done here — and it is worth
knowing that CapCut and TikTok have the same owner, so a video that uses
CapCut's mark is a video posted to their platform using their mark.

**Caption**

> sixty months of renting an editor. or $19.99 once. omnidx.net

`#editing #capcut #videoediting #contentcreator #editor`

**Post it like the other silent cuts** — upload, **Add sound** → **Trending**,
and drag the sound so the drop lands on **6.1s**, where the logo arrives. That
cut is the whole video; everything before it is the wait that makes it work.

**On the labels.** Only the five counts already used elsewhere in `videos.js`
appear — 544 tracks, 21 montages, 176 looks, 49 text styles, 340 effects. The
other twenty-five cuts name a feature and no number, because a number invented
to fill a caption is a number somebody checks.

**Rebuild another one the same way**

```
FFMPEG=/path/to/ffmpeg node tools/promo/studio/dissect.mjs reference.mp4 --out /tmp/ref
```

Then copy `cuts.json`'s times into a new `drop` scene in `videos.js`, give it a
`frames` list that alternates bright and dark with `tone` pinned to match, and
render it silent. Run the spec verifier before rendering — it re-measures every
crop and fails a cut that will not read, which is two minutes of render saved
each time and a whole category of mistake that cannot ship:

```
PROMO_ASSETS=... FFMPEG=... node verify-promo-specs.mjs
```

---

## The second mog — three logos, called out

`out/tiktok/mog-02-rivals-silent.mp4` · 35.5s · silent · corner sticker
throughout.

A second edit, rebuilt three times. The first two were wrong in the same way and
it is worth writing down, because the mistake is the obvious one.

**Attempt one** took the cut times off the reference's *picture* and never
looked at its audio. The cuts were in the right places relative to each other
and had no relationship to the music.

**Attempt two** tried to fix that by deriving a beat grid and cutting to it.
Three methods, three answers: the app's own `detectBeats` said **122 BPM at 0.44
confidence** (it had locked onto a hat pattern at ~133ms — worth knowing, since
that detector ships); autocorrelating the low band said **97.1 BPM**; a
least-squares fit through the reference's own cut times said **97.26 BPM** with
a worst residual of 104ms, which looked convincing. A video cut to it did not
line up with the track at all.

**Measuring the actual transients explains why there is no grid to find:**

- **Nothing before 11.81s.** No strong onset in the whole first third of the
  track — that section has no beat. So a grid fitted through those cuts was
  fitting the editor's own even rhythm and calling it tempo.
- **After the drop it is a groove, not a grid.** Searching every period from
  0.2s to 1.05s at every phase, the best fit still leaves an RMS error of 48ms
  and a worst case of 110ms. Nothing lands on a clean multiple of anything.

**Attempt three** is the answer that got walked past twice: **the reference is
the ground truth.** Somebody cut that footage to that track and it works. So
every cut here is one of their measured cut times, used directly — `REF_CUTS` in
`videos.js` — and the rebuild lines up with the track exactly as well as the
reference does, which is the most that can be claimed and is what was wanted.

Checked on the rendered file, not the spec: **all 35 of the reference's cut
points are hit, worst offset 23ms, none missing**, and the whole thing is
35.527s — the reference's length to the millisecond.

| | |
|---|---|
| **0 – 11.17s** | The DaVinci, After Effects and CapCut marks in a row on black, under *what everyone else is using*. Nine shots of the same row on the reference's own cut times — wide, in on one, wide, in on the next — each with its own height, lean and lighting. |
| **11.17 – 11.81s** | The picture desaturates and **MOGGED** slams on, red on white, for the two thirds of a second before the bass arrives. No fade. |
| **11.81s** | **The drop** — the first strong low-frequency transient in the track. Hard cut to the OmniDx mark with a chromatic split. The reference changes subject half a second *after* its drop; this changes on it. |
| **11.81 – 31.47s** | 25 cuts of the app, every one on a time the reference cuts on. |
| **31.47 – 35.53s** | `omnidx.net` · `$19.99 once. no subscription. ever.` |

### Two files

`mog-02-rivals-silent.mp4` is the one to post. `mog-02-rivals-withsound.mp4` has
the reference's own audio muxed onto it — **that one is for checking the sync,
not for posting**: the track belongs to whoever made it. Since the rebuild is
now the reference's length with its cuts at the reference's times, picking that
sound on TikTok from the original video lines the whole thing up from the first
frame with nothing to drag.

Re-make the check copy any time:

```
FFMPEG=/path/to/ffmpeg $FFMPEG -y -i out/tiktok/mog-02-rivals-silent.mp4 -i reference.mp4 \
  -map 0:v -map 1:a -c:v copy -c:a aac -shortest out/tiktok/mog-02-rivals-withsound.mp4
```

**The logos are not in this repo.** They are three companies' trademarks. The
generator can use them — showing a competitor is ordinary comparison — but
redistributing their artwork is not ours to do, so they live in
`$PROMO_ASSETS/logos/` with the rest of the generated input, which git ignores.
Supply your own copies and run:

```
PROMO_ASSETS=$HOME/omnidx-promo FFMPEG=/path/to/ffmpeg node tools/promo/studio/logos.mjs \
  --davinci davinci.jpg --ae aftereffects.png --capcut capcut.png
```

`logos.mjs` cuts each one onto a real alpha channel, three different ways
because they are three different problems. A coloured mark on white gets the
white keyed out. A **round** mark on white gets masked to a circle instead —
DaVinci's three lobes have white specular highlights near their tips and a
colour key takes those too, leaving holes in the middle of the logo. A **black**
mark on white (CapCut's) would be invisible on black, so its own luminance
becomes the alpha and the mark is painted white, which is exact rather than
thresholded and keeps the anti-aliased edge.

`verify.mjs` fails if any of them is missing, because without them the first
twelve seconds renders three empty boxes and nothing else tells you.

**Caption**

> they charge monthly for this. omnidx.net is $19.99 once.

`#editing #capcut #davinciresolve #videoediting #editor`

**Post it** the same way as the other silent cuts — upload, **Add sound** →
**Trending**, and drag the sound so its drop lands on **11.755s**, where the
OmniDx mark arrives. Everything is cut to a 97.26 BPM grid from there, so a
sound near that tempo will hold all the way to the end; one far off it will
only line up at the drop.

**Checking it stayed on the beat.** Dissect the render and compare each cut to
the grid:

```
FFMPEG=... node tools/promo/studio/dissect.mjs out/tiktok/mog-02-rivals-silent.mp4 \
  --out /tmp/mine --threshold 0.05
```

`--threshold 0.05` matters here: most of the first twelve seconds is black, and
at the default 0.25 a cut that is obvious to look at changes too few pixels to
score. `dissect.mjs` now says so when it suspects this rather than reporting one
long shot and moving on.

**Worth knowing before you post it.** ByteDance owns both CapCut and TikTok, so
this is a video that puts MOGGED on CapCut's mark and then goes up on CapCut's
owner's platform. Naming and showing a competitor is ordinary comparative
advertising and nothing here claims anything false about any of them — but the
moderation risk is real and it is separate from the legal question. If you would
rather not take it, `mog-01-subscription` makes the same argument with the names
set as text and no artwork.

---

## The lyric edit — the mark until the drop

`out/tiktok/mog-03-lyric-silent.mp4` · 23.7s · silent · corner sticker throughout.

A third sent-in edit, rebuilt the way that worked on the second: the
reference's own cut times, nothing derived, and a check copy with its audio
muxed on so the sync can actually be heard.

**What the reference is.** 27.67s square: eight seconds of a figure walking
towards camera in a dark red room while the lyric writes itself across the
frame a word at a time, then ten seconds of fast cuts with eight white flash
frames and one letter-spaced word, then the editor's card, then TikTok's own
download outro — which is not part of the edit, so this ends where their card
does, at 23.667s.

**Measured:** the low band sits at 4–14 units to 8.22s and climbs to 73 by
8.60s; the first fast cut is at **8.5s**, and that is where the mark arrives.
Cuts from `dissect.mjs` at threshold 0.12, which on this picture separates the
flash cuts the default folds together. The flashes are the eight frames whose
mean luma is over 150; they are not on any pattern the cut list could express,
so they are their own list.

| | |
|---|---|
| **0 – 8.5s** | The mark on a dark red floor, breathing on the beat, two rings turning round it, embers drifting up. Three shots at the reference's three cuts. The lyric lands a word at a time — *ima make the world hate me* mid-frame, then the big **ima** and the red *supervillain*, then *ima make this whole thing crumble* and the red *Yeah / people like the villains* low in the frame, where theirs are. |
| **8.5s** | **The drop.** Hard cut to the mark arriving. |
| **8.5 – 18.57s** | 36 cuts of the app at the reference's times, graded red to sit under a red track, its eight white flashes at its eight flash frames, and **D A N G E R** across the picture at 14.03s for the 0.93s theirs is. |
| **18.57 – 23.67s** | `omnidx.net` · `$19.99 once. no subscription. ever.` — where their card is. |

**On the words.** They are the track's own lyric, placed where the reference
places them, and they are the sound's words rather than a claim about
anything. The one design word, DANGER, is kept as it is shown; swapping it for
`O M N I D X` is a one-word change in `videos.js` if that reads better.

**Caption**

> everyone else is renting. omnidx.net is $19.99 once.

`#editing #videoedit #editor #videoediting #omnidx`

**Post it** with that sound picked from the original video: the rebuild is the
reference's length with its cuts at the reference's times, so the sound lines
up from the first frame with nothing to drag. `mog-03-lyric-withsound.mp4` has
the reference's audio muxed on for checking only — the track is not ours.

---

## The proof piece — 4K, 120 frames a second, from nothing

`out/tiktok/show-01-genesis-silent-4k-120fps.mp4` · 14.5s · 2160×3840 · 120fps ·
silent. `show-01-genesis-4k-120fps-bed.mp4` is the same with the app's own
132 BPM phonk under it.

Nothing in it is a photograph, a screenshot or a clip. Seven thousand particles
on paths that are functions of time and a seed; a torus projected and rotated;
type slammed on the beat over backdrops that are noise, a hex grid, radial
streaks and scanlines; and at the end the particles fly to the silhouette of
the mark — the one thing read from disk, an SVG sampled once for its points.
Every frame is a pure function of its time, so any frame renders on its own
and the same frame always comes out the same.

**Why it is really 4K and really 120.** The composition is laid out at
1080×1920 and rendered with the browser told the device has two pixels per
logical pixel — the way a phone screen works — so text, vectors and the canvas
all come out at 2160×3840, not upscaled from 1080. `--fps 120` renders 1,740
frames for the fourteen seconds. Motion blur is not a filter: each particle is
drawn at three recent times along its own path, fading, which is what a
shutter would have seen.

```
node tools/promo/studio/render.mjs --fmt tiktok --silent --scale 2 --fps 120 --video show-01-genesis --out $PROMO_ASSETS/out
node tools/promo/studio/render.mjs --fmt tiktok --silent --scale 4 --fps 60  --video show-01-genesis --out $PROMO_ASSETS/out   # 8K
```

`--scale 4` is 4320×7680. It works the same way and takes about four times as
long a frame; a fourteen-second piece at 60fps is a coffee, at 120 is a lunch.

**What it is for.** Not to post as-is — a phonk logo reveal from an unknown
account is still an ad. It is the thing to send someone who asks "can you
actually make graphics," and it is the engine for the next kind of video: any
`gen` scene can take any words on the beat and any silhouette at the end.

---

## Four sets of three

Twenty-six videos in one register is one experiment run twenty-six times. The
short ones so far all open the same way — a claim, in big type, on a gradient,
with a logo in the corner — and if a feed has decided that shape is an advert,
it will keep deciding it. These twelve vary the one thing that decision is made
on: **what the first second looks like.**

Post them **as four A/B tests, not as twelve videos**. One set a week, three
videos, same slot, same days as the originals. Then read the analytics and keep
the shape that got distribution. If none of them beat the originals, the
problem is not the videos and `PROMOTION.md` §7b is the next place to look.

Every one of the twelve carries the omnidx.net sticker in the corner and
**exactly five hashtags**.

---

### Set 1 · `n` — the result, before any claim
`n1-tap-it-gone.mp4` · `n2-bad-audio.mp4` · `n3-its-a-phone.mp4`

No studio ground, no gradient, no end card — a near-black frame, the caption at
the top where a phone would put it, and the thing already happening in frame
one. **This is the set to watch.** If the branded ones are being filed as ads,
these are the three that will show it, because nothing else about them changed.

**n1 — a finger lands on a can and the can is gone** · 14 s
> nobody believes this one until they try it. tap the thing you don't want. it's gone, and it stays gone for the whole clip — it fills in the background behind it 🫡 free version, no account: omnidx.net
> #objectremoval #videoediting #videoeditor #editingapp #fyp

**n2 — a filthy waveform and the same three seconds after one pass** · 19 s
> recorded on a phone next to a fridge. one pass: mains hum gone, hiss down, clicks repaired, level evened out 🎚️ no second app, no DAW. omnidx.net
> #audiorepair #podcast #videoediting #videoeditor #fyp

**n3 — the whole editor, full screen, on a phone** · 13 s
> this is the entire editor running on a phone. no app store, no download, it's a link 📱 unlimited tracks, no watermark, free to start. omnidx.net
> #mobileediting #videoeditor #editingapp #capcutalternative #fyp

---

### Set 2 · `c` — a question, and the answer
`c1-is-it-free.mp4` · `c2-whats-the-catch.mp4` · `c3-why-so-cheap.mp4`

The shape that travels furthest from an account nobody has heard of, because it
does not look like an advert — it looks like somebody answering. The questions
are written the way people type: lower case, no punctuation. A tidy question
reads as invented.

**The moment you get a real comment, replace the question with it** — retype it
in `videos.js` and re-render, or just post the video as an actual video reply.
That is worth more than any of the three as written.

**c1 — "free" like free trial free or actually free** · 21 s
> asked in the comments so here's the answer: actually free. no account, no email, no card, no watermark, and it doesn't expire 🆓 omnidx.net
> #freeapp #capcutalternative #videoeditor #nosubscription #fyp

**c2 — ok so whats the catch** · 22 s
> the catch is that i'll tell you what it can't do before you pay rather than after. no stabilisation, no generative video, captions don't type themselves yet 🫡 the full list is on the site. omnidx.net
> #honestreview #buildinpublic #videoeditor #nosubscription #fyp

**c3 — why is it 20 quid once when everyone else is 20 a month** · 19 s
> because a bill is not a feature. five years of a subscription editor is $1,379 and you still own nothing. this is $19.99, once, and every update after it is free 🧾 omnidx.net
> #nosubscription #onetimepurchase #videoeditor #editingapp #fyp

---

### Set 3 · `h` — how to do one thing
`h1-cut-to-the-beat.mp4` · `h2-remove-a-thing.mp4` · `h3-title-that-moves.mp4`

Numbered steps, one job, finished inside twenty seconds. These are made to be
**saved and sent to somebody**, which is a stronger signal than a like and the
one that keeps a video alive for weeks rather than hours. Write the caption as
an instruction, not a boast.

**h1 — cut a whole edit to the beat** · 21 s
> how to cut a whole edit to the beat in about fifteen seconds. it reads the actual track — 58 beats found, not a guess — then every clip lands on one 🥁 free in every version. omnidx.net
> #beatsync #montage #videoeditor #editingapp #fyp

**h2 — remove something from a video** · 17 s
> how to take something out of a video without a mask, a pen tool or a green screen. tap it in the picture, press remove, it's gone for the whole clip 🪄 omnidx.net
> #objectremoval #vfx #videoeditor #editingapp #fyp

**h3 — a title that types itself** · 18 s
> how to make a title animate letter by letter. pick a style, pick how it arrives — typewriter, rise, blur in, bounce on the beat. 49 of them, all per character 🔤 omnidx.net
> #typography #kinetictypography #videoeditor #editingapp #fyp

---

### Set 4 · `e` — one edit style, for the room that already cares
`e1-phonk.mp4` · `e2-anime.mp4` · `e3-velocity.mp4`

"Video editing" is not a community. Phonk edits, AMVs and velocity edits are,
and each has its own tags, its own audio and its own people posting daily. A
video about what one of those rooms does all day gets watched by people who
need the tool; a video about "a video editor" gets watched by nobody.

Post each one **into its own room** — the tags below are the room, not a
keyword strategy — and put the matching video in the Discord servers and
subreddits for it rather than the general editing ones.

The step list in each video is the app's own planner output for that style,
word for word, so anybody who opens it gets the edit they were shown.

**e1 — phonk drift** · 25 s
> clips in, phonk edit out. build → drop → outro, kickback ramp, velocity ramp, VHS crush, camera shake, speed lines, whip pans — all on the beat of your own track 🏎️ omnidx.net
> #phonk #driftedit #videoeditor #montage #fyp

**e2 — anime opening** · 22 s
> AMV opening in one press. six sections, slow cold open, impact frames on the big hits, chromatic slams, speed lines on the drop — it finds the drop itself ⚔️ omnidx.net
> #amv #animeedit #videoeditor #montage #fyp

**e3 — velocity edit** · 23 s
> velocity edit with no keyframes. go → faster → land, ramps into every cut, zoom blur on the acceleration, whip pans on the joins, every ease done for you 💨 omnidx.net
> #velocityedit #speedramp #videoeditor #editingapp #fyp

---

## The narrated tours

Four long ones, 53–69 seconds each, with a male voice over them and **no music
at all**. They exist for the half of the audience the short videos do not
reach: people who are not looking for a hook, they are trying to decide whether
this is real. A tour holds them by talking through the app the way a person
would demo it, not by cutting on a beat.

**Post them as they are.** The voice is already in the file. Do not add
TikTok's text-to-speech on top of it, do not lay a track under it, and do not
trim the end card — the address is read out and shown at the same time, which
is when people actually type it in.

**What they have in common**
- A small **omnidx.net sticker in the top-left corner of every frame**, from
  the first frame to the last, so a screen-recorded repost still carries the
  address.
- **A cursor that actually uses the app.** Wherever a tour is on a panel, a
  mouse pointer moves to the control being talked about and clicks it, with the
  click ring you get on a screen recording. It is not decoration: the cursor's
  coordinates come out of `shots.json`, where the screenshot tool records the
  measured box of every control it photographed — so it lands on the real
  button, and it keeps landing on it after the app's layout moves.
- A sound-off caption at the bottom of every scene, because most of the first
  watch is muted.
- The end card with the logo, `omnidx.net`, the price and the hashtags.
- **Exactly five hashtags** in each caption, which is TikTok's limit for a
  caption that still reads as a sentence rather than a tag dump.

**About the voice.** It is a neural text-to-speech voice running on the machine
that renders the videos — no licence, no per-word cost, and the same script
always produces the same take, so a script fix is a re-render rather than a
re-record. It is a synthetic voice and this kit says so; what it is not is the
platform reader everyone recognises. If someone asks in the comments, the
honest answer is short: *"synthetic voice, the editor is real — open it and
see."* Swapping it for your own recording is one command: record over
`tools/promo/studio/voice.mjs`'s output and re-render.

**Where they go in the schedule.** Post one tour a week, on the day after a
short video did well, and pin the one that gets the most comments. `tour-04`
is the one to pin on a new account — it is the one that answers the
"this is a scam" reflex before anyone has to ask.

---

### T1 · What it actually is — `tour-01-what-it-is.mp4` · 68 s
The whole app, top to bottom. Hook → the editor, where the cursor picks up the
razor, splits a clip and selects another → the viewer with the transport and
the 9:16 preset on screen → the effects panel, searching and clicking a preset
→ colour, with the RGB parade lit up and a look applied → the audio chain
(repair, 148 filters, ducking, channel strip, loudness) → the export dialog,
where it ticks **Export for every platform** and presses Export → "Free to
start. No account." → end card.

**Caption**
> a full video editor that runs in your browser. unlimited tracks, every trim mode, 340 effects, colour wheels and scopes, a real audio chain, and one export that goes to every platform 🎬 free version has no watermark and no account. omnidx.net
> #videoediting #videoeditor #nosubscription #capcutalternative #fyp

**What the voice says**
> This is a full video editor that runs in your browser. You buy it once. Let me show you what is actually in it. Unlimited video and audio tracks. Trim, ripple, roll, slip and razor, the same tools a desktop editor gives you. It plays back at sixty frames a second with the effects on, so what you see while you cut is what you get when you export. Three hundred and forty effects are built in. No plugins to buy, no packs, and every one previews on your own clip before you commit. The colour page has three way wheels, curves, LUTs and real scopes. A waveform, a vectorscope and an RGB parade. The sound side is a proper chain. EQ, dynamics, ducking under a voice, and loudness set to whatever the platform wants. One edit goes out to TikTok, YouTube, Reels and Shorts at the same time, each one reframed to fit, with no watermark on any of them. The free version asks you for nothing. No account, no email, no card, no download. Open the link and start cutting. It is at omnidx dot net. Free to start, nineteen ninety nine once for everything.

---

### T2 · The AI, and the two tricks — `tour-02-the-ai.mp4` · 53 s
The three things people do not believe. Hook → a sentence being typed and the
plan being built from it, step by step → the real AI panel with that plan on
screen, and the cursor **clearing two of its steps**, which is the whole claim:
the plan is a list you edit, not something that happens to your timeline →
"runs on your device", typing a prompt and pressing Plan the edit → a tap on a
can and a wipe to the same frame without it → a dirty waveform and the same three seconds after one repair pass
→ "Not a demo. That is the app." → end card.

**Caption**
> i typed one sentence and it planned every cut, every ramp, every effect — then showed me the list before touching the timeline 🤖 it runs on your device, so nothing uploads. then: tap an object, it's gone. one pass on the audio, hum and hiss gone. omnidx.net
> #aivideoediting #videoeditor #objectremoval #nosubscription #fyp

**What the voice says**
> I typed one sentence into this editor and it built the whole thing. Here is exactly what it did. You describe the edit you want. It plans every cut, every speed ramp, every effect, and shows you the list before it touches your timeline. Every step lands on the timeline as something you can drag, change or undo. Nothing is applied that you cannot see. It runs on your device. Your footage is not uploaded anywhere, and it works with the wifi switched off. Then there is this. Tap the thing you want gone and it is gone, followed through the whole shot, with the background filled in behind it. And the sound. One pass takes out the mains hum, drops the hiss, repairs the clicks and evens out a level that wanders. None of that is a mock up. That is the app, on a phone or a laptop, from a link. omnidx dot net. Free to start, nineteen ninety nine once.

**Note on the wipe and the waveform.** Both are the app's own output, produced
by `tools/promo/studio/pairs.mjs`, which refuses to write a pair that would
mislead. If anyone asks, that is the answer — and the free version lets them
check the eraser without an account.

---

### T3 · Everything that is included — `tour-03-whats-included.mp4` · 69 s
The counting video. Hook → 340 effects landing one by one → 544 music tracks by
genre → the sound panel, where the cursor does the whole search in one take:
the search box, a genre, a mood, then **+ Add** on a track → text animators →
expressions → export presets → "$19.99. Once." → end card.

**Caption**
> everything included for one payment: 340 effects, 544 music tracks the app writes itself (so nothing gets claimed), 49 text styles with per-character animators, expressions, 4K 60 export with no watermark 🧾 $19.99 once, not a month. omnidx.net
> #videoeditor #contentcreator #onetimepurchase #editingapp #fyp

**What the voice says**
> Here is everything you get for one payment, with nothing else to buy afterwards. I will count it out. Three hundred and forty effects. Motion blur, RGB split, glow, speed lines, particles, light leaks, the lot. Five hundred and forty four music tracks, and the app writes every one of them on your device. Nothing to licence, and nothing that gets claimed or muted when you upload. Search them by style, mood or tempo. Rap, drill, R and B, afrobeats, house, lo-fi. Or bring your own song in from a file. Forty nine text styles with animators that run per character. Typewriter, rise, blur in, bounce on the beat. After Effects style expressions, one click each. Wiggle, loop, react to the music, settle with inertia. Export presets for every platform with the safe zones built in, up to four K at sixty, and no watermark on any tier including the free one. All of it for nineteen ninety nine, once. Not a month. Once. omnidx dot net. There is a free version and it never expires.

---

### T4 · Why there is no subscription — `tour-04-no-subscription.mp4` · 57 s
The trust one, and the one to pin. Hook → five years of a subscription against
one payment → what the free version has → "Every update free. No version 2." →
**what it cannot do**, in full → "Open it, turn your wifi off, keep editing" →
the editor again, cursor cutting a clip → end card pointing at
`omnidx.net/studio/trust`.

**Caption**
> no subscription. not a cheap one, not a hidden one. five years of a subscription editor is $1,379 and you still own nothing — this is $19.99 once, every update after it free 🫡 and the list of what it can't do is on the site before you pay. omnidx.net
> #nosubscription #onetimepurchase #videoeditor #honestreview #fyp

**What the voice says**
> There is no subscription. Not a cheap one, not a hidden one. I want to explain exactly how this is priced, because you should be suspicious. Five years of a subscription editor is about thirteen hundred dollars, and at the end of it you own nothing. This is nineteen ninety nine, once. The free version is not a trial. Unlimited tracks, seventy eight effects, titles, ten eighty p export, and no watermark. It does not expire. Every update after you buy it is free, forever. There is no version two and no upgrade fee. That is a promise about what I will never charge you for. And here is what it cannot do, because a feature list is an advert. No stabilisation. No generative video. Captions do not type the words for you yet. You do not have to believe any of this. Open it, turn your wifi off, and keep editing. Then decide. The full list is on the site at omnidx dot net, before you pay rather than after.

---

## The videos

Each entry: what the viewer sees, the caption to paste (hashtags included),
and the voice-over script. Captions are written for TikTok; for Instagram
drop `#fyp` and add `#reels`; for Shorts keep the first sentence and three
hashtags.

### 01 · Stop paying monthly — `01-no-subscription.mp4`
Hook → the two ways to pay (a subscription's bill counting up vs $19.99 once) → the editor → end card.

**Caption**
> there's no subscription. at all. one payment, yours forever, every update after it free 🫡 free version at omnidx.net (link in bio)
> #videoediting #videoeditor #editingapp #nosubscription #onetimepurchase #capcut #contentcreator #fyp

**Voice-over**
> Stop paying twenty-three dollars a month to edit videos. OmniDx Studio is a full editor in your browser, and you pay once. Nineteen ninety-nine, yours forever, and every update after it is free. Link's in my bio: omnidx dot net.

### 02 · One sentence, whole edit — `02-ai-sentence.mp4`
Hook → the AI editor typing a prompt and planning the edit, step by step → the real AI panel → end card.

**Caption**
> i typed one sentence. it planned every cut, the effects, the look — and i just hit "do it" 🤯 runs on your device, nothing uploads. omnidx.net
> #aiediting #aivideo #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> I typed one sentence and it planned the whole edit. Cut on the beat, speed lines on the drops, a VHS look. It runs on your device, nothing uploads, and you approve every step. OmniDx Studio. One payment. Link in bio.

### 03 · Every cut on the beat — `03-cut-on-the-beat.mp4`
Hook → a timeline being cut on the beat, live → the audio panel with the beats detected → end card.

**Caption**
> drop your clips in. it listens to the track and cuts on the real beats. not a guess 🥁 free to start at omnidx.net
> #beatsync #montage #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Every cut on the beat, automatically. Drop your clips in, OmniDx listens to the track and cuts on the real beats, not a guess. Sync to the music, done. Nineteen ninety-nine once. omnidx dot net.

### 04 · 340 effects — `04-340-effects.mp4`
Hook → the number climbing to 340 with effect chips landing on the beat → the effects panel, presets previewing on the clip → end card.

**Caption**
> 340 effects built in. no plugins, no packs, no "pro effects bundle" for $49 🙃 every preset previews on your actual clip. omnidx.net
> #vfx #aftereffects #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Three hundred and forty effects, built in. No plugins, no packs to buy. Motion blur, RGB split, speed lines, particles, and every preset previews live on your clip. OmniDx Studio, one payment. Link in bio.

### 05 · Private and offline — `05-private-offline.mp4`
Hook → "No upload. No cloud. No account to start." → the editor → end card. Slower, cinematic beat.

**Caption**
> your footage never leaves your device. no upload, no cloud, no account to start. works on a plane ✈️ free version at omnidx.net
> #privacy #offline #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Your footage never leaves your device. No upload, no cloud, no account to start. OmniDx Studio edits offline, on a plane, anywhere. Free to start, nineteen ninety-nine once for everything. omnidx dot net.

### 06 · Expressions — `06-expressions.mp4`
Hook → twelve expressions as chips (wiggle, loop, beat, audio…) → the inspector with Transform highlighted → "Motion design. Without the rent." → end card.

**Caption**
> after effects expressions. in a browser. wiggle, loop, react to the beat — one click on any property 〰️ omnidx.net
> #motiondesign #aftereffects #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> After Effects expressions, in a browser. Wiggle, loop, react to the beat, one click on any property. Motion design without the rent. OmniDx Studio, nineteen ninety-nine, once. Link in bio.

### 07 · Text animators — `07-text-animators.mp4`
Hook → animator names landing on the beat → the text panel, 49 styles highlighted → "Titles that move." → end card.

**Caption**
> text that animates letter by letter. typewriter, rise, blur in, beat bounce — 49 styles, per character 🔤 omnidx.net
> #typography #kinetictypography #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Text that animates letter by letter. Typewriter, rise, blur in, beat bounce, forty-nine styles, all per character. Tap one and it's on your timeline. OmniDx Studio. One payment. omnidx dot net.

### 08 · Particles — `08-particles.mp4`
"SNOW. RAIN. SPARKS. EMBERS. CONFETTI." one per beat → the ten particle systems → the overlays panel → end card.

**Caption**
> snow. rain. sparks. embers. confetti. real particle systems, not stickers 🌨️ plus 68 light overlays. omnidx.net
> #particles #vfx #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Snow, rain, sparks, embers, confetti. Real particle systems, not stickers. Plus sixty-eight light overlays, leaks and flares, on top of anything. OmniDx Studio, nineteen ninety-nine once. Link in bio.

### 09 · Shape layers — `09-shape-layers.mp4`
Hook → twelve shape presets → the shapes panel → "Trim. Repeat. Wiggle." → end card.

**Caption**
> shape layers with trim paths and repeaters. draw it once, repeat it 40 times ◇ vector shapes, in the browser. omnidx.net
> #motiongraphics #shapes #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Shape layers with trim paths and repeaters. Draw it once, repeat it forty times. Progress bars, line reveals, neon rings, saber lines, vector shapes in the browser. OmniDx Studio. Pay once. omnidx dot net.

### 10 · One edit, every platform — `10-export-everywhere.mp4`
Hook → the eight export presets → the export dialog, "Export for every platform" ticked → "Reframed to fit. Subject-aware." → end card.

**Caption**
> one edit → tiktok, youtube, reels, shorts, square, 4:5. tick one box, get four files, each reframed to fit 📤 no watermark on any tier. omnidx.net
> #youtubeshorts #reels #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> One edit, every platform. TikTok, YouTube, Reels, Shorts, square, four by five. Tick one box and you get four files, reframed to fit. Safe zones included. OmniDx Studio, one payment. Link in bio.

### 11 · Every device — `11-every-device.mp4`
"PHONE. TABLET. LAPTOP. ONE LICENCE." → the editor on a phone → the editor on a desktop → "Buy once. Sign in anywhere." → end card.

**Caption**
> phone, tablet, laptop. one licence. same editor, same project, sign in anywhere 📱💻 omnidx.net
> #mobileediting #editingapp #videoediting #videoeditor #nosubscription #contentcreator #fyp

**Voice-over**
> Phone, tablet, laptop. One licence. It's the same editor on your phone and on your desk, same project. Buy once, sign in anywhere. OmniDx Studio, nineteen ninety-nine, once. omnidx dot net.

### 21 · Everything it can't do — `21-cant-do.mp4`
Hook → "A features list is an advert. This one is not." → the seven honest limits → the editor → "Free version. Find out yourself." → end card pointing at the trust page.

This is the one to expect the most from. A feature list is an advert and readers
discount it; a list of what a product cannot do is the only claim an unknown
seller makes against their own interest, so it gets believed — and it earns the
other nineteen videos a hearing. Post it as the day-20 piece alongside the trust
page itself. Every line in it matches `omnidx.net/studio/trust/#cant` word for
word; if you change one, change both.

**Caption**
> everything my video editor CAN'T do. no stabilisation, no generative fill, captions don't type themselves yet, and it won't beat a $6,000 workstation at 8K 🫡 the full list is on the site, before you pay. omnidx.net
> #honestreview #buildinpublic #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Everything my video editor can't do. It can't generate video that isn't there. It can't type your captions for you, yet. It can't stabilise a shaky shot, draw a mask with a pen, or beat a six thousand dollar workstation at 8K. That's the honest list, it's on the site before you pay, and everything else works. Free version at omnidx dot net.

### 22 · Tap it, it's gone — `22-instant-wow.mp4`
Hook → a tap on a can, and a wipe to the same frame with the can removed → the eraser open in the app → "Now the sound." → a dirty waveform and the same three seconds after one repair pass → the audio panel → end card. Trap beat, 22.7 s.

Both demonstrations are the app's own output, which matters if anyone asks.
The wipe is one frame of the table clip and that frame after `erase.js` filled
the can out of it, using a background plate from later in the same shot. The
waveform scene is drawn from `audio-repair.json`, written by running the app's
`audio-repair.js` over a recording with hiss, 60Hz hum, four clicks and a level
that wanders; the "−18 dB" on screen is the measured drop in the noise floor on
that clip, not a round number someone liked. Both are re-made by
`tools/promo/studio/pairs.mjs`, which refuses to write a pair that would
mislead — it fails if any of the can survives, or if the repair does not
actually find the hum and drop the floor.

**On not calling it "AI Cleanup Audio".** The repair pass is spectral
subtraction, notch filters at the mains frequency, de-clicking against a
running median, and RMS levelling — real signal processing, and none of it a
neural model. Naming it after a fashion instead of after what it does is the
exact move `PROMOTION.md` §3 warns gets an unknown app called a scam, and the
first person to ask "which model?" gets an answer that undercuts everything
else in the video. "Hum, hiss, clicks, level — gone in one pass" is both true
and the better line. The AI in this app plans edits from a sentence; that is
video 02, and it is called AI there because it is.

**Caption**
> tap the thing you don't want. it's gone, and it stays gone for the whole clip 🫡 then one pass on the audio: hum, hiss, clicks, wandering level, fixed. no subscription, $19.99 once. omnidx.net
> #objectremoval #audiorepair #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Two buttons that look like a cheat code. Tap the thing you want gone, and it's gone — and it follows it through the whole shot, filling in the background behind it. Then the sound. One pass takes out the hum, drops the hiss eighteen decibels, repairs the clicks and evens the level. Both in Creator. Free to start, nineteen ninety-nine once. omnidx dot net.

**If somebody says it's fake**
> Fair. Open the free version, drop a clip in, press the eraser and tap something. It won't ask you for an account. Object removal and audio repair are the paid ones, but you can see the whole editor work before you spend anything: omnidx.net

### 12 · Auto captions — `12-auto-captions.mp4` — **HOLD, do not post yet**

> This video says the captions button "finds the speech … times it to the word".
> Today it finds the *timings* and you type the words; turning audio into text
> needs the transcription server, which is not switched on. Posting this is the
> fastest available route to a "it doesn't do what the ad said" comment. Hold
> it, and when the server goes live re-render it (`--video 12-auto-captions`)
> and post it as a new feature — a shipped promise is a better post than the
> original would have been. See `docs/PROMOTION.md` §1.
Hook → the captions panel, one click → "Sound off? Still watched." → end card.

**Caption**
> auto captions that actually look good. one click: finds the speech, styles it for tiktok, times it to the word 💬 omnidx.net
> #captions #accessibility #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Auto captions that actually look good. One click, it finds the speech, styles it for TikTok, times it to the word. Sound off? Still watched. OmniDx Studio. One payment. Link in bio.

### 13 · Motion tracking — `13-motion-tracking.mp4`
Hook → the viewer zooming on a tracked subject → what follows the track (titles, stickers, flares, a blur on a face…) → "Pin it. Forget it." → end card.

**Caption**
> track anything, stick text to it. motion tracking built in, no plugin 🎯 titles, stickers, flares, a blur on a face — they all follow. omnidx.net
> #motiontracking #vfx #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Track anything and stick text to it. Motion tracking is built in, no plugin. Titles, stickers, flares, a blur on a face, they all follow. Pin it and forget it. OmniDx Studio, nineteen ninety-nine once.

### 14 · Colour — `14-colour.mp4`
"REAL COLOUR TOOLS." → a before/after wipe → the colour page with the RGB parade highlighted → end card. Cinematic beat.

**Caption**
> real colour tools. three-way wheels, curves, LUTs — and real scopes: waveform, vectorscope, parade 🎨 omnidx.net
> #colorgrading #cinematic #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Real colour tools. Three-way wheels, curves, LUTs, and real scopes: waveform, vectorscope, RGB parade, like the big apps. OmniDx Studio, one payment, free to start. omnidx dot net.

### 15 · Audio repair — `15-audio-repair.mp4`
"BAD AUDIO? FIXED. ONE CLICK." → the repair list → the audio panel → end card. Lo-fi beat.

**Caption**
> bad audio? fixed in one click. noise, hum, clicks — gone. level matching, ducking, loudness to spec 🎚️ omnidx.net
> #audioediting #podcast #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Bad audio? Fixed in one click. Noise, hum, clicks, gone. Level matching, ducking under voice, loudness to spec, a studio chain in the browser. OmniDx Studio. Pay once. Link in bio.

### 16 · Speed ramps — `16-speed-ramps.mp4`
Hook → the timeline with a ramp on the first clip → the time tools → "Smooth by default." → end card.

**Caption**
> speed ramps without the headache. drag the curve, every keyframe eased. time remap, freeze frames, velocity edits ⚡ omnidx.net
> #speedramp #velocityedit #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Speed ramps without the headache. Drag the curve, every keyframe eased. Time remap, freeze frames, reverse, velocity edits. Smooth by default. OmniDx Studio, nineteen ninety-nine once. omnidx dot net.

### 17 · Montage styles — `17-montage-styles.mp4`
Hook → 21 kinds of montage → the styles panel with the beat detected → "A finished edit. Not a filter." → end card.

**Caption**
> 21 montage styles. clips in, edit out. anime opening, phonk, velocity, cinematic — it builds the whole edit to your music 🎬 omnidx.net
> #montage #amv #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Twenty-one montage styles. Clips in, edit out. Anime opening, phonk, velocity, cinematic, trailer. It builds the whole edit to your music: cuts, ramps, slams, title. A finished edit, not a filter. OmniDx Studio. Link in bio.

### 18 · Free forever — `18-free-forever.mp4`
"FREE. FOREVER. NO WATERMARK." → what the free version has → the editor → "Upgrade once. If you ever want to." → end card.

**Caption**
> free. forever. no watermark. unlimited tracks, 78 effects, titles, 1080p export, works offline. not a trial — the free one 🆓 omnidx.net
> #freeapp #capcutalternative #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> Free. Forever. No watermark. Unlimited tracks, seventy-eight effects, titles, ten-eighty-p export, works offline. Not a trial, the free one. Upgrade once if you ever want to. omnidx dot net.

### 19 · Every update free — `19-daily-updates.mp4`
"YOU PAY ONCE. YOU GET EVERYTHING THAT COMES AFTER." → what was added since launch → the editor → "No version 2. No upgrade fee." → end card.

**Caption**
> you pay once and every update after is free. motion blur, particles, expressions, text animators, shape layers — all added since launch, all free 🛠️ omnidx.net
> #indieapp #buildinpublic #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> You pay once, and every update after that is free. Motion blur, particles, expressions, text animators, shape layers, all added since launch, all free. No version two, no upgrade fee. OmniDx Studio. Link in bio.

### 20 · What $19.99 gets you — `20-vs-subscriptions.mp4`
Hook → five years of a subscription ($1,379.40) vs $19.99 → the effects panel → "Own your editor." → end card.

**Caption**
> five years of a subscription editor: $1,379. and you still own nothing. here: $19.99, once, 340 effects included 🧾 omnidx.net
> #subscriptionfatigue #onetimepurchase #videoediting #videoeditor #editingapp #nosubscription #contentcreator #fyp

**Voice-over**
> What nineteen ninety-nine gets you here versus there. Five years of a subscription editor: one thousand three hundred and seventy-nine dollars, and you still own nothing. Here: nineteen ninety-nine, once, three hundred and forty effects included. Own your editor. omnidx dot net.

---

## Instagram

**Reels**: the twenty MP4s as they are. Same captions, swap `#fyp` for
`#reels #reelsinstagram`. Add the voice-over in CapCut or Instagram's own
text-to-speech (Text → the speaker icon).

**Feed posts** (1080x1350, `out/stills/`):

| File | Caption |
|---|---|
| feed-01-stop-paying | stop paying $23 a month to edit videos. OmniDx Studio: free to start, $19.99 once. that's it. link in bio. |
| feed-02-price | the whole pricing page in one picture. no monthly plan exists. |
| feed-03-effects | 340 effects, built in. no plugins, no packs. every preset previews on your own clip. |
| feed-04-editor | this is the free version. no watermark, unlimited tracks, 1080p. omnidx.net |
| feed-05-yours-forever | one payment. every update. every device. yours forever. |
| feed-06-end-card | omnidx.net — free to start, $19.99 once for everything in Creator. |

Feed hashtags (add to each): `#videoediting #videoeditor #editingapp #nosubscription #onetimepurchase #contentcreator #smallbusiness #creatortools`

**Stories**: post each day's Reel to your story with the link sticker set to
omnidx.net. A story with a link is the only place on Instagram a link is
clickable without a bio tap.

## YouTube

**Video**: `out/yt/yt-showcase.mp4` (83 s). Thumbnail: `out/stills/yt-thumb.png`.

**Title** (pick one; the first is the safest):
- OmniDx Studio: a video editor you buy once ($19.99, no subscription)
- I built a video editor with no subscription. Here's everything in it.
- 340 effects, AI editing, every platform — for $19.99, once

**Description**
```
OmniDx Studio is a full video editor you pay for once. Free to start, $19.99 once for everything in Creator, $39.99 for Studio. No subscription, no watermark, and your footage never leaves your device.

Try the free version: https://omnidx.net

0:00 A video editor you buy once
0:06 The editor
0:10 The AI editor: say what you want, it plans the edit
0:20 Every cut on the beat
0:25 340 effects, live on the clip
0:34 Text animators, per character
0:40 Shape layers and expressions
0:46 Particles and overlays
0:50 Colour wheels, curves and real scopes
0:55 Audio repair
0:58 One edit, every platform
1:06 On your phone, one licence
1:09 The price

What is in Creator ($19.99 once): all 340 effects, keyframes with bezier easing, speed ramps, motion tracking, expressions, shape layers, text animators, particles, the AI editor (200 plans a month), auto-captions, beat-synced cutting, silence removal, colour wheels and scopes, audio repair, H.265 and 4K/60 export.
What is in Studio ($39.99 once): everything above, unlimited AI, unlimited LUT slots, ProRes and DNxHR on desktop.
Free (Starter): unlimited tracks, 78 effects, titles, stickers, 1080p export, no watermark, works offline.

Every update is free, forever — no version 2 and no upgrade fee. One licence works on every device you own.
```

**Tags**: `video editor, video editing software, no subscription, one time purchase, capcut alternative, premiere pro alternative, after effects alternative, browser video editor, free video editor, ai video editor, motion graphics, omnidx`

**Shorts**: the twenty TikTok MP4s upload straight to Shorts. Title each one
with the video's first line ("Stop paying $23 a month to edit videos") and
put `omnidx.net` in the first line of the description.

**Pinned comment**: the same one as TikTok.

## Everywhere else

**X / Twitter** — a thread, one post per day for the first week, each with the
day's video attached:
1. `I got tired of paying rent on my video editor. So I built one you buy once. OmniDx Studio: free to start, $19.99 once, 340 effects, AI editing, runs in the browser and never uploads your footage. omnidx.net`
2. `Every cut on the beat, automatically. It listens to the track. (video)`
3. `340 effects built in. No plugins. No packs. (video)`
4. `Type one sentence, it plans the edit, you approve. Runs on your device. (video)`
5. `One edit → TikTok, YouTube, Reels, Shorts, reframed to fit. (video)`
6. `Free forever. No watermark. Not a trial. (video)`
7. `Every update is free, forever. No version 2, no upgrade fee. (video)`

**Reddit** — value first, link second, and read each subreddit's self-promo
rule before posting. Post the YouTube tour or a 20-second clip as a native
video, not a link.
- r/VideoEditing, r/editors: "I built a browser video editor with no subscription — 340 effects, AI planning, expressions, scopes. Free tier has no watermark. Would love feedback from people who edit for a living." Then answer every question honestly, including what it does not do yet.
- r/SideProject, r/webdev, r/InternetIsBeautiful: the technical angle — it runs entirely in the browser, footage never uploads, works offline, one codebase for phone and desktop.
- r/CapCut, r/premiere, r/AfterEffects: only in threads where someone asks for an alternative; never a cold post.

**Hacker News** — `Show HN: OmniDx Studio – a browser video editor you buy once (no subscription)`. First comment: what it is, what is hard about it (playback in the browser, effects at 60 fps, everything on-device), and what it does not do yet. HN rewards candour.

**Product Hunt** — tagline: `The video editor you buy once.` First comment: the story in five lines, the free tier, the price, and that updates are daily and free. Launch on a Tuesday–Thursday; have the YouTube tour and the six feed images ready as the gallery.

**Discord / communities** — editing servers, phonk and AMV communities, creator servers: share the beat-sync video (03) or the montage video (17), the ones that show something those groups care about, and offer the free version. Never the price first.

**Email** (if you have a list): subject `A video editor you buy once` — three lines, the YouTube tour embedded, the link.

## Where the numbers come from

Every claim in the videos is on the pricing page's comparison table:
340 effects, 21 montage kinds, 49 text styles, 290 effect presets, 68 light
overlays, 17 creative audio filters, 78 effects and 8 transitions in Starter,
200 AI plans a month in Creator. The subscription figure ($22.99/month) is a
typical monthly plan for a mainstream editor; $827.64 is three years of it,
$1,379.40 is five. If a number changes in the app, change it in `videos.js`
and re-render before posting.
