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

**Until you do this, do not advertise free-form AI editing.** It will not do
what the words on the pricing page promise.

### 3. Build the desktop installers — 30 minutes

`studio/download/files/` is empty, so the download buttons for macOS and
Windows have nothing behind them. The browser and phone installs work today;
the desktop ones do not until there is a file there. See
`studio/desktop/README.md`.

---

## Done and verified

Each of these was tested in a real browser against a real measurement, not
eyeballed.

**The editor**
- Multitrack timeline with ripple, roll, slip, snapping and markers
- Drag a clip down to an audio track for sound only; drag above the top for a
  new overlay layer, as many as you like
- Undo that names what it will take back, plus a full history you can jump
  into at any point
- 317 effects, 107 transitions, 118 looks, 200 typefaces, 130 styles
- **Keyframes you can see.** Unfold a clip and it becomes its properties —
  position, scale, rotation, opacity, volume, the grade, every parameter of
  every effect on it. Each has a stopwatch and a lane of draggable diamonds at
  the same scale as the clip, and a graph editor behind them for the shape of
  a move. This is the thing that separates a finishing tool from a phone
  editor, and it is the one that was missing
- **Follow a face** and pin a blur, a pixelate, a background blur, a spotlight,
  a skin soften or a light to it. Runs on your device, no model downloaded, and
  measured across six skin tones: found in all of them, confidence varying by
  0.002 between the palest and the deepest
- **B-roll matching** — which of your own clips suits the moment at the
  playhead, read from the caption line, the tempo and what is already on
  screen, with the reasoning shown. No stock library, nothing fetched
- Every effect, look and transition previews on your own footage. Nothing is a
  shipped screenshot, so nothing can drift from what it actually does — and it
  adds zero bytes to the download
- Curves and LUTs (any `.cube` file), colour wheels, four broadcast scopes
- Audio in decibels with peak hold and clip latching, 17 creative filters,
  noise/hum/click repair
- Export to 16 presets up to DCI 4K, then straight to TikTok, YouTube,
  Instagram or X

**Verified on phones** — iPhone 13 and a 360×640 Android: everything on screen,
the page never pans sideways, import works, panels open as sheets that fit, and
every control a finger has to hit is big enough.

**The site** — pricing with no subscriptions, instant activation after payment,
per-platform downloads, an account that remembers you.

---

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

**Shape masks and nesting.** After Effects has both; this does not. Masking is
covered for the common cases — chroma key, a tracked oval, background removal —
but there is no pen tool and no way to nest one composition inside another.
Neither is faked anywhere in the interface.

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
