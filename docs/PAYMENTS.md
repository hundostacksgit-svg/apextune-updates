# Taking payment, with the money landing in Cash App

**Short answer: yes.** Buyers can pay with any card or wallet and the money can
end up in your Cash App balance. There are two ways, and the difference between
them matters more than it looks.

---

## Option A — Cash App only (set up right now, free)

This is what the site is currently wired to. `app/js/config.js` holds the
cashtag and every buy button uses it.

**How it works:** the buyer opens `cash.app/$yourcashtag`. If they have Cash App
they pay in a tap. If they don't, Cash App's web page still accepts a **debit
card** from most people without an account.

**What it costs:** nothing to receive.

**Where it falls short:**

- **No credit cards.** Cash App charges the sender 3% for a credit card and
  many people simply won't. Debit is the realistic path.
- **No order information.** A payment arrives as a name and an amount. Nothing
  says what it was for. This is why the app tells buyers to put their email in
  the note — that note is your only link between a payment and a person.
- **No receipt or automatic delivery.** You send the unlock code by hand.
- **No buyer protection.** Cash App treats these as person-to-person payments
  and generally will not reverse them, which cuts both ways.
- **It's a personal account doing business.** Cash App's terms distinguish
  personal from business use, and accounts taking regular commercial payments
  on a personal profile can be limited or frozen. Switching to a **Cash App for
  Business** account (in Settings, takes a minute) makes it legitimate. That
  costs **2.75% per payment** and gives you a public profile page.

Fine for the first handful of sales. Not where you want to be at volume.

---

## Option B — Square checkout, paid out to Cash App (recommended)

Square and Cash App are the same company (Block), which makes this cleaner than
it sounds.

1. Create a free Square account.
2. Make a **Checkout Link** — Square's hosted payment page — for $19.
3. In Square's settings, point payouts at your **Cash App account and routing
   numbers** (Cash App → Money → the direct deposit section shows both).
4. Put the checkout link in `app/js/config.js` as `checkoutUrl`. Every buy
   button switches to it automatically.

**What this gets you that Cash App alone doesn't:**

| | Cash App link | Square Checkout |
|---|---|---|
| Credit cards | Buyer pays 3% | Included |
| Apple Pay / Google Pay | No | Yes |
| Cash App Pay as an option | n/a | Yes |
| Buyer email captured | Only if they type it | Collected at checkout |
| Receipt sent automatically | No | Yes |
| Order record | None | Full |
| Fee | 0% personal / 2.75% business | 2.9% + 30¢ |

**Test the payout before you rely on it.** Some processors reject deposits to
fintech routing numbers. Send yourself one real $1 sale and confirm it lands.
If Square won't deposit to Cash App, point it at a normal bank account and move
money across from there — Cash App can pull from a linked bank for free.

Stripe Payment Links work identically if you prefer Stripe. Same idea: the
payout destination is just account and routing numbers, and Cash App has both.

---

## Sending the unlock code

After a payment arrives:

```
python3 tools/make-licence.py
```

That prints something like `OMNIDX-HSK8-SG5P-MDWA`. Email it to the buyer.

For a batch, or to keep records:

```
python3 tools/make-licence.py -n 20 --csv > licences.csv
```

Fill in the buyer column as you issue them. **Keep that file.** Cash App
payments carry no order metadata, so your own record is the only thing linking
a code to a customer — you'll want it when someone emails asking for their code
again.

To check a code someone quotes you:

```
python3 tools/make-licence.py --check OMNIDX-HSK8-SG5P-MDWA
```

---

## What the licence actually protects

Be clear-eyed about this before you price anything.

OmniDx is a static app. Everything runs in the buyer's browser, which means the
validation code and its salt are readable by anyone who opens developer tools.
The check in `app/js/pro.js`:

- **stops** codes being guessed — the checksum makes random strings fail
- **stops** casual sharing, since "just type anything" doesn't work
- **does not stop** a determined person, and cannot

No purely client-side check can do better. The real options are:

1. **Accept it** (what's built). Most buyers of a $19 tool are not going to
   patch JavaScript. Low friction, no infrastructure, no running costs.
2. **Move the check to a server.** A small serverless function validating codes
   against a database. Real enforcement, but now you have a backend to run,
   and the app stops working offline — which is one of its selling points.
3. **Sell something that can't be copied**, like a hosted account or support.

Option 1 is the right trade for this product. Just don't assume it's stronger
than it is.

---

## Changing the price or what Pro includes

Price and links: `app/js/config.js`.

The free/paid split is one line in `app/js/pro.js`:

```js
export const PRO_FEATURES = ['live-scan', 'logging', 'garage'];
```

Remove an entry and it becomes free. The landing page's pricing section is
plain HTML in `index.html` and needs updating to match — nothing derives it
automatically.

---

## Before you advertise the cashtag

**Open your own buy link and check it lands on your account.** The cashtag in
`config.js` was typed from a message; a single wrong character sends your
customers' money to a stranger, and you'd have no way to get it back.

Once you're sure, that's the only manual check this needs.
