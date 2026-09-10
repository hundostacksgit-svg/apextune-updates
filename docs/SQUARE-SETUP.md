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

## Before you start

Have these to hand. That's it.

- Your phone with Cash App on it
- An email address
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

**Direct link:** <https://app.squareup.com/dashboard/balance/settings>

On that page choose **Cash App** as where your money goes.

If Cash App is not offered as a choice on your account, use your Cash App bank
details instead — they work like any bank account:

1. Open Cash App → **Money** → **Direct Deposit** → **Get account number**
2. Copy the **account number** and the **routing number**
3. Paste both into Square as a bank account

Either way, the money ends up in the same place.

---

## Step 3 — Make three payment links (4 min)

**Direct link:** <https://app.squareup.com/dashboard/items/payment-links>

Press **Create payment link** three times. Choose **"Accept a payment"** each
time — never "Subscription", because OmniDx doesn't have any.

Make exactly these three:

| Name in Square | Price | What the buyer gets |
|---|---|---|
| `OmniDx Studio — Creator` | **19.99** | AI editing, captions, all filters, 4K |
| `OmniDx Studio — Studio` | **39.99** | Everything, unlimited AI, ProRes, 10 devices |
| `OmniDx Studio — Team (3 people)` | **69.99** | Everything, for exactly 3 people |

The free edition isn't in the list because there is nothing to buy.

Each one gives you a link that looks like `https://square.link/u/AbC12345`.
**Copy all three somewhere** before you close the tab.

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

Then refund yourself here: <https://app.squareup.com/dashboard/sales/transactions>
— find the payment, press **Issue refund**. The fee is returned too on a full
refund.

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

| What | Direct link |
|---|---|
| Sign up | <https://squareup.com/signup> |
| Payout destination | <https://app.squareup.com/dashboard/balance/settings> |
| Payment links | <https://app.squareup.com/dashboard/items/payment-links> |
| Sales and refunds | <https://app.squareup.com/dashboard/sales/transactions> |
| Your prices in code | `studio/assets/config.js` |
| Make a licence key | `tools/make-studio-key.py` |
| The long version | [STUDIO-PAYMENTS.md](STUDIO-PAYMENTS.md) |
