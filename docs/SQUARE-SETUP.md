# Take money for OmniDx Studio — the ten-minute version

This is the short one. Follow it top to bottom and people can buy the app and
the money lands in your Cash App. Every link goes straight to the page you
need, so you are never hunting through a menu.

If you want the reasoning, the fees compared, refunds, tax, and the backup
processor, that is all in [STUDIO-PAYMENTS.md](STUDIO-PAYMENTS.md). You do not
need it to get paid. You need this page.

**Why Square:** Square and Cash App are the same company (Block). So Square is
the only processor that can pay you out to Cash App as a menu choice rather
than a bank transfer that might bounce.

---

## If a Square page just loads forever

That is Square, not you. Work down this list — it is ordered by how often each
one turns out to be the answer.

**First, find out how broad the problem is.** Open
<https://app.squareup.com/dashboard> on its own. Does the main dashboard
appear, or does that spin too? If the *main dashboard* spins, it is causes 1-3
below. If the main dashboard is fine and only certain pages hang, it is 4 or 5.

1. **You are on a phone.** This is the usual answer. Tapping an
   `app.squareup.com` link on a phone with the Square app installed hands the
   link to the app, the app has no screen for that address, and you get a
   spinner that never resolves. **Fix:** do this on a computer. Square's own
   activation instructions say the same thing.
2. **Your account is not activated yet.** A signed-up-but-unverified account
   can sign in and then stall, and Payment Links do not work until activation
   finishes. **Fix:** on a computer, sign in and look for **Verify identity**
   or **Activate your account** — expect to give your legal name, address, date
   of birth, and the last 4 of your SSN (or an EIN). Payment Links appear once
   that clears.
3. **Something is blocking Square's scripts.** An ad blocker, a privacy
   browser, or strict tracking protection will leave the page frame up with
   nothing in it. **Fix:** try a normal Chrome window with extensions off, or a
   private window.
4. **The URL has moved.** Square changes these paths and renames these menus
   between account types. A dead deep link shows a spinner, not a 404, so it
   looks like loading when there is no page. **Fix:** start at
   <https://app.squareup.com/dashboard> and use the menu path at each step.
5. **You are not signed in on that browser.** The deep link bounces to a login
   and sometimes stalls there. **Fix:** sign in at the dashboard first, then
   navigate by menu.

Every step below gives the **menu path first** and the direct link second, for
exactly this reason.

If the main dashboard still will not load on a computer with extensions off,
the problem is on Square's side of your account and only they can see it —
Square support is **1-855-700-6000** (US), Monday to Friday.

---

## Before you start

Have these to hand. That's it.

- **A computer.** Not a phone. Square's own instructions say identity
  verification has to be done on a desktop, and dashboard links tapped on a
  phone get grabbed by the Square app, which has no screen to show them and
  hangs on a spinner. Almost every "the link just loads forever" report is this.
- Your phone with Cash App on it (for the account numbers, if you need them)
- An email address
- Your SSN's last 4 digits, or your EIN — Square asks during activation
- 10 minutes

---

## Step 1 — Make a Square account (3 min)

**Direct link:** <https://squareup.com/signup>

Choose a free account. When it asks what you sell, pick **"Professional
services"** or **"Other"** — there is no wrong answer and you can change it
later.

You do **not** need a business name, a registered company, or a card reader.
Your own name is fine.

---

## Step 2 — Point the payouts at Cash App (2 min)

**In the dashboard:** ⚙️ **Settings** → **Account & Settings** → **Banking** →
**Bank accounts**

**Direct link (if it works):**
<https://app.squareup.com/dashboard/balances/bank-accounts>

On that page choose **Cash App** as where your money goes.

If Cash App is not offered as a choice on your account, use your Cash App bank
details instead — they work like any bank account:

1. Open Cash App → **Money** → **Direct Deposit** → **Get account number**
2. Copy the **account number** and the **routing number**
3. Paste both into Square as a bank account

Either way, the money ends up in the same place.

> **Already linked Cash App in the Square app?** Then this step is done — the
> phone app and the website are the same account. Skip to Step 3.

---

## Step 3 — Make three payment links (4 min)

**In the dashboard:** **Payments & orders** → **Payment links**

Square renames this menu depending on what your account has switched on, so it
may read **Payments & invoices**, **Payments**, or **Online Checkout** instead.
Whichever it says, **Payment links** is the item underneath it.

Press **Create payment link**. Choose **"Accept a payment"** each time — never
"Subscription", because OmniDx doesn't have any.

Make exactly these three. The exact text to type is below — copy it straight
in.

### Link 1 of 3

| Field | What to put |
|---|---|
| Item / service name | `OmniDx Studio — Creator` |
| Amount | `19.99` |
| Description | `Unlocks AI editing, auto-captions, the full filter library, studio audio repair and 4K export. One payment, nothing renews. Your licence key is emailed to you after purchase.` |

### Link 2 of 3

| Field | What to put |
|---|---|
| Item / service name | `OmniDx Studio — Studio` |
| Amount | `39.99` |
| Description | `Everything in Creator, plus unlimited AI, Apple ProRes and DNxHR export, scopes, unlimited LUT slots and 10 devices. One payment, nothing renews. Your licence key is emailed to you after purchase.` |

### Link 3 of 3

| Field | What to put |
|---|---|
| Item / service name | `OmniDx Studio — Team (3 people)` |
| Amount | `69.99` |
| Description | `Everything in Studio for exactly 3 people, with a shared licence and shared projects. Three separate Studio licences would be $119.97. One payment, nothing renews. Three licence keys are emailed to you after purchase.` |

### The settings that matter

Most of the toggles on that screen do not apply to software. These four do:

- **Fixed amount**, not "let the customer choose what to pay".
- **Collect the buyer's email address: ON.** You cannot send someone a licence
  key without it, and this is the field the whole manual fulfilment step
  depends on.
- **Shipping address: OFF.** There is nothing to post.
- **Quantity: OFF / fixed at 1.** One licence per purchase. (Team is already
  three seats on one licence — a buyer should not be able to order "2 × Team"
  and expect six.)

If the form offers **"Redirect to a URL after payment"**, point it at your
account page so a buyer lands somewhere that explains what happens next:

```
https://hundostacksgit-svg.github.io/apextune-updates/studio/account/
```

> **The description promises an email.** That email is you, by hand, running
> `tools/make-studio-key.py` — see below. Square notifies you on every sale, but
> nothing sends the key on its own yet. If you are going to be asleep for eight
> hours, say "within 24 hours" in the description rather than implying it is
> instant. A buyer who pays and hears nothing files a chargeback, and that costs
> far more than the sale.

---

## Step 4 — Paste the links into the app (1 min)

Open `studio/assets/config.js`. Find the `checkout` block near the bottom and
paste your three links in. Copy this whole block over the one that's there and
swap in your own codes:

```js
  checkout: {
    creator: 'https://square.link/u/AbC12345',
    studio: 'https://square.link/u/DeF67890',
    team: 'https://square.link/u/GhI13579',
  },
```

While you are in that file, put your support email in too, so buyers have
somewhere to write:

```js
  supportEmail: 'you@example.com',
```

Save the file, commit it, push it. Every buy button on the website and inside
the editor switches over the moment that lands — there is nothing else to
change anywhere.

```bash
git add studio/assets/config.js
git commit -m "Add Square checkout links"
git push
```

---

## Step 5 — Buy your own app once (2 min)

Go to your live pricing page, press **Get Creator**, and pay the $19.99 with
your own card.

Do this. It is the only way to know the whole chain works, and it costs you
about 88¢ in fees. Check that:

1. The Square link opens and shows **$19.99**
2. The payment goes through
3. The money appears in your Square balance
4. You get a receipt by email

Then refund yourself: in the dashboard go to **Payments & orders** →
**Transactions**, click the payment, then **•••** → **Issue refund**. The fee is
returned too on a full refund.

---

## That's it. You are taking money.

---

# The bits people ask about afterwards

## "How do I send someone their licence key?"

Right now, by hand, and that is fine until you are selling more than a few a
day.

```bash
python3 tools/make-studio-key.py --edition creator --email buyer@example.com
```

That prints a key like `OMNIDX-CRE-4F2A-91BC-77D3`. Email it to the buyer.
They paste it at `omnidx.net/studio/account/` and the app unlocks.

Square emails you on every sale, so you will know when to do it.

To automate it later, see the webhook section of
[STUDIO-PAYMENTS.md](STUDIO-PAYMENTS.md). Don't bother until the manual version
is annoying you.

## "What does Square take?"

2.9% + 30¢ per online payment.

| They pay | Square takes | You keep |
|---|---|---|
| $19.99 | $0.88 | **$19.11** |
| $39.99 | $1.46 | **$38.53** |
| $69.99 | $2.33 | **$67.66** |

## "Can people pay with PayPal or Klarna?"

Not through Square. If you want those too, add Stripe as a second processor —
it is the same shape of job and it is written up in
[STUDIO-PAYMENTS.md](STUDIO-PAYMENTS.md#route-b--stripe-for-everything-square-doesnt-take).
Start with Square alone; add Stripe when someone actually asks.

## "What if I set none of this up?"

The buy buttons fall back to your plain Cash App link
(`cash.app/$Ahmirp1961`). That works, but it is a personal transfer: no
receipt, no refund button, no card payments, no buyer email, and Cash App can
limit an account that takes a lot of them from strangers. Fine for the first
sale to a friend. Not fine as the plan.

## "Do I owe tax on this?"

Yes — it is income. Square sends you a 1099-K in the US once you pass the
reporting threshold, and the dashboard exports everything your accountant will
ask for. Talk to one before you are making real money, not after.

## Where each thing lives

| What | Where in the dashboard | Direct link |
|---|---|---|
| Sign up | — | <https://squareup.com/signup> |
| Everything below | — | <https://app.squareup.com/dashboard> |
| Payout destination | Settings → Account & Settings → Banking → Bank accounts | <https://app.squareup.com/dashboard/balances/bank-accounts> |
| Payment links | Payments & orders → Payment links | — |
| Sales and refunds | Payments & orders → Transactions | — |
| Your prices in code | — | `studio/assets/config.js` |
| Make a licence key | — | `tools/make-studio-key.py` |
| The long version | — | [STUDIO-PAYMENTS.md](STUDIO-PAYMENTS.md) |

The menu paths are the ones to trust. Square moves its URLs and renames its
menus between account types, so a deep link that worked last year can spin
forever today while the menu path still gets you there.
