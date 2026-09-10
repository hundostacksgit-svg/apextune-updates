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

## 4. What I would actually do

Not one idea. A sequence where each step pays for the next.

**Now — money this month.** Start C. Post on Marketplace, Craigslist, local
Facebook groups: PC repair and tune-ups, $80–150. Film every job. You are not
"starting a content channel", you are recording work you are doing anyway.

**Alongside it — build the audience on the work.** The repair videos *are* the
marketing, for the service and later for the product. Someone who watched you fix
a laptop will believe you about diagnostic software. Someone who watched an ad
will not.

**Add D when you have $200 spare.** Flipping stacks on top of repair with no new
skills, and the videos perform better than the repair ones.

**Build A when you have watched thirty machines.** By then you will know exactly
which problems repeat, which is the difference between a product people need and
a product you assumed they needed. Charge $29, not $19.

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
