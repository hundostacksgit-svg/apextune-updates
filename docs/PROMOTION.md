# Getting attention without getting called a scam

`PROMO-KIT.md` is the material — the videos, the captions, the schedule.
This is the strategy: how to push hard for reach while surviving the thing that
kills unknown paid software, which is a comment section deciding you are fake.

The two goals people think are in tension are not. For an unknown one-person
app, **the credibility material is the reach material.** The post that gets
shared is the one that says what the product cannot do. The hype post gets
scrolled past by everyone except the person who replies "ai slop, this is a
scam" — and once that comment is top-voted, the thread is over.

---

## 1. Fix these two claims before you post anything

I wrote both of these into the promo kit. Both would get caught.

**"Updates every day."** It is in video 19 and several captions. One person
cannot ship daily forever, and the first fortnight you don't, somebody who
bought on that promise will say so publicly. Worse, it is unfalsifiable-sounding
in exactly the way a scam claim is. Replace it everywhere with the version that
is structurally true and can never expire:

> Every update is free, forever. No version 2, no upgrade fee.

That is a stronger promise anyway — it is about what you will never charge for,
which is a commitment, rather than a delivery rate, which is a hostage.

**"Auto-captions."** Right now the captions feature finds the speech and lays
out correctly-timed boxes, and *you type the words*. Turning audio into text
needs the transcription server, which is not switched on. Video 12 says "one
click: finds the speech, styles it for TikTok, times it to the word", which
overstates it, and captions are a headline reason people try an editor.

- **Don't post video 12** until the transcription server is live.
- The pricing table now says "Captions, timed to the speech for you" and lists
  "Speech typed out for you (transcription)" as Building. Keep it that way.
- When the server goes live, re-render video 12 and post it as a *new feature*.
  "We just shipped the thing we said was coming" is a better post than the
  original would have been.

Everything else in the kit checks out against the app. The verifier
`verify-trust` now reads the public comparison table and the app's own
entitlement map and fails when they disagree, so this class of mistake gets
caught before it reaches a customer rather than after.

---

## 2. The one asset that does the most work

**The free version needs nothing.** No account, no email, no card, no download.
A stranger can go from a link to a working timeline in about five seconds.

That single fact is the answer to almost every objection, and it is checkable
instantly, which is what makes it different from a promise. So it goes first in
every context, phrased as an instruction rather than a boast:

> Open it and start cutting. It won't ask you for anything.

Not "free forever with no watermark!" — that is what every fake app says too.
The difference is that yours survives being tested, so **invite the test.** The
site now does this on the front page: the three claims are followed by "Sounds
too good? Check all three yourself in a minute", pointing at
`omnidx.net/studio/trust/`.

---

## 3. What to claim, and the exact words

**Safe, checkable, and strong:**

| Say | Because |
|---|---|
| "No account, no card, no download — the link opens an editor" | Verified in one click |
| "No watermark on any tier, including free" | Verified on the first export |
| "It works with your wifi off" | Verified in ten seconds, and proves the privacy claim |
| "One payment. There is no subscription at all." | Structurally true, no expiry |
| "Every update free, forever. No version 2." | A commitment, not a delivery rate |
| "340 effects, 107 transitions, 176 styles" | Counted from the code, on the pricing table |
| "14 days, no questions" | A policy you control |
| "Paid through Square — your card never touches me" | Real processor, real chargeback rights |
| "Here is everything it can't do: [link]" | Nobody fake writes this |

**Never say, no matter how well it would perform:**

- Any number of users, downloads, or creators you do not have. This is the
  single fastest way to get caught, because there is no version of it that is
  true later.
- Fake reviews, invented testimonials, or a star rating with no ratings behind
  it. The rating block on the site shows a real average or nothing — keep that
  property.
- "Was $49, now $19.99" when it was never $49. Fake anchoring is the most
  recognisable scam tell there is, and people screenshot it.
- Countdown timers, "launch week only", "3 people are viewing this".
- "Better than Premiere/Resolve." It is not, at everything, and one person
  saying "it can't even stabilise" makes the whole video look like a lie.
  Claim the true version: cheaper, faster to start, no subscription, and it
  does the specific things listed.
- "AI-powered" as a bare adjective. Say what the AI does — plans the cut from
  a sentence, on your device — or leave it out. In particular the audio repair
  is not AI and must not be sold as it: it is spectral subtraction, notch
  filters, de-clicking and RMS levelling. "Hum, hiss, clicks, level — gone in
  one pass" is true, is more specific, and survives "which model?".
- Anything about the transcription server until it is live.

**The framing that outperforms all of it:** you are not competing with Adobe.
You are competing with *a monthly bill somebody resents*. Aim every message at
the resentment, not at the feature list.

---

## 4. Where the attention actually comes from

Ranked by realistic return for a one-person launch, not by audience size.

### The honest post (highest return, lowest cost)

Communities reward the thing marketers won't do. Post the limitations, and the
product gets taken seriously.

- **Hacker News** — `Show HN: OmniDx Studio – a browser video editor you buy once`.
  First comment written before you post: what it is, what was hard (playback at
  60fps in a browser, effects on a phone, everything on-device), and what it
  cannot do yet, with the link to the trust page. HN punishes marketing and
  rewards candour; the "what it can't do" list is the reason the thread goes
  well. Post Tuesday–Thursday, 13:00–16:00 UTC. Answer every comment.
- **r/VideoEditing, r/editors** — lead with the question, not the product:
  "I built a browser editor with no subscription. Would love feedback from
  people who edit for a living — including what's missing." Read the self-promo
  rules first. Post the video natively.
- **r/SideProject, r/webdev, r/InternetIsBeautiful** — the technical angle:
  runs entirely in the browser, footage never uploads, works offline, one
  codebase for phone and desktop.

### The limitations page as content

`omnidx.net/studio/trust/` is itself postable. "Everything my video editor
can't do" is a title that gets clicked and shared by people who would scroll
past a feature list, and it converts better because the reader arrives already
believing you. Post it on its own, a week after launch.

### TikTok, Reels, Shorts

The videos, one a day, per the schedule in `PROMO-KIT.md`. Two changes
to that plan for credibility:

- **Reorder the first three.** Lead with 18 (free forever, no watermark), then
  01 (stop paying monthly), then 02 (the AI). Proof first, price second, magic
  third — if the magic lands first, the comments are "fake".
- **Pin the same comment on every one:** free version at omnidx.net, no
  watermark, no trial, ask me anything. Then actually answer, in the first hour.
- **Keep 22 in reserve.** It is the only one whose opening is a result rather
  than a claim — a tap, and the thing is gone — so it is the strongest single
  post in the set and the one to follow a hit with. It is last in the schedule
  on purpose: a trick posted before the proof reads as a trick.

Expect most videos to do nothing. That is normal and is not evidence anything
is wrong; the plan is twenty-odd attempts at one that works, and then more of
whatever that one was.

### Build in public

Post what you are building, including what broke. A "here's the bug I shipped
and how I fixed it" post is worth more trust than any polished feature demo,
and it is content you generate anyway by working. Use X and the subreddits.

### Where not to spend

Paid ads before you have organic proof — you will pay to send strangers to a
page they have no reason to trust. Influencer gifting before you have anyone
saying it is good. Product Hunt before the transcription server is live; you
get one launch, spend it when the product is at its strongest.

---

## 5. When somebody calls it a scam

They will, and it is not personal — it is the correct default for an unknown
app asking for money. How you answer is read by the hundred people who see the
thread and never comment.

**The rules:** answer within the hour, in public, never defensively, never with
marketing copy, and never argue. Agree with the suspicion first, then hand them
a test.

Replies that work:

> "Fair — you have no reason to trust a link. You don't need to: the free
> version doesn't ask for an account, an email or a card. Open it, cut
> something, export it. If it's rubbish you've lost two minutes and I've lost
> nothing."

> "Reasonable question. It's one person, not a company, and I say so on the
> site. Payment goes through Square so your card never touches me and you can
> charge it back. 14-day refund, no questions."

> "Here's the page listing everything it can't do: omnidx.net/studio/trust/ —
> including that captions don't type the words for you yet. I'd rather you know
> before you pay than after."

**When the criticism is right:** say so, immediately and specifically. "You're
right, it doesn't do that yet" costs nothing and buys more credibility than any
amount of arguing. Then fix it if it is fixable and reply again when you have.

**When it is an accusation you can disprove:** disprove it with an instruction,
not an assertion. "Turn your wifi off and keep editing" beats "we don't upload
your footage" every time.

**Never:** delete critical comments, argue about tone, reply from a second
account, or say "trust me". Deleting is the one move that converts a sceptic
into someone who warns other people about you.

---

## 6. The first 30 days

| Days | Do |
|---|---|
| Before day 1 | Fix the two claims in §1. Pin the trust page in the site menu (done). Have the free version open in a tab and check it cold on a phone you have never used it on. |
| 1–3 | TikTok/Reels/Shorts in the reordered order. Reply to everything. No paid anything. |
| 4 | Reddit: r/VideoEditing, with the feedback framing. |
| 5–7 | Keep posting one video a day. Post the first "here's what I fixed this week" note. |
| 8 | Show HN, with the pre-written first comment. Clear your day for replies. |
| 9–20 | One video a day. Answer every comment. Ship the things people asked for and say that you did. |
| ~14 | Post the trust page on its own as "everything my editor can't do". |
| 21+ | If transcription is live: re-render and post video 12, and launch on Product Hunt. If it is not, keep shipping and hold the launch. |

**The metric that matters** is not views. It is *people who opened the editor*,
and then *people who came back a second day*. A video with 200k views and no
opens means the hook worked and the offer didn't; a video with 4k views and 300
opens is the one to make five more of.

---

## 7. The checklist, before every post

Read this before anything goes out. If any answer is no, do not post it.

- [ ] Every number in it is one I can point at in the app or the pricing table.
- [ ] No user count, download count, revenue figure or review I do not have.
- [ ] No price I never charged shown as a discount.
- [ ] No urgency I invented.
- [ ] The free version is mentioned, and mentioned before the price.
- [ ] Nothing claims a feature that is marked Building.
- [ ] A sceptic who clicks through can check the main claim in under a minute.
- [ ] If somebody replies "prove it", I have a reply that is an instruction.

---

## 7b. When you have posted and nothing is happening

The first version of this kit assumed the problem would be credibility. On a
new account it is usually distribution, and the two have different fixes. Work
down this list in order — the first three cost nothing and are where the
answer almost always is.

**First, find out which failure it is.** Open each post's analytics and read
the view count, not the feeling:

| What you see | What it means | What to do |
|---|---|---|
| 0–20 views | Not distribution — a block. New account posting the same link in every caption, or a flagged video. | Take the URL out of the captions for a fortnight. Put it in the bio only. Post three videos with no link, no price and no "link in bio". |
| 100–400 views, every time | Normal cold start. The algorithm showed it to a test batch and they scrolled. | The hook is the problem, not the reach. Everything below. |
| One video at 2k, the rest at 200 | The format works and the rest do not. | Make four more of whatever that one was. Nothing else matters until you have. |
| Good views, no clicks | Distribution is fine, the offer is not landing. | Pin a comment with the link. Say the price out loud in the video. |

**Then the three things that actually move it.**

1. **The first second cannot look like an advert.** A title card on a gradient
   with a logo in the corner is the single most reliable way to be scrolled
   past, because the feed has been trained on a decade of them. Open on the
   thing happening instead — a finger landing on an object that then vanishes,
   a waveform going from filthy to clean, a timeline snapping to a beat. The
   claim can come at second four, once somebody is already watching.
2. **Post more of them, sooner.** One a day is a schedule for an account that
   already has an audience. A cold account is running an experiment and needs
   samples: three or four a day for a fortnight, then keep whichever shape
   worked. Reposting the same video after a week is normal and works.
3. **Go where the subject already is.** "Video editing" is not a community;
   phonk edits, AMVs, velocity edits, gym edits and podcast clipping are. A
   video about the thing one of those rooms does all day gets watched by
   people who need the tool. A video about "a video editor" gets watched by
   nobody.

**Then the things that compound.**

- **Reply to comments with a video.** It is a native format, it starts with a
  real question on screen, and it does not read as an advert. The `c1`–`c3`
  videos in the kit are built as this shape; swap the invented question for a
  real one the moment you get one.
- **Answer every comment in the first hour, including the rude ones.** Replies
  are a ranking signal and they are the only free one.
- **Say the address out loud, once, near the end.** People do not read
  watermarks; they hear a name and search it.
- **Stop optimising hashtags.** They have not decided TikTok distribution for
  years — the video itself does. Five relevant ones so the post is filed
  correctly, then forget them.

**What will not fix it:** posting at a different time of day, more hashtags,
buying views, deleting and reposting the same video hoping for a better roll,
or making the videos glossier. Every one of those is a way of avoiding the
first item on the list.

## 8. The thing that actually decides it

None of this makes an app spread. The videos, the posts and the honest page get
you looked at; whether people stay is decided by whether the editor is good on
the first try, on the phone of somebody who has never heard of you, on a bad
connection.

So the highest-leverage promotional work available is not in this document. It
is: open the app cold on a device you never develop on, import something real,
try to finish an edit, and fix whatever made you sigh. Every hour spent on that
is worth more than an hour spent on captions for a video.
