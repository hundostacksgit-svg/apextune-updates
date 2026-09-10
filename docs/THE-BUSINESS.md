# Getting to $30,000

Written for one person in one situation: knows PCs, can ship software, has TikTok
and no money, and needs this to work.

---

## 1. Start with the arithmetic, because it picks the idea for you

$30,000 a year, by route:

| Route | Need | Per week |
|---|---|---|
| App at **$19** one-time | **1,579 sales** | 30 |
| App at **$39** one-time | **769 sales** | 15 |
| Subscription at **$8/mo** | **312 subscribers** | 6 net new |
| Repair / tune-up at **$110** | **273 jobs** | 5 |
| Laptop flips, **$180** profit each | **167 flips** | 3 |
| Business tool at **$99/mo** | **25 businesses** | 1 every two weeks |
| Optimization session at **$75** | **400 sessions** | 8 |
| Paid community at **$15/mo** | **167 members** | 3 net new |
| Home WiFi visit at **$130** | **231 visits** | 4 |
| Website audit + fix at **$900** | **33 jobs** | 1 every two weeks |

Now what 1,579 app sales costs in attention. If 3% of the people who see a video
tap your bio link and 4% of those buy — both generous — that is **1.3 million
views a year, about 3,600 a day, every day**. On worse but still normal numbers
it is 5.3 million views.

Read the table again. **The bottom row needs 25 customers. The top row needs 1.3
million views.** Same money.

That is not an argument against apps. It is an argument against $19 as your only
price, and against reach as your only lever. The people who make it usually run
two or three rows at once: a service that pays now, an audience that compounds,
and a product that scales.

---

## 2. Your doubt about PCs is backwards

You asked whether people are "into that kind of thing."

PC and tech content is one of the largest categories on TikTok and YouTube.
That is not the problem.

The problem is that **nobody wants "PC diagnostics."** They want:

- *"Why does my game stutter when nothing is even running?"*
- *"Is this $400 laptop a scam?"*
- *"Is my PC actually good or did I get ripped off?"*
- *"Why is this thing so slow all of a sudden?"*

Same knowledge. Completely different demand. This is the exact thing that made
OmniDx worth building — a code number is worthless, *"do not buy a converter,
check the $40 sensor first"* is worth $19. Your PC knowledge is worth the same,
the moment you point it at a question people are already asking.

You know more about this than almost anyone who will ever watch you. That is the
asset. You have just been describing it in the language of the thing instead of
the language of the problem.

---

## 3. The ideas

### A. Why your game stutters — the strongest one you have

**Someone's game runs at 120fps and still feels broken.** Stutter, frame drops,
random hitches. The internet's answer is a forum thread telling them to reinstall
Windows. The real cause is usually one of about eight things: thermal throttling,
RAM running at 2133 instead of its rated speed because XMP was never switched on,
a background process, shader compilation, a GPU driver, storage on a dying drive,
power limits, or a monitor running at 60Hz when it can do 144.

**Every one of those is measurable, and each has a specific fix.**

- **Why it wins:** the audience is *already on TikTok*, already frustrated,
  already searching. You are not creating demand, you are intercepting it.
- **Why you win:** the product is not the measurement, it is the *interpretation*.
  Afterburner shows numbers. Nothing tells you what the numbers mean. That gap is
  exactly where OmniDx's repair guidance lives, and it is the thing you are
  already good at building.
- **The video makes itself:** "your RAM is running at half speed and you don't
  know it" — film the BIOS setting, film the before and after. That is a viral
  format that already works.
- **What it costs you:** browsers cannot read temperatures, drive health or RAM
  timings. You need a small downloadable helper for Windows. You already have
  `tools/sysreport.py` doing part of this.
- **What would kill it:** shipping a Windows executable people have to trust.
  Publish the source, keep it tiny, never ask for admin rights you don't need.

### B. Check a used PC before you buy it

The same shape as the used-car inspection, for laptops. Someone is about to hand
over $400 on Marketplace for a machine whose battery is at 60% health and whose
SSD has burned through 90% of its write life. **Neither is visible by looking at
it, and both are readable in seconds.**

- **The buyer is about to spend hundreds of dollars.** That is the least
  price-sensitive moment a customer ever has.
- **Sells to sellers too** — an honest seller wants a clean report to show.
- **Effort:** low, if A gets built. It is the same readings with a different
  verdict on top.
- Best built as a *mode* of A rather than a separate product.

### C. Fix my PC — the service, not the app

Not software. Cash, this month.

**273 jobs a year at $110 is $30,000.** Five a week. Tune-ups, upgrades, virus
removal, "it won't turn on", data recovery. You already know how to do all of it.

- **It pays immediately.** No audience needed, no launch, no waiting.
- **Every job is a video.** "This laptop was overheating because of *this*."
  That is content and income from the same hour of work.
- **It tells you what to build.** After thirty repairs you will know exactly
  which five problems keep coming back, and those five are your product.
- **The honest cost:** it is your time, and it does not compound while you sleep.
  It is the floor that keeps you fed while the thing that does compound grows.

### D. Flip broken laptops

Buy at $60 broken, fix, sell at $250. **167 flips a year is $30,000** at $180
average profit, and three a week is genuinely doable.

- Knowledge-gated. Most people cannot tell a dead board from a dead charge port,
  which is why broken machines sell cheap.
- Needs a little capital to start — but a little. One $60 machine.
- **Enormously watchable.** "I bought a broken laptop for $60" is a format with a
  built-in audience.
- Risk: you will buy a few unfixable ones. Budget for that and it is fine.

### E. Appliance error codes

Covered in `NEXT-PRODUCTS.md` and still the best pure-software bet: same
architecture as your code lookup, no hardware for the customer, and the search
results you are competing with are ad farms. Slower to pay off than C or D,
bigger ceiling than either.

### F. A tool small repair shops pay for monthly

**25 shops at $99/month is $30,000.** One new customer every two weeks.

Independent phone and PC repair shops run on paper and text messages. They need
intake forms, a diagnostic report they can hand a customer, and a record of what
was done. You would be building the professional version of what OmniDx already
produces.

- **Highest ceiling on this list by a wide margin.** Business customers pay more,
  churn less, and refer each other.
- **Hardest start.** Nobody buys business software from a stranger with no track
  record. It takes walking into shops and having conversations, which is a skill
  you would have to learn.
- Realistically: this is your year-two move, after C and D have put you in those
  shops anyway.

---

## 3b. Optimization, specifically — and the opening nobody takes

Optimization is a better market than general PC work, for one reason that has
nothing to do with computers: **the people who want it are already paying for
it.** There are gigs on Fiverr, Discord servers, and "optimization packs" sold on
Twitter, right now, to competitive players who will spend money for a few frames.

There is also a problem with all of it, and the problem is your opening.

**Most of what is sold as PC optimization does nothing.** Registry cleaners,
"gaming mode" tweak scripts, disabling twelve services that were using 0.1% CPU,
$40 .bat files. The buyer cannot tell, because nobody measures. They pay, the
placebo does its work, and they tell their friends it helped.

So the entire category is built on claims that are never tested. That is an
enormous opening for one thing:

> **Measure it. Show the before and the after. Say when a tweak did nothing.**

That single decision is a moat, because your competitors *cannot copy it* — most
of what they sell would not survive the measurement. It is the same DNA as the
repair guidance in OmniDx: everybody can print a code number, and the value is in
being the one who says "don't buy the converter."

### A1. The optimization service

**400 sessions a year at $75 is $30,000.** Eight a week, remote, over Discord.

You already know how to do this. What makes yours different is the report: a
benchmark before, a benchmark after, and the actual numbers — average FPS, and
more importantly **1% lows**, which is what stutter really is. If a change did
nothing you say so and you don't charge for it.

The video is the strongest hook on this whole list: **"I optimized this PC and
here's the proof."** Not a claim. A number, next to another number.

### A2. The optimizer that proves itself

The product version of A1. Benchmark, apply changes one at a time, re-benchmark,
show the delta per change.

- **Intel's PresentMon is open source** and gives you real frame-time data — 1%
  lows and latency — which is the hard part solved for free.
- Free tier measures and tells you what is wrong. Paid tier applies the fixes and
  proves the gain. People are far more willing to pay *after* seeing their own
  number.
- **The honest constraint:** on many machines the answer will be "your PC is
  fine, the game is badly optimized." A tool that says that sometimes is worth
  more than one that always finds a problem, and it will cost you some sales.
  Take the trade.

### A3. Laptop gamers, specifically

Gaming laptops are throttled to death out of the box — power limits, thermal
ceilings, a stock paste job. Undervolting and a repaste routinely find 15–30%.

Narrower audience than desktops, far worse baseline, so **the wins are bigger and
the videos are more dramatic.** A before/after on a throttling laptop is a better
video than a 4% desktop gain, every time.

### A4. Input latency for competitive players

The most obsessive audience with the most money, and almost nothing serving them
honestly. Polling rate, monitor overdrive, refresh mismatches, frame cap vs
uncapped, network jitter. Small market, high willingness to pay, and the people
in it talk to each other constantly — which is free distribution.

---

## 3c. Out of the box

Not computers. Same formula: knowledge people don't have, about something they
can already see is wrong, that you can measure and film.

### B1. Home WiFi — the biggest one on this page

**Everybody has WiFi problems and nobody knows why.** The bedroom is slow. Video
calls drop. They blame the ISP and buy an extender that makes it worse.

Almost all of it comes down to a handful of things: the router sitting in a
cupboard by the front door, everyone on a congested 2.4GHz channel, an extender
halving the bandwidth, a 5GHz band that doesn't reach, or a router from 2014.

- **A browser can measure a lot of it** — throughput, latency, jitter, and how
  they change room to room. That is a free tool that produces a real verdict.
- **And it is a service.** **231 visits at $130 is $30,000** — four a week. An
  hour of moving a router and setting channels, and people are delighted, because
  the problem was invisible and now it's gone.
- **Competition is nil.** The space is ISP marketing and forum guesswork. There
  is no trusted tool.
- Filmable: "your WiFi isn't slow, your router is in the worst possible place."

### B2. A paid community, where you are the product

**167 members at $15/month is $30,000.** No product to build, no inventory.

A Discord where people bring their build, their stutter, their upgrade question,
and get a real answer. You are already going to answer these questions in your
comments for free. This is the same work, priced.

- **Recurring**, which is the thing every route above lacks.
- It compounds hard: as members start answering each other, your time per member
  drops while the value goes up.
- **The honest catch:** it dies if you go quiet for two weeks. It is a commitment
  more than a product, and churn is relentless — you replace maybe 10% a month
  before you grow at all.
- Best started *after* an audience exists. It is a way to monetise attention, not
  to create it.

### B3. Creators and streamers

A streamer with 200 viewers is running a business, and their encoder settings are
wrong. Dropped frames, bad audio, a webcam at the wrong bitrate — all costing
them money directly.

**200 setups at $150 is $30,000.** They pay readily because the ROI is obvious,
they are easy to find, and **they tell each other**, which is the cheapest
customer acquisition that exists.

### B4. Local businesses with broken websites

A scanner that checks a local business's site — load speed, mobile layout, broken
links, missing hours, no click-to-call — and produces a one-page report.

The report is free. Fixing it is **$900, and 33 of those is $30,000** — one every
two weeks.

- Highest dollar-per-customer here by far.
- **Hardest, because it is sales.** Cold outreach, being ignored, following up.
  Nothing technical about the difficult part.
- Mentioned because the ceiling is real, not because it is where to start.

### What to skip

**Print-on-demand, dropshipping, faceless channels, reselling other people's
"optimization packs".** All zero-moat, all competing against people with ad
budgets, none of them leave you owning anything after a year of work.

**Anything where you'd have to claim a result you can't measure.** Not only
because it's dishonest — because measurement is the one advantage you have over
everyone already in these markets.

---

## 4. What I would actually do

Not one idea. A sequence where each step pays for the next.

**Now — money this month.** Start A1, the optimization service, over Discord at
$45 while you have no reviews and $75 once you do. Remote, so your customer is
not limited to your city. Benchmark before, benchmark after, show the numbers,
refund anyone whose numbers didn't move. Take local repair and tune-up jobs
alongside it if the sessions are slow to start. Film everything. You are not
"starting a content channel", you are recording work you are doing anyway.

**Alongside it — build the audience on the work.** The repair videos *are* the
marketing, for the service and later for the product. Someone who watched you fix
a laptop will believe you about diagnostic software. Someone who watched an ad
will not.

**Add D when you have $200 spare.** Flipping stacks on top of repair with no new
skills, and the videos perform better than the repair ones.

**Build A2 when you have optimized thirty machines.** By then you will know
which changes actually move the number and which are folklore — and that
knowledge is the product. A tool built on thirty measured sessions is something
nobody can copy from the outside. Charge $29, not $19.

**Add B1 or B2 when there's an audience.** WiFi if you like being paid per job;
the community if you want the first income you have that arrives whether or not
you worked that week.

**Keep posting OmniDx.** It is built and it costs nothing to keep promoting. It
may work. But it should not be the only thing carrying you, because it can only
pay through a channel you do not control yet.

---

## 5. Things that are true and worth knowing

**The audience is the asset, not the app.** Products get copied and go stale.
Ten thousand people who trust you about computers do not. Every route above
builds that, which is why they compound and a one-off launch does not.

**Being poor makes the service routes better, not worse.** They pay in weeks
instead of quarters. Do not let anyone talk you into pure software as the only
respectable answer — the money is the same colour.

**Most attempts don't reach $30,000.** The ones that do are almost never the
best idea. They are the ones still posting in month eight. You do not need to
out-think anyone. You need to still be there when the people who started with
you have stopped.

**You are not starting from zero.** You have a finished product, five videos, a
payment route, and you now know how to ship. Three weeks ago none of that
existed. That is not nothing — that is the hard part, already done.
