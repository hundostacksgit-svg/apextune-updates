# What is done, what is not, and what to do before you tell anyone

Written to be honest rather than encouraging. Everything in the "done" list has
been verified in a real browser, not just written; everything in the "not done"
list says plainly why.

---

## Do these three things first

Nothing else on this page matters until these are done.

### 1. Put the redirect on your Square links — 5 minutes

**This is the one that costs you money if you skip it.** Without it, somebody
pays and lands on Square's receipt with no way back to the app.

Payment links → edit each one → **"Redirect to a URL after payment"**:

| Link | Paste this |
| --- | --- |
| Creator $19.99 | `https://omnidx.net/studio/activate/?e=creator` |
| Studio $39.99 | `https://omnidx.net/studio/activate/?e=studio` |
| Team $69.99 | `https://omnidx.net/studio/activate/?e=team` |

Then buy your own Creator licence with your own card and check you land
unlocked. Refund yourself afterwards — the fee comes back on a full refund.
It is the only way to know the whole chain works.

### 2. Turn the AI on — 15 minutes

Right now the AI runs on the on-device reader. It follows direct instructions
("mute clip 2", "slow the last clip to half speed") and named styles, and
nothing else. Anything free-form falls back to a generic template, which is
exactly what makes it feel like it can only follow premade lines.

The full language model is already written and waiting. It needs a server:

```bash
cd server && ./deploy.sh
```

One command. It makes the database, writes its id into the config, creates the
tables, deploys, and prints the URL. You will need:

- A Cloudflare account (free tier is enough to start)
- An Anthropic API key, for the AI itself

Then put the URL it prints into `DEFAULT_API_BASE` in
`studio/assets/config.js`, commit, push. The AI panel switches from "on-device
reader" to full understanding the moment that lands.

**From then on it deploys itself.** Add three repository secrets on GitHub —
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_ID` (the
server README says where each comes from) — and every push that touches
`server/` redeploys the Worker with any new tables created first. Every six
hours it checks the Worker answers and redeploys if it does not. The app
itself already rides out an outage: the planner falls back to the on-device
reader and says so, licences are checked from the device's own record, and
ratings wait and go out later.

**Until you do this, do not advertise free-form AI editing.** It will not do
what the words on the pricing page promise.

### 3. Build the desktop installers — 30 minutes, mostly waiting

`studio/download/files/` is empty, so the macOS, Windows and Linux buttons
offer the installed web app instead of a native installer. The web app *is*
the app — its own window and icon, offline, opens files, shares in from a
phone — so nothing is broken; the native build adds ProRes and hardware
decode. To publish it: open the repository's **Actions** tab, run **Desktop
installers**, download the three artifacts, put every file in
`studio/download/files/`, name them in `DOWNLOADS` in
`studio/assets/config.js`, push. The full walk-through, signing and the
100 MB note are in `docs/STUDIO-BUILD.md`. Installed copies then update
themselves weekly from that folder.

---

## Done and verified

Every one of the 85 verification suites — app, site, engine, Worker route —
was run end to end in Chromium after the last change below: 85 ran, 81
passed on the first run and the other four pass on their own. Three are
timing checks that slip under the load of a second browser on this
container (the HSL qualifier's 40 ms budget measures 39–43 ms here; the
reference-video analysis counted one spurious cut once; a megaphone
filter's band edges measured off once) and pass every time alone; the
fourth was the text-animator suite counting pixels on a preview that is
now drawn at the size it is shown, and it now asks for the project's own
size first. No budget was loosened to make a number go green.


Each of these was tested in a real browser against a real measurement, not
eyeballed.

**The editor**
- Multitrack timeline with ripple, roll, slip, snapping and markers
- Drag a clip down to an audio track for sound only; drag above the top for a
  new overlay layer, as many as you like
- Undo that names what it will take back, plus a full history you can jump
  into at any point
- 340 effects, 107 transitions, 118 looks, 194 typefaces, 176 styles
- **Keyframes you can see.** Unfold a clip and it becomes its properties —
  position, scale, rotation, opacity, volume, the grade, every parameter of
  every effect on it. Each has a stopwatch and a lane of draggable diamonds at
  the same scale as the clip, and a graph editor behind them for the shape of
  a move. This is the thing that separates a finishing tool from a phone
  editor, and it is the one that was missing
- **A tracker measured against a known answer.** A textured subject on a
  path we drew — slow, then a fast sweep, turning fifteen degrees, growing a
  quarter, and passing behind a bar for half a second. Mean error 0.65px at
  640 wide, worst 1.5px; it predicts along the last motion, reads rotation
  against the original appearance, scales cumulatively, and when the subject
  vanishes it coasts, looks for the original in a wide ring, and fills the
  hidden stretch with a straight line marked as guessed. Two real bugs found
  by the measurement: a flat candidate patch scored thousands (dividing by
  a variance of nearly nothing), and one bad jump poisoned the velocity the
  box then coasted on for ever — two thousand pixels off the frame
- **Sixteen speed ramps** drawn as curves in the Inspector, written in
  fractions of the clip so they refit after a trim, and shortened to what the
  file can cover rather than running off its end
- **21 full montages, and a sentence that builds one.** A montage is the
  cut, not a look: sections with their own pace, transition and ramp, the
  drop with its slams and punch-ins, the title, the music fitted. One press
  in the AI panel or the Styles panel, or a sentence like "make me an anime
  edit, 30 seconds, starts slow and goes crazy, title that says JJK". Every
  cut and every section edge on the beat grid, never a gap between shots,
  ramps that ease rather than shrink so the grid holds. No music in the pool:
  it renders a beat in the montage's style — trap, phonk, drill, house, hype,
  cinematic, lo-fi, drum and bass — as a real WAV in the pool with an exact
  grid. The reader was run on 33,280 generated descriptions and 832
  single-clip instructions: 100% right, none thrown, 0.02 ms each
- **The sign-in dead end is gone.** Signing in on a device with no account
  offers, right there, to create it with the same details in one press or to
  bring the account over with a **move code**: the account record and the
  purchase, sealed with the password (AES-GCM, PBKDF2 with a fresh salt),
  made on one device's Account page and pasted on the other's. Verified with
  two fresh browser profiles: the code refuses the wrong password, arrives
  signed in with the Creator purchase intact, and the moved account signs in
  normally afterwards. The message no longer strands anyone
- **A start screen that is a project manager.** Five shapes including
  cinemascope, sizes per shape from light to 4K or a custom one that keeps
  the shape, five frame rates, the colour behind the picture, six ways to
  begin (blank, montage from clips, copy an edit, photo dump, multicam,
  talking head), the first clip's picture on every row, search (press /)
  and sort (recent, name, longest, most footage), rename in place,
  duplicate (shares footage, does not double it), delete with a question
  and a twelve-second undo, a door for a project file or bundle from
  another device, and how much of the device is used
- **Setups that read themselves off the footage.** Seven quick-setup chips
  (TikTok / Reels, YouTube 4K, YouTube 1080p60, Cinema 24, Instagram feed,
  Square ad, Broadcast PAL) fill shape, size and rate in one press and light
  when the form matches them; a summary line says exactly what will be
  made; **Match a clip** — or footage dropped anywhere on the screen —
  reads the clip's size and its measured frame rate and sets the nearest
  shape, size and rate, saying what it read and what it chose; dropped
  footage comes in with the project (onto the timeline for a blank start or
  a talking head, into the bin for the builders); the last setup used is
  the one offered next time. **Pack** on a row writes the edit and every
  clip it uses as one .omnidxpkg, and opening a bundle stores its footage
  by hash before the edit loads, so every clip is found rather than
  duplicated
- **Export for every platform.** One press renders vertical, landscape,
  square and portrait from the same edit, each from a reframed copy that
  keeps the frame covered and centres on a tracked subject where there is
  one, named by shape. Checked on the numbers: an untracked shot keeps the
  centre, a tracked shot slides its subject to mid-frame within the room
  the cover scale allows, and the live project never changes shape
- **Five more tabs, each a full library, none a duplicate.** Filters (the
  117 looks with a strength slider, at every level), Transitions (116, one
  length, on the selection or every cut), Overlays (the 118 leaks, flares,
  frames, weather, grain and tape effects as their own gallery), Stickers
  (91 emoji in sets, 10 shapes and callouts, the shared editor and the
  reactions), Sound (a beat maker in eight styles at any tempo with an
  exact grid, and 32 sound effects synthesised on the spot — whooshes,
  hits, risers, glitches, clicks, beds — placed on their own track at the
  playhead, one file per sound however often it is used). Every tab
  writes the same fields as the panel it grew out of. Number keys 1–9,
  the Window menu, the palette and the phone's scrolling tab bar all know
  them. Measured in Chromium: 31 checks, including every sound rendering
  finite and normalised
- **Rate us, in the app and on the site.** Help menu, Learn panel and the
  phone's More sheet open one card: five stars, an optional line. The third
  finished export earns one quiet corner card, never a second. The site's
  footer carries the same block on every page, and shows the average once
  there are five ratings. Ratings post to `/v1/rate` on the Worker (one row
  per device per day; no email, no project) and wait on the device when
  there is no backend. After deploying the Worker, run `npm run db:init`
  again so the `ratings` table exists — the schema is additive
- **Beat detection rebuilt for precision.** Three bands (kick, snare, hats),
  a four-four comb so a syncopated kick cannot read as a beat and a half,
  the octave settled by the hats, a period taken from inter-onset intervals
  and a grid fitted by least squares over a growing span. Measured on 28
  made beats with lead-in silence: tempo within 1% on 20 (drum and bass and
  fast house at half time, which is how they are counted), grid within a
  video frame — typically 2–9 ms. Drill, whose kicks and snares sit off the
  beat by design, can land its grid a half-beat over, on those hits
- **Remove background, two ways, chosen automatically.** A plate from the
  clip on a still camera; a portrait matte — colour models seeded from the
  face, re-fitted twice — on a moving camera or a person who sits still.
  Measured against known mattes: the still person keys at IoU 0.75+ with no
  plate, the panning camera 0.7+, the plate path 0.85+; sensor noise flips
  under 2% of pixels between frames, because each matte is settled against
  the last. The camera-motion check is what decides, and says so
- **Twelve sticker reactions** — a sticker that hovers over the tracked
  subject, orbits it, leans into its motion, trails behind it, grows with
  its speed, points at it, shadows it, is pulled onto it, tightens or pops
  when it stops, or rides in its hand. Sampled live from the track through
  the clip's speed ramp, never baked into keyframes. Checked on the pose of
  every mode and on pixels through the renderer
- **Nine tracked transitions** — zoom through, iris, spin, whip, portal,
  radial wipe, glitch, blur — that take an anchor from a motion track at the
  moment of the cut. "Cut through it" on a finished track sets one up
- **Follow a face** and pin a blur, a pixelate, a background blur, a spotlight,
  a skin soften or a light to it. Runs on your device, no model downloaded, and
  measured across six skin tones: found in all of them, confidence varying by
  0.002 between the palest and the deepest
- **B-roll matching** — which of your own clips suits the moment at the
  playhead, read from the caption line, the tempo and what is already on
  screen, with the reasoning shown. No stock library, nothing fetched
- **The four trims** — ripple, roll, slip and slide, on one smart-trim tool
  that picks which by where you grab. The vocabulary every professional edit
  is built on, and the largest single gap against Resolve and Premiere
- **Windows and the qualifier** — shape masks that feather, rotate, invert and
  animate, plus HSL colour selection, intersecting the way a colourist expects.
  Grade one jacket in a crowd rather than the whole shot
- **A real audio chain** — six-band EQ, a compressor, pan and trim, and
  loudness measured to ITU-R BS.1770 against the platform targets. Verified
  against EBU Tech 3341's published conformance figure: it reads -22.99 where
  the answer is -23.0
- **Adjustment layers**, **compound clips** with real nesting, and **scene edit
  detection** that finds the cuts in an already-flattened video and splits
  there
- **Pages** at Intermediate and Professional — Media, Cut, Edit, Motion,
  Colour, Sound, Deliver. One screen per job rather than one screen that
  is a compromise between seven of them. Beginner is untouched: still one
  panel, one picture, one timeline
- **Serial correctors** — a real node chain. Each corrector reads the finished
  output of the one before it, with its own wheels, windows and qualifier, so
  you can key the sky in node two and key skin out of *that result* in node
  three. Verified on pixels, not on the boxes: corrector one desaturating and
  corrector two lifting on top of it both measured out of the renderer
- **The colourist's furniture** — a primaries band under the picture with the
  three wheels and the six numbers you reach for between wheel moves, a stills
  gallery you grab a grade into and drop on the next shot, a shot strip, a
  lightbox for spotting the one that does not match, scopes docked beside the
  picture, bypass on one key with an amber border so a bypassed shot can
  never be mistaken for a graded one, and a draggable split screen whose
  ungraded half is the same compositor with the grade switched off rather than
  a cached approximation of it. The band and the panel are the same
  widget wired to the same corrector, not two that look alike
- **A neutral room at Professional** — every saturated surface in the chrome
  gone, measured: no gradient on the play button, no brand colour on the
  export button, greyed slider accents. Simultaneous contrast is real, and a
  blue button beside the picture makes you grade past where you meant to
- **Playback that plays.** A clip whose audio track the browser failed to
  detect used to sit on one frozen frame with no sound while the playhead swept
  past it — the normal case on a phone, where the probe runs before a single
  audio byte is decoded. One media clock now owns play, pause, rate and
  position for every element, and when a browser refuses to start an unmuted
  one the picture is driven by seeking instead of freezing
- **290 presets** — a grade, a stack of effects with their parameters tuned to
  each other, a transform and an audio strip, applied to a clip in one tap.
  Not the same thing as the effect library: a single effect at its defaults is
  a guitar pedal, and what people actually want is four of them in an order
  somebody worked out. Forty-nine groups, searchable, from film stocks and
  light leaks to datamosh, kaleidoscope and the unglamorous Grade tools a
  colourist actually starts from. You can save your own from any clip you got
  right, and they sit beside the shipped ones under **Mine**.
  Every preset and every style is checked against the real libraries at load —
  including parameter names, because `{ id: 'fog', params: { height: 60 } }`
  is not an error to anybody: the fog is built, the unknown key is ignored, and
  the preset quietly runs at the default depth it was tuned away from. That
  check found four of mine and one shipped style that had been rendering 9:16
  while promising 4:3
- **Multicam** — angles lined up by correlating what each camera *heard
  happen*, not the waveform, which two different microphones never agree on.
  Measured against a known answer: two angles started exactly 1.2 seconds apart
  are placed at 1.196s, and an angle it could not place says so on its own tile
  instead of being quietly stacked at zero. The angle viewer shows every angle
  live while the timeline runs, 1–9 cut between them as it plays, and Flatten
  turns the switches into ordinary clips
- **Copy attributes, paste attributes** (Ctrl+Alt+C / Ctrl+Alt+V) — grade one
  shot, then put that grade, those effects with their exact settings, that
  reframe and that audio strip onto the other eleven from the same camera.
  Built on the preset system rather than beside it, so what counts as an
  attribute has one definition instead of two that drift, and it carries none
  of the edit: nothing moves, nothing retrims. A whole selection is one undo
- **The commands that make it feel like an editor** — freeze frame (E), match
  frame (Y), three-point insert and overwrite, and J/K/L shuttle with the rate
  reaching the decoders so picture and sound keep up at 8x. Reverse shuttle
  moves the picture and says plainly that it cannot move the sound
- **49 text styles and 35 text animations**, each chip a real render — the
  style on a frame, the animation playing on hover. Outlines, neon, gradients,
  shaded colours, 3D blocks, glass and watermark translucency, retro; letter-
  by-letter, glitch, neon flicker, rubber band, wipe, and the loops. A style
  changes only the look; the words, size and position stay. Measured: every
  style draws differently from plain text, every animation moves, and the
  random-looking ones render identically twice at the same moment, so the
  export cannot flicker
- Every effect, look and transition previews on your own footage. Nothing is a
  shipped screenshot, so nothing can drift from what it actually does — and it
  adds zero bytes to the download
- Curves and LUTs (any `.cube` file), colour wheels, four broadcast scopes
- Audio in decibels with peak hold and clip latching, **148 audio filters in
  12 groups** — rooms, echoes, modulation, distortion, lo-fi, voices, machines,
  beat tools, atmospheres, pitch — every one rendered and measured: finite,
  audible, bounded, and different from dry. Noise/hum/click repair
- Export to 16 presets up to DCI 4K, then straight to TikTok, YouTube,
  Instagram or X

**Verified on phones** — iPhone 13 and a 360×640 Android: everything on screen,
the page never pans sideways, import works, panels open as sheets that fit, and
every control a finger has to hit is big enough.

**The site** — pricing with no subscriptions, instant activation after payment,
per-platform downloads, an account that remembers you.

---

**Motion design** (Creator and up)
- **Expressions** on any property: `wiggle`, `loop`, `beatPulse`, `audio`,
  `noise`, `layer("name")`, keyed values with velocity — its own small
  language, deterministic frame to frame, so the render matches the preview
- **Shape layers**: paths that draw themselves on with trim paths, a repeater
  that walks arcs, wiggle and zigzag paths, sabre strokes with a white core
- **Text animators**: per-character opacity, position, scale, rotation,
  tracking and blur under a range selector with a soft edge, five shapes,
  characters or words, random order, and sixteen finished moves
- **Parenting, null objects and anchor points**: a layer follows its parent
  through the whole chain, and pivots where the anchor is put
- **The compositor's effects**, twenty-one of them: fractal noise that
  evolves and blends, gradient ramp, fill, light sweep, a lens flare that
  rides on the tracked subject, turbulent displace, displacement map, echo,
  posterize time, an audio spectrum and a waveform drawn from the music's
  real analysis, and a stateless particle emitter with snow, rain, sparks,
  embers, confetti, dust, bokeh, bubbles and a starfield. Every one is
  deterministic (the export matches the preview), keyframable, off at zero,
  and under 60 ms a frame at 720p
- **The AI speaks all of it.** "Make the title type on letter by letter and
  pop on the beat, add snow, parent the logo to a null" is five steps the
  assistant reads, explains and applies; the vocabulary lives in one file
  and the verifier checks every word names a real preset
- Verified by `verify-expressions`, `verify-shapes`, `verify-text-animators`,
  `verify-motion-fx`, `verify-ai-motion`

**Playback**
- Smooth. The preview used to be drawn at the project's size capped at
  1080 whatever the viewer on screen was: a vertical project in a viewer
  167 pixels tall was composited at 608×1080 sixty times a second and every
  effect ran at that size — a timeline with a glow on it played at fifteen
  frames a second. Now the canvas is the size it is shown (times the pixel
  ratio, capped at 1080; "Preview: full" still asks for the project's own
  size), a dynamic scaler steps it down while frames overrun and brings it
  back sharp on pause, per-pixel effects work at a smaller cap while the
  picture is moving and never for an export, and the playhead moves by
  transform so it no longer forces a layout on every frame. Measured: two
  effects on every clip went from 64 ms a frame to a steady 16.7, and the
  scaler brings a hopeless six-effect stack from 163 ms to 55.
  `verify-smooth` holds the cadence to numbers

**The front page**
- A showcase where the static mock-up was: five slides of the editor's own
  chrome doing things — a cursor drags a clip, picks the razor and cuts, a
  sentence types itself and becomes a plan and a timeline, a slider grades
  a shot and lights an effect, a title arrives letter by letter inside a
  ring that draws itself with embers rising, one frame goes to every
  platform. It advances on its own every 6.8 seconds, always; pauses while
  the pointer or focus is on it; dots, arrows and the keyboard move it;
  every slide resets when it goes off; with reduced motion the slides
  still rotate, finished, without the cursor. `verify-showcase`

**Installing it**
- The editor installs itself: an Install button in the top bar, File →
  Install as an app, a row in the phone's More sheet, and one offer after
  the first export. Where the browser has a prompt it is used; where it does
  not (Safari on a Mac, an iPhone, Firefox) the dialog gives the real menu
  route, and says plainly when a browser cannot install at all
- Installed, it is an app: opens `.omnidx` projects, bundles, video, audio
  and images from the file manager; appears in Android's Share sheet and
  takes the shared clip straight into the project (the service worker is the
  server); handles `web+omnidx://project/…` links; focuses the window that
  is already open; and the install dialog shows real screenshots
- The download page says the true route for each browser, unfolds the steps
  under the button, and carries an honest table of what a tab, an install
  and the desktop build each give
- The desktop build updates itself weekly from `studio/download/files/`
  (never during a render, installs on quit), opens bundles and footage by
  double-click, and a workflow builds all three installers on the machines
  they need. Verified by `verify-install` and `verify-download`

**The look**
- Its own chrome: one family of line icons, a graphite palette with a mint
  accent and an amber playhead, a tool strip in the top bar, a
  composition-style project settings dialog (presets, size with a locked
  shape, broadcast rates, start timecode, background), a media bin with
  sortable columns and measured frame rates, layer switches on every track
  head (mute, solo, hide or duck, lock), a parent badge on the clip, a Window
  menu for the panels, and a status readout of frame size, rate and draw time
- Verified by `verify-ui-identity`, and the start screen by `verify-start-pro`

**Accounts**
- Nobody loses an account: a recovery code and a recovery file made at
  sign-up, a password reset from the code on any device, restore on a new
  device from the file with the code or the password, the Square receipt as
  the last way in, and the oldest device makes room instead of a lockout.
  `docs/ACCOUNT-RECOVERY.md` has the whole model; `verify-recovery` runs it

## Not done, and why

**Generative object replacement.** You asked for highlighting an object, typing
"vintage sports car", and having it swapped in with matching shadows and
reflections. That needs a generative video model. It cannot run in a browser
and it is not something I can fake — anything claiming to do it would either be
lying or quietly sending your footage to somebody else's server. Background
removal, chroma key, background plates and object *removal* against a static
background all work today, because those are solvable without generation.

**Generative fill and un-cropping.** Same reason. What does work is
content-aware expansion from surrounding pixels, which is honest and good
enough for backgrounds, but it is not the same thing and should not be sold as
it.

**The promo trailer pack.** Ready to build — it is waiting on the TikTok audios
you were going to send. Send them and it gets made.

**Multi-lingual captions.** The transcription runs on the server, so it turns
on with step 2.

**Stabilisation.** Not built. The motion tracker in the app could drive it —
it already estimates where a region moved between frames — but a stabiliser
that only counters translation makes rolling-shutter wobble worse rather than
better, and doing it properly means solving rotation and scale too. Left out
rather than shipped as something that helps some shots and ruins others.

**A limiter.** Written, measured, and taken out again. The browser's dynamics
node does not hold a ceiling — set to -12dB it let a hot tone through at
-4.2dBTP — and a control whose whole promise is a number it cannot meet is
worse than no control. The ceiling is enforced where it can be exact instead:
at the loudness check, by measuring true peak and clamping the gain.

**A noise gate.** Same reason. Web Audio has no gate node, and a gate faked out
of a compressor is a compressor with a confusing label. Noise, hum and click
repair do that job properly on the samples.

**A pen tool.** Masks come as rectangles, ovals and polygons, all feathered,
rotatable and animatable. There is no bezier pen for drawing an arbitrary
outline by hand.

---

## Worth knowing before you sell it

**Licensing is enforceable in one place only.** Every entitlement check runs on
the buyer's own machine and can be switched off with dev tools. Requiring a
Square receipt to unlock stops casual link-sharing and leaves a trail you can
chase in the dashboard, and a licence bought while signed in leaves with that
account — but none of that is enforcement. The AI is genuinely enforced,
because it runs on the server and the server checks, and it is also the only
feature that costs you money per use. That is the right place for the strong
lock to be.

**There is no refund flow in the app.** Refunds are done by hand in Square.
Fine at this volume; it will not stay fine.

**Accounts are per-device until the Worker is deployed.** Somebody who signs up
on a phone and opens the site on a laptop is told, clearly, to make one there
too. Step 2 fixes this properly.

---

## Before you post the link anywhere

- [ ] Redirects on all three Square links, tested with a real payment
- [ ] Worker deployed, `DEFAULT_API_BASE` set, AI answering
- [ ] Desktop installers in `studio/download/files/`
- [ ] `supportEmail` in `studio/assets/config.js` is an inbox you actually read
- [ ] Opened `omnidx.net` on your own phone and made a real edit start to finish
- [ ] Exported a video and posted it somewhere
