# What else is worth building

Written for one situation: you can build a working tool, you have no ad budget,
and TikTok is your distribution.

---

## Read this before the list

**A second product with no audience earns exactly what the first one earns with
no audience.** Ten sales of OmniDx is $190. Ten sales of OmniDx plus ten of
something else is $380 — and you did twice the work for it. The number that
actually moves money right now is reach, not product count.

So the honest ranking of what to do next is:

1. Post OmniDx videos until you have data on what lands. A hundred posts, not four.
2. Build the *next thing* only when something tells you to — a comment section
   full of the same question, a video that outperforms the rest by 10x.
3. Everything below is for step 2.

The one exception: if a build takes a weekend and reuses what you already have,
it can be worth doing early purely because it gives you more to post about.

---

## The test an idea has to pass

Score an idea out of 5. Anything under 4 is a hobby, not income.

1. **Does the problem cost real money?** People pay to avoid a $150 repair bill.
   Nobody pays to avoid mild inconvenience.
2. **Are people already searching for it?** You cannot create demand with no
   budget. You can only intercept it. If they are already typing the error code
   into Google, you win. If you have to explain why they need it, you lose.
3. **Can you film the moment it works?** TikTok needs a visible before-and-after.
   A screen that says "PASSED" is not a moment. A code turning into "this $4 part
   is your problem" is.
4. **Is the knowledge scarce and the tool cheap?** The value has to sit in what
   you know, not in hardware you'd have to buy or manufacture.
5. **Can a browser do all of it?** The moment you need an app store you have added
   $99/yr, a review process, and two platforms to maintain.

OmniDx scores 5/5, which is why it was worth building.

---

## The shortlist

### 1. Appliance error codes — washer, dryer, fridge, dishwasher, oven

**Score: 5/5. Build this one.**

Every appliance throws a cryptic code. LG shows `OE`. Samsung shows `4C`.
Whirlpool shows `F8 E1`. All three mean roughly "not draining," and all three are
usually a blocked filter or a $12 pump — but the search results are ad farms and
ten-year-old forum posts, so people book a $150 call-out instead.

- **Why the demand is real:** the person searching is standing in front of a
  machine full of water. That is as motivated as a customer gets.
- **Who else is doing it:** almost nobody, properly. There are content sites
  covered in ads and a couple of repair-shop lead-gen pages. No clean tool.
- **What you'd build:** the code lookup you already wrote, pointed at a different
  database. Brand picker, code, what it means, most likely cause, cheapest fix
  first, part cost. **No hardware at all** — which removes the single biggest
  drop-off point OmniDx has.
- **The hook:** "Your washer isn't broken. Type this code in." Film the filter
  coming out full of coins and hair. That video makes itself.
- **Effort:** a weekend for the shell, then weeks of patiently entering codes.
  The database *is* the product; do not rush it.
- **What would kill it:** getting codes wrong. Brands reuse letters with different
  meanings across model years. Cite the brand and be explicit when you are
  unsure, exactly like the "educated guess" framing already in OmniDx.

### 2. Used-car pre-purchase inspection

**Score: 5/5. And it is an OmniDx feature, not a separate product.**

Someone about to hand over $9,000 for a used car will happily pay $19 to not be
robbed. They are the least price-sensitive customer you will ever meet.

- **What you'd build:** a guided walkthrough — what to look at, in order, with a
  photo prompt at each step — that ends by running the OBD scan you already have,
  checking for recently-cleared codes and incomplete readiness monitors. That
  combination is the actual tell that a seller cleared the check-engine light in
  the car park before you arrived.
- **The hook:** "He cleared the codes ten minutes before I got there. Here's how
  the app caught it." That is the strongest car video available to you, because
  it is a scam being caught on camera.
- **Effort:** low. Mostly new screens over existing machinery.
- **Why it matters commercially:** it justifies a higher price for Pro, and it
  gives dealerships and flippers a reason to buy — a different customer than the
  one fixing their own car.

### 3. Move-out inspection and deposit defence

**Score: 4/5.**

Renters lose deposits because they cannot prove what a place looked like when
they moved in. A guided, timestamped, room-by-room photo walkthrough that
produces one PDF is a genuinely valuable artefact, and the same walkthrough run
on move-out gives a side-by-side.

- **Why the demand is real:** deposits are $1,000–$3,000, and losing one is a
  story people already tell online constantly.
- **Who else is doing it:** landlord-side tools exist. Renter-side is thin.
- **The hook:** "How I got my entire deposit back." Proven format, huge audience.
- **Effort:** medium. Photos are the problem — they are large, and a browser's
  local storage is not the place for a hundred of them. You would need real
  storage, which means a running cost and an account system. That is a genuine
  step up in complexity from anything you have built so far.
- **What would kill it:** the storage bill arriving before the revenue does.

### 4. Furnace and boiler blink codes

**Score: 4/5.**

Furnaces report faults by flashing an LED a certain number of times. It is the
same shape of problem as appliance codes — a lookup nobody has made clean — with
the advantage that it is desperately urgent in winter.

- **Effort:** low, same architecture again.
- **Smaller audience** than appliances, and seasonal. Best as a section inside the
  appliance tool rather than its own product.
- **Be careful:** gas. Anything touching a gas appliance needs an unambiguous
  "stop and call someone licensed" for the failure modes that warrant it. Write
  those first, before the money-saving advice.

### 5. Small engines — mowers, generators, pressure washers, snowblowers

**Score: 3/5.**

Real demand, genuinely low competition, and the fixes are satisfying (it is
almost always the carburettor or old fuel). But most small engines have no
electronics to read, so the product is a decision tree rather than a scanner,
and a decision tree is much easier for a competitor to copy.

Worth it as content even if you never build it — "your generator isn't dead"
videos perform, and they can point at OmniDx.

---

## What to skip, and why

- **Anything needing live pricing data** (resale checkers, deal finders). You
  become dependent on a data source that can cut you off, and the category is
  saturated.
- **Pet or human symptom checkers.** Liability, and you would deserve it.
- **Home electrical diagnosis beyond "call an electrician".** Same reason. Note
  that OmniDx already draws this line — it tells people to stop driving on an
  overheating engine rather than guessing.
- **Anything that is a thin wrapper on someone else's model.** Zero moat, and the
  cost per user goes up as you grow instead of down.
- **Dropshipping and faceless content farms.** Different business, no compounding
  asset at the end of it, and the competition is people with ad budgets.

---

## Checking demand before you build

Twenty minutes of this beats a month of guessing.

1. **Search autocomplete.** Type `lg washer oe` into Google and TikTok and read
   the suggestions. Those are real queries, ranked by volume.
2. **Read the comments on other people's videos.** Not the video — the comments.
   The same question asked forty times is a product.
3. **Reddit and brand forums.** Search the error code. Count how many threads end
   with someone saying they called a repair company.
4. **Check what the ads look like.** If every result is a repair company paying
   for that keyword, the problem is expensive enough that somebody is already
   spending money on it. That is a good sign, not a bad one.
5. **Post the video before you build the thing.** Make one video for the idea
   using the videos you already know how to make. If it does nothing across three
   attempts, that is a cheap answer.
