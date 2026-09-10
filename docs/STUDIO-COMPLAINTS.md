# Every complaint we found, and what OmniDx Studio does about it

This is the design document. The feature list came out of it, not the other way
round: we went looking for what people say about the editors they already use —
the recurring threads, the one-star reviews, the "why does it do this" posts —
and built to answer them.

Three columns of honesty below: what's **done**, what's **partly done**, and
what's **not done yet**. The third list is the important one. An editor that
claims to have fixed everything has fixed nothing.

---

## Losing work

| Complaint | About | What we do |
|---|---|---|
| "It crashed and I lost four hours" | Premiere, Resolve | Autosave every **5 seconds**, on by default, no setting to forget. |
| "Autosave was off / set to 20 minutes" | Premiere | There is no off. The interval is not configurable because a configurable one is a foot-gun. |
| "It crashed and there was no recovery prompt" | Premiere, Vegas | A mirror of the open project is written synchronously on every change. Reopening after a crash offers it back. A *clean* close marks itself clean, so an ordinary reload doesn't nag. |
| "The autosave folder is somewhere I can't find" | Premiere | Projects are in the app, listed under Settings → Projects. Nothing is hidden in a user folder. |
| "Undo skipped a step / broke after saving" | Everyone | Undo is a stack of whole-document snapshots, so it cannot miss a change. Every entry is named and you can jump to any point. |

## Media and files

| Complaint | About | What we do |
|---|---|---|
| "MEDIA OFFLINE — I moved one folder" | Premiere | Media is stored and matched by a **content fingerprint**, not a path. Rename it, move it, put it on another drive — the project still finds it. |
| "Relinking is a nightmare" | Premiere, Resolve | If a file genuinely can't be found, it asks for that one file and leaves the timeline intact. |
| "The project file is a black box / proprietary" | Everyone | A project is readable JSON. Open it in a text editor. Put it in git. Email it. |
| "Can't open my project on the other machine" | Final Cut, Resolve | Save project file → open it anywhere. The format is documented and versioned. |
| "Unsupported media format" | Everyone | Whatever your browser can decode, the editor can edit — which is every phone and camera format in normal use. When something genuinely can't be read, it says which file and why. |

## Performance

| Complaint | About | What we do |
|---|---|---|
| "Playback stutters unless I make proxies first" | Resolve, Premiere | Preview resolution drops automatically while scrubbing and snaps back when you stop. Export always uses the full-quality original. |
| "It needs 32GB of RAM to be usable" | Resolve | Decoders are pooled and torn down when cold, so a hundred-clip project doesn't open a hundred of them. |
| "Timeline lags with a lot of clips" | Everyone | Trimming repaints one clip, not the whole timeline. Filmstrips and waveforms are computed once at import, never per frame. |
| "Effects render in real time and kill playback" | Everyone | Grading is done with GPU-accelerated canvas filters. The heavy passes are skipped entirely for clips you haven't touched. |

## Export

| Complaint | About | What we do |
|---|---|---|
| "It failed at 97% and I lost the whole render" | Premiere, Resolve | Encoded video is written continuously. A failure leaves you a **playable file** of everything rendered so far, and names the timecode and the clip it stopped on. |
| "The error message is a number" | Everyone | Failures are in plain English and name the clip. |
| "Export settings are a wall of codecs" | Everyone | Presets are named after where the video is going. The resolution is underneath in small text for people who care. |
| "My text was under the TikTok buttons" | CapCut, Premiere | Safe-zone overlays show exactly where each platform's UI covers your frame, per aspect ratio. |
| "Watermark on the free version" | CapCut, Filmora, Clipchamp | None. Not on any tier. |
| "4K export is behind a subscription" | CapCut | Behind a **one-time $19.99**, and 1080p is free forever. |

## The paywall

| Complaint | About | What we do |
|---|---|---|
| "Features move behind Pro overnight" | CapCut | The free tier is written down on the pricing page and doesn't move. |
| "$23/month forever for software I use twice a year" | Premiere | One-time $19.99 / $39.99 / $69.99. There is no monthly option at all — we removed it. |
| "Cancelling costs a fee" | Adobe | Nothing to cancel, because nothing renews. You bought it; you have it. |
| "Constant upgrade popups mid-edit" | CapCut, Filmora | Paid features are labelled once, in grey, where they live. No popups, no countdowns, no interruptions. |
| "$300 and Mac only" | Final Cut | One licence covers Mac, Windows, iPhone, Android and the browser. |
| "The trial expired mid-project" | Everyone | There is no trial. The free tier is the product. |

## Learning it

| Complaint | About | What we do |
|---|---|---|
| "I opened Resolve once and never again" | Resolve | Three skill levels. Beginner puts nine tools on screen. You move up when you want to. |
| "Seven pages and I don't know which one I need" | Resolve | One workspace. Panels, not pages. |
| "The tutorial is a 40-minute YouTube video" | Everyone | An eight-step walkthrough inside the app, skippable on every step, and it never touches your project. |
| "Where is that setting" | Everyone | `Ctrl+K` searches tools, effects, looks, settings, shortcuts and your own clips. |
| "I can't find the keyboard shortcut for X" | Everyone | The whole list is in the Learn panel, and every button's tooltip names its key. |

## Things people asked for that we built

Suggestions that came up again and again, and are in:

- **Cut to the beat automatically** — tempo detection, then cuts on a beat grid.
- **Remove silence in one press** — the jump-cut look, done for you.
- **Auto-captions** — with the caveat below.
- **Describe the edit and have it made** — the AI planner. Every step is shown
  before it runs and lands as normal, editable clips.
- **Speed ramps with real easing**, not a speed dropdown.
- **A visible undo history you can jump around in.**
- **Per-platform export presets with safe zones.**
- **Dark and light mode**, everywhere, remembered.
- **Works offline.** Fully. On a plane, with the wifi off.
- **Beat markers on the ruler** so you can cut to the music by hand too.
- **An open project format.**
- **Ducking music under voice** without keyframing it by hand.
- **A grade you can copy to every clip at once.**
- **One-tap edit styles** — anime AMV, velocity, phonk, aesthetic, cinematic, gaming,
  product, meme, sports, listicle, talking-head cleanup. Every one shows its plan
  before it runs, and they are free on every tier.
- **"Sync my clips to the track"** that keeps your clips and your order and only
  moves the cuts onto the beat, rather than rebuilding your edit.
- **Motion tracking.** Draw a box, follow anything through the shot, pin a blur, a
  sticker or a title to it. Classical template tracking with sub-pixel fitting —
  no model to download and it runs offline.
- **Real motion blur**, sampled from the actual movement rather than a directional smear.
- **Speed ramps** where the speed changes *through* a shot and the audio follows it.
- **Three-way colour wheels** — lift, gamma, gain — running as a GPU filter.
- **Impact frames, speed lines and beat-pulsed chromatic split**, because the edits
  people are trying to copy are made of exactly those three things.
- **17 creative audio filters** — underwater, telephone, old radio, megaphone,
  through-a-wall, vinyl, small room, cathedral, stadium, slowed-and-reverb,
  stereo widening, robot, 8-bit, chipmunk, deep voice, nightcore, alien. They
  play live while you scrub and are rendered into the export by the same code,
  so what you heard is what ships. Thirteen are free; the four that pitch-shift
  without changing the clip's length are in Creator and up.
- **One payment, never a subscription.** There is no monthly plan to cancel
  because there is no monthly plan.
- **Three skill levels that change the density, not just the button count** —
  Professional is a finishing-suite layout with a neutral grey chrome, because
  judging a grade next to saturated blue furniture is your own eye lying to you.

---

## The things other editors charge extra for

| Complaint | About | What we do |
|---|---|---|
| "ProRes needs a paid tier or a separate licence" | Premiere, Resolve free | ProRes 422 and DNxHR come out of the desktop app with nothing extra to buy. |
| "H.265 export is behind an upgrade" | Several | H.265 is in Creator, $19.99 once, where the hardware supports it. |
| "Backup and sharing need an expensive tier" | Everyone | A bundle carries the footage with the edit and is a plain ZIP. Team is three people for $69.99 — less than half what three individual licences cost. |
| "Real noise reduction means buying a DAW" | Everyone | Spectral noise reduction, hum removal, click repair and levelling, in the app, offline. |
| "A project won't move between desktop and mobile" | Almost everyone | The same bundle opens on all of them. The format is documented and readable. |
| "Proxy generation is clunky or missing" | Mid-tier editors | One button per clip, or on by default. Preview uses the proxy, export never does. |
| "It can't open my screen recording without converting it first" | Many | Variable-frame-rate files work as they are, and a broken duration — which most screen recorders write — is recovered on import instead of showing a zero-length clip. |

## Partly done — and what's missing

**Auto-captions.** There are two halves: *when* someone speaks and *what* they
said. We do the first entirely on your device — speech is located, cues are
placed and timed, you type the words. The second needs speech recognition,
which no browser offers for a file, so it needs a transcription key configured
(`server/`). The app says which mode it is in rather than calling both
"auto-captions".

**Export speed.** Fixed where the browser allows it. On Chrome and Edge the
encoder is driven directly, so export is frame-exact, usually faster than real
time, and the tab can be in the background. On browsers without an H.264
encoder it falls back to capturing the timeline as it plays — three minutes of
video takes three minutes — and the export dialog says which one you are
getting and why.

**Audio repair on very long files.** The noise reduction is an FFT over the
whole track. A three-minute clip is a second or two; an hour-long podcast will
make you wait. It should process in the background and does not yet.

**Sharpening.** The colour panel has blur but not a true unsharp mask; doing it
properly needs a convolution pass that isn't in yet.

---

## Not done yet — the honest list

- **Real-time collaboration.** Two people on one timeline. Wanted a lot, not built.
- **Nested sequences / compound clips.**

- **Green screen keying.** Background removal is planned for Studio but the
  chroma keyer isn't written.
- **Multicam sync.** Same: listed, not built.
- **A mixing EQ and a per-clip compressor.** There are 17 creative audio
  filters (underwater, telephone, cathedral, robot, pitch shifting and so on)
  and the full repair chain, but no parametric EQ band you can place yourself
  and no compressor with a ratio and a threshold.
- **HDR / 10-bit.** Everything is 8-bit sRGB.
- **Timeline markers with notes and colours** — markers exist, notes don't.
- **A proper curve editor** for keyframes. Easing presets only.
- **Custom keyboard maps.** The shortcuts are fixed.

If you are reading this to decide whether to pay: everything in "done" is in
the build you can download and try for free, and you should try it before
paying for anything on the strength of a list.
