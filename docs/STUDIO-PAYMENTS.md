# Getting paid for OmniDx Studio, with the money landing in Cash App

You asked for: **anyone can pay with any method, and it ends up in your Cash
App.** That is achievable, and this is exactly how. It is worth reading the
whole thing once, because the difference between the routes is money and
whether your account survives contact with volume.

**Short version:** take payments with **Square**, set your payout destination
to **Cash App**, and add **Stripe** as a second checkout for the methods Square
doesn't carry. Never advertise a bare `cash.app/$cashtag` link as your only
option.

> **In a hurry?** [SQUARE-SETUP.md](SQUARE-SETUP.md) is the same thing as a
> ten-minute checklist with a direct link for every step. Start there; come
> back here for fees, refunds, tax and the second processor.
>
> **Note on subscriptions:** OmniDx no longer sells any. Every edition is a
> single payment, so create "Accept a payment" links, never subscriptions.

---

## The thing that makes this work

Cash App gives every account a real **account number and routing number**
(Cash App → Money → Direct Deposit). To a payment processor those numbers look
like any other bank account. So anything that can pay out to a bank account can
pay out to Cash App.

That single fact is what lets someone pay you with a Visa, an Apple Pay tap, a
PayPal balance or Klarna instalments and have it arrive in the same place.

---

## Route A — Square (recommended, and the one to set up first)

Square and Cash App are the same company (Block). This is the shortest path
between a stranger's credit card and your Cash App balance, and it is the only
one where the payout is *native* rather than a bank transfer that might bounce.

1. Create a free Square account at squareup.com.
2. **Payment Links → Create** → one link per edition:
   - Creator — $19.99
   - Studio — $39.99
   - Team — $69.99 (three people, one licence)
3. Square Dashboard → **Balance → Settings → Linked accounts** → choose **Cash
   App** as the destination. Block owns both, so this is a menu choice, not a
   bank transfer.
4. Paste the links into `studio/assets/config.js`:

```js
  checkout: {
    creator: 'https://square.link/u/XXXXXXXX',
    studio: 'https://square.link/u/YYYYYYYY',
    team: 'https://square.link/u/ZZZZZZZZ',
  },
```

Every buy button on the site and in the app switches over the moment you save
that file. Nothing else to change.

**What Square takes:** 2.9% + 30¢ on an online payment link. On a $39.99 sale
that is $1.46, and you keep $38.53.

**What you get that a Cash App link doesn't give you:** credit cards at no
charge to the buyer, Apple Pay, Google Pay, Cash App Pay, a receipt sent
automatically, the buyer's email address, an order record you can refund with
one click, and — the one that matters most — a **business** payment rather than
a personal transfer.

---

## Route B — Stripe, for everything Square doesn't take

Square does not carry PayPal or Klarna. Stripe does. Running both is normal and
costs nothing extra; each edition just gets a second link.

1. Create a Stripe account, then **Payment Links** for the same two prices.
2. In the link's settings turn on every method you want: **Card, Apple Pay,
   Google Pay, Link, Cash App Pay, Klarna, Affirm**, and **PayPal** where
   Stripe offers it in your country.
3. Stripe → **Settings → Bank accounts and scheduling** → add your **Cash App
   account and routing numbers** as the payout destination.
4. Put those links in the same `checkout` block, or use the `paypal` block for
   a PayPal-specific one.

**What Stripe takes:** 2.9% + 30¢, same ballpark.

**The one warning that matters:** some processors reject payouts to fintech
routing numbers. Stripe usually accepts Cash App's; sometimes it doesn't.
**Test it before you rely on it** — see the checklist below. If Stripe refuses,
point Stripe at an ordinary bank account and pull the money into Cash App from
there (Cash App can pull from a linked bank for free, it just takes 1-3 days).

---

## Route C — the bare Cash App link (the fallback, not the plan)

`cash.app/$Ahmirp1961` is what the app uses when nothing else is configured.
It works with zero setup and takes nothing in fees. It is also where most
first-time sellers get stuck, so be clear-eyed about what it costs you:

| | Cash App link | Square / Stripe checkout |
|---|---|---|
| Credit cards | Buyer pays 3% extra, so most won't | Included, free to the buyer |
| Apple Pay / Google Pay | No | Yes |
| PayPal | No | Yes (Stripe) |
| Buy now, pay later | No | Yes (Klarna) |
| Buyer's email captured | Only if they type it in the note | Always |
| Receipt | No | Sent automatically |
| Order record | None — a name and an amount | Full, searchable, refundable |
| Fee | 0% personal / 2.75% business | ~2.9% + 30¢ |
| Chargeback risk | Effectively none | Normal card rules apply |
| Doing business on it | Against the personal-account terms | What it's for |

That last row is the one that bites people. Cash App's terms distinguish
personal from business use, and personal accounts taking regular commercial
payments **get limited or frozen**. If you are going to take payments on Cash
App directly, switch to a **Cash App for Business** account first (Settings,
one minute, 2.75% per payment). It is the difference between a side income and
a locked account with your money inside it.

---

## PayPal specifically

You asked whether someone can pay with PayPal and have it reach Cash App.
Three ways, best first:

1. **Stripe checkout with PayPal enabled.** The buyer taps PayPal, Stripe
   settles it, Stripe pays out to your Cash App numbers. The buyer never knows
   there was a hop and you never touch PayPal's dashboard. **This is the one
   to use.**
2. **A PayPal payment link of your own**, then move the balance out. PayPal →
   Withdraw → to a linked bank. You *can* add Cash App's routing and account
   numbers there, and it often works; PayPal is also stricter than most about
   fintech accounts and may reject or later reverse it. Have a real bank
   account as the backstop.
3. **PayPal Payouts / mass pay.** Overkill for selling software. Ignore it.

There is no service that automatically forwards PayPal money into Cash App, and
anything advertising itself as one should be treated as a scam. The hop is
either done by your payment processor (route 1) or by you (route 2).

---

## Delivering what they bought

Two ways, depending on whether you've deployed the Worker in `server/`.

**With the Worker** (recommended once you have any volume): Stripe fires a
`checkout.session.completed` webhook, the Worker mints a licence key, writes it
down, and emails it. Nobody waits on you. Point the webhook at
`https://your-worker.workers.dev/v1/webhooks/stripe` and set the signing secret:

```
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Which edition a payment unlocks is decided by the **amount**, so a discount code
or a new price can't accidentally hand out the wrong tier.

**Without the Worker** — perfectly fine for the first dozen sales:

```
python3 tools/make-studio-key.py --edition studio
python3 tools/make-studio-key.py --edition creator --count 5
```

Email the key. It looks like `OMNIDX-STU-4WSC-R4E8-2DLY` and unlocks every
device that person signs in on. **Keep your own list of who got which key** —
without the Worker there is no record anywhere.

To check a key someone sends you:

```
python3 tools/make-studio-key.py --check OMNIDX-STU-4WSC-R4E8-2DLY
```

---

## What the licence check actually stops

Being honest about this, because the alternative is pretending:

The app validates a key **on the buyer's machine**. Anyone who opens dev tools
can switch that off, and no purely client-side check can prevent it. What the
check does stop is a typo, a guess, and a key passed casually round a group
chat — which is the overwhelming majority of what happens in practice.

Deploying the Worker makes it a real server-side check tied to an account and a
device limit. Even then, someone determined will get around it. Every editor
ever made has been cracked; the ones that make money make it easy and fair to
pay, and that is the lever worth pulling. The refund promise, the one-time
price and the absence of a watermark do more for revenue than any lock would.

---

## Before you take a single real payment

- [ ] Open your checkout link on a **phone you're not signed in on**. If it
      doesn't load, buyers can't buy.
- [ ] Buy your own product for **$1** with a test price. Real card, real money.
- [ ] Confirm the money **actually arrives in Cash App**, not just that the
      processor says "paid". This is the step people skip, and it is the one
      that fails.
- [ ] Refund that $1 from the processor's dashboard and confirm the refund
      lands too.
- [ ] Send yourself the licence key by the route a buyer would get it, and
      redeem it in the app on a device that has never seen it.
- [ ] Check the cashtag in `studio/assets/config.js` opens **your** account.
      A typo sends your customers' money to a stranger and there is no getting
      it back.

Do all six. The whole business is one broken link away from making nothing.

---

## Taxes, briefly

Money from selling software is income. Square and Stripe both issue a 1099-K in
the US once you cross the reporting threshold, and both will ask for a tax ID.
Cash App for Business does too. Set aside something for it from the first sale
rather than discovering the number in April.
