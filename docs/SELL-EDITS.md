# Sell the edits first. The app comes after.

Written the day the owner said "I have yet to sell a single one, it feels like
I'm lost, I need something that can go NOW."

## The honest position

The app has not sold because nobody knows it exists, and a TikTok account at
100 views a video is not going to fix that this month. That is not a failure —
it is what month one looks like for every unknown product — but it means the
app is the *slow* money, and chasing it while broke is the wrong order.

The fast money is the thing we spent this week building the machine for:
**rebuilding somebody's favourite TikTok edit with their footage.** People pay
for that today, on marketplaces where the buyer arrives already wanting it.
You do not need a following to sell there. You need a listing, three samples,
and a same-day turnaround. We have the samples and the pipeline.

Every edit you sell also puts `omnidx.net` on screen for its whole length. The
service *is* the app's marketing, and it pays you to do it.

## What to do today, in order

1. Open a Fiverr seller account (fiverr.com → Become a Seller). Twenty minutes.
2. Create one gig with the copy below. Upload the three mog videos as the
   gallery — the silent versions, so nobody's music gets your gig flagged.
3. Price it low to get the first three reviews, then raise it. Reviews are the
   whole game on Fiverr; price is not.
4. Send twenty DMs with the script below. Car pages, gym pages, barbers,
   anyone posting phone footage with a following under 20k. They answer.
5. Post the three mogs on your TikTok with the caption "want yours? link in
   bio" and the Fiverr link in bio. Not to go viral — so that the DM people
   can see you are real.

## The gig

**Title** (80 characters max on Fiverr)

> I will recreate any TikTok or Reel edit with your clips, cut to the beat, in 24 hours

**Category:** Video & Animation → Video Editing → Short Video Ads / Social Media Videos

**Search tags:** tiktok edit, reel edit, beat sync, phonk edit, car edit

**Description**

> Send me a TikTok or Reel you love and your clips. I rebuild it one to one —
> every cut on the beat, the same text, the same flashes, the same timing — with
> your footage in it.
>
> Not "inspired by." The same edit. I measure the original's cuts to the frame
> and place yours on them, so when you post it with that sound it lines up from
> the first beat.
>
> **What I need from you**
> - The link to the edit you want (TikTok, Reels, Shorts)
> - Your clips or photos (phone footage is fine)
> - Anything you want on screen: your handle, a line of text, your logo
>
> **What you get**
> - 1080×1920 vertical, ready to post
> - No watermark
> - Cut to the sound so you just pick it in the app and post
> - One round of changes included
>
> **Turnaround:** 24 hours. Same day if you order before noon EST.
>
> Car edits, gym edits, lyric edits, "mogged" edits, phonk, anime-style —
> anything that's cut to a beat. Check the gallery for three rebuilt from
> real TikToks.

**Packages**

| | Basic | Standard | Premium |
|---|---|---|---|
| Name | One edit | Edit + text | Three edits |
| What | Your clips on the reference's cuts | Same, plus your handle/logo/lines on screen where the original has text | Three different edits from three references, same footage or different |
| Delivery | 1 day | 1 day | 2 days |
| Revisions | 1 | 2 | 2 per edit |
| Price to start | **$15** | **$25** | **$60** |
| Price after 5 reviews | $30 | $45 | $110 |

**FAQ** (Fiverr shows these on the gig)

> **Can you copy any edit?** Any edit that is cut to a beat, yes. If it relies
> on 3D or a specific movie clip I will say so before you order.
>
> **Do I need to send the sound?** No — send the link and I take the timing
> from it. You add the sound in TikTok when you post so it counts as using the
> sound.
>
> **What if I don't have clips?** I can build it from photos, a logo, or
> screen recordings. Send what you have.
>
> **Will it get copyright claimed?** I deliver it silent. You add the sound
> inside TikTok or Instagram, which is the licensed way, so no.

## The DM

Twenty a day. Pages with 2k–20k followers that post phone footage: car pages,
gyms, barbers, detailers, sneaker sellers, small clothing brands, fight gyms.
Pick ones that have posted in the last week.

> hey — I rebuild TikTok edits 1 to 1 with people's own clips. saw your
> [car/gym/shop] page, I'd do one for you free so you can see it. just send
> me a clip you like and the edit you'd want it to look like. if you post it
> and want more they're $15 each. no catch, I'm building my portfolio.

The free one is the whole trick. It costs you fifteen minutes with the
pipeline, it goes on their page with `omnidx.net` in the corner, and one in
five comes back for more. That is the following you were trying to build —
built on their accounts instead of yours.

When one replies with a clip:

> perfect. send me the link to the edit you want it to look like and I'll have
> it back to you tonight.

## The seven days

| Day | Do this |
|---|---|
| 1 | Gig up. Twenty DMs. Three TikToks posted with the link in bio. |
| 2 | Deliver the free ones from day 1. Twenty more DMs. |
| 3 | Ask everyone you delivered to for a Fiverr review or a repost with your handle. Twenty DMs. |
| 4 | First paid orders usually land here from the free ones reposting. Deliver same day. |
| 5 | Twenty DMs. Post a "here's one I made for @page" TikTok — a delivered edit, with their permission. |
| 6 | Raise Basic to $20 if you have two reviews. |
| 7 | Count: DMs sent, replies, free delivered, paid delivered, revenue. Then we adjust. |

A hundred and forty DMs at a 10% reply rate is fourteen conversations. Half
send a clip. That is seven free edits on seven pages, and the paid orders come
off those. It will not be a thousand dollars in week one. It will be the first
money, and the first money is the hard one.

## What the app is for in this

Every delivered edit carries `omnidx.net` in the corner for its whole length,
on somebody else's page, to their followers. The pricing page and the trust
page are already built for the person who taps it. The app sells itself to
the ten percent who want to make the next one themselves — and the gig pays
you while that happens.

Do not tell buyers "I made this with my own app" unless they ask. It sounds
like a pitch. The corner sticker does that job quietly.

## The mechanics, for when the orders come

Rebuild any edit somebody sends:

```
FFMPEG=$FFMPEG node tools/promo/studio/dissect.mjs their-edit.mp4 --out /tmp/ref --threshold 0.12
```

Then a new entry in `videos.js` on those cut times — `mog-02` and `mog-03` are
the two shapes to copy from, one with a held subject then a montage, one with
a lyric — render it silent, mux their audio on for your own check, deliver the
silent file. The kit doc has both walkthroughs.
