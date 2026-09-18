# What this editor has, what it hasn't, and which gaps are worth closing

Written because "add every feature the other apps have" is not a thing anybody
can do, and pretending otherwise produces a list of ticks nobody checked. This
is the honest version: what was found in the code, what is genuinely missing
against CapCut, Premiere Pro, DaVinci Resolve and Final Cut, and which of those
gaps would change anything for a person deciding whether to use this.

**The short answer: the feature list is not the problem.** This editor already
does things CapCut cannot, and several things Premiere charges a subscription
for. A person who has not heard of it does not decline to buy it because it is
missing optical-flow retiming. Read `PROMOTION.md` §7b before building from
this list.

---

## Already here, and checked

Not claims — each of these was found in the code while writing this file.

| | |
|---|---|
| **Timeline** | Unlimited video/audio tracks, ripple, roll, slip, slide, razor, snapping, markers, groups, adjustment layers, compound clips, scene detect, multicam with audio sync |
| **Transport** | JKL shuttle with acceleration, frame step, Home/End, freeze frame, match frame |
| **Keyboard** | 44 commands, **all of them rebindable**, plus a Ctrl+K command palette |
| **Colour** | Three-way wheels, curves, LUTs, HSL qualifier, power windows, masks, waveform, vectorscope, RGB parade |
| **Motion** | Keyframes with bezier easing, speed ramps, time remap, motion tracking, expressions, parenting, null objects, shape layers with trim paths and repeaters, per-character text animators, particles, motion blur |
| **Audio** | EQ, compressor, pan, ducking, loudness to platform spec, 148 creative filters, beat detection, silence removal, repair (hum, hiss, clicks, level) |
| **Media** | Proxies, VFR handling, project bundles with footage, autosave and crash recovery |
| **Export** | 16 presets, H.264, H.265, ProRes/DNxHR on desktop, 4K60, every-platform export with subject-aware reframing, no watermark on any tier |
| **AI** | Plans a whole edit from a sentence, 21 montage builders, on-device, every step a checkbox you can clear |
| **Not in CapCut at all** | Scopes, ProRes, expressions, power windows, multicam, audio repair, offline operation, no account required |

## Genuinely missing, in the order I would build them

### 1. Speech to text — **the biggest one**
Captions find the speech *timings* and you type the words. Every competitor
turns audio into text. This is also the gate on **edit-by-transcript**, which is
the headline feature of Premiere and Descript.

Why it is not done: it needs either a server running Whisper (a real monthly
bill) or a ~40 MB model downloaded into the browser. The second is doable —
`whisper-tiny` via transformers.js runs in WASM — and is the right answer here
because it keeps the "nothing leaves your device" promise, which is a load-
bearing claim on the trust page.

**Until it ships, `PROMOTION.md` forbids claiming it.** That rule stays.

### 2. Stabilisation
On the trust page's can't-do list, so at least it is honest. Doable in-browser:
estimate per-frame motion from the tracker that already exists, smooth the path,
crop and counter-move. The existing motion tracker does most of the maths.

### 3. Track mattes (luma and alpha)
`grep` found nothing. A staple of Premiere/AE/Resolve — "use this layer's
brightness as this layer's transparency". Masks and power windows exist, which
covers some of it, but not text-shaped reveals or a matte driven by another clip.

### 4. Render cache / preview render
No RAM preview. On a heavy stack the app re-renders every frame every time.
Playback is already smooth (measured, see the playback verifier), so this is
comfort rather than rescue — but it is what people mean by "it can handle a
real project".

### 5. Batch export / render queue
One export at a time. Anybody delivering more than one video a day wants a
queue. Small to build, disproportionately loved.

### 6. Colour match between shots
"Make this shot look like that shot" — one button in Resolve and Premiere.
The scopes and the grading engine are already there.

### 7. Optical-flow retiming
Slow motion currently blends frames. Optical flow generates in-between ones.
Genuinely hard, genuinely GPU-hungry, and the thing people notice on a 4× slow.

### 8. Roto brush / AI masking over time
Object removal tracks a region already. A paint-a-mask-and-it-follows tool is
the next step up and is what After Effects charges for.

## Deliberately not doing

- **A stock footage/music marketplace.** The library the app writes itself is
  better for the job: nothing to licence, nothing that gets claimed on upload.
- **Cloud project sync.** Marked "building" on the pricing page and honestly
  described on the trust page. It needs a server and a bill.
- **Collaboration / shared timelines.** Same reason, at ten times the cost.
- **A mobile app-store app.** It installs from the browser and works offline;
  an App Store binary adds a review queue and a 30% cut for nothing the user
  gets.

## The rule this file exists to protect

Every row on the pricing page's comparison table must be something in the build
you can open right now, or marked **Building**. Two claims have already had to
be walked back after being found here — "custom keyboard maps" (now built) and
"project sync across devices" (now marked Building). A feature list nobody
checks is how an unknown app gets called a scam, and it is the one thing this
project cannot afford.
