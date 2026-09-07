# OmniDx launch kit

Everything in one place: the videos, the exact words to type into text-to-speech,
what to buy, and how to get paid.

**Live now:** <https://hundostacksgit-svg.github.io/apextune-updates/>

---

## 0. Do this next, in this order

Each step is worth doing on its own, so a hold-up on one does not block the rest.

1. **Open <https://cash.app/$Ahmirp1961> and check it is your account.** Before
   anything else and before any post. A wrong character pays a stranger and
   there is no getting it back.
2. **Buy the OBD-II adapter (~$30). Scan your own car.** You need to have seen it
   work on a real engine before a stranger asks you a question about it.
3. **Buy omnidx.net (~$12).** Add the DNS records in section 2, wait, then run
   the one command. The site keeps working the whole time.
4. **Make the TikTok account.** Profile picture, handle, bio, link. Section 8.
5. **Post `4-codes.mp4`.** Then the rest, a day or two apart. Section 4.
6. **Set up Square checkout** once a payment or two has come through Cash App and
   you know the demand is real. Section 3, Option B.

Everything after that is repetition: post, read the comments, post again.

---

## 1. What to buy

Two things, about **$45 total**. Nothing else costs money — hosting, HTTPS and
distribution are all free.

| | Cost | Why |
|---|---|---|
| **OBD-II adapter — Vgate iCar Pro BLE 4.0** | ~$30 | Scan your own car before selling a car scanner. Must say **BLE / Bluetooth 4.0** |
| **omnidx.net** | ~$11–15/yr | Cloudflare Registrar is cheapest and never marks up renewals |

**Do not buy:** Wi-Fi OBD adapters or Bluetooth 3.0 "Classic" ones (no browser can
reach either), $6 clones, Apple Developer ($99/yr), Google Play ($25), or any
hosting.

---

## 2. Setting up omnidx.net

It was unregistered at last check — a DNS lookup returns NXDOMAIN — so it should
be available. `omnidx.com` is taken.

**Step 1 — buy it.** Cloudflare Registrar, Porkbun or Namecheap. Check the
*renewal* price, not the first year.

**Step 2 — add five DNS records.** Four A records, host `@`:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

One CNAME record, host `www`, value:

```
hundostacksgit-svg.github.io
```

**Step 3 — run one command.**

```
python3 tools/set-domain.py omnidx.net
```

This checks DNS first and **refuses** if the domain isn't pointing at GitHub yet.
That guard matters: the moment a `CNAME` file exists, Pages serves the site *only*
on that hostname, so adding it early takes your live site offline. While you wait
for DNS, poll with:

```
python3 tools/set-domain.py --check-only omnidx.net
```

**Step 4 — Settings → Pages → tick Enforce HTTPS** once the certificate is issued.

Full detail: [`docs/CUSTOM-DOMAIN.md`](CUSTOM-DOMAIN.md)

---

## 3. Getting paid — any method, lands in Cash App

**Yes, this works.** Two ways, and the difference matters more than it looks.

### Option A — Cash App only (live right now, free)

Already wired. `app/js/config.js` holds the cashtag and every buy button uses it.

Buyers open `cash.app/$yourcashtag`. Cash App users pay in a tap; people without
it can still pay by **debit card** on that page.

**Before you advertise it:** open your own buy link and confirm it lands on your
account. A single wrong character sends customers' money to a stranger.

Limits worth knowing:
- **Credit cards cost the sender 3%** — most people won't
- **No order information** — a payment is just a name and an amount, which is why
  the app tells buyers to put their email in the note
- **No receipt or automatic delivery** — you send the code by hand
- **Personal accounts aren't for business.** Switch to **Cash App for Business**
  in Settings (one minute, 2.75% per payment). Accounts taking regular commercial
  payments on a personal profile can be frozen.

### Option B — Square checkout, paid out to Cash App (recommended)

Square and Cash App are the same company, which makes this clean.

1. Free Square account
2. Create a **Checkout Link** for $19
3. In Square, set payouts to your **Cash App account and routing numbers**
   (Cash App → Money → direct deposit shows both)
4. Put the link in `app/js/config.js` as `checkoutUrl` — every buy button switches
   to it automatically

| | Cash App link | Square Checkout |
|---|---|---|
| Credit cards | Buyer pays 3% | Included |
| Apple / Google Pay | No | Yes |
| Buyer email captured | Only if typed | Automatically |
| Receipt | No | Yes |
| Fee | 0% personal / 2.75% business | 2.9% + 30¢ |

**Send yourself one real $1 sale and confirm it lands.** Some processors reject
deposits to fintech routing numbers. If Square won't deposit to Cash App, point it
at a normal bank account — Cash App pulls from a linked bank for free.

Stripe Payment Links work identically.

### After a payment arrives

```
python3 tools/make-licence.py
```

Prints something like `OMNIDX-HSK8-SG5P-MDWA`. Email it to the buyer. For records:

```
python3 tools/make-licence.py -n 20 --csv > licences.csv
```

**Keep that file** — Cash App payments carry no order data, so it's your only link
between a code and a customer.

Full detail: [`docs/PAYMENTS.md`](PAYMENTS.md)

---

## 4. The videos

All in `assets/social/videos/`. 1080×1920, 30fps, H.264 — upload straight to
TikTok, Reels or Shorts with no conversion.

| File | Length | Use |
|---|---|---|
| `4-codes.mp4` | 18s | **Post this first.** Educational, free to act on, gets saved |
| `2-fastcut.mp4` | 15s | Fast edit. **Needs a trending sound** — built to a 120bpm grid |
| `3-listicle.mp4` | 20s | Broadest reach, not only for car people |
| `1-story-silent.mp4` | 28s | The full pitch, silent |
| `1-story-voiceover.mp4` | 28s | Same, with a synthetic voice baked in — **don't post this one** |

The baked-in voice is espeak, a local open-source engine. It sounds like a screen
reader. Use the silent files.

**Post order:** codes → fastcut → listicle → story. A day or two apart, not all at
once. Same product, four hooks — that's how you learn which angle works before
committing to it.

---

## 5. Cutting a video to your own sound

Send a song and the edit will be rebuilt so every cut, every text hit and every
flash lands on the beat of that specific track. One command:

```
tools/promo/make-beat-video.sh song.mp3
```

That writes `omnidx-beatcut.mp4` in the repo root — 1080×1920, the audio already
muxed in, ready to upload.

Options, in order:

```
tools/promo/make-beat-video.sh song.mp3 20 8
```

...means make it 20 seconds long starting 8 seconds into the track — which is
usually what you want, because the part of a song worth cutting to is rarely the
intro.

**If the cuts feel like they are on the offbeat**, the tempo was read at half or
double what you hear. Force it:

```
python3 tools/promo/beatsync.py song.mp3 --bpm 150
tools/promo/make-beat-video.sh song.mp3
```

This is not always the tool being wrong — on a half-time trap beat, 75 and 150
are both defensible answers, and only you know which one the video should move at.

**How it works**, briefly: `beatsync.py` finds the tempo and the position of
every beat and writes `beatmap.json`. `beatcut.html` writes the edit in beats
rather than seconds, so the same cuts work at any tempo without a single number
being retyped. Check it against tracks of known tempo any time with:

```
python3 tools/promo/beatsync.py --selftest
```

**On using commercial music:** posting with a track from TikTok's own library is
fine and is what the algorithm rewards. Baking someone's copyrighted song into a
file and uploading it elsewhere — YouTube, your own site, an ad — is not. For
TikTok, the safest route is to upload the beat-cut video *silent* and add the
sound in the TikTok editor; the cuts still land, because they were cut to that
track.

---

## 6. Text-to-speech scripts

Upload the **silent** file, add each line as a text block at the time shown, tap it
→ **text-to-speech**. TikTok's voices are free and sound far better than anything
bundled here. Those text blocks double as captions, which matters because most
TikTok is watched on mute.

### 4-codes.mp4 (18s)

```
 0.2s   Your check engine light is telling you exactly what's wrong.
 2.4s   You just need to read it.
 5.2s   P0420 is your catalytic converter running below efficiency.
 7.6s   P0171 means the engine's running lean, often a vacuum leak.
10.0s   P0301 is a misfire on cylinder one.
11.6s   Two hundred and five codes, decoded on your phone. No adapter needed.
15.2s   Free, right now. Link in bio.
```

### 3-listicle.mp4 (20s)

```
 0.2s   Three things one free app does for you.
 3.8s   One. It reads your car's fault codes, in plain English.
 8.4s   Two. It tests your phone's hardware — battery, screen, cameras, GPS.
12.6s   Three. It benchmarks your computer.
16.6s   One app, free to try. Link in bio.
```

### 1-story-silent.mp4 (28s)

```
 0.15s  Check engine light on? Shops charge eighty bucks just to read it.
 3.60s  You can do it yourself, in about ten seconds.
 7.40s  All you need is a thirty dollar adapter and your phone.
11.60s  It pulls the fault codes and tells you what's actually wrong, in plain English.
17.80s  It even shows what the engine was doing the moment it broke.
21.60s  The same app checks your phone and your laptop too.
24.80s  Free to try. No app store. Link in bio.
```

### 2-fastcut.mp4 (15s)

**No voiceover.** The genre doesn't use them. Add a trending sound near 120bpm and
the cuts land on the beat.

---

## 7. Captions and hashtags

**codes**
```
what your check engine code actually means 👇 save this for later
205 codes, free, works offline — link in bio

#checkenginelight #obd2 #cartok #carrepair #mechanic #cartips #p0420
#carmaintenance #diycar #learnontiktok
```

**fastcut**
```
your car has been trying to tell you what's wrong this whole time 🔧
free, link in bio

#cartok #checkenginelight #obd2 #carhacks #fyp #cars #diycar #mechanic #edit
```

**listicle**
```
one free app instead of three 📱🚗💻
link in bio

#techtok #carhacks #phonetips #freeapps #diy #cartok #obd2 #lifehack
```

**story**
```
Your check engine light isn't a mystery. Read the code yourself in 10 seconds 🔧
Free to try, link in bio 👇

#checkenginelight #cartok #obd2 #carrepair #diy #mechanic #cartips #carhacks
```

---

## 8. Account setup

**Profile picture:** `assets/social/pfp-a-gradient-white.png` — white mark on the
brand gradient. The app icon itself (`pfp-b`) is the most on-brand option and the
worst performing: dark on TikTok's dark feed, it reads as an empty grey dot at
48px. See `pfp-size-comparison.png`.

**Handle**, in order — try each, they may be taken:
`@omnidx` → `@omnidx.app` → `@getomnidx` → `@tryomnidx` → `@omnidxhq`

Grab the same name on Instagram and YouTube at the same time. Reels and Shorts
take these exact files.

**Display name:** `OmniDx · Car Diagnostics`

TikTok search weights the display name. "OmniDx" alone is unsearchable — nobody
looks for a brand they've never heard of. "Car diagnostics" is what they type.

**Bio** (80 char limit):
```
Read your check engine light yourself. Car, phone & PC. Free 👇
```

**Put the link in before you post anything.** Every video ends on "link in bio."

---

## 9. An honest growth plan

There's no trick here, so here's what actually moves the needle, in order.

**Volume beats polish.** Five videos is a start, not a campaign. Accounts that
grow post 1–2 a day for weeks. The generators are in `tools/promo/` — change the
hook, re-render, post. Every video is one number in one array away from a variant.

**The hook is the whole game.** People decide in under two seconds. Test hooks,
not products: "shops charge $80", "your car is telling you what's wrong", "check
this before you buy a catalytic converter". Same video, different first line.

**Answer every comment for the first month.** Comment replies are ranked, and a
reply that teaches something gets more reach than the original post. Someone
asking "what about P0128?" is free content — reply, then make that video.

**Reply-videos are the cheapest content you have.** Someone comments a code, you
make a 15-second video answering it. The repair guidance in the app means you
already have the answer written.

**Free thing first, product second.** The code lookup needs no purchase and no
adapter. Lead with it. People who found you useful once will look twice.

**Push the share card.** Every result screen has *Share as image* — the score,
the code, the cause and the first thing to check, with `omnidx.net` printed on
it. Someone showing a friend what's wrong with their car is a post you did not
have to make. Say it in the videos: "screenshot this and send it to whoever's
been telling you it's the catalytic converter." That is the only part of your
distribution that grows without you.

**Expect the objections and answer them straight:**
- *"AutoZone does this free"* — true. The pitch is not driving there, seeing
  freeze frame data a parts-counter scanner won't show, and knowing before you're
  quoted.
- *"Why not a $30 scanner?"* — you still need the $30 adapter. The app is what
  turns a code number into what to check first.
- *"Does it work on iPhone?"* — everything except live car scanning. Apple blocks
  Bluetooth in iOS browsers. Say it up front; dodging costs more trust than the
  limitation does.
- *"Can it diagnose my PS5?"* — the console, no. Its controller and its screen,
  yes, and those are the parts that fail.

**Be realistic about money.** At $19 with no ad spend, this is a side income that
depends entirely on reach. Ten sales is $190. The videos are free to make and free
to post, so the only real cost is your time — but treat 100 posts as the
experiment, not 4.

---

## 10. Where everything lives

```
assets/social/videos/        the five videos
assets/social/pfp-*.png      profile pictures + the size comparison
tools/promo/                 video generators — re-cut any of them
tools/promo/beatsync.py      find the beat in a song you want to post with
tools/promo/make-beat-video.sh  cut the promo to that song, one command
app/js/card.js               the share-as-image card
tools/make-licence.py        generate a Pro code after a payment
tools/set-domain.py          point omnidx.net at the site, safely
app/js/config.js             cashtag, price, checkout link
app/js/pro.js                what Free vs Pro includes (one array)
app/js/obd/repairs.js        the cause-and-fix guidance
docs/PAYMENTS.md             full payment setup
docs/CUSTOM-DOMAIN.md        full domain setup
docs/NEXT-PRODUCTS.md        what else is worth building, and what isn't
```
