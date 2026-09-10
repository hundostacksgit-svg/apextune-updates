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
| "$23/month forever for software I use twice a year" | Premiere | One-time $19.99 / $39.99. A monthly option exists if you prefer; nobody is pushed to it. |
| "Cancelling costs a fee" | Adobe | Nothing to cancel. Monthly cancels in the app with no fee. |
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

---

## Partly done — and what's missing

**Auto-captions.** There are two halves: *when* someone speaks and *what* they
said. We do the first entirely on your device — speech is located, cues are
placed and timed, you type the words. The second needs speech recognition,
which no browser offers for a file, so it needs a transcription key configured
(`server/`). The app says which mode it is in rather than calling both
"auto-captions".

**Export speed.** A timeline with sound is captured in real time, because
that is the only way a browser will mux audio and video without shipping a
30 MB transcoder. Three minutes of video takes three minutes. Silent timelines
render frame-by-frame and are usually faster. The desktop build is where a real
encoder belongs, and it isn't there yet.

**Background rendering.** Exports run in the foreground and want the tab in
front. Backgrounded tabs get throttled by the browser and drop frames.

**Sharpening.** The colour panel has blur but not a true unsharp mask; doing it
properly needs a convolution pass that isn't in yet.

---

## Not done yet — the honest list

- **Real-time collaboration.** Two people on one timeline. Wanted a lot, not built.
- **Nested sequences / compound clips.**
- **Motion tracking**, and text that sticks to a moving object.
- **Green screen keying.** Background removal is planned for Studio but the
  chroma keyer isn't written.
- **Voice isolation and noise removal.** Advertised on the Studio tier; the
  model isn't wired up. Until it is, that tier is worth its price on the other
  features — and if you bought it for this, ask for a refund and get one.
- **Multicam sync.** Same: listed, not built.
- **Audio effects** beyond gain, fades and ducking. No EQ, no compressor.
- **HDR / 10-bit.** Everything is 8-bit sRGB.
- **Timeline markers with notes and colours** — markers exist, notes don't.
- **A proper curve editor** for keyframes. Easing presets only.
- **Custom keyboard maps.** The shortcuts are fixed.

If you are reading this to decide whether to pay: everything in "done" is in
the build you can download and try for free, and you should try it before
paying for anything on the strength of a list.
